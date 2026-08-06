use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_positioner::Position;

use crate::app_categories::{
    discover_running_apps, merge_discovered_apps, AppCategoryEntry, UNKNOWN_CATEGORY,
};

// ensure these values are consistent everywhere
pub const OVERLAY_WIDTH: f64 = 300.0;
pub const OVERLAY_HEIGHT: f64 = 300.0;
pub const SETTINGS_WIDTH: f64 = 420.0;
pub const SETTINGS_HEIGHT: f64 = 580.0;

pub const DEFAULT_PAUSE_SHORTCUT: &str = "Cmd+Option+Shift+KeyP";

fn default_pause_shortcut() -> String {
    DEFAULT_PAUSE_SHORTCUT.to_string()
}

#[derive(Default)]
pub struct AppState {
    pub settings_open: Mutex<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub monitor_index: i32,
    pub reminder_interval_mins: u32,
    pub position: String,
    #[serde(default = "default_pause_shortcut")]
    pub pause_shortcut: String,
    #[serde(default)]
    pub app_categories: HashMap<String, AppCategoryEntry>,
    #[serde(default)]
    pub onboarding_complete: bool,
    /// User-written lines the character speaks at the next reminder (time event).
    #[serde(default)]
    pub pending_notes: Vec<String>,
    /// Minutes without keyboard/mouse input before an automatic break starts.
    #[serde(default = "default_auto_idle_break_mins")]
    pub auto_idle_break_mins: u32,
    /// Whether to automatically launch nudge when the user logs in.
    #[serde(default)]
    pub launch_at_login: bool,
}

fn default_auto_idle_break_mins() -> u32 {
    5
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            monitor_index: 0,
            reminder_interval_mins: 30,
            position: "bottom_left".to_string(),
            pause_shortcut: default_pause_shortcut(),
            app_categories: HashMap::new(),
            onboarding_complete: false,
            pending_notes: Vec::new(),
            auto_idle_break_mins: default_auto_idle_break_mins(),
            launch_at_login: false,
        }
    }
}

impl Settings {
    pub fn sync_app_categories(&mut self) {
        let discovered = discover_running_apps();
        merge_discovered_apps(&mut self.app_categories, &discovered);
    }

    pub fn category_for_bundle(&self, bundle_id: Option<&str>) -> String {
        if let Some(id) = bundle_id {
            if let Some(entry) = self.app_categories.get(id) {
                return entry.category.clone();
            }
        }
        UNKNOWN_CATEGORY.to_string()
    }

    fn path(app: &AppHandle) -> Result<PathBuf, String> {
        let dir = app
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?;
        Ok(dir.join("settings.json"))
    }

    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let path = Self::path(app)?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut settings: Settings = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        // Existing installs without this field already completed setup implicitly.
        if !data.contains("onboarding_complete") {
            settings.onboarding_complete = true;
        }
        Ok(settings)
    }

    pub fn load_synced(app: &AppHandle) -> Result<Self, String> {
        let mut settings = Self::load(app)?;
        settings.sync_app_categories();
        Ok(settings)
    }

    pub fn load_synced_and_save(app: &AppHandle) -> Result<Self, String> {
        let settings = Self::load_synced(app)?;
        settings.save(app)?;
        Ok(settings)
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }

    pub fn window_position(&self) -> Position {
        match self.position.as_str() {
            "bottom_left" => Position::BottomLeft,
            "bottom_right" => Position::BottomRight,
            "top_left" => Position::TopLeft,
            "top_right" => Position::TopRight,
            "center" => Position::Center,
            _ => Position::BottomLeft,
        }
    }
}

fn target_monitor(app: &AppHandle, settings: &Settings) -> Result<tauri::Monitor, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let idx = settings.monitor_index.max(0) as usize;
    if let Some(monitor) = monitors.get(idx).or(monitors.first()).cloned() {
        return Ok(monitor);
    }
    // available_monitors() can be empty at launch on macOS
    app.primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitors found".to_string())
}

fn physical_window_size(monitor: &tauri::Monitor, logical_width: f64, logical_height: f64) -> (i32, i32) {
    let scale = monitor.scale_factor();
    (
        (logical_width * scale).round() as i32,
        (logical_height * scale).round() as i32,
    )
}

// put window on correct monitor
pub fn move_to_settings_monitor(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    settings: &Settings,
    position: Position,
    logical_width: f64,
    logical_height: f64,
) -> Result<(), String> {
    let monitor = target_monitor(app, settings)?;
    let work_area = monitor.work_area();
    let screen_pos = work_area.position;
    let screen_w = work_area.size.width as i32;
    let screen_h = work_area.size.height as i32;
    let (window_w, window_h) = physical_window_size(&monitor, logical_width, logical_height);

    let x = match position {
        Position::BottomLeft | Position::TopLeft | Position::LeftCenter => screen_pos.x,
        Position::BottomRight | Position::TopRight | Position::RightCenter => {
            screen_pos.x + screen_w - window_w
        }
        Position::BottomCenter | Position::TopCenter | Position::Center => {
            screen_pos.x + (screen_w - window_w) / 2
        }
        #[allow(unreachable_patterns)]
        _ => screen_pos.x,
    };

    let y = match position {
        Position::TopLeft | Position::TopRight | Position::TopCenter => screen_pos.y,
        Position::BottomLeft | Position::BottomRight | Position::BottomCenter => {
            screen_pos.y + screen_h - window_h
        }
        Position::Center | Position::LeftCenter | Position::RightCenter => {
            screen_pos.y + (screen_h - window_h) / 2
        }
        #[allow(unreachable_patterns)]
        _ => screen_pos.y,
    };

    window
        .set_position(PhysicalPosition { x, y })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct MonitorOption {
    pub value: i32,
    pub label: String,
}

#[cfg(target_os = "macos")]
fn monitor_label(_app: &AppHandle, monitor: &tauri::Monitor, index: usize) -> String {
    if let Some(name) = monitor.name() {
        if !name.starts_with("Monitor #") {
            return name.clone();
        }
    }

    let size = monitor.size();
    let scale = monitor.scale_factor();
    let w = (size.width as f64 / scale).round() as u32;
    let h = (size.height as f64 / scale).round() as u32;

    format!("Display {} · {} x {}", index + 1, w, h)
}


#[tauri::command]
pub fn get_monitor_options(app: AppHandle) -> Result<Vec<MonitorOption>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| MonitorOption {
            value: index as i32,
            label: monitor_label(&app, monitor, index),
        })
        .collect())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    Settings::load_synced_and_save(&app)
}

/// Registers the hide-character global shortcut. Pressing it emits to the frontend
pub fn register_pause_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: Settings,
) -> Result<(), String> {
    let previous = Settings::load(&app).unwrap_or_default();
    if previous.pause_shortcut != settings.pause_shortcut {
        // Register the new binding first so an invalid one fails the save.
        register_pause_shortcut(&app, &settings.pause_shortcut)?;
        let _ = app.global_shortcut().unregister(previous.pause_shortcut.as_str());
    }

    settings.save(&app)?;

    // Apply autostart setting
    if let Some(autostart) = app.try_state::<tauri_plugin_autostart::AutoLaunchManager>() {
        if settings.launch_at_login {
            let _ = autostart.enable();
        } else {
            let _ = autostart.disable();
        }
    }

    if *state.settings_open.lock().unwrap() {
        return Ok(());
    }
    if let Some(window) = app.get_webview_window("main") {
        let position = settings.window_position();
        move_to_settings_monitor(
            &app,
            &window,
            &settings,
            position,
            OVERLAY_WIDTH,
            OVERLAY_HEIGHT,
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    *state.settings_open.lock().unwrap() = true;

    #[cfg(target_os = "macos")]
    super::set_ignores_mouse_events(&window, false);
    #[cfg(not(target_os = "macos"))]
    let _ = window.set_ignore_cursor_events(false);

    window
        .set_size(LogicalSize::new(SETTINGS_WIDTH, SETTINGS_HEIGHT))
        .map_err(|e| e.to_string())?;

    let settings = Settings::load(&app)?;
    move_to_settings_monitor(
        &app,
        &window,
        &settings,
        Position::Center,
        SETTINGS_WIDTH,
        SETTINGS_HEIGHT,
    )?;

    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub fn close_settings(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    *state.settings_open.lock().unwrap() = false;

    window
        .set_size(LogicalSize::new(OVERLAY_WIDTH, OVERLAY_HEIGHT))
        .map_err(|e| e.to_string())?;

    let settings = Settings::load(&app)?;
    let position = settings.window_position();
    move_to_settings_monitor(
        &app,
        &window,
        &settings,
        position,
        OVERLAY_WIDTH,
        OVERLAY_HEIGHT,
    )?;

    #[cfg(target_os = "macos")]
    super::configure_macos_overlay_window(&window, &app);
    #[cfg(target_os = "macos")]
    super::set_ignores_mouse_events(&window, true);
    #[cfg(not(target_os = "macos"))]
    let _ = window.set_ignore_cursor_events(true);

    Ok(())
}

/// Appends a pending reminder note.
#[tauri::command]
pub fn add_pending_note(app: AppHandle, note: String) -> Result<(), String> {
    let text = note.trim();
    if text.is_empty() {
        return Ok(());
    }
    let mut settings = Settings::load(&app)?;
    settings.pending_notes.push(text.to_string());
    settings.save(&app)?;
    Ok(())
}

/// Queued reminder notes (oldest first).
#[tauri::command]
pub fn get_pending_notes(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(Settings::load(&app)?.pending_notes)
}

/// Removes a queued note by index.
#[tauri::command]
pub fn remove_pending_note(app: AppHandle, index: usize) -> Result<(), String> {
    let mut settings = Settings::load(&app)?;
    if index >= settings.pending_notes.len() {
        return Err(format!("note index {} out of range", index));
    }
    settings.pending_notes.remove(index);
    settings.save(&app)?;
    Ok(())
}

/// Returns and removes the oldest pending note, if any.
#[tauri::command]
pub fn pop_pending_note(app: AppHandle) -> Result<Option<String>, String> {
    let mut settings = Settings::load(&app)?;
    if settings.pending_notes.is_empty() {
        return Ok(None);
    }
    let note = settings.pending_notes.remove(0);
    settings.save(&app)?;
    Ok(Some(note))
}
