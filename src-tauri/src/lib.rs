use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager};
mod activity;
mod app_categories;
mod auto_break;
mod settings;
pub use activity::{get_activity, persist_activity, save_activity, ActivityStore};
pub use app_categories::get_app_category_options;
pub use settings::{
    get_settings, get_monitor_options, save_settings, close_settings, open_settings,
    move_to_settings_monitor, register_pause_shortcut, pop_pending_note, add_pending_note,
    get_pending_notes, remove_pending_note,
    AppState, MonitorOption, Settings,
};


#[cfg(target_os = "macos")]
use cocoa::appkit::{NSEvent, NSColor, NSWindow};
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil, BOOL, NO, YES};
#[cfg(target_os = "macos")]
use cocoa::foundation::{NSPoint, NSString};
#[cfg(target_os = "macos")]
use objc::runtime::Class;
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

#[derive(Clone, serde::Serialize)]
struct CursorMove {
    x: f64,
    y: f64,
    inside: bool,
    /// if left mouse button is currently held down
    pressed: bool,
}

/// Seconds passed on the reminder/energy-drain clock. Shared with the reminder thread so the frontend can reset
struct ReminderTimer(Arc<AtomicU64>);

/// Resets the reminder/energy-drain clock so the next reminder is a full interval away
#[tauri::command]
fn reset_reminder_timer(timer: tauri::State<ReminderTimer>) {
    timer.0.store(0, Ordering::SeqCst);
}

/// When pass_through is true, clicks pass go through the window
#[tauri::command]
fn set_click_through(app: tauri::AppHandle, pass_through: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let w = window.clone();
    window
        .run_on_main_thread(move || {
            set_ignores_mouse_events(&w, pass_through);
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Nudge AppKit/WebKit to repaint after overlay UI changes. Transparent panels can
/// leave stale IOSurface layers on some Mac GPUs if the window is not invalidated.
#[tauri::command]
fn invalidate_overlay_display(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        let w = window.clone();
        window
            .run_on_main_thread(move || invalidate_overlay_window(&w))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};

#[cfg(target_os = "macos")]
static OVERLAY_PANEL_READY: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
unsafe fn configure_transparent_layers(window: &tauri::WebviewWindow) {
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

#[cfg(target_os = "macos")]
fn invalidate_overlay_window(window: &tauri::WebviewWindow) {
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

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
pub(crate) fn configure_macos_overlay_window(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    use tauri_nspanel::{
        cocoa::appkit::NSWindowCollectionBehavior, ManagerExt, WebviewWindowExt,
    };

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

#[cfg(target_os = "macos")]
fn ensure_overlay_on_active_space(window: &tauri::WebviewWindow) {
    let app = window.app_handle();
    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };

    unsafe {
        let ns_window = ns_window_ptr as id;
        let on_active_space: BOOL = msg_send![ns_window, isOnActiveSpace];
        if on_active_space == NO {
            configure_macos_overlay_window(window, &app);
        }
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn set_ignores_mouse_events(window: &tauri::WebviewWindow, ignore: bool) {
    unsafe {
        let ns_window = window.ns_window().expect("ns_window") as id;
        ns_window.setIgnoresMouseEvents_(if ignore { YES } else { NO });
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn set_ignores_mouse_events(window: &tauri::WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

#[cfg(target_os = "macos")]
fn emit_cursor_position(window: &tauri::WebviewWindow) {
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

        let _ = window.emit(
            "cursor://move",
            CursorMove {
                x,
                y,
                inside,
                pressed,
            },
        );
    }
}

#[cfg(target_os = "macos")]
fn start_cursor_monitor(window: tauri::WebviewWindow) {
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

#[cfg(target_os = "macos")]
fn start_space_monitor(window: tauri::WebviewWindow) {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object};
    use std::sync::OnceLock;

    static OVERLAY_WINDOW: OnceLock<tauri::WebviewWindow> = OnceLock::new();
    let _ = OVERLAY_WINDOW.set(window);

    extern "C" fn workspace_changed(_this: &Object, _cmd: objc::runtime::Sel, _note: id) {
        let _ = _this;
        let _ = _note;
        if let Some(window) = OVERLAY_WINDOW.get() {
            let w = window.clone();
            let w2 = w.clone();
            let app = w.app_handle().clone();
            let _ = w.run_on_main_thread(move || configure_macos_overlay_window(&w2, &app));
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

#[cfg(target_os = "macos")]
fn start_power_monitor(window: tauri::WebviewWindow) {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object};
    use std::sync::OnceLock;

    static OVERLAY_WINDOW: OnceLock<tauri::WebviewWindow> = OnceLock::new();
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

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    /// double CGEventSourceSecondsSinceLastEventType(CGEventSourceStateID, CGEventType)
    fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
}

/// Seconds since last keypresses/clicks/scrolling
#[tauri::command]
fn get_seconds_since_last_input() -> f64 {
    #[cfg(target_os = "macos")]
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
    #[cfg(not(target_os = "macos"))]
    {
        f64::INFINITY
    }
}

// get current focused app
#[derive(Clone, serde::Serialize)]
struct FrontmostApp {
    name: String,
    bundle_id: Option<String>,
    category: String,
    category_label: String,
}

#[cfg(target_os = "macos")]
fn frontmost_app() -> Option<FrontmostApp> {
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
                category: app_categories::UNKNOWN_CATEGORY.to_string(),
                category_label: app_categories::category_label(app_categories::UNKNOWN_CATEGORY),
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

#[tauri::command]
fn get_frontmost_app(app: tauri::AppHandle) -> Result<Option<FrontmostApp>, String> {
    #[cfg(target_os = "macos")]
    {
        let mut front = frontmost_app();
        if let Some(ref info) = front {
            let mut settings = Settings::load(&app).unwrap_or_default();
            if info
                .bundle_id
                .as_ref()
                .is_some_and(|bid| !settings.app_categories.contains_key(bid))
            {
                settings.sync_app_categories();
                let _ = settings.save(&app);
            }
            if let Some(ref mut info) = front {
                info.category = settings.category_for_bundle(info.bundle_id.as_deref());
                info.category_label = app_categories::category_label(&info.category);
            }
        }
        Ok(front)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(None)
    }
}

#[derive(Clone, serde::Serialize)]
struct AutoBreakStatus {
    idle_seconds: f64,
    idle_threshold_seconds: u64,
    should_auto_break: bool,
    defer_auto_break: bool,
    defer_reason: Option<String>,
}

#[tauri::command]
fn get_auto_break_status(app: tauri::AppHandle) -> Result<AutoBreakStatus, String> {
    let idle_seconds = get_seconds_since_last_input();
    let settings = Settings::load(&app)?;
    let front = get_frontmost_app(app.clone())?;
    let bundle_id = front.as_ref().and_then(|info| info.bundle_id.as_deref());
    let category = front.as_ref().map(|info| info.category.as_str());
    let status = auto_break::evaluate_auto_break(
        &app,
        idle_seconds,
        &settings,
        bundle_id,
        category,
    );
    Ok(AutoBreakStatus {
        idle_seconds: status.idle_seconds,
        idle_threshold_seconds: status.idle_threshold_seconds,
        should_auto_break: status.should_auto_break,
        defer_auto_break: status.defer_auto_break,
        defer_reason: status.defer_reason,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    builder
        .plugin(tauri_plugin_positioner::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // The pause-tracking shortcut is the only one we register.
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let _ = app.emit("toggle-pause", ());
                    }
                })
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            set_click_through,
            get_settings,
            get_monitor_options,
            save_settings,
            open_settings,
            close_settings,
            get_frontmost_app,
            get_app_category_options,
            get_seconds_since_last_input,
            get_auto_break_status,
            get_activity,
            save_activity,
            reset_reminder_timer,
            pop_pending_note,
            add_pending_note,
            get_pending_notes,
            remove_pending_note,
            invalidate_overlay_display,
        ])
        .setup(|app| {
            app.manage(ActivityStore::load(app.handle()));

            let window = app.get_webview_window("main").unwrap();
            let settings = Settings::load_synced_and_save(app.handle()).unwrap_or_default();
            let position = settings.window_position();

            if let Err(e) = register_pause_shortcut(app.handle(), &settings.pause_shortcut) {
                eprintln!(
                    "failed to register pause shortcut {:?}: {e}",
                    settings.pause_shortcut
                );
            }

            // dont bug out when screens missing
            if let Err(e) = move_to_settings_monitor(
                app.handle(),
                &window,
                &settings,
                position,
                settings::OVERLAY_WIDTH,
                settings::OVERLAY_HEIGHT,
            ) {
                eprintln!("failed to position window on startup: {e}");
            }

            #[cfg(target_os = "macos")]
            {
                let _ = window.set_visible_on_all_workspaces(true);
                set_ignores_mouse_events(&window, true);
            }

            #[cfg(not(target_os = "macos"))]
            let _ = window.set_ignore_cursor_events(true);

            let app_handle = app.handle().clone();
            let w_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Moved(_) = event {
                    if *app_handle.state::<AppState>().settings_open.lock().unwrap() {
                        return;
                    }
                    let settings = Settings::load(&app_handle).unwrap_or_default();
                    let position = settings.window_position();
                    let _ = move_to_settings_monitor(
                        &app_handle,
                        &w_clone,
                        &settings,
                        position,
                        settings::OVERLAY_WIDTH,
                        settings::OVERLAY_HEIGHT,
                    );
                }

                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    if let Err(e) = persist_activity(&app_handle) {
                        eprintln!("Failed to save activity: {e}");
                    }
                }
            });

            // Shared reminder clock so the frontend can reset it via reset_reminder_timer.
            let reminder_elapsed = Arc::new(AtomicU64::new(0));
            app.manage(ReminderTimer(reminder_elapsed.clone()));

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut settings = Settings::load(&app_handle).unwrap_or_default();
                let mut target_interval_secs = settings.reminder_interval_mins as u64 * 60;

                loop {
                    std::thread::sleep(Duration::from_secs(1));
                    let seconds_passed = reminder_elapsed.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = app_handle.emit("time-passed", ()); // emits every second

                    // check if setting's changed
                    if let Ok(latest_settings) = Settings::load(&app_handle) {
                        if latest_settings.reminder_interval_mins != settings.reminder_interval_mins {
                            settings = latest_settings;
                            target_interval_secs = settings.reminder_interval_mins as u64 * 60;
                            reminder_elapsed.store(0, Ordering::SeqCst);
                            continue;
                        }
                    }

                    if target_interval_secs > 0 && seconds_passed >= target_interval_secs {
                        let _ = app_handle.emit("show-reminder", ());
                        reminder_elapsed.store(0, Ordering::SeqCst);
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Ready = event {
                #[cfg(target_os = "macos")]
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
                    configure_macos_overlay_window(&window, app_handle);
                    start_cursor_monitor(window.clone());
                    start_space_monitor(window.clone());
                    start_power_monitor(window);
                }
            }
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Err(e) = persist_activity(app_handle) {
                    eprintln!("Failed to save activity on exit: {e}");
                }
            }
        });
}
