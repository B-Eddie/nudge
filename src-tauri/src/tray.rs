//! Menu-bar item. Nudge runs as an accessory app with no Dock icon, so this is the
//! one place that is always reachable, including the only way to quit.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter};

const TRAY_ID: &str = "nudge";

/// Menu ids forwarded to the overlay as the `tray-action` event payload.
pub const FORWARDED_ACTIONS: &[&str] = &[
    "toggle-companion",
    "ugh",
    "break",
    "focus",
    "garden",
    "quiet-30",
    "quiet-hour",
    "quiet-3h",
    "quiet-tomorrow",
    "resume-nudges",
    "summary",
    "wrapup",
    "settings",
];

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let version = format!("nudge {}", app.package_info().version);
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
    let quiet = Submenu::with_items(
        app,
        "Quiet Nudges",
        true,
        &[
            &item("quiet-30", "For 30 Minutes")?,
            &item("quiet-hour", "For 1 Hour")?,
            &item("quiet-3h", "For 3 Hours")?,
            &item("quiet-tomorrow", "Until Tomorrow")?,
        ],
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "version", version, false, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &item("toggle-companion", "Show or Hide Companion")?,
            &item("ugh", "Do-Nothing Expansion")?,
            &item("break", "Take a Break…")?,
            &item("focus", "Focus Session…")?,
            &item("garden", "Garden…")?,
            &PredefinedMenuItem::separator(app)?,
            &quiet,
            &item("resume-nudges", "Resume Nudges")?,
            &PredefinedMenuItem::separator(app)?,
            &item("summary", "Activity Summary…")?,
            &item("wrapup", "Wrap Up the Day…")?,
            &item("settings", "Settings…")?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "Quit nudge")?,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
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

/// Short text beside the menu-bar icon, such as the minutes left; `None` clears it.
#[tauri::command]
pub fn set_tray_title(app: AppHandle, title: Option<String>) -> Result<(), String> {
    let title = title.map(|t| t.chars().take(12).collect::<String>());
    match app.tray_by_id(TRAY_ID) {
        Some(tray) => tray.set_title(title).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

fn handle(app: &AppHandle, id: &str) {
    if id == "quit" {
        // ExitRequested persists activity before the process ends.
        app.exit(0);
    } else if FORWARDED_ACTIONS.contains(&id) {
        let _ = app.emit("tray-action", id);
    }
}
