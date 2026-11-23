//! What the Mac's microphone, cameras and audio outputs are doing, without opening any of
//! them. macOS publishes "in use" flags for each; reading those captures nothing and needs
//! no permission. They let nudge stay quiet in a call and tell a video from a closed laptop.

use std::sync::{Arc, Mutex};
use std::time::Duration;

/// How often the flags are refreshed. Enumerating audio clients takes a few milliseconds.
const SAMPLE_EVERY: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Presence {
    pub mic_in_use: bool,
    pub camera_in_use: bool,
    /// Bundle ids playing audio. `None` where macOS cannot say (before 14.2).
    pub audible: Option<Vec<String>>,
}

impl Presence {
    pub fn in_call(&self) -> bool {
        self.mic_in_use || self.camera_in_use
    }
}

/// Latest sample, refreshed off the main thread so the overlay never waits on CoreAudio.
#[derive(Clone, Default)]
pub struct PresenceStore(Arc<Mutex<Presence>>);

impl PresenceStore {
    pub fn get(&self) -> Presence {
        self.0.lock().unwrap().clone()
    }

    pub fn start(&self, our_bundle: Option<String>) {
        let store = self.clone();
        std::thread::spawn(move || loop {
            let latest = sample(our_bundle.as_deref());
            *store.0.lock().unwrap() = latest;
            std::thread::sleep(SAMPLE_EVERY);
        });
    }
}

/// Always-listening system services. They hold the microphone without anyone being on a call.
const IGNORED_MIC_CLIENTS: &[&str] = &[
    "com.apple.corespeech",
    "com.apple.corespeechd",
    "com.apple.assistantd",
    "com.apple.siri",
    "com.apple.sirincservice",
    "com.apple.voicetrigger",
];

fn counts_as_mic_use(bundle_id: &str, our_bundle: Option<&str>) -> bool {
    let id = bundle_id.to_ascii_lowercase();
    !IGNORED_MIC_CLIENTS.contains(&id.as_str())
        && our_bundle.is_none_or(|ours| !id.eq_ignore_ascii_case(ours))
}

#[cfg(target_os = "macos")]
mod hardware {
    use std::ffi::c_void;

    use objc2::rc::Retained;
    use objc2_foundation::NSString;

    const SYSTEM_OBJECT: u32 = 1;

    const fn fourcc(code: &[u8; 4]) -> u32 {
        u32::from_be_bytes(*code)
    }

    #[repr(C)]
    struct Address {
        selector: u32,
        scope: u32,
        element: u32,
    }

    impl Address {
        const fn global(selector: &[u8; 4]) -> Self {
            Self {
                selector: fourcc(selector),
                scope: fourcc(b"glob"),
                element: 0,
            }
        }
    }

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyDataSize(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn AudioObjectGetPropertyData(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> i32;
    }

    #[link(name = "CoreMediaIO", kind = "framework")]
    extern "C" {
        fn CMIOObjectGetPropertyDataSize(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn CMIOObjectGetPropertyData(
            object: u32,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: u32,
            used: *mut u32,
            data: *mut c_void,
        ) -> i32;
    }

    fn audio_u32(object: u32, selector: &[u8; 4]) -> Option<u32> {
        let address = Address::global(selector);
        let mut value = 0u32;
        let mut size = std::mem::size_of::<u32>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                &address,
                0,
                std::ptr::null(),
                &mut size,
                (&mut value as *mut u32).cast(),
            )
        };
        (status == 0).then_some(value)
    }

    fn audio_bundle_id(object: u32) -> String {
        let address = Address::global(b"pbid");
        let mut value: *mut NSString = std::ptr::null_mut();
        let mut size = std::mem::size_of::<*mut NSString>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                object,
                &address,
                0,
                std::ptr::null(),
                &mut size,
                (&mut value as *mut *mut NSString).cast(),
            )
        };
        if status != 0 {
            return String::new();
        }
        // CoreAudio hands over a +1 CFString, which is toll-free bridged to NSString.
        unsafe { Retained::from_raw(value) }
            .map(|id| id.to_string())
            .unwrap_or_default()
    }

    pub struct AudioClient {
        pub bundle_id: String,
        pub recording: bool,
        pub playing: bool,
    }

    /// Processes with running audio. `None` before macOS 14.2, which has no process list.
    pub fn active_audio_clients() -> Option<Vec<AudioClient>> {
        let address = Address::global(b"prs#");
        let mut size = 0u32;
        let status = unsafe {
            AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &address, 0, std::ptr::null(), &mut size)
        };
        if status != 0 {
            return None;
        }
        let mut objects = vec![0u32; size as usize / std::mem::size_of::<u32>()];
        let status = unsafe {
            AudioObjectGetPropertyData(
                SYSTEM_OBJECT,
                &address,
                0,
                std::ptr::null(),
                &mut size,
                objects.as_mut_ptr().cast(),
            )
        };
        if status != 0 {
            return None;
        }
        objects.truncate(size as usize / std::mem::size_of::<u32>());
        Some(
            objects
                .into_iter()
                .filter_map(|object| {
                    let recording = audio_u32(object, b"piri") == Some(1);
                    let playing = audio_u32(object, b"piro") == Some(1);
                    (recording || playing).then(|| AudioClient {
                        bundle_id: audio_bundle_id(object),
                        recording,
                        playing,
                    })
                })
                .collect(),
        )
    }

    /// Fallback for older systems: is the default input device running for anyone?
    pub fn default_input_running() -> bool {
        audio_u32(SYSTEM_OBJECT, b"dIn ")
            .filter(|device| *device != 0)
            .and_then(|device| audio_u32(device, b"gone"))
            == Some(1)
    }

    pub fn any_camera_running() -> bool {
        let address = Address::global(b"dev#");
        let mut size = 0u32;
        let status = unsafe {
            CMIOObjectGetPropertyDataSize(SYSTEM_OBJECT, &address, 0, std::ptr::null(), &mut size)
        };
        if status != 0 || size == 0 {
            return false;
        }
        let mut devices = vec![0u32; size as usize / std::mem::size_of::<u32>()];
        let mut used = 0u32;
        let status = unsafe {
            CMIOObjectGetPropertyData(
                SYSTEM_OBJECT,
                &address,
                0,
                std::ptr::null(),
                size,
                &mut used,
                devices.as_mut_ptr().cast(),
            )
        };
        if status != 0 {
            return false;
        }
        devices.truncate(used as usize / std::mem::size_of::<u32>());
        let running = Address {
            selector: fourcc(b"gone"),
            scope: fourcc(b"****"),
            element: u32::MAX,
        };
        devices.into_iter().any(|device| {
            let mut value = 0u32;
            let mut used = 0u32;
            let status = unsafe {
                CMIOObjectGetPropertyData(
                    device,
                    &running,
                    0,
                    std::ptr::null(),
                    std::mem::size_of::<u32>() as u32,
                    &mut used,
                    (&mut value as *mut u32).cast(),
                )
            };
            status == 0 && value != 0
        })
    }
}

#[cfg(target_os = "macos")]
fn sample(our_bundle: Option<&str>) -> Presence {
    use objc2::rc::autoreleasepool;

    autoreleasepool(|_| {
        let clients = hardware::active_audio_clients();
        let mic_in_use = match &clients {
            Some(clients) => clients
                .iter()
                .any(|c| c.recording && counts_as_mic_use(&c.bundle_id, our_bundle)),
            None => hardware::default_input_running(),
        };
        let audible = clients.map(|clients| {
            clients
                .into_iter()
                .filter(|c| c.playing && Some(c.bundle_id.as_str()) != our_bundle)
                .map(|c| c.bundle_id)
                .collect()
        });
        Presence {
            mic_in_use,
            camera_in_use: hardware::any_camera_running(),
            audible,
        }
    })
}

#[cfg(not(target_os = "macos"))]
fn sample(_our_bundle: Option<&str>) -> Presence {
    Presence::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_microphone_or_camera_in_use_counts_as_a_call() {
        let quiet = Presence::default();
        assert!(!quiet.in_call());
        assert!(Presence {
            mic_in_use: true,
            ..quiet.clone()
        }
        .in_call());
        assert!(Presence {
            camera_in_use: true,
            ..quiet
        }
        .in_call());
    }

    #[test]
    fn always_listening_services_and_nudge_itself_do_not_count_as_a_call() {
        let ours = Some("com.eb.nudge");
        assert!(!counts_as_mic_use("com.apple.CoreSpeech", ours));
        assert!(!counts_as_mic_use("com.apple.Siri", ours));
        assert!(!counts_as_mic_use("com.eb.nudge", ours));
        assert!(counts_as_mic_use("us.zoom.xos", ours));
        assert!(counts_as_mic_use("com.apple.FaceTime", ours));
        // A command-line recorder has no bundle id but is still using the microphone.
        assert!(counts_as_mic_use("", ours));
    }

    /// Exercises the real CoreAudio and CoreMediaIO calls: they must not crash or block.
    #[test]
    fn sampling_the_hardware_is_safe_to_repeat() {
        for _ in 0..3 {
            let _ = sample(Some("com.eb.nudge"));
        }
    }
}
