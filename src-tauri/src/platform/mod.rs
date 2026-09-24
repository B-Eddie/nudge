//! Platform-specific integrations, selected at compile time.
//!
//! The rest of the app talks to the OS only through the functions re-exported
//! here. Each `platform/<os>.rs` module must implement the full interface;
//! unsupported platforms degrade gracefully (`None` / `INFINITY` / empty /
//! no-op) so the crate always compiles everywhere.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

use serde::Serialize;
use tauri::{Emitter, WebviewWindow};

/// The currently focused application, as seen by the OS.
#[derive(Clone, Serialize)]
pub struct FrontmostApp {
    pub name: String,
    /// macOS: bundle identifier. Linux: lowercased WM_CLASS / app id.
    /// Windows (future): lowercased process image name.
    /// `None` when the OS does not expose an identifier.
    pub bundle_id: Option<String>,
    pub category: String,
    pub category_label: String,
}

#[derive(Clone, Serialize)]
struct CursorMove {
    x: f64,
    y: f64,
    inside: bool,
    /// if left mouse button is currently held down
    pressed: bool,
}

/// Shared emitter for the `cursor://move` frontend event. Each platform module
/// computes the coordinates its own way and funnels them through here.
pub(crate) fn emit_cursor_move(window: &WebviewWindow, x: f64, y: f64, inside: bool, pressed: bool) {
    let _ = window.emit(
        "cursor://move",
        CursorMove {
            x,
            y,
            inside,
            pressed,
        },
    );
}
