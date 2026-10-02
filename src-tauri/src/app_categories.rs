use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::{fs, io};

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

pub fn is_valid_apple_category(value: &str) -> bool {
    APP_CATEGORIES.iter().any(|(id, _)| *id == value)
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
    #[serde(default)]
    pub is_helper: Option<bool>,
    #[serde(default)]
    pub bundle_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct DiscoveredApp {
    pub is_helper: bool,
    pub bundle_id: String,
    pub name: String,
    pub category: String,
    pub bundle_path: Option<String>,
}

#[tauri::command]
pub fn get_app_category_options() -> Vec<CategoryOption> {
    let mut options = vec![CategoryOption {
        value: UNKNOWN_CATEGORY.to_string(),
        label: "Unknown".to_string(),
    }];
    options.extend(APP_CATEGORIES.iter().map(|(value, label)| CategoryOption {
        value: (*value).to_string(),
        label: (*label).to_string(),
    }));
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

fn is_in_trash(path: &Path) -> bool {
    let contains_trash = |path: &Path| {
        path.components()
            .any(|part| part.as_os_str() == ".Trash" || part.as_os_str() == ".Trashes")
    };
    contains_trash(path)
        || fs::canonicalize(path)
            .ok()
            .is_some_and(|resolved| contains_trash(&resolved))
}

fn app_from_bundle(bundle_path: &Path) -> Option<DiscoveredApp> {
    if is_in_trash(bundle_path) || !bundle_path.is_dir() {
        return None;
    }
    let dict = plist::Value::from_file(bundle_path.join("Contents/Info.plist"))
        .ok()?
        .into_dictionary()?;
    let bundle_id = dict.get("CFBundleIdentifier")?.as_string()?.trim();
    if bundle_id.is_empty() {
        return None;
    }
    let name = ["CFBundleDisplayName", "CFBundleName"]
        .iter()
        .filter_map(|key| dict.get(*key)?.as_string())
        .map(str::trim)
        .find(|name| !name.is_empty())
        .or_else(|| bundle_path.file_stem()?.to_str())
        .unwrap_or(bundle_id);
    let flag = |key| {
        dict.get(key).is_some_and(|value| {
            value.as_boolean() == Some(true)
                || value.as_signed_integer() == Some(1)
                || value
                    .as_string()
                    .is_some_and(|raw| raw == "1" || raw.eq_ignore_ascii_case("true"))
        })
    };
    let path = bundle_path.to_string_lossy().into_owned();
    let embedded = path.contains("/Contents/") || path.contains("/System/Library/");
    Some(DiscoveredApp {
        bundle_id: bundle_id.to_string(),
        name: name.to_string(),
        category: dict
            .get("LSApplicationCategoryType")
            .and_then(plist::Value::as_string)
            .map(normalize_plist_category)
            .unwrap_or_else(|| UNKNOWN_CATEGORY.to_string()),
        is_helper: flag("LSBackgroundOnly") || (flag("LSUIElement") && embedded),
        bundle_path: Some(path),
    })
}

fn scan_application_directories(roots: &[PathBuf]) -> io::Result<Vec<DiscoveredApp>> {
    fn visit(directory: &Path, apps: &mut HashMap<String, DiscoveredApp>) -> io::Result<()> {
        let mut entries = fs::read_dir(directory)?.collect::<io::Result<Vec<_>>>()?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let path = entry.path();
            if path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("app"))
            {
                if let Some(app) = app_from_bundle(&path) {
                    apps.entry(app.bundle_id.clone()).or_insert(app);
                }
                // Embedded helpers are discovered when running, rather than listed
                // as separate installed apps inside every application's package.
                continue;
            }
            if entry.file_type()?.is_dir() && !entry.file_name().to_string_lossy().starts_with('.')
            {
                visit(&path, apps)?;
            }
        }
        Ok(())
    }

    let mut apps = HashMap::new();
    let mut scanned = false;
    for root in roots {
        match visit(root, &mut apps) {
            Ok(()) => scanned = true,
            Err(error) if error.kind() == io::ErrorKind::NotFound && !root.exists() => {}
            Err(error) => return Err(error),
        }
    }
    if !scanned {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "No application directories were available",
        ));
    }
    Ok(apps.into_values().collect())
}

fn cached_app_at_path(
    bundle_id: &str,
    entry: &AppCategoryEntry,
    path: &Path,
) -> Option<DiscoveredApp> {
    if is_in_trash(path) || !path.is_dir() {
        return None;
    }
    match app_from_bundle(path) {
        Some(app) if app.bundle_id == bundle_id => Some(app),
        Some(_) => None,
        // An existing bundle with temporarily unreadable metadata is not proof
        // that the app was deleted. Keep its saved category until we can read it.
        None => Some(DiscoveredApp {
            bundle_id: bundle_id.to_string(),
            name: entry.name.clone(),
            category: entry.category.clone(),
            is_helper: entry.is_helper.unwrap_or(false),
            bundle_path: Some(path.to_string_lossy().into_owned()),
        }),
    }
}

#[cfg(target_os = "macos")]
fn discover_installed_apps(
    app_categories: &HashMap<String, AppCategoryEntry>,
) -> io::Result<Vec<DiscoveredApp>> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::{NSBundle, NSString};

    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Library/CoreServices/Applications"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    let mut apps: HashMap<_, _> = scan_application_directories(&roots)?
        .into_iter()
        .map(|app| (app.bundle_id.clone(), app))
        .collect();

    autoreleasepool(|pool| {
        let workspace = unsafe { NSWorkspace::sharedWorkspace() };
        let our_bundle = unsafe { NSBundle::mainBundle().bundleIdentifier() }
            .map(|id| id.as_str(pool).to_owned());

        for (bundle_id, entry) in app_categories {
            if apps.contains_key(bundle_id) {
                continue;
            }
            // macOS knows about apps outside the usual folders and apps moved
            // since their last launch. Check every registered copy, not just one.
            let urls = unsafe {
                workspace.URLsForApplicationsWithBundleIdentifier(&NSString::from_str(bundle_id))
            };
            let mut found = None;
            for url in &*urls {
                if let Some(path) = unsafe { url.path() } {
                    found = cached_app_at_path(bundle_id, entry, Path::new(path.as_str(pool)));
                    if found.is_some() {
                        break;
                    }
                }
            }
            if found.is_none() {
                found = entry
                    .bundle_path
                    .as_deref()
                    .and_then(|path| cached_app_at_path(bundle_id, entry, Path::new(path)));
            }
            if let Some(app) = found {
                apps.insert(bundle_id.clone(), app);
            }
        }
        if let Some(bundle_id) = our_bundle {
            apps.remove(&bundle_id);
        }
    });
    Ok(apps.into_values().collect())
}

#[cfg(target_os = "macos")]
pub fn discover_running_apps() -> Vec<DiscoveredApp> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace};
    use objc2_foundation::NSBundle;

    autoreleasepool(|pool| {
        let our_bundle = unsafe { NSBundle::mainBundle().bundleIdentifier() }
            .map(|id| id.as_str(pool).to_owned());

        let workspace = unsafe { NSWorkspace::sharedWorkspace() };
        let running = unsafe { workspace.runningApplications() };
        let mut seen = HashMap::new();

        for app in &*running {
            let Some(bundle_id) =
                (unsafe { app.bundleIdentifier() }).map(|id| id.as_str(pool).to_owned())
            else {
                continue;
            };

            if our_bundle.as_deref() == Some(bundle_id.as_str()) {
                continue;
            }

            let name = unsafe { app.localizedName() }
                .map(|n| n.as_str(pool).to_owned())
                .unwrap_or_else(|| bundle_id.clone());

            let bundle_path = unsafe { app.bundleURL() }
                .and_then(|url| unsafe { url.path() })
                .map(|path| path.as_str(pool).to_owned());
            let category = unsafe { app.bundleURL() }
                .and_then(|url| unsafe { url.path() })
                .map(|path| category_from_info_plist(Path::new(path.as_str(pool))))
                .unwrap_or_else(|| UNKNOWN_CATEGORY.to_string());

            let policy = unsafe { app.activationPolicy() };
            let embedded = bundle_path.as_deref().is_some_and(|path| {
                path.contains("/Contents/") || path.contains("/System/Library/")
            });
            let is_helper = policy == NSApplicationActivationPolicy::Prohibited
                || (policy == NSApplicationActivationPolicy::Accessory && embedded);
            seen.entry(bundle_id.clone()).or_insert(DiscoveredApp {
                is_helper,
                bundle_id,
                name,
                category,
                bundle_path,
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

fn is_unresolved_legacy_helper(bundle_id: &str, entry: &AppCategoryEntry) -> bool {
    if entry.bundle_path.is_some() {
        return false;
    }
    if let Some(is_helper) = entry.is_helper {
        return is_helper;
    }
    let name_and_id = format!("{bundle_id} {}", entry.name).to_lowercase();
    bundle_id.starts_with("com.apple.")
        && [
            "helper",
            "agent",
            "service",
            "daemon",
            "xpc",
            "extension",
            "widget",
        ]
        .iter()
        .any(|kind| name_and_id.contains(kind))
}

fn reconcile_discovered_apps(
    app_categories: &mut HashMap<String, AppCategoryEntry>,
    installed: io::Result<Vec<DiscoveredApp>>,
    running: &[DiscoveredApp],
) {
    match installed {
        Ok(installed) => {
            let available: HashSet<_> = installed
                .iter()
                .chain(running)
                .map(|app| app.bundle_id.as_str())
                .collect();
            app_categories.retain(|bundle_id, entry| {
                available.contains(bundle_id.as_str())
                    // Legacy system services may not be registered with Launch
                    // Services. Preserve unresolved helpers until a running-app
                    // discovery supplies a bundle path we can check next time.
                    || is_unresolved_legacy_helper(bundle_id, entry)
            });
            merge_discovered_apps(app_categories, &installed);
        }
        Err(error) => {
            eprintln!("Could not refresh installed apps; keeping saved categories: {error}")
        }
    }
    merge_discovered_apps(app_categories, running);
}

pub fn refresh_app_categories(app_categories: &mut HashMap<String, AppCategoryEntry>) {
    let running = discover_running_apps();
    #[cfg(target_os = "macos")]
    {
        let installed = discover_installed_apps(app_categories);
        reconcile_discovered_apps(app_categories, installed, &running);
    }
    #[cfg(not(target_os = "macos"))]
    merge_discovered_apps(app_categories, &running);
}

pub fn merge_discovered_apps(
    app_categories: &mut HashMap<String, AppCategoryEntry>,
    discovered: &[DiscoveredApp],
) {
    for app in discovered {
        if let Some(entry) = app_categories.get_mut(&app.bundle_id) {
            entry.name = app.name.clone();
            entry.is_helper = Some(app.is_helper);
            if app.bundle_path.is_some() {
                entry.bundle_path = app.bundle_path.clone();
            }
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
                is_helper: Some(app.is_helper),
                bundle_path: app.bundle_path.clone(),
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn helper_metadata_updates_without_overwriting_user_categories() {
        let mut entries = HashMap::new();
        entries.insert(
            "test.helper".into(),
            AppCategoryEntry {
                name: "Old helper".into(),
                category: "public.app-category.music".into(),
                user_override: true,
                is_helper: None,
                bundle_path: None,
            },
        );
        merge_discovered_apps(
            &mut entries,
            &[DiscoveredApp {
                bundle_id: "test.helper".into(),
                name: "Helper".into(),
                category: UNKNOWN_CATEGORY.into(),
                is_helper: true,
                bundle_path: Some("/Applications/Player.app/Contents/Helpers/Helper.app".into()),
            }],
        );
        let entry = &entries["test.helper"];
        assert_eq!(entry.is_helper, Some(true));
        assert_eq!(entry.category, "public.app-category.music");
        assert!(entry.user_override);
        assert_eq!(
            entry.bundle_path.as_deref(),
            Some("/Applications/Player.app/Contents/Helpers/Helper.app")
        );
    }
    #[test]
    fn legacy_entries_deserialize_without_helper_metadata() {
        let entry: AppCategoryEntry =
            serde_json::from_str(r#"{"name":"Safari","category":"unknown"}"#).unwrap();
        assert_eq!(entry.is_helper, None);
        assert_eq!(entry.bundle_path, None);
    }

    struct TestApplications(PathBuf);

    impl TestApplications {
        fn new() -> Self {
            use std::sync::atomic::{AtomicU64, Ordering};
            static NEXT_ID: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "nudge-app-discovery-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_ID.fetch_add(1, Ordering::Relaxed),
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn app(&self, relative_path: &str, bundle_id: &str) -> PathBuf {
            let path = self.0.join(relative_path);
            fs::create_dir_all(path.join("Contents")).unwrap();
            let mut info = plist::Dictionary::new();
            info.insert("CFBundleIdentifier".into(), bundle_id.into());
            info.insert("CFBundleDisplayName".into(), "Installed app".into());
            info.insert(
                "LSApplicationCategoryType".into(),
                "public.app-category.productivity".into(),
            );
            plist::Value::Dictionary(info)
                .to_file_xml(path.join("Contents/Info.plist"))
                .unwrap();
            path
        }

        fn scan(&self) -> io::Result<Vec<DiscoveredApp>> {
            scan_application_directories(std::slice::from_ref(&self.0))
        }
    }

    impl Drop for TestApplications {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn saved_entry(path: Option<&Path>) -> AppCategoryEntry {
        AppCategoryEntry {
            name: "Saved app".into(),
            category: "public.app-category.music".into(),
            user_override: true,
            is_helper: Some(false),
            bundle_path: path.map(|path| path.to_string_lossy().into_owned()),
        }
    }

    #[test]
    fn refresh_discovers_closed_apps_and_removes_deleted_apps_without_resetting_categories() {
        let directory = TestApplications::new();
        let installed_path = directory.app("Utilities/Installed.app", "test.installed");
        directory.app("New.app", "test.new");
        let mut entries = HashMap::from([
            ("test.installed".into(), saved_entry(Some(&installed_path))),
            ("wallspace.app".into(), saved_entry(None)),
        ]);

        reconcile_discovered_apps(&mut entries, directory.scan(), &[]);

        assert!(!entries.contains_key("wallspace.app"));
        assert_eq!(
            entries["test.installed"].category,
            "public.app-category.music"
        );
        assert!(entries["test.installed"].user_override);
        assert_eq!(
            entries["test.new"].category,
            "public.app-category.productivity"
        );
        assert!(!entries["test.new"].user_override);
        assert_eq!(entries["test.new"].name, "Installed app");
    }

    #[test]
    fn moving_an_app_updates_its_path_and_preserves_its_category() {
        let directory = TestApplications::new();
        let old_path = directory.app("Old.app", "test.moved");
        let mut entries = HashMap::from([("test.moved".into(), saved_entry(Some(&old_path)))]);
        let new_path = directory.0.join("Renamed.app");
        fs::rename(&old_path, &new_path).unwrap();

        reconcile_discovered_apps(&mut entries, directory.scan(), &[]);

        assert_eq!(
            entries["test.moved"].bundle_path.as_deref(),
            new_path.to_str()
        );
        assert_eq!(entries["test.moved"].category, "public.app-category.music");
        assert!(entries["test.moved"].user_override);
    }

    #[test]
    fn discovery_ignores_trash_and_embedded_helpers_and_deduplicates_copies() {
        let directory = TestApplications::new();
        directory.app("Main.app", "test.main");
        directory.app("Copies/Main.app", "test.main");
        directory.app("Main.app/Contents/Helpers/Helper.app", "test.helper");
        let trashed = directory.app(".Trash/Deleted.app", "test.deleted");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&trashed, directory.0.join("DeletedAlias.app")).unwrap();

        let apps = directory.scan().unwrap();

        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].bundle_id, "test.main");
        assert!(
            cached_app_at_path("test.deleted", &saved_entry(Some(&trashed)), &trashed).is_none()
        );
    }

    #[test]
    fn failed_inventory_keeps_saved_categories_and_still_adds_running_apps() {
        let mut entries = HashMap::from([("test.saved".into(), saved_entry(None))]);
        let running = DiscoveredApp {
            bundle_id: "test.running".into(),
            name: "Running app".into(),
            category: UNKNOWN_CATEGORY.into(),
            is_helper: false,
            bundle_path: None,
        };
        reconcile_discovered_apps(
            &mut entries,
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Unavailable inventory",
            )),
            &[running],
        );

        assert!(entries.contains_key("test.saved"));
        assert!(entries["test.saved"].user_override);
        assert!(entries.contains_key("test.running"));
    }

    #[test]
    fn a_running_app_is_retained_until_it_exits_even_if_its_bundle_was_removed() {
        let mut entries = HashMap::from([("test.running".into(), saved_entry(None))]);
        let running = DiscoveredApp {
            bundle_id: "test.running".into(),
            name: "Running app".into(),
            category: UNKNOWN_CATEGORY.into(),
            is_helper: false,
            bundle_path: Some("/missing/Removed.app".into()),
        };
        reconcile_discovered_apps(&mut entries, Ok(Vec::new()), &[running]);
        assert!(entries.contains_key("test.running"));

        reconcile_discovered_apps(&mut entries, Ok(Vec::new()), &[]);
        assert!(!entries.contains_key("test.running"));
    }

    #[test]
    fn an_empty_or_unavailable_scan_is_not_treated_as_an_empty_installation() {
        let directory = TestApplications::new();
        let mut entries = HashMap::from([("test.saved".into(), saved_entry(None))]);
        let inventory = scan_application_directories(&[directory.0.join("Missing")]);
        assert!(inventory.is_err());

        reconcile_discovered_apps(&mut entries, inventory, &[]);
        assert!(entries.contains_key("test.saved"));
    }

    #[test]
    fn cached_paths_keep_unreadable_bundles_but_reject_replaced_apps() {
        let directory = TestApplications::new();
        let replaced = directory.app("Replaced.app", "test.replacement");
        let unreadable = directory.0.join("Unreadable.app");
        fs::create_dir(&unreadable).unwrap();

        assert!(
            cached_app_at_path("test.original", &saved_entry(Some(&replaced)), &replaced).is_none()
        );
        let retained =
            cached_app_at_path("test.saved", &saved_entry(Some(&unreadable)), &unreadable).unwrap();
        assert_eq!(retained.bundle_id, "test.saved");
        assert_eq!(retained.category, "public.app-category.music");
    }

    #[test]
    fn legacy_services_are_kept_until_their_bundle_paths_can_be_verified() {
        let missing = Path::new("/missing/Service.app");
        let mut entries = HashMap::from([
            (
                "com.apple.legacy-service".into(),
                AppCategoryEntry {
                    is_helper: None,
                    ..saved_entry(None)
                },
            ),
            (
                "com.apple.iWork.Keynote".into(),
                AppCategoryEntry {
                    is_helper: None,
                    ..saved_entry(None)
                },
            ),
            (
                "com.apple.removed-service".into(),
                saved_entry(Some(missing)),
            ),
        ]);

        reconcile_discovered_apps(&mut entries, Ok(Vec::new()), &[]);

        assert!(entries.contains_key("com.apple.legacy-service"));
        assert!(!entries.contains_key("com.apple.removed-service"));
        assert!(!entries.contains_key("com.apple.iWork.Keynote"));
        assert!(entries["com.apple.legacy-service"].user_override);
    }
}
