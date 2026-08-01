use serde::Serialize;
use tauri::AppHandle;

use crate::settings::Settings;

/// Dedicated players — idle usually means passive watching/listening.
const PASSIVE_MEDIA_BUNDLES: &[&str] = &[
    "com.apple.Music",
    "com.apple.TV",
    "com.apple.QuickTimePlayerX",
    "com.spotify.client",
    "com.netflix.Netflix",
    "com.colliderli.iina",
    "org.videolan.vlc",
    "com.plexapp.desktop",
    "tv.twitch.desktop",
    "com.disney.disneyplus",
    "com.hulu.plus",
    "com.max.bundle",
    "com.amazon.aiv.AIVApp",
];

const PASSIVE_MEDIA_CATEGORIES: &[&str] = &[
    "public.app-category.music",
    "public.app-category.video",
    "public.app-category.entertainment",
];

#[derive(Debug, Clone, Serialize)]
pub struct AutoBreakStatus {
    pub idle_seconds: f64,
    pub idle_threshold_seconds: u64,
    pub should_auto_break: bool,
    pub defer_auto_break: bool,
    pub defer_reason: Option<String>,
}

pub fn idle_threshold_seconds(settings: &Settings) -> u64 {
    settings.auto_idle_break_mins.max(1) as u64 * 60
}

fn bundle_is_passive_media(bundle_id: &str) -> bool {
    PASSIVE_MEDIA_BUNDLES.contains(&bundle_id)
}

fn category_is_passive_media(category: &str) -> bool {
    PASSIVE_MEDIA_CATEGORIES.contains(&category)
}

#[cfg(target_os = "macos")]
fn our_bundle_id() -> Option<String> {
    use objc2::rc::autoreleasepool;
    use objc2_foundation::NSBundle;

    autoreleasepool(|pool| {
        unsafe { NSBundle::mainBundle().bundleIdentifier() }
            .map(|id| id.as_str(pool).to_owned())
    })
}

#[cfg(target_os = "macos")]
fn fourcc(bytes: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*bytes)
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct AudioObjectPropertyAddress {
    m_selector: u32,
    m_scope: u32,
    m_element: u32,
}

#[cfg(target_os = "macos")]
#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyData(
        in_object_id: u32,
        in_address: *const AudioObjectPropertyAddress,
        in_qualifier_data_size: u32,
        in_qualifier_data: *const std::ffi::c_void,
        io_data_size: *mut u32,
        out_data: *mut std::ffi::c_void,
    ) -> i32;
}

#[cfg(target_os = "macos")]
fn process_is_audible(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }

    let address = AudioObjectPropertyAddress {
        m_selector: fourcc(b"piad"),
        m_scope: fourcc(b"glob"),
        m_element: 0,
    };
    let mut audible: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let pid_u32 = pid as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            1, // kAudioObjectSystemObject
            &address,
            std::mem::size_of::<u32>() as u32,
            &pid_u32 as *const u32 as *const std::ffi::c_void,
            &mut size,
            &mut audible as *mut u32 as *mut std::ffi::c_void,
        )
    };
    status == 0 && audible != 0
}

#[cfg(target_os = "macos")]
fn audible_media_processes() -> Vec<(i32, String)> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSWorkspace;

    autoreleasepool(|pool| {
        let our_bundle = our_bundle_id();
        let workspace = unsafe { NSWorkspace::sharedWorkspace() };
        let running = unsafe { workspace.runningApplications() };
        let mut audible = Vec::new();

        for app in &*running {
            let pid = unsafe { app.processIdentifier() };
            if !process_is_audible(pid) {
                continue;
            }
            let bundle_id = unsafe { app.bundleIdentifier() }
                .map(|id| id.as_str(pool).to_owned());
            if bundle_id.as_deref() == our_bundle.as_deref() {
                continue;
            }
            let name = unsafe { app.localizedName() }
                .map(|n| n.as_str(pool).to_owned())
                .unwrap_or_else(|| bundle_id.clone().unwrap_or_else(|| format!("pid {pid}")));
            audible.push((pid, name));
        }

        audible
    })
}

#[cfg(not(target_os = "macos"))]
fn audible_media_processes() -> Vec<(i32, String)> {
    Vec::new()
}

pub fn defer_reason(
    app: &AppHandle,
    frontmost_bundle_id: Option<&str>,
    frontmost_category: Option<&str>,
) -> Option<String> {
    if let Some(bundle_id) = frontmost_bundle_id {
        if bundle_is_passive_media(bundle_id) {
            return Some(format!("Using {bundle_id}"));
        }
    }

    if let Some(category) = frontmost_category {
        if category_is_passive_media(category) {
            return Some(format!("{} app in front", crate::app_categories::category_label(category)));
        }
    }

    let audible = audible_media_processes();
    if !audible.is_empty() {
        // Covers browser video, music players, calls, etc. while the user isn't moving input.
        let names: Vec<String> = audible.into_iter().map(|(_, name)| name).collect();
        return Some(format!("Audio playing ({})", names.join(", ")));
    }

    let _ = app;
    None
}

pub fn evaluate_auto_break(
    app: &AppHandle,
    idle_seconds: f64,
    settings: &Settings,
    frontmost_bundle_id: Option<&str>,
    frontmost_category: Option<&str>,
) -> AutoBreakStatus {
    let idle_threshold_seconds = idle_threshold_seconds(settings);
    let defer_reason = defer_reason(app, frontmost_bundle_id, frontmost_category);
    let defer_auto_break = defer_reason.is_some();
    let should_auto_break =
        !defer_auto_break && idle_seconds >= idle_threshold_seconds as f64;

    AutoBreakStatus {
        idle_seconds,
        idle_threshold_seconds,
        should_auto_break,
        defer_auto_break,
        defer_reason,
    }
}
