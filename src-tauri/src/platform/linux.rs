//! Linux platform integration (X11-first; Wayland degrades gracefully).
//!
//! Implements the platform interface from `platform/mod.rs`:
//! - focused app via `active-win-pos-rs` (WM_CLASS as the identifier)
//! - idle time via the X11 MIT-SCREEN-SAVER extension (`x11rb`)
//! - cursor position/buttons via `device_query`
//! - sleep/wake via logind's `PrepareForSleep` D-Bus signal (`zbus`)
//! - audible media: not yet implemented (PipeWire would be the way forward)

use std::time::Duration;

use tauri::{Emitter, WebviewWindow};

use super::{emit_cursor_move, FrontmostApp};

/// Never treat our own overlay window as "the focused app".
fn is_our_window(app_name: &str, title: &str) -> bool {
    // The overlay window is titled "nudge" (see tauri.conf.json).
    app_name.eq_ignore_ascii_case("nudge") || title.eq_ignore_ascii_case("nudge")
}

/// The currently focused app.
///
/// `bundle_id` carries the lowercased WM_CLASS (`app_name` from
/// `active-win-pos-rs` on X11) so the existing settings/category schema keeps
/// working unchanged. Returns `None` when no display server info is available
/// (e.g. pure Wayland without XWayland).
pub fn frontmost_app() -> Option<FrontmostApp> {
    let window = active_win_pos_rs::get_active_window().ok()?;
    if is_our_window(&window.app_name, &window.title) {
        return None;
    }
    let bundle_id = {
        let id = window.app_name.trim().to_lowercase();
        if id.is_empty() {
            None
        } else {
            Some(id)
        }
    };
    let name = if window.title.trim().is_empty() {
        window.app_name.clone()
    } else {
        window.title.clone()
    };
    Some(FrontmostApp {
        name,
        bundle_id,
        category: crate::app_categories::UNKNOWN_CATEGORY.to_string(),
        category_label: crate::app_categories::category_label(crate::app_categories::UNKNOWN_CATEGORY),
    })
}

/// Seconds since last keyboard/mouse input, via the X11 MIT-SCREEN-SAVER
/// extension. Returns `INFINITY` when X11 is unavailable.
pub fn seconds_since_last_input() -> f64 {
    x11_idle_seconds().unwrap_or(f64::INFINITY)
}

fn x11_idle_seconds() -> Option<f64> {
    use x11rb::connection::{Connection, RequestConnection};
    use x11rb::protocol::screensaver;

    let (conn, screen_num) = x11rb::connect(None).ok()?;
    let screen = &conn.setup().roots[screen_num];
    // None => the MIT-SCREEN-SAVER extension isn't advertised by the X server.
    conn.extension_information(screensaver::X11_EXTENSION_NAME)
        .ok()??;
    let reply = screensaver::query_info(&conn, screen.root)
        .ok()?
        .reply()
        .ok()?;
    Some(reply.ms_since_user_input as f64 / 1000.0)
}

/// When pass_through is true, clicks pass through the window.
pub fn set_ignores_mouse_events(window: &WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

/// Overlay setup. tauri.conf.json already requests a transparent,
/// decorationless, always-on-top window; reinforce what the window manager
/// allows us (best effort — some compositors ignore these hints).
pub fn configure_overlay_window(window: &WebviewWindow, _app: &tauri::AppHandle) {
    let _ = window.set_visible_on_all_workspaces(true);
    let _ = window.set_always_on_top(true);
}

/// No repaint nudge needed outside macOS.
pub fn invalidate_overlay_display(_window: &WebviewWindow) {}

/// Cursor + sleep/wake monitors for the overlay.
pub fn start_platform_monitors(window: WebviewWindow) {
    start_cursor_monitor(window.clone());
    start_sleep_monitor(window);
}

fn start_cursor_monitor(window: WebviewWindow) {
    std::thread::spawn(move || {
        use device_query::{DeviceQuery, DeviceState};

        let device_state = DeviceState::new();
        loop {
            std::thread::sleep(Duration::from_millis(16));
            let mouse = device_state.get_mouse();
            let (gx, gy) = (mouse.coords.0 as f64, mouse.coords.1 as f64);
            let pressed = mouse.button_pressed.first().copied().unwrap_or(false);

            // Window-relative coordinates, best effort if the window moved.
            let (x, y, inside) = match (window.outer_position(), window.outer_size()) {
                (Ok(pos), Ok(size)) => {
                    let x = gx - pos.x as f64;
                    let y = gy - pos.y as f64;
                    let inside = x >= 0.0
                        && y >= 0.0
                        && x < size.width as f64
                        && y < size.height as f64;
                    (x, y, inside)
                }
                _ => (gx, gy, false),
            };
            emit_cursor_move(&window, x, y, inside, pressed);
        }
    });
}

fn start_sleep_monitor(window: WebviewWindow) {
    std::thread::spawn(move || {
        if let Err(e) = sleep_monitor_loop(&window) {
            eprintln!("nudge: logind sleep monitor unavailable: {e}");
        }
    });
}

/// Listens for logind's `PrepareForSleep` signal and mirrors the macOS
/// `system-will-sleep` / `system-did-wake` frontend events.
fn sleep_monitor_loop(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    use zbus::blocking::{Connection, Proxy};

    let conn = Connection::system()?;
    let proxy = Proxy::new(
        &conn,
        "org.freedesktop.login1",
        "/org/freedesktop/login1",
        "org.freedesktop.login1.Manager",
    )?;
    for msg in proxy.receive_signal("PrepareForSleep")? {
        // Signal body is a single boolean: true = going to sleep.
        let going_to_sleep: bool = msg.body().deserialize().unwrap_or(true);
        let event = if going_to_sleep {
            "system-will-sleep"
        } else {
            "system-did-wake"
        };
        let _ = window.emit(event, ());
    }
    Ok(())
}

/// Processes currently producing audio.
///
/// Not implemented on Linux yet — PipeWire's session manager would be the way
/// to enumerate audible streams per application. Returning empty simply means
/// auto-break never defers for "audio playing" on Linux.
pub fn audible_media_processes() -> Vec<(i32, String)> {
    Vec::new()
}
