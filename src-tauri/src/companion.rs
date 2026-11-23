//! The companion's own memory: its garden, bond, outfits and your focus sessions. The
//! overlay owns the shape of this document; this side only stores it safely.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::storage::{quarantine, write_atomic};

const MAX_BYTES: usize = 1024 * 1024;

pub struct CompanionStore {
    path: PathBuf,
    cache: Mutex<Option<Value>>,
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn read(path: &Path) -> Option<Value> {
    let data = std::fs::read(path).ok()?;
    serde_json::from_slice::<Value>(&data)
        .ok()
        .filter(Value::is_object)
}

impl CompanionStore {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        Ok(Self::open(dir.join("companion.json")))
    }

    /// Falls back to the last good copy. A file that can't be read is moved aside, never
    /// overwritten, so a garden is not lost to one bad write.
    fn open(path: PathBuf) -> Self {
        let mut value = read(&path);
        if value.is_none() && path.exists() {
            match quarantine(&path) {
                Ok(moved) => {
                    eprintln!("companion file was unreadable; kept at {}", moved.display())
                }
                Err(e) => eprintln!("companion file is unreadable: {e}"),
            }
        }
        if value.is_none() {
            value = read(&backup_path(&path));
        }
        Self {
            path,
            cache: Mutex::new(value),
        }
    }

    fn save(&self, companion: Value) -> Result<(), String> {
        if !companion.is_object() {
            return Err("companion data must be an object".into());
        }
        let bytes = serde_json::to_vec_pretty(&companion).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BYTES {
            return Err("companion data is too large".into());
        }
        let mut cache = self.cache.lock().unwrap();
        if let Some(previous) = read(&self.path) {
            let previous = serde_json::to_vec_pretty(&previous).map_err(|e| e.to_string())?;
            write_atomic(&backup_path(&self.path), &previous)?;
        }
        write_atomic(&self.path, &bytes)?;
        *cache = Some(companion);
        Ok(())
    }

    fn erase_backup(&self) -> Result<(), String> {
        match std::fs::remove_file(backup_path(&self.path)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

#[tauri::command]
pub fn get_companion(store: State<CompanionStore>) -> Option<Value> {
    store.cache.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_companion(store: State<CompanionStore>, companion: Value) -> Result<(), String> {
    store.save(companion)
}

/// Saves a companion whose history was erased, without keeping the old copy as a backup.
#[tauri::command]
pub fn replace_companion(store: State<CompanionStore>, companion: Value) -> Result<(), String> {
    store.save(companion)?;
    store.erase_backup()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);

    fn fixture() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nudge-companion-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("companion.json")
    }

    fn garden(store: &CompanionStore) -> Option<Value> {
        store.cache.lock().unwrap().clone()
    }

    #[test]
    fn starts_empty_then_remembers_what_was_saved() {
        let path = fixture();
        let store = CompanionStore::open(path.clone());
        assert_eq!(garden(&store), None);
        store.save(json!({ "version": 1 })).unwrap();
        assert_eq!(
            garden(&CompanionStore::open(path.clone())),
            Some(json!({ "version": 1 }))
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn an_unreadable_file_is_kept_aside_and_the_backup_is_used() {
        let path = fixture();
        let store = CompanionStore::open(path.clone());
        store.save(json!({ "plants": 1 })).unwrap();
        store.save(json!({ "plants": 2 })).unwrap();
        std::fs::write(&path, b"{half").unwrap();
        assert_eq!(
            garden(&CompanionStore::open(path.clone())),
            Some(json!({ "plants": 1 }))
        );
        let kept = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .any(|f| f.file_name().to_string_lossy().contains("corrupt"));
        assert!(kept);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn rejects_documents_that_are_not_objects_or_are_too_large() {
        let path = fixture();
        let store = CompanionStore::open(path.clone());
        assert!(store.save(json!([1, 2])).is_err());
        assert!(store.save(json!({ "x": "y".repeat(MAX_BYTES) })).is_err());
        assert!(!path.exists());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn erasing_the_backup_leaves_only_the_new_copy() {
        let path = fixture();
        let store = CompanionStore::open(path.clone());
        store.save(json!({ "secret": true })).unwrap();
        store.save(json!({ "secret": false })).unwrap();
        store.erase_backup().unwrap();
        store.erase_backup().unwrap();
        assert!(!backup_path(&path).exists());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
