use std::collections::HashMap;
use std::path::PathBuf;
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
        let path = Self::path(app)?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    }

    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }
}

pub struct ActivityStore {
    cache: Mutex<ActivityState>,
}

impl ActivityStore {
    pub fn load(app: &AppHandle) -> Self {
        Self {
            cache: Mutex::new(ActivityState::load(app).unwrap_or_default()),
        }
    }

    pub fn persist(&self, app: &AppHandle) -> Result<(), String> {
        self.cache.lock().unwrap().save(app)
    }
}

#[tauri::command]
pub fn get_activity(state: State<ActivityStore>) -> Result<ActivityState, String> {
    Ok(state.cache.lock().unwrap().clone())
}

#[tauri::command]
pub fn save_activity(
    app: AppHandle,
    state: State<ActivityStore>,
    activity: ActivityState,
) -> Result<(), String> {
    *state.cache.lock().unwrap() = activity;
    state.persist(&app)
}

pub fn persist_activity(app: &AppHandle) -> Result<(), String> {
    app.state::<ActivityStore>().persist(app)
}
