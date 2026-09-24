use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const UNKNOWN_CATEGORY: &str = "unknown";

// for now, only support some of them
pub const APP_CATEGORIES: &[(&str, &str)] = &[
    ("public.app-category.developer-tools", "Developer Tools"),
    ("public.app-category.music", "Music"),
    ("public.app-category.productivity", "Productivity"),
    ("public.app-category.social-networking", "Social Networking"),
    ("public.app-category.entertainment", "Entertainment"),
    ("public.app-category.video", "Video"),
    ("public.app-category.games", "Games"),
    ("public.app-category.action-games", "Games"),
    ("public.app-category.adventure-games", "Games"),
    ("public.app-category.arcade-games", "Games"),
    ("public.app-category.casino-games", "Games"),
    ("public.app-category.dice-games", "Games"),
    ("public.app-category.educational-games", "Games"),
    ("public.app-category.family-games", "Games"),
    ("public.app-category.kids-games", "Games"),
    ("public.app-category.music-games", "Games"),
    ("public.app-category.puzzle-games", "Games"),
    ("public.app-category.racing-games", "Games"),
    ("public.app-category.role-playing-games", "Games"),
    ("public.app-category.simulation-games", "Games"),
    ("public.app-category.sports-games", "Games"),
    ("public.app-category.strategy-games", "Games"),
    ("public.app-category.trivia-games", "Games"),
    ("public.app-category.word-games", "Games"),
];

#[cfg(target_os = "macos")]
pub fn is_valid_apple_category(value: &str) -> bool {
    APP_CATEGORIES
        .iter()
        .any(|(id, _)| *id == value)
}

pub fn category_label(value: &str) -> String {
    if value == UNKNOWN_CATEGORY {
        return "Unknown".to_string();
    }
    APP_CATEGORIES
        .iter()
        .find(|(id, _)| *id == value)
        .map(|(_, label)| (*label).to_string())
        .unwrap_or_else(|| value.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppCategoryEntry {
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub user_override: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct DiscoveredApp {
    pub bundle_id: String,
    pub name: String,
    pub category: String,
}

#[tauri::command]
pub fn get_app_category_options() -> Vec<CategoryOption> {
    let mut options = vec![CategoryOption {
        value: UNKNOWN_CATEGORY.to_string(),
        label: "Unknown".to_string(),
    }];
    options.extend(
        APP_CATEGORIES
            .iter()
            .map(|(value, label)| CategoryOption {
                value: (*value).to_string(),
                label: (*label).to_string(),
            }),
    );
    options
}

#[cfg(target_os = "macos")]
fn normalize_plist_category(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || !is_valid_apple_category(trimmed) {
        UNKNOWN_CATEGORY.to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(target_os = "macos")]
fn category_from_info_plist(bundle_path: &Path) -> String {
    let plist_path = bundle_path.join("Contents/Info.plist");
    let Ok(plist_value) = plist::Value::from_file(&plist_path) else {
        return UNKNOWN_CATEGORY.to_string();
    };
    let Some(dict) = plist_value.into_dictionary() else {
        return UNKNOWN_CATEGORY.to_string();
    };
    let Some(plist::Value::String(category)) = dict.get("LSApplicationCategoryType") else {
        return UNKNOWN_CATEGORY.to_string();
    };
    normalize_plist_category(category)
}

#[cfg(target_os = "macos")]
pub fn discover_running_apps() -> Vec<DiscoveredApp> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSBundle;

    autoreleasepool(|pool| {
        let our_bundle = unsafe { NSBundle::mainBundle().bundleIdentifier() }
            .map(|id| id.as_str(pool).to_owned());

        let workspace = unsafe { NSWorkspace::sharedWorkspace() };
        let running = unsafe { workspace.runningApplications() };
        let mut seen = HashMap::new();

        for app in &*running {
            let Some(bundle_id) = (unsafe { app.bundleIdentifier() })
                .map(|id| id.as_str(pool).to_owned())
            else {
                continue;
            };

            if our_bundle.as_deref() == Some(bundle_id.as_str()) {
                continue;
            }

            let name = unsafe { app.localizedName() }
                .map(|n| n.as_str(pool).to_owned())
                .unwrap_or_else(|| bundle_id.clone());

            let category = unsafe { app.bundleURL() }
                .and_then(|url| unsafe { url.path() })
                .map(|path| category_from_info_plist(Path::new(path.as_str(pool))))
                .unwrap_or_else(|| UNKNOWN_CATEGORY.to_string());

            seen.entry(bundle_id.clone()).or_insert(DiscoveredApp {
                bundle_id,
                name,
                category,
            });
        }

        let mut apps: Vec<_> = seen.into_values().collect();
        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps
    })
}

/// Map freedesktop `Categories=` values to the app's category ids.
#[cfg(target_os = "linux")]
fn category_from_desktop_categories(categories: &str) -> String {
    for cat in categories.split(';').map(str::trim) {
        let mapped = match cat {
            "Development" => Some("public.app-category.developer-tools"),
            "Audio" => Some("public.app-category.music"),
            "Video" => Some("public.app-category.video"),
            "Game" => Some("public.app-category.games"),
            _ => None,
        };
        if let Some(id) = mapped {
            return id.to_string();
        }
    }
    UNKNOWN_CATEGORY.to_string()
}

#[cfg(target_os = "linux")]
fn discover_desktop_entry(path: &Path) -> Option<DiscoveredApp> {
    let content = std::fs::read_to_string(path).ok()?;
    let mut in_entry = false;
    let mut name: Option<String> = None;
    let mut wm_class: Option<String> = None;
    let mut categories = String::new();

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry || line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key.trim() {
            "Name" if name.is_none() => name = Some(value.trim().to_string()),
            "StartupWMClass" if wm_class.is_none() => {
                wm_class = Some(value.trim().to_string())
            }
            "Categories" => categories = value.trim().to_string(),
            "NoDisplay" | "Hidden" if value.trim().eq_ignore_ascii_case("true") => {
                return None
            }
            _ => {}
        }
    }

    let name = name.filter(|n| !n.is_empty())?;
    // The identifier must match what platform::frontmost_app() reports, which
    // is the lowercased WM_CLASS — hence StartupWMClass when present.
    let bundle_id = wm_class
        .map(|c| c.to_lowercase())
        .filter(|c| !c.is_empty())
        .or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase())
        })?;

    Some(DiscoveredApp {
        bundle_id,
        name,
        category: category_from_desktop_categories(&categories),
    })
}

/// Linux has no NSWorkspace equivalent, so discover *installed* apps from
/// `.desktop` files instead. The merge logic in settings only fills in missing
/// entries, so this is a strict improvement over an empty list.
#[cfg(target_os = "linux")]
pub fn discover_running_apps() -> Vec<DiscoveredApp> {
    use std::collections::HashSet;
    use std::path::PathBuf;

    let mut apps = Vec::new();
    let mut seen = HashSet::new();

    let mut dirs = vec![PathBuf::from("/usr/share/applications")];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join(".local/share/applications"));
    }

    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            if let Some(app) = discover_desktop_entry(&path) {
                if seen.insert(app.bundle_id.clone()) {
                    apps.push(app);
                }
            }
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn discover_running_apps() -> Vec<DiscoveredApp> {
    Vec::new()
}

pub fn merge_discovered_apps(
    app_categories: &mut HashMap<String, AppCategoryEntry>,
    discovered: &[DiscoveredApp],
) {
    for app in discovered {
        if let Some(entry) = app_categories.get_mut(&app.bundle_id) {
            entry.name = app.name.clone();
            if !entry.user_override
                && entry.category == UNKNOWN_CATEGORY
                && app.category != UNKNOWN_CATEGORY
            {
                entry.category = app.category.clone();
            }
            continue;
        }
        app_categories.insert(
            app.bundle_id.clone(),
            AppCategoryEntry {
                name: app.name.clone(),
                category: app.category.clone(),
                user_override: false,
            },
        );
    }
}
