use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::storage::write_atomic;

/// How one reminder was answered, kept so later ones can be better timed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NudgeRecord {
    pub hour: u8,
    /// taken | later | missed
    pub outcome: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStats {
    pub started_at: u64,
    pub category_seconds: HashMap<String, u32>,
    pub breaks_taken: u32,
    pub breaks_interrupted: u32,
    pub rest_seconds: u32,
    pub current_stretch_seconds: u32,
    pub longest_stretch_seconds: u32,
    /// Active seconds in each hour of the day (24 entries, or empty on older days).
    #[serde(default)]
    pub hourly_seconds: Vec<u32>,
    #[serde(default)]
    pub nudges: Vec<NudgeRecord>,
    #[serde(default)]
    pub focus_seconds: u32,
    #[serde(default)]
    pub focus_sessions: u32,
    /// 1 (rough) to 5 (great), if the person chose to say.
    #[serde(default)]
    pub mood: Option<u8>,
}

impl Default for SessionStats {
    fn default() -> Self {
        let started_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        Self {
            started_at,
            category_seconds: HashMap::new(),
            breaks_taken: 0,
            breaks_interrupted: 0,
            rest_seconds: 0,
            current_stretch_seconds: 0,
            longest_stretch_seconds: 0,
            hourly_seconds: Vec::new(),
            nudges: Vec::new(),
            focus_seconds: 0,
            focus_sessions: 0,
            mood: None,
        }
    }
}

/// A finished day's stats, archived when a session crosses a date boundary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayRecord {
    pub date: String,
    pub category_seconds: HashMap<String, u32>,
    pub breaks_taken: u32,
    pub breaks_interrupted: u32,
    pub rest_seconds: u32,
    pub longest_stretch_seconds: u32,
    #[serde(default)]
    pub hourly_seconds: Vec<u32>,
    #[serde(default)]
    pub nudges: Vec<NudgeRecord>,
    #[serde(default)]
    pub focus_seconds: u32,
    #[serde(default)]
    pub focus_sessions: u32,
    #[serde(default)]
    pub mood: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityState {
    pub time_passed: u32,
    pub time_events: i32,
    pub stats: SessionStats,
    #[serde(default)]
    pub paused: bool,
    #[serde(default)]
    pub history: Vec<DayRecord>,
}

impl Default for ActivityState {
    fn default() -> Self {
        Self {
            time_passed: 0,
            time_events: 1,
            stats: SessionStats::default(),
            paused: false,
            history: Vec::new(),
        }
    }
}

impl ActivityState {
    fn path(app: &AppHandle) -> Result<PathBuf, String> {
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        Ok(dir.join("activity.json"))
    }

    pub fn load(app: &AppHandle) -> Result<Self, String> {
        load_from_path(&Self::path(app)?)
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        let json = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
        save_to_path(&path, &json)
    }
}

// Both the primary and the last valid state are retained. A malformed primary is never
// allowed to replace the backup. Do not treat an unreadable file as an empty history.
fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn read_activity(path: &Path) -> Result<ActivityState, String> {
    let data = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&data).map_err(|e| format!("{}: {e}", path.display()))
}

fn load_from_path(path: &Path) -> Result<ActivityState, String> {
    if !path.exists() {
        return if backup_path(path).exists() {
            read_activity(&backup_path(path))
        } else {
            Ok(ActivityState::default())
        };
    }
    match read_activity(path) {
        Ok(activity) => Ok(activity),
        Err(primary_error) => match read_activity(&backup_path(path)) {
            Ok(activity) => {
                eprintln!("Activity primary is unreadable; recovered valid backup: {primary_error}");
                Ok(activity)
            }
            Err(backup_error) => Err(format!(
                "Activity history is unreadable; not overwriting it. {primary_error}; backup: {backup_error}"
            )),
        },
    }
}

fn save_to_path(path: &Path, bytes: &[u8]) -> Result<(), String> {
    // Verify the new data before touching either file.
    serde_json::from_slice::<ActivityState>(bytes).map_err(|e| e.to_string())?;
    if path.exists() {
        match std::fs::read(path) {
            Ok(previous) if serde_json::from_slice::<ActivityState>(&previous).is_ok() => {
                write_atomic(&backup_path(path), &previous)?;
            }
            Ok(_) => {
                // A prior interrupted write may have corrupted the primary. Keep a good backup.
                if !backup_path(path).exists() {
                    return Err(
                        "Activity primary is corrupt and no backup exists; refusing to overwrite"
                            .into(),
                    );
                }
                read_activity(&backup_path(path))?;
            }
            Err(e) => return Err(format!("Cannot read prior activity: {e}")),
        }
    }
    write_atomic(path, bytes)
}

/// Removes the saved history and its backup so nothing readable is left behind.
fn erase_files(path: &Path) -> Result<(), String> {
    for file in [path.to_path_buf(), backup_path(path)] {
        match std::fs::remove_file(&file) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("{}: {e}", file.display())),
        }
    }
    Ok(())
}

pub struct ActivityStore {
    cache: Mutex<ActivityState>,
    load_error: Mutex<Option<String>>,
}

impl ActivityStore {
    pub fn load(app: &AppHandle) -> Self {
        let loaded = ActivityState::load(app);
        let (activity, load_error) = match loaded {
            Ok(activity) => (activity, None),
            Err(error) => {
                eprintln!("{error}");
                (ActivityState::default(), Some(error))
            }
        };
        Self {
            cache: Mutex::new(activity),
            load_error: Mutex::new(load_error),
        }
    }

    fn check_loaded(&self) -> Result<(), String> {
        match self.load_error.lock().unwrap().as_ref() {
            Some(error) => Err(error.clone()),
            None => Ok(()),
        }
    }

    pub fn persist(&self, app: &AppHandle) -> Result<(), String> {
        self.check_loaded()?;
        self.cache.lock().unwrap().save(app)
    }
}

#[tauri::command]
pub fn get_activity(state: State<ActivityStore>) -> Result<ActivityState, String> {
    state.check_loaded()?;
    Ok(state.cache.lock().unwrap().clone())
}

#[tauri::command]
pub fn save_activity(
    app: AppHandle,
    state: State<ActivityStore>,
    activity: ActivityState,
) -> Result<(), String> {
    state.check_loaded()?;
    let mut cache = state.cache.lock().unwrap();
    activity.save(&app)?;
    *cache = activity;
    Ok(())
}

/// Deletes every saved activity summary and starts today over. Also the way out when the
/// file on disk can't be read: the person has chosen to let it go.
#[tauri::command]
pub fn erase_activity(
    app: AppHandle,
    state: State<ActivityStore>,
) -> Result<ActivityState, String> {
    let mut cache = state.cache.lock().unwrap();
    erase_files(&ActivityState::path(&app)?)?;
    *cache = ActivityState::default();
    *state.load_error.lock().unwrap() = None;
    Ok(cache.clone())
}

/// A plain export file name such as `nudge-activity-2026-11-10.csv`. Anything else
/// (separators, `..`, hidden files) is rejected so the webview cannot choose a path.
fn valid_export_name(name: &str, extension: &str) -> bool {
    name.len() <= 80
        && name.ends_with(extension)
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// `dir/name`, or `dir/stem (2).csv` and so on, never replacing an earlier export.
fn unused_path(dir: &Path, name: &str, extension: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let stem = name.trim_end_matches(extension);
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){extension}")))
        .find(|candidate| !candidate.exists())
        .expect("an unused file name exists")
}

fn export_to_downloads(
    app: &AppHandle,
    file_name: &str,
    extension: &str,
    bytes: &[u8],
) -> Result<String, String> {
    if !valid_export_name(file_name, extension) {
        return Err(format!("invalid export file name: {file_name}"));
    }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let path = unused_path(&dir, file_name, extension);
    write_atomic(&path, bytes)?;
    if let Err(e) = tauri_plugin_opener::reveal_item_in_dir(&path) {
        eprintln!(
            "exported to {} but could not reveal it: {e}",
            path.display()
        );
    }
    Ok(path.display().to_string())
}

/// Writes the CSV built by the overlay into Downloads and reveals it in Finder.
/// Returns the saved path.
#[tauri::command]
pub fn export_activity_csv(
    app: AppHandle,
    file_name: String,
    contents: String,
) -> Result<String, String> {
    export_to_downloads(&app, &file_name, ".csv", contents.as_bytes())
}

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const MAX_POSTCARD_BYTES: usize = 8 * 1024 * 1024;

fn valid_postcard(png: &[u8]) -> bool {
    png.len() <= MAX_POSTCARD_BYTES && png.starts_with(PNG_SIGNATURE)
}

/// Saves a postcard drawn by the overlay to Downloads and reveals it in Finder.
#[tauri::command]
pub fn export_postcard(app: AppHandle, file_name: String, png: Vec<u8>) -> Result<String, String> {
    if !valid_postcard(&png) {
        return Err("the postcard is not a PNG image".into());
    }
    export_to_downloads(&app, &file_name, ".png", &png)
}

const MAX_GIF_BYTES: usize = 16 * 1024 * 1024;

fn valid_gif(gif: &[u8]) -> bool {
    gif.len() <= MAX_GIF_BYTES && gif.starts_with(b"GIF89a")
}

/// Saves an animation drawn by the overlay to Downloads and reveals it in Finder.
#[tauri::command]
pub fn export_gif(app: AppHandle, file_name: String, gif: Vec<u8>) -> Result<String, String> {
    if !valid_gif(&gif) {
        return Err("the animation is not a GIF".into());
    }
    export_to_downloads(&app, &file_name, ".gif", &gif)
}

pub fn persist_activity(app: &AppHandle) -> Result<(), String> {
    app.state::<ActivityStore>().persist(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);

    fn fixture() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "nudge-activity-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path.join("activity.json")
    }

    fn data(time_passed: u32) -> Vec<u8> {
        let state = ActivityState {
            time_passed,
            ..ActivityState::default()
        };
        serde_json::to_vec(&state).unwrap()
    }

    #[test]
    fn export_names_cannot_escape_the_downloads_folder() {
        assert!(valid_export_name("nudge-activity-2026-11-10.csv", ".csv"));
        assert!(valid_export_name("nudge-postcard.png", ".png"));
        assert!(!valid_export_name("nudge-postcard.png", ".csv"));
        for bad in ["../x.csv", "a/b.csv", ".hidden.csv", "x.sh", "", "a b.csv"] {
            assert!(!valid_export_name(bad, ".csv"), "{bad}");
        }
    }

    #[test]
    fn exports_never_replace_an_earlier_file() {
        let dir = fixture().parent().unwrap().to_path_buf();
        let first = unused_path(&dir, "nudge.csv", ".csv");
        std::fs::write(&first, "a").unwrap();
        let second = unused_path(&dir, "nudge.csv", ".csv");
        assert_eq!(second.file_name().unwrap(), "nudge (2).csv");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn postcards_must_be_png_images() {
        assert!(valid_postcard(b"\x89PNG\r\n\x1a\nrest"));
        assert!(!valid_postcard(b"#!/bin/sh"));
        assert!(!valid_postcard(b""));
    }

    #[test]
    fn animations_must_be_gif_images() {
        assert!(valid_gif(b"GIF89a..."));
        assert!(!valid_gif(b"\x89PNG\r\n\x1a\n"));
    }

    #[test]
    fn erasing_removes_the_history_and_its_backup() {
        let path = fixture();
        save_to_path(&path, &data(12)).unwrap();
        save_to_path(&path, &data(13)).unwrap();
        erase_files(&path).unwrap();
        assert!(!path.exists() && !backup_path(&path).exists());
        assert_eq!(load_from_path(&path).unwrap().time_passed, 0);
        erase_files(&path).unwrap(); // nothing left is not an error
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn days_saved_by_earlier_versions_still_load() {
        let day = r#"{"date":"2026-11-01","categorySeconds":{"Games":60},"breaksTaken":1,
            "breaksInterrupted":0,"restSeconds":60,"longestStretchSeconds":60}"#;
        let day: DayRecord = serde_json::from_str(day).unwrap();
        assert!(day.hourly_seconds.is_empty() && day.nudges.is_empty() && day.mood.is_none());
    }

    #[test]
    fn saves_current_and_prior_valid_snapshot() {
        let path = fixture();
        save_to_path(&path, &data(12)).unwrap();
        save_to_path(&path, &data(13)).unwrap();
        assert_eq!(load_from_path(&path).unwrap().time_passed, 13);
        assert_eq!(read_activity(&backup_path(&path)).unwrap().time_passed, 12);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn recovers_corrupt_primary_and_preserves_backup_on_next_save() {
        let path = fixture();
        save_to_path(&path, &data(12)).unwrap();
        save_to_path(&path, &data(13)).unwrap();
        std::fs::write(&path, b"{incomplete").unwrap();
        assert_eq!(load_from_path(&path).unwrap().time_passed, 12);
        save_to_path(&path, &data(14)).unwrap();
        assert_eq!(load_from_path(&path).unwrap().time_passed, 14);
        assert_eq!(read_activity(&backup_path(&path)).unwrap().time_passed, 12);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn refuses_to_overwrite_unrecoverable_history() {
        let path = fixture();
        std::fs::write(&path, b"{incomplete").unwrap();
        assert!(load_from_path(&path).is_err());
        assert!(save_to_path(&path, &data(13)).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"{incomplete");
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn keeps_valid_primary_when_incoming_data_is_invalid() {
        let path = fixture();
        save_to_path(&path, &data(12)).unwrap();
        assert!(save_to_path(&path, b"invalid").is_err());
        assert_eq!(load_from_path(&path).unwrap().time_passed, 12);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
