//! Desktop movement reads geometry only. It never activates or edits another app.
use tauri::Manager;

#[cfg(target_os = "macos")]
mod mac {
    use cocoa::appkit::{NSEvent, NSWindow};
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSPoint, NSRect, NSString};
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::Mutex;
    use tauri::Emitter;

    #[derive(Clone, Copy)]
    struct Perch {
        window: u32,
        offset: f64,
        foot_x: f64,
        foot_y: f64,
    }
    #[derive(Default)]
    struct Movement {
        drag: Option<(f64, f64, f64, f64)>,
        perch: Option<Perch>,
        body_size: f64,
    }
    static MOVEMENT: Mutex<Movement> = Mutex::new(Movement {
        drag: None,
        perch: None,
        body_size: 120.0,
    });

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(options: u32, relative: u32) -> id;
    }
    struct Surface {
        number: u32,
        x: f64,
        y: f64,
        width: f64,
    }
    unsafe fn get(dict: id, key: &str) -> id {
        let key = NSString::alloc(nil).init_str(key);
        let value: id = msg_send![dict, objectForKey: key];
        let _: () = msg_send![key, release];
        value
    }
    unsafe fn number(dict: id, key: &str) -> f64 {
        let v = get(dict, key);
        msg_send![v, doubleValue]
    }
    unsafe fn surfaces() -> Vec<Surface> {
        // On-screen, non-desktop windows. Bounds do not require screen-recording access.
        let list = CGWindowListCopyWindowInfo(1 | 16, 0);
        if list == nil {
            return vec![];
        }
        let count: usize = msg_send![list, count];
        let mut result = Vec::new();
        for i in 0..count {
            let entry: id = msg_send![list, objectAtIndex:i];
            if number(entry, "kCGWindowLayer") != 0.0
                || number(entry, "kCGWindowOwnerPID") == std::process::id() as f64
            {
                continue;
            }
            let bounds = get(entry, "kCGWindowBounds");
            let width = number(bounds, "Width");
            if width < 160.0 || number(bounds, "Height") < 100.0 {
                continue;
            }
            result.push(Surface {
                number: number(entry, "kCGWindowNumber") as u32,
                x: number(bounds, "X"),
                y: number(bounds, "Y"),
                width,
            });
        }
        let _: () = msg_send![list, release];
        result
    }
    unsafe fn primary_height() -> f64 {
        let screens: id = msg_send![class!(NSScreen), screens];
        let primary: id = msg_send![screens, objectAtIndex:0usize];
        let frame: NSRect = msg_send![primary, frame];
        frame.size.height
    }
    unsafe fn clamp_origin(
        origin: NSPoint,
        size: cocoa::foundation::NSSize,
        foot_x: f64,
        foot_y: f64,
        body_size: f64,
    ) -> NSPoint {
        let screens: id = msg_send![class!(NSScreen), screens];
        let count: usize = msg_send![screens, count];
        let foot = NSPoint::new(origin.x + foot_x, origin.y + size.height - foot_y);
        let mut closest = None;
        let mut distance = f64::INFINITY;
        for i in 0..count {
            let screen: id = msg_send![screens, objectAtIndex:i];
            let frame: NSRect = msg_send![screen, visibleFrame];
            let x = foot.x.clamp(
                frame.origin.x + body_size / 2.0 + 4.0,
                frame.origin.x + frame.size.width - body_size / 2.0 - 4.0,
            );
            let y = foot.y.clamp(
                frame.origin.y + body_size * 0.1 + 8.0,
                frame.origin.y + frame.size.height - body_size * 0.9 - 12.0,
            );
            let d = (x - foot.x).hypot(y - foot.y);
            if d < distance {
                distance = d;
                closest = Some(NSPoint::new(x - foot_x, y - size.height + foot_y));
            }
        }
        closest.unwrap_or(origin)
    }
    unsafe fn arrange_canvas(
        origin: NSPoint,
        size: cocoa::foundation::NSSize,
        foot_x: f64,
        foot_y: f64,
        body_size: f64,
    ) -> (NSPoint, f64, f64) {
        // Keep the pet at the drop point while bringing its transparent popup
        // canvas fully onto the display containing the pet (Cocoa points).
        let foot = NSPoint::new(origin.x + foot_x, origin.y + size.height - foot_y);
        let screens: id = msg_send![class!(NSScreen), screens];
        let count: usize = msg_send![screens, count];
        let mut canvas = origin;
        for i in 0..count {
            let screen: id = msg_send![screens, objectAtIndex:i];
            let bounds: NSRect = msg_send![screen, visibleFrame];
            if foot.x >= bounds.origin.x
                && foot.x <= bounds.origin.x + bounds.size.width
                && foot.y >= bounds.origin.y
                && foot.y <= bounds.origin.y + bounds.size.height
            {
                let (x, y) = super::canvas_origin(
                    (foot.x, foot.y),
                    (size.width, size.height),
                    (
                        bounds.origin.x,
                        bounds.origin.y,
                        bounds.size.width,
                        bounds.size.height,
                    ),
                    body_size,
                );
                canvas = NSPoint::new(x, y);
                break;
            }
        }
        let local_x = foot.x - canvas.x;
        let local_y = size.height - (foot.y - canvas.y);
        (canvas, local_x, local_y)
    }
    pub fn drag(
        window: &tauri::WebviewWindow,
        phase: &str,
        foot_x: f64,
        foot_y: f64,
        start: Option<(f64, f64)>,
        body_size: Option<f64>,
    ) {
        let Ok(ptr) = window.ns_window() else {
            return;
        };
        unsafe {
            let ns = ptr as id;
            let frame = ns.frame();
            let mouse = NSEvent::mouseLocation(nil);
            let mut state = MOVEMENT.lock().unwrap();
            state.body_size = body_size.unwrap_or(state.body_size).clamp(60.0, 180.0);
            let body_size = state.body_size;
            match phase {
                "begin" => {
                    let (mx, my) = start.unwrap_or((mouse.x, mouse.y));
                    state.drag = Some((mx, my, frame.origin.x, frame.origin.y));
                }
                "move" => {
                    if let Some((mx, my, x, y)) = state.drag {
                        state.perch = None;
                        let _: () = msg_send![ns, setFrameOrigin:NSPoint::new(x + mouse.x - mx, y + mouse.y - my)];
                    }
                }
                "end" | "layout" => {
                    if let Some((mx, my, x, y)) = state.drag {
                        let _: () = msg_send![ns, setFrameOrigin:NSPoint::new(x + mouse.x - mx, y + mouse.y - my)];
                    }
                    let frame = ns.frame();
                    state.drag = None;
                    let primary = primary_height();
                    let foot = NSPoint::new(
                        frame.origin.x + foot_x,
                        primary - frame.origin.y - frame.size.height + foot_y,
                    );
                    let mut origin = frame.origin;
                    // Only attach when deliberately dropped close to an edge; never jump to a new app.
                    for surface in if phase == "end" { surfaces() } else { Vec::new() } {
                        if foot.x >= surface.x + 45.0
                            && foot.x <= surface.x + surface.width - 45.0
                            && (foot.y - surface.y).abs() < 24.0
                        {
                            origin.y += foot.y - surface.y;
                            state.perch = Some(Perch {
                                window: surface.number,
                                offset: foot.x - surface.x,
                                foot_x,
                                foot_y,
                            });
                            break;
                        }
                    }
                    let origin = clamp_origin(origin, frame.size, foot_x, foot_y, body_size);
                    // Leave room for a readable menu on either side at every pet size.
                    let canvas_size = cocoa::foundation::NSSize::new(body_size + 332.0, (body_size + 232.0).max(300.0));
                    // Changing the canvas must preserve the pet's global foot point.
                    let adjusted = NSPoint::new(origin.x, origin.y + frame.size.height - canvas_size.height);
                    let (canvas, local_x, local_y) =
                        arrange_canvas(adjusted, canvas_size, foot_x, foot_y, body_size);
                    if let Some(perch) = state.perch.as_mut() {
                        perch.foot_x = local_x;
                        perch.foot_y = local_y;
                    }
                    let _: () = msg_send![ns, setFrame:NSRect::new(canvas, canvas_size) display:true];
                    let _ = window.emit(
                        "pet://layout",
                        crate::pet_desktop::PetLayout {
                            left: local_x - body_size / 2.0,
                            top: local_y - body_size * 0.9,
                            size: body_size,
                        },
                    );
                }
                _ => {
                    state.drag = None;
                }
            }
        }
    }
    pub fn tick(window: &tauri::WebviewWindow) {
        let dragging = MOVEMENT.lock().unwrap().drag;
        if let Some((mx, my, _, _)) = dragging {
            unsafe {
                let pressed: usize = msg_send![class!(NSEvent), pressedMouseButtons];
                let mouse = NSEvent::mouseLocation(nil);
                if pressed & 1 != 0 && (mouse.x - mx).hypot(mouse.y - my) > 5.0 {
                    drag(window, "move", 60.0, 258.0, None, None);
                }
            }
        }
    }
    pub fn follow(window: &tauri::WebviewWindow) {
        let Ok(ptr) = window.ns_window() else {
            return;
        };
        let mut state = MOVEMENT.lock().unwrap();
        if state.drag.is_some() {
            return;
        }
        let Some(perch) = state.perch else {
            return;
        };
        unsafe {
            let Some(surface) = surfaces().into_iter().find(|s| s.number == perch.window) else {
                state.perch = None;
                return;
            };
            let ns = ptr as id;
            let frame = ns.frame();
            let origin = NSPoint::new(
                surface.x + perch.offset.min(surface.width - 45.0) - perch.foot_x,
                primary_height() - surface.y - frame.size.height + perch.foot_y,
            );
            let origin = clamp_origin(origin, frame.size, perch.foot_x, perch.foot_y, state.body_size);
            let (origin, foot_x, foot_y) =
                arrange_canvas(origin, frame.size, perch.foot_x, perch.foot_y, state.body_size);
            if (foot_x - perch.foot_x).abs() > 0.5 || (foot_y - perch.foot_y).abs() > 0.5 {
                state.perch = Some(Perch {
                    foot_x,
                    foot_y,
                    ..perch
                });
                let _ = window.emit(
                    "pet://layout",
                    crate::pet_desktop::PetLayout {
                        left: foot_x - state.body_size / 2.0,
                        top: foot_y - state.body_size * 0.9,
                        size: state.body_size,
                    },
                );
            }
            if (frame.origin.x - origin.x).abs() > 0.5 || (frame.origin.y - origin.y).abs() > 0.5 {
                let _: () = msg_send![ns, setFrameOrigin:origin];
            }
        }
    }
    pub fn detach() {
        let mut state = MOVEMENT.lock().unwrap();
        state.drag = None;
        state.perch = None;
    }
}

#[tauri::command]
pub fn pet_drag(
    app: tauri::AppHandle,
    phase: String,
    foot_x: Option<f64>,
    foot_y: Option<f64>,
    screen_x: Option<f64>,
    screen_y: Option<f64>,
    body_size: Option<f64>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    if *app.state::<crate::AppState>().settings_open.lock().unwrap() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let w = window.clone();
        window
            .run_on_main_thread(move || {
                mac::drag(
                    &w,
                    &phase,
                    foot_x.unwrap_or(60.0),
                    foot_y.unwrap_or(258.0),
                    screen_x.zip(screen_y),
                    body_size,
                )
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (foot_x, foot_y);
        if phase == "begin" {
            window.start_dragging().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn follow(window: &tauri::WebviewWindow) {
    if *window
        .app_handle()
        .state::<crate::AppState>()
        .settings_open
        .lock()
        .unwrap()
    {
        return;
    }
    #[cfg(target_os = "macos")]
    mac::follow(window);
}
pub fn detach() {
    #[cfg(target_os = "macos")]
    mac::detach();
}

#[derive(Clone, serde::Serialize)]
pub struct PetLayout {
    pub left: f64,
    pub top: f64,
    pub size: f64,
}

pub fn tick(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    if !*window
        .app_handle()
        .state::<crate::AppState>()
        .settings_open
        .lock()
        .unwrap()
    {
        mac::tick(window);
    }
}

// Coordinates are Cocoa points throughout, including negative/stacked displays.
fn canvas_origin(foot: (f64, f64), size: (f64, f64), bounds: (f64, f64, f64, f64), body_size: f64) -> (f64, f64) {
    (
        (foot.0 - body_size / 2.0).clamp(bounds.0, bounds.0 + (bounds.2 - size.0).max(0.0)),
        (foot.1 - body_size * 0.1 - 14.0).clamp(bounds.1, bounds.1 + (bounds.3 - size.1).max(0.0)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canvas_fits_negative_and_stacked_displays_without_moving_the_pet() {
        for body in [60.0_f64, 120.0, 180.0] {
          let size = (body + 332.0, (body + 232.0).max(300.0));
          for bounds in [
            (-1920.0, 0.0, 1920.0, 1080.0),
            (0.0, 900.0, 1440.0, 900.0),
            (1440.0, -400.0, 1920.0, 1080.0),
        ] {
            for offset in [
                (body / 2.0 + 4.0, body * 0.1 + 8.0),
                (720.0, 450.0),
                (bounds.2 - body / 2.0 - 4.0, bounds.3 - body * 0.9 - 12.0),
            ] {
                let foot = (bounds.0 + offset.0, bounds.1 + offset.1);
                let origin = canvas_origin(foot, size, bounds, body);
                assert!(origin.0 >= bounds.0 && origin.0 + size.0 <= bounds.0 + bounds.2);
                assert!(origin.1 >= bounds.1 && origin.1 + size.1 <= bounds.1 + bounds.3);
                let local_foot = (foot.0 - origin.0, size.1 - (foot.1 - origin.1));
                assert!(local_foot.0 >= body / 2.0 && local_foot.0 + body / 2.0 <= size.0);
                assert!(local_foot.1 >= body * 0.9 && local_foot.1 + body * 0.1 <= size.1);
                assert_eq!(
                    (origin.0 + local_foot.0, origin.1 + size.1 - local_foot.1),
                    foot
                );
            }
        }
        }
    }
}
