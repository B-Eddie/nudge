//! Durable file helpers shared by settings and activity persistence.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn nonce() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
}

/// Writes `bytes` to `path` so readers see either the old or the new file, never a
/// partial one: write to a sibling temporary file, fsync it, then rename over `path`.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = path.with_extension(format!("tmp-{}-{}", std::process::id(), nonce()));
    let result = (|| -> Result<(), String> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
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

/// Moves an unreadable file aside (e.g. `settings.json.corrupt-<nanos>`) so it can be
/// inspected later instead of being silently replaced. Returns the new location.
pub fn quarantine(path: &Path) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("{} has no file name", path.display()))?
        .to_string_lossy();
    let target = path.with_file_name(format!("{file_name}.corrupt-{}", nonce()));
    std::fs::rename(path, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);

    fn dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "nudge-storage-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn atomic_write_replaces_contents_and_leaves_no_temporary_files() {
        let dir = dir();
        let path = dir.join("data.json");
        write_atomic(&path, b"one").unwrap();
        write_atomic(&path, b"two").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"two");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn quarantine_keeps_the_original_bytes() {
        let dir = dir();
        let path = dir.join("settings.json");
        std::fs::write(&path, b"{broken").unwrap();
        let moved = quarantine(&path).unwrap();
        assert!(!path.exists());
        assert_eq!(std::fs::read(moved).unwrap(), b"{broken");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
