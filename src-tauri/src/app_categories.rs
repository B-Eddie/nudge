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
    // ("public.app-category.games", "Games"),
    // ("public.app-category.business", "Business"),
    // ("public.app-category.education", "Education"),
    // ("public.app-category.finance", "Finance"),
    // ("public.app-category.graphics-design", "Graphics & Design"),
    // ("public.app-category.healthcare-fitness", "Healthcare & Fitness"),
    // ("public.app-category.lifestyle", "Lifestyle"),
    // ("public.app-category.medical", "Medical"),
    // ("public.app-category.news", "News"),
    // ("public.app-category.photography", "Photography"),
    // ("public.app-category.reference", "Reference"),
    // ("public.app-category.sports", "Sports"),
    // ("public.app-category.travel", "Travel"),
    // ("public.app-category.utilities", "Utilities"),
    // ("public.app-category.weather", "Weather"),
    // ("public.app-category.action-games", "Games"),
    // ("public.app-category.adventure-games", "Games"),
    // ("public.app-category.arcade-games", "Games"),
    // ("public.app-category.casino-games", "Games"),
    // ("public.app-category.dice-games", "Games"),
    // ("public.app-category.educational-games", "Games"),
    // ("public.app-category.family-games", "Games"),
    // ("public.app-category.kids-games", "Games"),
    // ("public.app-category.music-games", "Games"),
    // ("public.app-category.puzzle-games", "Games"),
    // ("public.app-category.racing-games", "Games"),
    // ("public.app-category.role-playing-games", "Games"),
    // ("public.app-category.simulation-games", "Games"),
    // ("public.app-category.sports-games", "Games"),
    // ("public.app-category.strategy-games", "Games"),
    // ("public.app-category.trivia-games", "Games"),
    // ("public.app-category.word-games", "Games"),
    
];

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

fn normalize_plist_category(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || !is_valid_apple_category(trimmed) {
        UNKNOWN_CATEGORY.to_string()
    } else {
        trimmed.to_string()
    }
}

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

#[cfg(not(target_os = "macos"))]
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
