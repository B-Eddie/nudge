use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;
mod activity;
mod app_categories;
mod auto_break;
mod platform;
mod settings;
pub use activity::{get_activity, persist_activity, save_activity, ActivityStore};
pub use app_categories::get_app_category_options;
pub use platform::FrontmostApp;
pub use settings::{
    get_settings, get_monitor_options, save_settings, close_settings, open_settings,
    move_to_settings_monitor, register_pause_shortcut, pop_pending_note, add_pending_note,
    get_pending_notes, remove_pending_note,
    AppState, MonitorOption, Settings,
};

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
            platform::set_ignores_mouse_events(&w, pass_through);
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Nudge the platform to repaint the overlay after UI changes.
/// (Only macOS needs this; it is a no-op elsewhere.)
#[tauri::command]
fn invalidate_overlay_display(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let w = window.clone();
    window
        .run_on_main_thread(move || platform::invalidate_overlay_display(&w))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Seconds since last keypresses/clicks/scrolling
#[tauri::command]
fn get_seconds_since_last_input() -> f64 {
    platform::seconds_since_last_input()
}

// get current focused app
#[tauri::command]
fn get_frontmost_app(app: tauri::AppHandle) -> Result<Option<FrontmostApp>, String> {
    let mut front = platform::frontmost_app();
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
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostarted"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
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

            // Sync autostart state with saved setting
            if let Some(autostart) = app.try_state::<tauri_plugin_autostart::AutoLaunchManager>() {
                if settings.launch_at_login {
                    let _ = autostart.enable();
                } else {
                    let _ = autostart.disable();
                }
            }

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

            // Start click-through; platform::configure_overlay_window (at Ready)
            // finishes the overlay setup.
            let _ = window.set_visible_on_all_workspaces(true);
            platform::set_ignores_mouse_events(&window, true);

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
                if let Some(window) = app_handle.get_webview_window("main") {
                    platform::configure_overlay_window(&window, app_handle);
                    platform::start_platform_monitors(window);
                }
            }
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Err(e) = persist_activity(app_handle) {
                    eprintln!("Failed to save activity on exit: {e}");
                }
            }
        });
}
