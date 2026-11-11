use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_positioner::Position;

use crate::app_categories::{
    discover_running_apps, merge_discovered_apps, refresh_app_categories, AppCategoryEntry,
    UNKNOWN_CATEGORY,
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

fn default_character() -> String {
    "crab".to_string()
}

fn default_character_size() -> u32 {
    120
}

/// New installs follow the macOS appearance; saved choices are kept as they are.
fn default_theme() -> String {
    "system".to_string()
}

fn default_reminder_snooze_mins() -> u32 {
    10
}

#[derive(Default)]
pub struct AppState {
    pub settings_open: Mutex<bool>,
    pub pet_position: Mutex<Option<PhysicalPosition<i32>>>,
    input_request_generation: AtomicU64,
}

impl AppState {
    pub(crate) fn set_panel_open(&self, open: bool) {
        let mut panel_open = self.settings_open.lock().unwrap();
        *panel_open = open;
        // A panel transition supersedes cursor events already queued on AppKit.
        self.input_request_generation.fetch_add(1, Ordering::SeqCst);
    }

    pub(crate) fn next_input_request(&self) -> u64 {
        self.input_request_generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub(crate) fn queued_click_through(&self, generation: u64, requested: bool) -> Option<bool> {
        let panel_open = self.settings_open.lock().unwrap();
        if generation != self.input_request_generation.load(Ordering::SeqCst) {
            return None;
        }
        // Recheck at execution time: old pet hit tests must never disable a dialog.
        Some(requested && !*panel_open)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub monitor_index: i32,
    pub reminder_interval_mins: u32,
    #[serde(default = "default_reminder_snooze_mins")]
    pub reminder_snooze_mins: u32,
    pub position: String,
    #[serde(default = "default_character")]
    pub character: String,
    #[serde(default = "default_character_size")]
    pub character_size: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
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
    #[serde(default)]
    pub hide_helper_apps: bool,
}

fn default_auto_idle_break_mins() -> u32 {
    5
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            monitor_index: 0,
            reminder_interval_mins: 30,
            reminder_snooze_mins: default_reminder_snooze_mins(),
            position: "bottom_left".to_string(),
            character: default_character(),
            character_size: default_character_size(),
            theme: default_theme(),
            pause_shortcut: default_pause_shortcut(),
            app_categories: HashMap::new(),
            onboarding_complete: false,
            pending_notes: Vec::new(),
            auto_idle_break_mins: default_auto_idle_break_mins(),
            launch_at_login: false,
            hide_helper_apps: false,
        }
    }
}

impl Settings {
    pub fn sync_app_categories(&mut self) {
        self.character_size = self.character_size.clamp(60, 180);
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

    /// Parses a settings file. Installs that predate onboarding already finished it.
    pub fn from_json(data: &str) -> Result<Self, String> {
        let mut settings: Settings = serde_json::from_str(data).map_err(|e| e.to_string())?;
        if !data.contains("onboarding_complete") {
            settings.onboarding_complete = true;
        }
        settings.character_size = settings.character_size.clamp(60, 180);
        Ok(settings)
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

/// The single owner of `settings.json`.
///
/// Every reader shares one in-memory copy, and every change goes through
/// [`SettingsStore::update`], which holds the lock across modify-and-write. Previously
/// several commands (including a 500 ms frontmost-app poll) each loaded the file,
/// changed it and wrote it back, so a concurrent save could silently undo another.
pub struct SettingsStore {
    path: Option<PathBuf>,
    inner: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(app: &AppHandle) -> Self {
        match app.path().app_config_dir() {
            Ok(dir) => Self::open(dir.join("settings.json")),
            Err(e) => {
                eprintln!("settings directory unavailable; using defaults in memory: {e}");
                Self {
                    path: None,
                    inner: Mutex::new(Settings::default()),
                }
            }
        }
    }

    /// Opens the store at `path`. An unreadable file is moved aside rather than overwritten.
    pub fn open(path: PathBuf) -> Self {
        let settings = match std::fs::read_to_string(&path) {
            Ok(data) => match Settings::from_json(&data) {
                Ok(settings) => settings,
                Err(error) => {
                    match crate::storage::quarantine(&path) {
                        Ok(moved) => eprintln!(
                            "settings.json is unreadable ({error}); moved to {} and using defaults",
                            moved.display()
                        ),
                        Err(move_error) => eprintln!(
                            "settings.json is unreadable ({error}) and could not be moved aside: {move_error}"
                        ),
                    }
                    Settings::default()
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(e) => {
                eprintln!("could not read settings.json; using defaults: {e}");
                Settings::default()
            }
        };
        Self {
            path: Some(path),
            inner: Mutex::new(settings),
        }
    }

    /// A snapshot of the current settings.
    pub fn get(&self) -> Settings {
        self.inner.lock().unwrap().clone()
    }

    /// Reads without cloning (for hot paths such as the frontmost-app poll).
    pub fn read<R>(&self, f: impl FnOnce(&Settings) -> R) -> R {
        f(&self.inner.lock().unwrap())
    }

    /// Applies `f` and persists the result atomically. Memory changes only if the
    /// write succeeds, so the in-memory copy never drifts from disk.
    pub fn update<R>(&self, f: impl FnOnce(&mut Settings) -> R) -> Result<R, String> {
        let mut current = self.inner.lock().unwrap();
        let mut next = current.clone();
        let result = f(&mut next);
        next.character_size = next.character_size.clamp(60, 180);
        if let Some(path) = &self.path {
            let json = serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?;
            crate::storage::write_atomic(path, &json)?;
        }
        *current = next;
        Ok(result)
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

fn physical_window_size(
    monitor: &tauri::Monitor,
    logical_width: f64,
    logical_height: f64,
) -> (i32, i32) {
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
pub fn get_settings(store: State<SettingsStore>) -> Settings {
    store.get()
}

/// Rescans installed and running apps, dropping deleted apps and keeping custom categories.
pub fn refresh_installed_apps(store: &SettingsStore) {
    if let Err(e) = store.update(|s| refresh_app_categories(&mut s.app_categories)) {
        eprintln!("failed to save refreshed app list: {e}");
    }
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
    store: State<SettingsStore>,
    settings: Settings,
) -> Result<(), String> {
    let previous = store.get();
    if previous.pause_shortcut != settings.pause_shortcut {
        // Register the new binding first so an invalid one fails the save.
        register_pause_shortcut(&app, &settings.pause_shortcut)?;
        let _ = app
            .global_shortcut()
            .unregister(previous.pause_shortcut.as_str());
    }

    let settings = store.update(|current| {
        *current = merge_saved_settings(current, settings);
        current.clone()
    })?;
    let placement_changed =
        previous.position != settings.position || previous.monitor_index != settings.monitor_index;
    if placement_changed {
        *state.pet_position.lock().unwrap() = None;
        crate::pet_desktop::detach();
    }

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
    if !placement_changed {
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
pub fn open_settings(
    app: AppHandle,
    state: State<AppState>,
    store: State<SettingsStore>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    if !*state.settings_open.lock().unwrap() {
        *state.pet_position.lock().unwrap() = window.outer_position().ok();
    }
    state.set_panel_open(true);

    #[cfg(target_os = "macos")]
    super::set_ignores_mouse_events(&window, false);
    #[cfg(not(target_os = "macos"))]
    let _ = window.set_ignore_cursor_events(false);

    window
        .set_size(LogicalSize::new(SETTINGS_WIDTH, SETTINGS_HEIGHT))
        .map_err(|e| e.to_string())?;

    refresh_installed_apps(&store);
    let settings = store.get();
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
pub fn close_settings(
    app: AppHandle,
    state: State<AppState>,
    store: State<SettingsStore>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    state.set_panel_open(false);

    window
        .set_size(LogicalSize::new(OVERLAY_WIDTH, OVERLAY_HEIGHT))
        .map_err(|e| e.to_string())?;

    let settings = store.get();
    let position = settings.window_position();
    if let Some(saved) = *state.pet_position.lock().unwrap() {
        window.set_position(saved).map_err(|e| e.to_string())?;
    } else {
        move_to_settings_monitor(
            &app,
            &window,
            &settings,
            position,
            OVERLAY_WIDTH,
            OVERLAY_HEIGHT,
        )?;
    }

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
pub fn add_pending_note(store: State<SettingsStore>, note: String) -> Result<(), String> {
    let text = note.trim();
    if text.is_empty() {
        return Ok(());
    }
    store.update(|s| s.pending_notes.push(text.to_string()))
}

/// Queued reminder notes (oldest first).
#[tauri::command]
pub fn get_pending_notes(store: State<SettingsStore>) -> Vec<String> {
    store.read(|s| s.pending_notes.clone())
}

/// Removes a queued note by index.
#[tauri::command]
pub fn remove_pending_note(store: State<SettingsStore>, index: usize) -> Result<(), String> {
    store.update(|s| {
        if index >= s.pending_notes.len() {
            return Err(format!("note index {index} out of range"));
        }
        s.pending_notes.remove(index);
        Ok(())
    })?
}

/// Returns and removes the oldest pending note, if any.
#[tauri::command]
pub fn pop_pending_note(store: State<SettingsStore>) -> Result<Option<String>, String> {
    if store.read(|s| s.pending_notes.is_empty()) {
        return Ok(None);
    }
    store.update(|s| (!s.pending_notes.is_empty()).then(|| s.pending_notes.remove(0)))
}

/// The settings panel edits a snapshot taken when it opened. Notes are owned by their own
/// commands, and apps discovered while the panel was open are not in the snapshot, so keep
/// both from the live copy instead of letting a stale draft erase them.
fn merge_saved_settings(current: &Settings, mut incoming: Settings) -> Settings {
    incoming.pending_notes = current.pending_notes.clone();
    for (bundle_id, entry) in &current.app_categories {
        incoming
            .app_categories
            .entry(bundle_id.clone())
            .or_insert_with(|| entry.clone());
    }
    incoming
}

#[cfg(test)]
mod tests {
    use super::{merge_saved_settings, AppState, Settings, SettingsStore};
    use crate::app_categories::AppCategoryEntry;

    fn temp_settings_path() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "nudge-settings-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    fn app(name: &str) -> AppCategoryEntry {
        AppCategoryEntry {
            name: name.into(),
            category: "public.app-category.developer-tools".into(),
            user_override: false,
            is_helper: Some(false),
            bundle_path: None,
        }
    }

    #[test]
    fn store_persists_updates_and_reloads_them() {
        let path = temp_settings_path();
        let store = SettingsStore::open(path.clone());
        store.update(|s| s.reminder_interval_mins = 45).unwrap();
        assert_eq!(
            SettingsStore::open(path.clone())
                .get()
                .reminder_interval_mins,
            45
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn corrupt_settings_are_moved_aside_not_overwritten() {
        let path = temp_settings_path();
        std::fs::write(&path, b"{\"monitor_index\": ").unwrap();
        let store = SettingsStore::open(path.clone());
        assert_eq!(store.get().reminder_interval_mins, 30);
        let dir = path.parent().unwrap();
        let kept: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("settings.json.corrupt-"))
            .collect();
        assert_eq!(kept.len(), 1);
        assert_eq!(
            std::fs::read(dir.join(&kept[0])).unwrap(),
            b"{\"monitor_index\": "
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn concurrent_updates_are_not_lost() {
        let path = temp_settings_path();
        let store = std::sync::Arc::new(SettingsStore::open(path.clone()));
        let threads: Vec<_> = (0..8)
            .map(|i| {
                let store = store.clone();
                std::thread::spawn(move || {
                    for j in 0..10 {
                        store
                            .update(|s| s.pending_notes.push(format!("{i}-{j}")))
                            .unwrap();
                    }
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap();
        }
        assert_eq!(store.get().pending_notes.len(), 80);
        assert_eq!(
            SettingsStore::open(path.clone()).get().pending_notes.len(),
            80
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn saving_a_stale_panel_draft_keeps_notes_and_newly_discovered_apps() {
        let mut current = Settings {
            pending_notes: vec!["stretch".into()],
            ..Settings::default()
        };
        current
            .app_categories
            .insert("com.new.app".into(), app("New"));
        current
            .app_categories
            .insert("com.code".into(), app("Code"));

        let mut draft = Settings {
            reminder_interval_mins: 50,
            ..Settings::default()
        };
        let mut edited = app("Code");
        edited.category = "public.app-category.games".into();
        edited.user_override = true;
        draft.app_categories.insert("com.code".into(), edited);

        let saved = merge_saved_settings(&current, draft);
        assert_eq!(saved.reminder_interval_mins, 50);
        assert_eq!(saved.pending_notes, vec!["stretch".to_string()]);
        assert!(saved.app_categories.contains_key("com.new.app"));
        assert_eq!(
            saved.app_categories["com.code"].category,
            "public.app-category.games"
        );
    }

    #[test]
    fn opening_a_panel_discards_queued_pet_click_through() {
        let state = AppState::default();
        let before_open = state.next_input_request();
        state.set_panel_open(true);
        assert_eq!(state.queued_click_through(before_open, true), None);

        let during_panel = state.next_input_request();
        assert_eq!(state.queued_click_through(during_panel, true), Some(false));
    }

    #[test]
    fn latest_cursor_request_supersedes_a_stale_queued_request() {
        let state = AppState::default();
        let older = state.next_input_request();
        let latest = state.next_input_request();
        assert_eq!(state.queued_click_through(older, true), None);
        assert_eq!(state.queued_click_through(latest, false), Some(false));
    }

    #[test]
    fn closing_a_panel_restores_pet_hit_testing_without_old_capture_requests() {
        let state = AppState::default();
        state.set_panel_open(true);
        let during_panel = state.next_input_request();
        state.set_panel_open(false);
        assert_eq!(state.queued_click_through(during_panel, false), None);

        let outside_pet = state.next_input_request();
        assert_eq!(state.queued_click_through(outside_pet, true), Some(true));
        let over_pet = state.next_input_request();
        assert_eq!(state.queued_click_through(over_pet, false), Some(false));
    }

    #[test]
    fn legacy_settings_keep_default_size_and_saved_sizes_round_trip() {
        let mut legacy = serde_json::to_value(Settings::default()).unwrap();
        legacy.as_object_mut().unwrap().remove("character_size");
        let restored: Settings = serde_json::from_value(legacy).unwrap();
        assert_eq!(restored.character_size, 120);
        for size in [60, 144, 180] {
            let settings = Settings {
                character_size: size,
                ..Settings::default()
            };
            let saved = serde_json::to_string(&settings).unwrap();
            assert_eq!(
                serde_json::from_str::<Settings>(&saved)
                    .unwrap()
                    .character_size,
                size
            );
        }
    }
}
