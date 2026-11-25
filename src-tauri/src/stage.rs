//! A clear, click-through sheet shown for a few seconds so the pet can throw things at the
//! window in front. Geometry only: it never reads, activates or changes another app.

/// Long enough for every pet's longest tantrum, its landing and its clean-up.
const TANTRUM_MS: u64 = 12_000;
/// A little longer than `ULTIMATE_MS` in src/lib/ultimate.ts.
const EXPANSION_MS: u64 = 7_000;
const CHARACTERS: &[&str] = &["crab", "panda", "cat", "capybara"];

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// The sheet's own coordinates for the pet and for the part of the window on this screen.
/// Everything comes in as top-left global points. `None` when there is nothing to aim at.
pub fn aim(screen: Rect, pet: (f64, f64), window: Rect) -> Option<((f64, f64), Rect)> {
    let left = window.x.max(screen.x);
    let top = window.y.max(screen.y);
    let right = (window.x + window.width).min(screen.x + screen.width);
    let bottom = (window.y + window.height).min(screen.y + screen.height);
    if right - left < 160.0 || bottom - top < 80.0 {
        return None;
    }
    Some((
        (pet.0 - screen.x, pet.1 - screen.y),
        Rect {
            x: left - screen.x,
            y: top - screen.y,
            width: right - left,
            height: bottom - top,
        },
    ))
}

/// The sheet, pet and target when only the targeted window is covered.
pub fn inside(screen: Rect, pet: (f64, f64), target: Rect) -> (Rect, (f64, f64), Rect) {
    let sheet = Rect {
        x: screen.x + target.x,
        y: screen.y + target.y,
        width: target.width,
        height: target.height,
    };
    let local = Rect {
        x: 0.0,
        y: 0.0,
        width: target.width,
        height: target.height,
    };
    (sheet, (pet.0 - target.x, pet.1 - target.y), local)
}

/// Where to aim when no window is open.
pub fn middle(screen: Rect) -> Rect {
    Rect {
        x: screen.x + screen.width * 0.2,
        y: screen.y + screen.height * 0.15,
        width: screen.width * 0.6,
        height: screen.height * 0.6,
    }
}

/// Opens the sheet. Returns whether anything will be thrown.
#[tauri::command]
pub async fn throw_at_front_window(
    app: tauri::AppHandle,
    character: String,
    started_at: f64,
    pet_x: f64,
    pet_y: f64,
    ultimate: bool,
) -> Result<bool, String> {
    if !CHARACTERS.contains(&character.as_str()) || !started_at.is_finite() {
        return Err("unknown companion".into());
    }
    #[cfg(target_os = "macos")]
    {
        mac::open(app, character, started_at, (pet_x, pet_y), ultimate)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, pet_x, pet_y, ultimate);
        Ok(false)
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use cocoa::base::{id, NO, YES};
    use objc::{msg_send, sel, sel_impl};
    use std::sync::atomic::{AtomicU64, Ordering};
    use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

    /// Counts the sheets opened, so each has its own label and only closes itself.
    static LATEST: AtomicU64 = AtomicU64::new(0);

    fn close(app: &AppHandle, number: u64) {
        if let Some(window) = app.get_webview_window(&label(number)) {
            let _ = window.destroy();
        }
    }
    fn label(number: u64) -> String {
        format!("stage-{number}")
    }

    pub fn open(
        app: AppHandle,
        character: String,
        started_at: f64,
        at: (f64, f64),
        ultimate: bool,
    ) -> Result<bool, String> {
        if *app.state::<crate::AppState>().settings_open.lock().unwrap() {
            return Ok(false);
        }
        // A new performance replaces whatever is left of the last one.
        let number = LATEST.fetch_add(1, Ordering::SeqCst) + 1;
        close(&app, number - 1);
        if !build(&app, number, &character, started_at, at, ultimate)? {
            return Ok(false);
        }
        std::thread::spawn(move || {
            let shown = if ultimate { EXPANSION_MS } else { TANTRUM_MS };
            std::thread::sleep(std::time::Duration::from_millis(shown));
            close(&app, number);
        });
        Ok(true)
    }

    fn build(
        app: &AppHandle,
        number: u64,
        character: &str,
        started_at: f64,
        at: (f64, f64),
        ultimate: bool,
    ) -> Result<bool, String> {
        let main = app
            .get_webview_window("main")
            .ok_or("main window missing")?;
        let (send, receive) = std::sync::mpsc::channel();
        let measured = main.clone();
        main.run_on_main_thread(move || {
            let found = crate::pet_desktop::front_window_on_pet_screen(
                &measured,
                crate::working_pid(),
                at.0,
                at.1,
            );
            let _ = send.send(found);
        })
        .map_err(|e| e.to_string())?;
        let Ok(Some((screen, pet, window))) =
            receive.recv_timeout(std::time::Duration::from_secs(2))
        else {
            return Ok(false);
        };
        // With nothing to aim at, an expansion takes the middle of the screen instead.
        let Some((pet, target)) = window
            .and_then(|window| aim(screen, pet, window))
            .or_else(|| ultimate.then(|| aim(screen, pet, middle(screen))).flatten())
        else {
            return Ok(false);
        };
        // An expansion happens inside the window it's aimed at; a tantrum needs the whole
        // screen for things to fly across.
        let (sheet_area, pet, target) = if ultimate {
            inside(screen, pet, target)
        } else {
            (screen, pet, target)
        };
        let screen = sheet_area;
        let scene = serde_json::json!({
            "ultimate": ultimate, "character": character, "startedAt": started_at,
            "pet": { "x": pet.0, "y": pet.1 }, "target": target,
        });
        let sheet =
            WebviewWindowBuilder::new(app, label(number), WebviewUrl::App("stage.html".into()))
                .title("nudge")
                .initialization_script(format!("window.__STAGE__ = {scene};"))
                .position(screen.x, screen.y)
                .inner_size(screen.width, screen.height)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .resizable(false)
                .skip_taskbar(true)
                .focused(false)
                .visible(false)
                .build()
                .map_err(|e| e.to_string())?;
        let shown = sheet.clone();
        sheet
            .run_on_main_thread(move || unsafe {
                let Ok(ptr) = shown.ns_window() else {
                    return;
                };
                let ns = ptr as id;
                // One level below the pet, so the pet stays in front of its own mess.
                const BELOW_PET: i64 = 24;
                // Every space, and beside full-screen windows.
                const BEHAVIOR: u64 = 1 | (1 << 8);
                let _: () = msg_send![ns, setIgnoresMouseEvents: YES];
                let _: () = msg_send![ns, setLevel: BELOW_PET];
                let _: () = msg_send![ns, setCollectionBehavior: BEHAVIOR];
                let _: () = msg_send![ns, setHidesOnDeactivate: NO];
                crate::configure_transparent_layers(&shown);
                // AppKit nudges new windows clear of the menu bar; put it back over everything.
                let screens: id = msg_send![objc::class!(NSScreen), screens];
                let primary: id = msg_send![screens, objectAtIndex: 0usize];
                let main: cocoa::foundation::NSRect = msg_send![primary, frame];
                let frame = cocoa::foundation::NSRect::new(
                    cocoa::foundation::NSPoint::new(
                        screen.x,
                        main.size.height - screen.y - screen.height,
                    ),
                    cocoa::foundation::NSSize::new(screen.width, screen.height),
                );
                let _: () = msg_send![ns, setMovable: NO];
                let _: () = msg_send![ns, setFrame: frame display: YES];
                // Never becomes key: what the person is typing into keeps the keyboard.
                let _: () = msg_send![ns, orderFrontRegardless];
                let _: () = msg_send![ns, setFrame: frame display: YES];
            })
            .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn aims_in_the_sheets_own_coordinates_on_any_display() {
        let screen = rect(-1920.0, 200.0, 1920.0, 1080.0);
        let (pet, target) = aim(
            screen,
            (-1800.0, 1200.0),
            rect(-1500.0, 300.0, 900.0, 700.0),
        )
        .unwrap();
        assert_eq!(pet, (120.0, 1000.0));
        assert_eq!(target, rect(420.0, 100.0, 900.0, 700.0));
    }

    #[test]
    fn an_expansion_covers_exactly_the_window() {
        let screen = rect(-1920.0, 200.0, 1920.0, 1080.0);
        let window = rect(-1500.0, 300.0, 900.0, 700.0);
        let (pet, target) = aim(screen, (-1800.0, 1200.0), window).unwrap();
        let (sheet, pet, target) = inside(screen, pet, target);
        assert_eq!(sheet, window);
        assert_eq!(target, rect(0.0, 0.0, 900.0, 700.0));
        // The pet may well be standing outside it.
        assert_eq!(pet, (-300.0, 900.0));
    }

    #[test]
    fn an_empty_desktop_still_has_a_middle() {
        let screen = rect(-1920.0, 200.0, 1920.0, 1080.0);
        assert!(aim(screen, (-1900.0, 1200.0), middle(screen)).is_some());
    }

    #[test]
    fn only_the_visible_part_of_a_window_is_a_target() {
        let screen = rect(0.0, 0.0, 1440.0, 900.0);
        let (_, target) = aim(screen, (0.0, 0.0), rect(1200.0, -50.0, 800.0, 600.0)).unwrap();
        assert_eq!(target, rect(1200.0, 0.0, 240.0, 550.0));
        assert_eq!(
            aim(screen, (0.0, 0.0), rect(1500.0, 0.0, 800.0, 600.0)),
            None
        );
    }
}
