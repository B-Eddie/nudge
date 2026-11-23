//! The title of the window in front, and whether it is full screen.
//!
//! Opt-in, and off until macOS grants Accessibility. Only the focused window's title and
//! full-screen flag are read: no page contents, no addresses, no keystrokes. Titles are
//! handed to the overlay to be understood and then forgotten; nothing here stores them.

use serde::Serialize;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct WindowContext {
    pub bundle_id: Option<String>,
    pub title: Option<String>,
    pub fullscreen: bool,
    /// macOS lists this app among those that open web links.
    pub browser: bool,
}

/// Every app registered to open web links, so any browser works without being named here.
#[cfg(target_os = "macos")]
fn installed_browsers() -> std::collections::HashSet<String> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSString as _};
    use objc::{class, msg_send, sel, sel_impl};

    let mut found = std::collections::HashSet::new();
    unsafe {
        let pool = cocoa::foundation::NSAutoreleasePool::new(nil);
        let text = cocoa::foundation::NSString::alloc(nil).init_str("https://example.com");
        let link: id = msg_send![class!(NSURL), URLWithString: text];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let selector = sel!(URLsForApplicationsToOpenURL:);
        let supported: bool = msg_send![workspace, respondsToSelector: selector];
        if supported {
            let apps: id = msg_send![workspace, URLsForApplicationsToOpenURL: link];
            let count: usize = msg_send![apps, count];
            for index in 0..count {
                let url: id = msg_send![apps, objectAtIndex: index];
                let bundle: id = msg_send![class!(NSBundle), bundleWithURL: url];
                if bundle == nil {
                    continue;
                }
                let identifier: id = msg_send![bundle, bundleIdentifier];
                if identifier == nil {
                    continue;
                }
                let utf8: *const std::ffi::c_char = msg_send![identifier, UTF8String];
                if !utf8.is_null() {
                    let name = std::ffi::CStr::from_ptr(utf8).to_string_lossy();
                    found.insert(name.to_ascii_lowercase());
                }
            }
        }
        let _: () = msg_send![text, release];
        pool.drain();
    }
    found
}

pub fn is_browser(bundle_id: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        static BROWSERS: std::sync::OnceLock<std::collections::HashSet<String>> =
            std::sync::OnceLock::new();
        BROWSERS
            .get_or_init(installed_browsers)
            .contains(&bundle_id.to_ascii_lowercase())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bundle_id;
        false
    }
}

const MAX_TITLE_CHARS: usize = 200;

/// Apps whose titles are never read, whatever the settings say.
const SECRET_APPS: &[&str] = &[
    "com.1password.1password",
    "com.agilebits.onepassword7",
    "com.bitwarden.desktop",
    "com.dashlane.dashlanephonefinal",
    "com.lastpass.lastpassmacdesktop",
    "me.proton.pass.electron",
    "org.keepassxc.keepassxc",
    "com.apple.passwords",
    "com.apple.keychainaccess",
    "com.apple.loginwindow",
    // Every Tor Browser window is a private one.
    "org.torproject.torbrowser",
];

/// Words browsers add to the title of a private window.
const PRIVATE_MARKERS: &[&str] = &[
    "private browsing",
    "(incognito)",
    "incognito - ",
    "[inprivate]",
    "inprivate - ",
    "- incognito",
    "(private)",
    "private window",
];

pub fn is_secret_app(bundle_id: &str) -> bool {
    SECRET_APPS.contains(&bundle_id.to_ascii_lowercase().as_str())
}

/// Tidies a title, or drops it when it belongs to a private window.
pub fn usable_title(raw: &str) -> Option<String> {
    let lower = raw.to_lowercase();
    if PRIVATE_MARKERS.iter().any(|marker| lower.contains(marker)) {
        return None;
    }
    let title: String = raw
        .chars()
        // Edge and others put invisible direction marks in their titles.
        .filter(|c| !c.is_control() && !matches!(c, '\u{200b}'..='\u{200f}' | '\u{2060}'))
        .take(MAX_TITLE_CHARS)
        .collect();
    let title = title.trim();
    (!title.is_empty()).then(|| title.to_string())
}

#[cfg(target_os = "macos")]
mod ax {
    use std::ffi::c_void;

    use objc2::rc::Retained;
    use objc2_foundation::NSString;

    type Ref = *const c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: Ref) -> bool;
        fn AXUIElementCreateApplication(pid: i32) -> Ref;
        fn AXUIElementSetMessagingTimeout(element: Ref, seconds: f32) -> i32;
        fn AXUIElementCopyAttributeValue(element: Ref, attribute: Ref, value: *mut Ref) -> i32;
        static kAXTrustedCheckOptionPrompt: Ref;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: Ref);
        fn CFGetTypeID(value: Ref) -> usize;
        fn CFStringGetTypeID() -> usize;
        fn CFBooleanGetTypeID() -> usize;
        fn CFBooleanGetValue(value: Ref) -> bool;
        fn CFDictionaryCreate(
            allocator: Ref,
            keys: *const Ref,
            values: *const Ref,
            count: isize,
            key_callbacks: Ref,
            value_callbacks: Ref,
        ) -> Ref;
        static kCFBooleanTrue: Ref;
        static kCFTypeDictionaryKeyCallBacks: c_void;
        static kCFTypeDictionaryValueCallBacks: c_void;
    }

    /// Releases a Core Foundation value when it goes out of scope.
    struct Owned(Ref);
    impl Drop for Owned {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) }
            }
        }
    }

    fn attribute(element: &Owned, name: &str) -> Option<Owned> {
        let name = NSString::from_str(name);
        let mut value: Ref = std::ptr::null();
        let status = unsafe {
            AXUIElementCopyAttributeValue(element.0, Retained::as_ptr(&name).cast(), &mut value)
        };
        (status == 0 && !value.is_null()).then_some(Owned(value))
    }

    pub fn trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    /// Asks macOS to show its own Accessibility prompt.
    pub fn prompt() -> bool {
        unsafe {
            let keys = [kAXTrustedCheckOptionPrompt];
            let values = [kCFBooleanTrue];
            let options = Owned(CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                std::ptr::addr_of!(kCFTypeDictionaryKeyCallBacks),
                std::ptr::addr_of!(kCFTypeDictionaryValueCallBacks),
            ));
            AXIsProcessTrustedWithOptions(options.0)
        }
    }

    pub fn front_window(pid: i32) -> Option<(Option<String>, bool)> {
        let app = Owned(unsafe { AXUIElementCreateApplication(pid) });
        if app.0.is_null() {
            return None;
        }
        // A busy app must never hold nudge up.
        unsafe { AXUIElementSetMessagingTimeout(app.0, 0.25) };
        let window = attribute(&app, "AXFocusedWindow")?;
        unsafe { AXUIElementSetMessagingTimeout(window.0, 0.25) };
        let title = attribute(&window, "AXTitle")
            .filter(|value| unsafe { CFGetTypeID(value.0) == CFStringGetTypeID() })
            // Toll-free bridged: a CFString is an NSString.
            .map(|value| unsafe { &*value.0.cast::<NSString>() }.to_string());
        let fullscreen = attribute(&window, "AXFullScreen").is_some_and(|value| unsafe {
            CFGetTypeID(value.0) == CFBooleanGetTypeID() && CFBooleanGetValue(value.0)
        });
        Some((title, fullscreen))
    }
}

#[cfg(target_os = "macos")]
pub fn read(pid: i32) -> Option<(Option<String>, bool)> {
    use objc2::rc::autoreleasepool;

    if !ax::trusted() {
        return None;
    }
    autoreleasepool(|_| ax::front_window(pid))
}

#[cfg(not(target_os = "macos"))]
pub fn read(_pid: i32) -> Option<(Option<String>, bool)> {
    None
}

/// Whether macOS currently lets nudge read window titles.
#[tauri::command]
pub fn get_window_access() -> bool {
    #[cfg(target_os = "macos")]
    return ax::trusted();
    #[cfg(not(target_os = "macos"))]
    false
}

/// Shows the macOS permission prompt. Only ever called from a button in Settings.
#[tauri::command]
pub fn request_window_access() -> bool {
    #[cfg(target_os = "macos")]
    return ax::prompt();
    #[cfg(not(target_os = "macos"))]
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_windows_have_no_title() {
        for private in [
            "Mozilla Firefox Private Browsing",
            "Something — Zen Browser Private Browsing",
            "New Tab - Google Chrome (Incognito)",
            "Bank - [InPrivate] - Microsoft Edge",
            "Anything - Incognito",
        ] {
            assert_eq!(usable_title(private), None, "{private}");
        }
        assert!(usable_title("Privacy law - Wikipedia").is_some());
    }

    #[test]
    fn titles_are_tidied_and_bounded() {
        assert_eq!(
            usable_title("  Inbox\u{200b} \u{7}- Gmail "),
            Some("Inbox - Gmail".into())
        );
        assert_eq!(usable_title(" \u{200e} "), None);
        assert_eq!(
            usable_title(&"é".repeat(900)).unwrap().chars().count(),
            MAX_TITLE_CHARS
        );
    }

    #[test]
    fn password_managers_are_always_off_limits() {
        assert!(is_secret_app("com.1password.1password"));
        assert!(is_secret_app("com.apple.Passwords"));
        assert!(!is_secret_app("app.zen-browser.zen"));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn the_browser_list_comes_from_macos() {
        assert!(is_browser("com.apple.Safari"));
        assert!(!is_browser("com.apple.finder"));
    }

    #[test]
    fn reading_a_process_that_does_not_exist_is_harmless() {
        assert_eq!(read(-1), None);
    }
}
