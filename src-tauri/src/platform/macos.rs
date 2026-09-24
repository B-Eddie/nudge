//! macOS platform integration: NSPanel overlay, cursor/space/power monitors,
//! focused-app detection, idle-time and audible-media queries.
//!
//! This is the reference implementation of the platform interface declared in
//! `platform/mod.rs`. Moved here verbatim from `lib.rs` / `auto_break.rs`.

use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::time::Duration;

use cocoa::appkit::{NSEvent, NSColor, NSWindow};
use cocoa::base::{id, nil, BOOL, NO, YES};
use cocoa::foundation::{NSPoint, NSString};
use objc::runtime::Class;
use objc::{class, msg_send, sel, sel_impl};
use tauri::{Emitter, Manager, WebviewWindow};

use super::{emit_cursor_move, FrontmostApp};

static OVERLAY_PANEL_READY: AtomicBool = AtomicBool::new(false);

unsafe fn configure_view_transparency(view: id) {
    if view == nil {
        return;
    }

    if let Some(wk_class) = Class::get("WKWebView") {
        let is_wk: BOOL = msg_send![view, isKindOfClass: wk_class];
        if is_wk == YES {
            let no: id = msg_send![class!(NSNumber), numberWithBool: NO];
            let key = NSString::alloc(nil).init_str("drawsBackground");
            let _: () = msg_send![view, setValue: no forKey: key];
        }
    }

    let subviews: id = msg_send![view, subviews];
    let count: usize = msg_send![subviews, count];
    for i in 0..count {
        let sub: id = msg_send![subviews, objectAtIndex: i];
        configure_view_transparency(sub);
    }
}

unsafe fn configure_transparent_layers(window: &WebviewWindow) {
    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };
    let ns_window = ns_window_ptr as id;
    let clear = NSColor::clearColor(nil);
    let _: () = msg_send![ns_window, setOpaque: NO];
    let _: () = msg_send![ns_window, setBackgroundColor: clear];
    let _: () = msg_send![ns_window, setHasShadow: NO];

    let content_view: id = msg_send![ns_window, contentView];
    configure_view_transparency(content_view);
}

unsafe fn invalidate_view_display(view: id) {
    if view == nil {
        return;
    }

    let _: () = msg_send![view, setNeedsDisplay: YES];
    let _: () = msg_send![view, displayIfNeeded];

    let subviews: id = msg_send![view, subviews];
    let count: usize = msg_send![subviews, count];
    for i in 0..count {
        let sub: id = msg_send![subviews, objectAtIndex: i];
        invalidate_view_display(sub);
    }
}

fn invalidate_overlay_window(window: &WebviewWindow) {
    unsafe {
        let Ok(ns_window_ptr) = window.ns_window() else {
            return;
        };
        let ns_window = ns_window_ptr as id;
        let content_view: id = msg_send![ns_window, contentView];
        invalidate_view_display(content_view);
        let _: () = msg_send![ns_window, displayIfNeeded];
    }
}

/// Nudge AppKit/WebKit to repaint after overlay UI changes. Transparent panels
/// can leave stale IOSurface layers on some Mac GPUs if the window is not
/// invalidated.
pub fn invalidate_overlay_display(window: &WebviewWindow) {
    invalidate_overlay_window(window);
}

/// Full overlay setup: accessory activation policy + non-activating NSPanel
/// floating at status-window level on all spaces, with transparent layers.
pub fn configure_overlay_window(window: &WebviewWindow, app: &tauri::AppHandle) {
    use tauri_nspanel::{
        cocoa::appkit::NSWindowCollectionBehavior, ManagerExt, WebviewWindowExt,
    };

    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    const NS_NONACTIVATING_PANEL_MASK: i32 = 1 << 7;
    const NS_STATUS_WINDOW_LEVEL: i32 = 25;

    let panel = if OVERLAY_PANEL_READY.load(AtomicOrdering::SeqCst) {
        match app.get_webview_panel("main") {
            Ok(panel) => panel,
            Err(e) => {
                eprintln!("overlay panel not found: {e:?}");
                return;
            }
        }
    } else {
        match window.to_panel() {
            Ok(panel) => {
                OVERLAY_PANEL_READY.store(true, AtomicOrdering::SeqCst);
                panel
            }
            Err(e) => {
                eprintln!("failed to convert overlay to NSPanel: {e}");
                return;
            }
        }
    };

    panel.set_style_mask(NS_NONACTIVATING_PANEL_MASK);
    panel.set_floating_panel(true);
    panel.set_becomes_key_only_if_needed(true);
    panel.set_level(NS_STATUS_WINDOW_LEVEL);
    panel.set_hides_on_deactivate(false);
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );
    panel.order_front_regardless();
    unsafe {
        configure_transparent_layers(window);
    }
}

fn ensure_overlay_on_active_space(window: &WebviewWindow) {
    let app = window.app_handle();
    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };

    unsafe {
        let ns_window = ns_window_ptr as id;
        let on_active_space: BOOL = msg_send![ns_window, isOnActiveSpace];
        if on_active_space == NO {
            configure_overlay_window(window, &app);
        }
    }
}

/// When pass_through is true, clicks pass through the window.
pub fn set_ignores_mouse_events(window: &WebviewWindow, ignore: bool) {
    unsafe {
        let ns_window = window.ns_window().expect("ns_window") as id;
        ns_window.setIgnoresMouseEvents_(if ignore { YES } else { NO });
    }
}

fn emit_cursor_position(window: &WebviewWindow) {
    unsafe {
        let ns_window = window.ns_window().expect("ns_window") as id;
        let mouse: NSPoint = NSEvent::mouseLocation(nil);
        let frame = ns_window.frame();

        let inside = mouse.x >= frame.origin.x
            && mouse.x < frame.origin.x + frame.size.width
            && mouse.y >= frame.origin.y
            && mouse.y < frame.origin.y + frame.size.height;

        let x = mouse.x - frame.origin.x;
        let y = frame.size.height - (mouse.y - frame.origin.y);

        // Global button state (0 = left button). works anywhere so hover/click can be detected without activating window
        let pressed_mask: usize = msg_send![class!(NSEvent), pressedMouseButtons];
        let pressed = (pressed_mask & 0b1) != 0;

        emit_cursor_move(window, x, y, inside, pressed);
    }
}

fn start_cursor_monitor(window: WebviewWindow) {
    std::thread::spawn(move || {
        let mut ticks: u64 = 0;
        loop {
            std::thread::sleep(Duration::from_millis(16));
            ticks += 1;
            let w = window.clone();
            let w2 = w.clone();
            let _ = w.run_on_main_thread(move || {
                emit_cursor_position(&w2);
                if ticks % 60 == 0 {
                    ensure_overlay_on_active_space(&w2);
                }
            });
        }
    });
}

fn start_space_monitor(window: WebviewWindow) {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object};
    use std::sync::OnceLock;

    static OVERLAY_WINDOW: OnceLock<WebviewWindow> = OnceLock::new();
    let _ = OVERLAY_WINDOW.set(window);

    extern "C" fn workspace_changed(_this: &Object, _cmd: objc::runtime::Sel, _note: id) {
        let _ = _this;
        let _ = _note;
        if let Some(window) = OVERLAY_WINDOW.get() {
            let w = window.clone();
            let w2 = w.clone();
            let app = w.app_handle().clone();
            let _ = w.run_on_main_thread(move || configure_overlay_window(&w2, &app));
        }
    }

    unsafe {
        static OBSERVER_CLASS: OnceLock<&'static Class> = OnceLock::new();
        let observer_class = OBSERVER_CLASS.get_or_init(|| {
            if let Some(existing) = Class::get("NudgeSpaceObserver") {
                return existing;
            }
            let superclass = class!(NSObject);
            let mut decl = ClassDecl::new("NudgeSpaceObserver", superclass).unwrap();
            decl.add_method(
                sel!(workspaceChanged:),
                workspace_changed as extern "C" fn(&Object, objc::runtime::Sel, id),
            );
            decl.register()
        });

        let observer: id = msg_send![*observer_class, new];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let notification_center: id = msg_send![workspace, notificationCenter];
        let notifications = [
            "NSWorkspaceActiveSpaceDidChangeNotification",
            "NSWorkspaceDidActivateApplicationNotification",
        ];
        for name in notifications {
            let notification_name = NSString::alloc(nil).init_str(name);
            let _: () = msg_send![
                notification_center,
                addObserver:observer
                selector:sel!(workspaceChanged:)
                name:notification_name
                object:nil
            ];
        }
        let _: () = msg_send![observer, retain];
    }
}

fn start_power_monitor(window: WebviewWindow) {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object};
    use std::sync::OnceLock;

    static OVERLAY_WINDOW: OnceLock<WebviewWindow> = OnceLock::new();
    let _ = OVERLAY_WINDOW.set(window);

    extern "C" fn system_will_sleep(_this: &Object, _cmd: objc::runtime::Sel, _note: id) {
        let _ = (_this, _note);
        if let Some(window) = OVERLAY_WINDOW.get() {
            let _ = window.emit("system-will-sleep", ());
        }
    }

    extern "C" fn system_did_wake(_this: &Object, _cmd: objc::runtime::Sel, _note: id) {
        let _ = (_this, _note);
        if let Some(window) = OVERLAY_WINDOW.get() {
            let _ = window.emit("system-did-wake", ());
        }
    }

    unsafe {
        static OBSERVER_CLASS: OnceLock<&'static Class> = OnceLock::new();
        let observer_class = OBSERVER_CLASS.get_or_init(|| {
            if let Some(existing) = Class::get("NudgePowerObserver") {
                return existing;
            }
            let superclass = class!(NSObject);
            let mut decl = ClassDecl::new("NudgePowerObserver", superclass).unwrap();
            decl.add_method(
                sel!(systemWillSleep:),
                system_will_sleep as extern "C" fn(&Object, objc::runtime::Sel, id),
            );
            decl.add_method(
                sel!(systemDidWake:),
                system_did_wake as extern "C" fn(&Object, objc::runtime::Sel, id),
            );
            decl.register()
        });

        let observer: id = msg_send![*observer_class, new];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let notification_center: id = msg_send![workspace, notificationCenter];
        let notifications = [
            ("NSWorkspaceWillSleepNotification", sel!(systemWillSleep:)),
            ("NSWorkspaceDidWakeNotification", sel!(systemDidWake:)),
        ];
        for (name, selector) in notifications {
            let notification_name = NSString::alloc(nil).init_str(name);
            let _: () = msg_send![
                notification_center,
                addObserver:observer
                selector:selector
                name:notification_name
                object:nil
            ];
        }
        let _: () = msg_send![observer, retain];
    }
}

/// Cursor, space-change and sleep/wake monitors for the overlay.
pub fn start_platform_monitors(window: WebviewWindow) {
    start_cursor_monitor(window.clone());
    start_space_monitor(window.clone());
    start_power_monitor(window);
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    /// double CGEventSourceSecondsSinceLastEventType(CGEventSourceStateID, CGEventType)
    fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
}

/// Seconds since last keypresses/clicks/scrolling
pub fn seconds_since_last_input() -> f64 {
    unsafe {
        // kCGEventSourceStateCombinedSessionState = 0
        const STATE: i32 = 0;
        // CGEventType values treating as the user being active.
        // Mouse-moved (5) and dragged variants (6/7) not considered
        const EVENT_TYPES: [u32; 7] = [
            1,  // kCGEventLeftMouseDown
            3,  // kCGEventRightMouseDown
            10, // kCGEventKeyDown
            11, // kCGEventKeyUp
            12, // kCGEventFlagsChanged (modifier keys)
            22, // kCGEventScrollWheel
            25, // kCGEventOtherMouseDown
        ];
        EVENT_TYPES
            .iter()
            .map(|&t| CGEventSourceSecondsSinceLastEventType(STATE, t))
            .fold(f64::INFINITY, f64::min)
    }
}

/// The currently focused app, skipping our own overlay process.
pub fn frontmost_app() -> Option<FrontmostApp> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication, NSWorkspace};
    use objc2_foundation::NSBundle;

    autoreleasepool(|pool| {
        let our_bundle = unsafe { NSBundle::mainBundle().bundleIdentifier() }
            .map(|id| id.as_str(pool).to_owned());
        let our_bundle_ref = our_bundle.as_deref();

        let is_our_app = |app: &NSRunningApplication| -> bool {
            match (our_bundle_ref, unsafe { app.bundleIdentifier() }) {
                (Some(ours), Some(bid)) => bid.as_str(pool) == ours,
                _ => false,
            }
        };

        let from_running_app = |app: &NSRunningApplication| -> Option<FrontmostApp> {
            let name = unsafe { app.localizedName()? }.as_str(pool).to_owned();
            let bundle_id = unsafe { app.bundleIdentifier() }
                .map(|bid| bid.as_str(pool).to_owned());
            Some(FrontmostApp {
                name,
                bundle_id,
                category: crate::app_categories::UNKNOWN_CATEGORY.to_string(),
                category_label: crate::app_categories::category_label(
                    crate::app_categories::UNKNOWN_CATEGORY,
                ),
            })
        };

        let workspace = unsafe { NSWorkspace::sharedWorkspace() };

        if let Some(app) = unsafe { workspace.frontmostApplication() } {
            if !is_our_app(&app) {
                return from_running_app(&app);
            }
        }

        // use the active regular app underneath since overlay is at the front frontmost
        let running = unsafe { workspace.runningApplications() };
        for app in &*running {
            if is_our_app(&app) {
                continue;
            }
            let active = unsafe { app.isActive() };
            let regular =
                unsafe { app.activationPolicy() } == NSApplicationActivationPolicy::Regular;
            if active && regular {
                return from_running_app(&app);
            }
        }

        None
    })
}

fn our_bundle_id() -> Option<String> {
    use objc2::rc::autoreleasepool;
    use objc2_foundation::NSBundle;

    autoreleasepool(|pool| {
        unsafe { NSBundle::mainBundle().bundleIdentifier() }
            .map(|id| id.as_str(pool).to_owned())
    })
}

fn fourcc(bytes: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*bytes)
}

#[repr(C)]
struct AudioObjectPropertyAddress {
    m_selector: u32,
    m_scope: u32,
    m_element: u32,
}

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

/// Pids and display names of processes currently producing audio (CoreAudio).
pub fn audible_media_processes() -> Vec<(i32, String)> {
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
