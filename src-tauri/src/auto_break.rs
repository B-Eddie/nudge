//! Decides whether being away from the keyboard is a break, a video, or a call.

use serde::Serialize;

use crate::presence::Presence;
use crate::settings::Settings;

/// Dedicated music apps. Background music never means someone is watching the screen.
const MUSIC_APPS: &[&str] = &[
    "com.apple.music",
    "com.spotify.client",
    "com.tidal.desktop",
    "com.deezer.deezer-desktop",
    "com.amazon.music",
    "com.coppertino.vox",
    "sh.cider.electron",
];

/// Dedicated video players. Trusted on their own only where macOS can't report audio.
const VIDEO_PLAYERS: &[&str] = &[
    "com.apple.tv",
    "com.apple.quicktimeplayerx",
    "com.netflix.netflix",
    "com.colliderli.iina",
    "org.videolan.vlc",
    "com.plexapp.desktop",
    "tv.twitch.desktop",
    "com.disney.disneyplus",
    "com.hulu.plus",
    "com.max.bundle",
    "com.amazon.aiv.aivapp",
];

/// Browsers whose audio comes from a shared WebKit process rather than their own helper.
const WEBKIT_BROWSERS: &[&str] = &[
    "com.apple.safari",
    "com.apple.safaritechnologypreview",
    "com.kagi.kagimacos",
    "com.duckduckgo.macos.browser",
];

const MUSIC_CATEGORY: &str = "public.app-category.music";
const VIDEO_CATEGORIES: &[&str] = &[
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
    /// The microphone or a camera is in use.
    pub in_call: bool,
    /// The app in front is playing video or other sound worth watching.
    pub watching: bool,
    /// A music app is playing, in front or not.
    pub music_playing: bool,
}

/// The app in front, as far as these decisions care.
#[derive(Clone, Copy, Default)]
pub struct Front<'a> {
    pub bundle_id: Option<&'a str>,
    pub category: Option<&'a str>,
}

impl Front<'_> {
    fn is_music(&self) -> bool {
        self.bundle_id.is_some_and(is_music_app) || self.category == Some(MUSIC_CATEGORY)
    }

    fn is_video_player(&self) -> bool {
        self.bundle_id
            .is_some_and(|id| VIDEO_PLAYERS.contains(&id.to_ascii_lowercase().as_str()))
            || self.category.is_some_and(|c| VIDEO_CATEGORIES.contains(&c))
    }

    /// Games play sound constantly, but someone playing one is active, not watching.
    fn is_game(&self) -> bool {
        self.category.is_some_and(|c| c.ends_with("games"))
    }

    fn is_sounding(&self, audible: &[String]) -> bool {
        self.bundle_id
            .is_some_and(|front| audible.iter().any(|id| belongs_to(front, id)))
    }
}

fn is_music_app(bundle_id: &str) -> bool {
    MUSIC_APPS.contains(&bundle_id.to_ascii_lowercase().as_str())
}

/// Whether sound from `audible` comes from the app in front: itself, one of its helpers,
/// or the browser-engine process playing on its behalf.
fn belongs_to(front: &str, audible: &str) -> bool {
    let front = front.to_ascii_lowercase();
    let audible = audible.to_ascii_lowercase();
    audible == front
        || audible
            .strip_prefix(&front)
            .is_some_and(|rest| rest.starts_with('.'))
        || (audible.starts_with("com.apple.webkit") && WEBKIT_BROWSERS.contains(&front.as_str()))
        || is_gecko_content(&front, &audible)
}

/// Firefox and its relatives (Zen and others) play sound from a sibling process:
/// `app.zen-browser.plugincontainer` on behalf of `app.zen-browser.zen`.
fn is_gecko_content(front: &str, audible: &str) -> bool {
    let vendor = |id: &str| id.rsplit_once('.').map(|(vendor, _)| vendor.to_string());
    audible.ends_with(".plugincontainer") && vendor(front) == vendor(audible)
}

pub fn is_watching(front: Front, audible: Option<&[String]>) -> bool {
    if front.is_music() || front.is_game() {
        return false;
    }
    match audible {
        Some(audible) => front.is_sounding(audible),
        None => front.is_video_player(),
    }
}

fn is_listening_in_front(front: Front, audible: Option<&[String]>) -> bool {
    front.is_music() && audible.is_none_or(|audible| front.is_sounding(audible))
}

pub fn idle_threshold_seconds(settings: &Settings) -> u64 {
    settings.auto_idle_break_mins.max(1) as u64 * 60
}

pub fn evaluate_auto_break(
    idle_seconds: f64,
    settings: &Settings,
    front: Front,
    presence: &Presence,
) -> AutoBreakStatus {
    let idle_threshold_seconds = idle_threshold_seconds(settings);
    let audible = presence.audible.as_deref();
    let in_call = settings.call_awareness && presence.in_call();
    let watching = is_watching(front, audible);
    let defer_reason = if in_call {
        Some("Microphone or camera in use")
    } else if watching {
        Some("Watching something")
    } else if is_listening_in_front(front, audible) {
        Some("Music app in front")
    } else {
        None
    };
    let defer_auto_break = defer_reason.is_some();

    AutoBreakStatus {
        idle_seconds,
        idle_threshold_seconds,
        should_auto_break: !defer_auto_break && idle_seconds >= idle_threshold_seconds as f64,
        defer_auto_break,
        defer_reason: defer_reason.map(str::to_string),
        in_call,
        watching,
        music_playing: audible.is_some_and(|ids| ids.iter().any(|id| is_music_app(id))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHROME: Front = Front {
        bundle_id: Some("com.google.Chrome"),
        category: Some("public.app-category.productivity"),
    };
    const EDITOR: Front = Front {
        bundle_id: Some("com.microsoft.VSCode"),
        category: Some("public.app-category.developer-tools"),
    };
    const SPOTIFY: Front = Front {
        bundle_id: Some("com.spotify.client"),
        category: Some(MUSIC_CATEGORY),
    };

    fn audible(ids: &[&str]) -> Presence {
        Presence {
            audible: Some(ids.iter().map(|id| id.to_string()).collect()),
            ..Presence::default()
        }
    }

    fn status(idle: f64, front: Front, presence: &Presence) -> AutoBreakStatus {
        evaluate_auto_break(idle, &Settings::default(), front, presence)
    }

    #[test]
    fn background_music_neither_blocks_breaks_nor_counts_as_watching() {
        let status = status(400.0, EDITOR, &audible(&["com.spotify.client"]));
        assert!(status.should_auto_break);
        assert!(!status.watching && !status.in_call);
        assert!(status.music_playing);
    }

    #[test]
    fn a_video_in_the_browser_in_front_is_watching_not_a_break() {
        for (front, sound) in [
            ("com.google.Chrome", "com.google.Chrome.helper"),
            (
                "company.thebrowser.Browser",
                "company.thebrowser.browser.helper",
            ),
            ("com.apple.Safari", "com.apple.WebKit.GPU"),
            ("org.mozilla.firefox", "org.mozilla.plugincontainer"),
            ("app.zen-browser.zen", "app.zen-browser.plugincontainer"),
        ] {
            let front = Front {
                bundle_id: Some(front),
                ..CHROME
            };
            let status = status(3600.0, front, &audible(&[sound]));
            assert!(status.watching, "{sound}");
            assert!(!status.should_auto_break, "{sound}");
        }
    }

    #[test]
    fn a_video_left_playing_behind_other_work_is_not_watching() {
        let status = status(400.0, EDITOR, &audible(&["com.google.Chrome.helper"]));
        assert!(!status.watching);
        assert!(status.should_auto_break);
    }

    #[test]
    fn similar_bundle_ids_are_not_mistaken_for_helpers() {
        assert!(!belongs_to("com.google.Chrome", "com.google.ChromeRemote"));
        assert!(belongs_to("com.google.Chrome", "com.google.Chrome.helper"));
    }

    #[test]
    fn a_paused_player_no_longer_holds_breaks_back_forever() {
        let vlc = Front {
            bundle_id: Some("org.videolan.vlc"),
            category: Some("public.app-category.video"),
        };
        assert!(status(400.0, vlc, &audible(&[])).should_auto_break);
        assert!(!status(400.0, vlc, &audible(&["org.videolan.vlc"])).should_auto_break);
        // Older macOS can't report audio, so the player itself is the best evidence.
        assert!(!status(400.0, vlc, &Presence::default()).should_auto_break);
    }

    #[test]
    fn games_and_music_apps_are_never_watching() {
        let game = Front {
            bundle_id: Some("com.example.game"),
            category: Some("public.app-category.puzzle-games"),
        };
        assert!(!status(0.0, game, &audible(&["com.example.game"])).watching);
        let music = status(400.0, SPOTIFY, &audible(&["com.spotify.client"]));
        assert!(!music.watching);
        assert!(!music.should_auto_break, "choosing music isn't leaving");
    }

    #[test]
    fn calls_hold_everything_unless_call_awareness_is_off() {
        let call = Presence {
            mic_in_use: true,
            ..audible(&[])
        };
        let on = status(900.0, EDITOR, &call);
        assert!(on.in_call && !on.should_auto_break);

        let settings = Settings {
            call_awareness: false,
            ..Settings::default()
        };
        let off = evaluate_auto_break(900.0, &settings, EDITOR, &call);
        assert!(!off.in_call && off.should_auto_break);
    }
}
