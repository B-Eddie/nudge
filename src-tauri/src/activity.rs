use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

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
        let dir = app
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?;
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

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "activity path has no parent".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?.as_nanos();
    let temporary = path.with_extension(format!("tmp-{}-{nonce}", std::process::id()));
    let result = (|| -> Result<(), String> {
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true)
            .open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, path).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
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
                    return Err("Activity primary is corrupt and no backup exists; refusing to overwrite".into());
                }
                read_activity(&backup_path(path))?;
            }
            Err(e) => return Err(format!("Cannot read prior activity: {e}")),
        }
    }
    write_atomic(path, bytes)
}

fn clear_at_path(path: &Path) -> Result<ActivityState, String> {
    let fresh = ActivityState::default();
    let bytes = serde_json::to_vec(&fresh).map_err(|e| e.to_string())?;
    let backup = backup_path(path);
    // Removing a backup first leaves the valid primary untouched if deletion fails.
    // The next write is atomic. Deletion is deliberate and already confirmed in the UI.
    if backup.exists() {
        std::fs::remove_file(backup).map_err(|e| e.to_string())?;
    }
    write_atomic(path, &bytes)?;
    Ok(fresh)
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
        Self { cache: Mutex::new(activity), load_error: Mutex::new(load_error) }
    }

    pub fn persist(&self, app: &AppHandle) -> Result<(), String> {
        if let Some(error) = &*self.load_error.lock().unwrap() { return Err(error.clone()); }
        self.cache.lock().unwrap().save(app)
    }
}

#[tauri::command]
pub fn get_activity(state: State<ActivityStore>) -> Result<ActivityState, String> {
    if let Some(error) = &*state.load_error.lock().unwrap() { return Err(error.clone()); }
    Ok(state.cache.lock().unwrap().clone())
}

#[tauri::command]
pub fn save_activity(
    app: AppHandle,
    state: State<ActivityStore>,
    activity: ActivityState,
) -> Result<(), String> {
    if let Some(error) = &*state.load_error.lock().unwrap() { return Err(error.clone()); }
    let mut cache = state.cache.lock().unwrap();
    activity.save(&app)?;
    *cache = activity;
    Ok(())
}

#[tauri::command]
pub fn clear_activity(app: AppHandle, state: State<ActivityStore>) -> Result<ActivityState, String> {
    // Explicit deletion can recover even if the previous on-disk history was unreadable.
    // The user is shown a separate confirmation before this command is invoked.
    let mut cache = state.cache.lock().unwrap();
    *cache = clear_at_path(&ActivityState::path(&app)?)?;
    *state.load_error.lock().unwrap() = None;
    Ok(cache.clone())
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
            "nudge-activity-test-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path.join("activity.json")
    }

    fn data(time_passed: u32) -> Vec<u8> {
        let mut state = ActivityState::default();
        state.time_passed = time_passed;
        serde_json::to_vec(&state).unwrap()
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
    #[test]
    fn clearing_removes_primary_and_backup_history() {
        let path = fixture();
        save_to_path(&path, &data(12)).unwrap();
        save_to_path(&path, &data(13)).unwrap();
        let fresh = clear_at_path(&path).unwrap();
        assert_eq!(fresh.time_passed, 0);
        assert_eq!(load_from_path(&path).unwrap().time_passed, 0);
        assert!(!backup_path(&path).exists());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

}
