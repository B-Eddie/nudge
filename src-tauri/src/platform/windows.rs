//! Windows platform integration — stubbed for now.
//!
//! Every function in the platform interface is present so the crate compiles,
//! but each degrades gracefully until the real Win32 implementation lands.
//! Each stub names the API to reach for.

use tauri::WebviewWindow;

use super::FrontmostApp;

/// The currently focused app.
// TODO: GetForegroundWindow + GetWindowThreadProcessId to find the owning
// process, then the lowercased process image name in the `bundle_id` slot
// (mirrors how Linux uses the lowercased WM_CLASS).
pub fn frontmost_app() -> Option<FrontmostApp> {
    None
}

/// Seconds since last keyboard/mouse input.
// TODO: GetLastInputInfo.
pub fn seconds_since_last_input() -> f64 {
    f64::INFINITY
}

/// When pass_through is true, clicks pass through the window.
pub fn set_ignores_mouse_events(window: &WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

/// Overlay setup.
// TODO: SetWindowPos(HWND_TOPMOST) for always-on-top plus layered-window
// attributes (WS_EX_LAYERED / SetLayeredWindowAttributes) for the transparent
// click-through overlay.
pub fn configure_overlay_window(_window: &WebviewWindow, _app: &tauri::AppHandle) {}

/// No repaint nudge needed on Windows.
pub fn invalidate_overlay_display(_window: &WebviewWindow) {}

/// Platform monitors for the overlay.
// TODO: cursor monitor via GetCursorPos + GetAsyncKeyState (left button),
// emitting the shared `cursor://move` event; sleep/wake via WM_POWERBROADCAST /
// RegisterPowerSettingNotification emitting `system-will-sleep` /
// `system-did-wake` like the other platforms.
pub fn start_platform_monitors(_window: WebviewWindow) {}

/// Processes currently producing audio.
// TODO: enumerate WASAPI audio sessions (IAudioSessionManager2) and map them
// back to owning processes.
pub fn audible_media_processes() -> Vec<(i32, String)> {
    Vec::new()
}
