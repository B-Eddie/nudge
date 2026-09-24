use serde::Serialize;
use tauri::AppHandle;

use crate::platform::audible_media_processes;
use crate::settings::Settings;

/// Dedicated players — idle usually means passive watching/listening.
/// macOS entries are bundle identifiers; Linux entries are lowercased WM_CLASS
/// values (the `bundle_id` slot carries the WM_CLASS on Linux).
const PASSIVE_MEDIA_BUNDLES: &[&str] = &[
    "com.apple.Music",
    "com.apple.TV",
    "com.apple.QuickTimePlayerX",
    "com.spotify.client",
    "com.netflix.Netflix",
    "com.colliderli.iina",
    "org.videolan.vlc",
    "com.plexapp.desktop",
    "tv.twitch.desktop",
    "com.disney.disneyplus",
    "com.hulu.plus",
    "com.max.bundle",
    "com.amazon.aiv.AIVApp",
    // Linux WM_CLASS values (lowercased)
    "vlc",
    "spotify",
    "mpv",
    "celluloid",
    "totem",
    "rhythmbox",
    "audacious",
    "smplayer",
    "parole",
    "kodi",
    "stremio",
    "elisa",
    "lollypop",
    "amberol",
];

const PASSIVE_MEDIA_CATEGORIES: &[&str] = &[
    "public.app-category.music",
    "public.app-category.video",
    "public.app-category.entertainment",
];

#[derive(Debug, Clone, Serialize)]
pub struct AutoBreakStatus {
    pub idle_seconds: f64,
    pub idle_threshold_seconds: u64,
    pub should_auto_break: bool,
    pub defer_auto_break: bool,
    pub defer_reason: Option<String>,
}

pub fn idle_threshold_seconds(settings: &Settings) -> u64 {
    settings.auto_idle_break_mins.max(1) as u64 * 60
}

fn bundle_is_passive_media(bundle_id: &str) -> bool {
    PASSIVE_MEDIA_BUNDLES.contains(&bundle_id)
}

fn category_is_passive_media(category: &str) -> bool {
    PASSIVE_MEDIA_CATEGORIES.contains(&category)
}

pub fn defer_reason(
    app: &AppHandle,
    frontmost_bundle_id: Option<&str>,
    frontmost_category: Option<&str>,
) -> Option<String> {
    if let Some(bundle_id) = frontmost_bundle_id {
        if bundle_is_passive_media(bundle_id) {
            return Some(format!("Using {bundle_id}"));
        }
    }

    if let Some(category) = frontmost_category {
        if category_is_passive_media(category) {
            return Some(format!("{} app in front", crate::app_categories::category_label(category)));
        }
    }

    let audible = audible_media_processes();
    if !audible.is_empty() {
        // Covers browser video, music players, calls, etc. while the user isn't moving input.
        let names: Vec<String> = audible.into_iter().map(|(_, name)| name).collect();
        return Some(format!("Audio playing ({})", names.join(", ")));
    }

    let _ = app;
    None
}

pub fn evaluate_auto_break(
    app: &AppHandle,
    idle_seconds: f64,
    settings: &Settings,
    frontmost_bundle_id: Option<&str>,
    frontmost_category: Option<&str>,
) -> AutoBreakStatus {
    let idle_threshold_seconds = idle_threshold_seconds(settings);
    let defer_reason = defer_reason(app, frontmost_bundle_id, frontmost_category);
    let defer_auto_break = defer_reason.is_some();
    let should_auto_break =
        !defer_auto_break && idle_seconds >= idle_threshold_seconds as f64;

    AutoBreakStatus {
        idle_seconds,
        idle_threshold_seconds,
        should_auto_break,
        defer_auto_break,
        defer_reason,
    }
}
