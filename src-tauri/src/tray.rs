//! Menu-bar item. Nudge runs as an accessory app with no Dock icon, so this is the
//! one place that is always reachable, including the only way to quit.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter};

/// Menu ids forwarded to the overlay as the `tray-action` event payload.
pub const FORWARDED_ACTIONS: &[&str] = &[
    "toggle-companion",
    "break",
    "quiet-hour",
    "resume-nudges",
    "summary",
    "settings",
];

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let version = format!("nudge {}", app.package_info().version);
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "version", version, false, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &item("toggle-companion", "Show or Hide Companion")?,
            &item("break", "Take a Break…")?,
            &PredefinedMenuItem::separator(app)?,
            &item("quiet-hour", "Quiet Nudges for 1 Hour")?,
            &item("resume-nudges", "Resume Nudges")?,
            &PredefinedMenuItem::separator(app)?,
            &item("summary", "Activity Summary…")?,
            &item("settings", "Settings…")?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "Quit nudge")?,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("nudge")
        .tooltip("nudge")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle(app, event.id().as_ref()));
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn handle(app: &AppHandle, id: &str) {
    if id == "quit" {
        // ExitRequested persists activity before the process ends.
        app.exit(0);
    } else if FORWARDED_ACTIONS.contains(&id) {
        let _ = app.emit("tray-action", id);
    }
}
