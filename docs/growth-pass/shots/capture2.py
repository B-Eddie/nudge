#!/usr/bin/env python3
"""Cycle-2 audit captures: every corner x character, every floating element,
long-string stress, empty states, onboarding walk, note panel, toasts,
level-up, snooze-off, escape/backdrop behavior.

Reuses capture.py's inliner + mock; extends the mock with pending-note
commands. Run: python3 capture2.py [scenario ...]
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capture
from capture import fire, click, click_action, char_center, BASE, PANEL_VIEWPORT

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))

POSITIONS = ["bottom_left", "bottom_right", "top_left", "top_right"]
CHARS = ["panda", "maple", "puddle"]
LONG_NAME = "Bartholomew Wigglesworth"  # exactly 24 chars (maxLength)

LONGNAME_SEEDS = {
    "nudge.pet.v1": json.dumps({
        "panda": {"name": LONG_NAME, "xp": 130, "focusSessions": 2,
                  "questsDone": 3, "fullBreaks": 6},
    }),
}


def extend_mock():
    """Patch the mock JS with pending-note commands before building pages."""
    extra = """
    const __origInvoke = internals.invoke;
    const __notes = (S.notes || []).slice();
    internals.invoke = async (cmd, args) => {
      if (cmd === "get_pending_notes") return __notes.slice();
      if (cmd === "add_pending_note") { __notes.push(args.note); return null; }
      if (cmd === "remove_pending_note") { __notes.splice(args.index, 1); return null; }
      if (cmd === "pop_pending_note") return S.pendingNote ?? null;
      return __origInvoke(cmd, args);
    };
    """
    capture.MOCK_JS = capture.MOCK_JS.replace(
        "window.__tauriFire = (event, payload) => {", extra + "\n  window.__tauriFire = (event, payload) => {"
    )


def shot(pg, name):
    path = os.path.join(HERE, "cycle2-" + name + ".png")
    pg.screenshot(path=path)
    print("[c2] wrote", path, flush=True)
    return path


def corner_crop(path, position):
    """Crop the 300x300 overlay corner out of a full-viewport shot, 2x."""
    img = Image.open(path)
    w, h = img.size
    box = {
        "bottom_left": (0, h - 300, 300, h),
        "bottom_right": (w - 300, h - 300, w, h),
        "top_left": (0, 0, 300, 300),
        "top_right": (w - 300, 0, w, 300),
    }[position]
    crop = img.crop(box).resize((600, 600), Image.NEAREST)
    out = path.replace(".png", "-crop.png")
    crop.save(out)
    print("[c2] wrote", out, flush=True)


def new_overlay(p, position="bottom_right", char="panda", **kw):
    scen = dict(BASE, position=position, characterId=char,
                seedLocalStorage=kw.pop("seedLocalStorage", None) or {})
    scen.update(kw)
    b, pg, errors = capture.new_page(p, scen)
    return b, pg, errors


def open_menu(pg):
    c = char_center(pg)
    click(pg, c["x"], c["y"])
    pg.wait_for_timeout(500)


# ---------- scenarios ----------

def scen_corners_idle(p):
    errs = []
    for pos in POSITIONS:
        for char in CHARS:
            b, pg, errors = new_overlay(p, pos, char)
            try:
                pg.wait_for_timeout(1200)
                path = shot(pg, "idle-%s-%s" % (pos, char))
                corner_crop(path, pos)
            finally:
                b.close()
            errs += errors
    return errs


def scen_corners_radial(p):
    errs = []
    for pos in POSITIONS:
        b, pg, errors = new_overlay(p, pos)
        try:
            open_menu(pg)
            path = shot(pg, "radial-%s" % pos)
            corner_crop(path, pos)
        finally:
            b.close()
        errs += errors
    return errs


def scen_corners_radial_break(p):
    errs = []
    for pos in POSITIONS:
        b, pg, errors = new_overlay(p, pos)
        try:
            click_action(pg, "break")   # starts break, menu closes
            pg.wait_for_timeout(1500)
            open_menu(pg)              # reopen: "End break" slice
            path = shot(pg, "radial-break-%s" % pos)
            corner_crop(path, pos)
        finally:
            b.close()
        errs += errors
    return errs


def scen_corners_hover(p):
    errs = []
    for pos in POSITIONS:
        b, pg, errors = new_overlay(p, pos)
        try:
            c = char_center(pg)
            fire(pg, "cursor://move", {"x": c["x"], "y": c["y"],
                                       "inside": True, "pressed": False})
            pg.wait_for_timeout(500)
            path = shot(pg, "hover-%s" % pos)
            corner_crop(path, pos)
        finally:
            b.close()
        errs += errors
    return errs


def scen_corners_msg(p):
    errs = []
    for pos in POSITIONS:
        b, pg, errors = new_overlay(p, pos)
        try:
            fire(pg, "show-reminder", None)
            pg.wait_for_timeout(1500)  # typewriter mid-flight
            path = shot(pg, "msg-%s" % pos)
            corner_crop(path, pos)
        finally:
            b.close()
        errs += errors
    return errs


def scen_corners_focus(p):
    errs = []
    for pos in POSITIONS:
        b, pg, errors = new_overlay(p, pos)
        try:
            click_action(pg, "focus")  # opens focus panel (overlay windowMode)
            pg.wait_for_timeout(800)
            pg.evaluate("() => document.querySelector('.focus-option').click()")
            pg.wait_for_timeout(1500)  # session starts, message types
            path = shot(pg, "focus-%s" % pos)
            corner_crop(path, pos)
        finally:
            b.close()
        errs += errors
    return errs


def scen_corners_quest(p):
    errs = []
    for pos in POSITIONS:
        b, pg, errors = new_overlay(p, pos)
        try:
            click_action(pg, "break")
            pg.wait_for_timeout(2200)  # quest card + message typed
            path = shot(pg, "quest-%s" % pos)
            corner_crop(path, pos)
        finally:
            b.close()
        errs += errors
    return errs


def scen_corners_sleep(p):
    errs = []
    for pos in POSITIONS:
        b, pg, errors = new_overlay(p, pos)
        try:
            fire(pg, "system-will-sleep", None)
            pg.wait_for_timeout(2200)
            path = shot(pg, "sleep-%s" % pos)
            corner_crop(path, pos)
        finally:
            b.close()
        errs += errors
    return errs


def scen_longname(p):
    errs = []
    b, pg, errors = new_overlay(p, "bottom_right", "panda",
                                seedLocalStorage=LONGNAME_SEEDS)
    try:
        open_menu(pg)
        path = shot(pg, "longname-radial")
        corner_crop(path, "bottom_right")
    finally:
        b.close()
    errs += errors

    # summary pet strip
    live = dict(capture.SUMMARY_LIVE, startedAt=int(time.time() * 1000))
    scen = dict(BASE, windowMode="panel", liveStats=live,
                historySpec=capture.SUMMARY_HISTORY,
                seedLocalStorage=LONGNAME_SEEDS)
    b, pg, errors = capture.new_page(p, scen, PANEL_VIEWPORT)
    try:
        pg.wait_for_timeout(6000)
        click_action(pg, "summary")
        pg.wait_for_timeout(1000)
        shot(pg, "longname-summary")
    finally:
        b.close()
    errs += errors
    return errs


def scen_summary_empty(p):
    live = {"startedAt": int(time.time() * 1000), "categorySeconds": {},
            "breaksTaken": 0, "breaksInterrupted": 0, "restSeconds": 0,
            "currentStretchSeconds": 0, "longestStretchSeconds": 0}
    scen = dict(BASE, windowMode="panel", liveStats=live, historySpec=[])
    b, pg, errors = capture.new_page(p, scen, PANEL_VIEWPORT)
    try:
        pg.wait_for_timeout(2500)
        click_action(pg, "summary")
        pg.wait_for_timeout(1000)
        shot(pg, "empty-today")
        pg.evaluate(
            "() => [...document.querySelectorAll('.summary-tab')]"
            ".find(b => b.textContent.trim() === 'week').click()")
        pg.wait_for_timeout(800)
        shot(pg, "empty-week")
    finally:
        b.close()
    return errors


def scen_note_panel(p):
    scen = dict(BASE, windowMode="panel",
                notes=["Call mom back", "Water the desk plant",
                       "A very long reminder note to see how the row wraps inside the panel list"])
    b, pg, errors = capture.new_page(p, scen, PANEL_VIEWPORT)
    try:
        pg.wait_for_timeout(1500)
        c = char_center(pg)
        # click the note slice (data-note-trigger, not data-action)
        click(pg, c["x"], c["y"])
        pg.wait_for_timeout(500)
        box = pg.evaluate(
            """() => { const el = document.querySelector('[data-note-trigger]');
               if (!el) return null; const r = el.getBoundingClientRect();
               return { x: r.x + r.width/2, y: r.y + r.height/2 }; }""")
        assert box, "no note slice"
        click(pg, box["x"], box["y"])
        pg.wait_for_timeout(1200)
        shot(pg, "note-panel")
    finally:
        b.close()
    return errors


def scen_note_pinned(p):
    b, pg, errors = new_overlay(
        p, "bottom_right", "panda",
        pendingNote="Don't forget to drink water!")
    try:
        fire(pg, "show-reminder", None)
        pg.wait_for_timeout(3500)  # typed + stays (pinned)
        path = shot(pg, "note-pinned")
        corner_crop(path, "bottom_right")
    finally:
        b.close()
    return errors


def scen_onboarding(p):
    scen = dict(BASE, onboarding=False, windowMode="panel")
    b, pg, errors = capture.new_page(p, scen, PANEL_VIEWPORT)
    try:
        pg.wait_for_selector(".onboarding-btn.primary", timeout=15000)
        for i in range(8):
            step = pg.evaluate(
                """() => document.querySelector('.onboarding-progress')
                    .textContent.trim().toLowerCase().replace(/ /g, '-')""")
            shot(pg, "onboarding-%d-%s" % (i + 1, step))
            if i < 7:
                pg.evaluate(
                    "() => document.querySelector('.onboarding-btn.primary').click()")
                pg.wait_for_timeout(600)
    finally:
        b.close()
    return errors


def scen_settings_bottom(p):
    scen = dict(BASE, windowMode="panel", seedLocalStorage=LONGNAME_SEEDS)
    b, pg, errors = capture.new_page(p, scen, PANEL_VIEWPORT)
    try:
        pg.wait_for_timeout(6000)
        click_action(pg, "settings")
        pg.wait_for_timeout(1000)
        pg.evaluate(
            """() => { const b = document.querySelector('.settings-body');
               b.scrollTop = b.scrollHeight; }""")
        pg.wait_for_timeout(600)
        shot(pg, "settings-bottom")
    finally:
        b.close()
    return errors


def scen_toasts(p):
    # 300x300 viewport = true overlay geometry for fixed-position toasts.
    seed = {"nudge.pet.v1": json.dumps(
        {"panda": {"name": "Mochi", "xp": 95, "focusSessions": 0,
                   "questsDone": 0, "fullBreaks": 0}})}
    scen = dict(BASE, windowMode="overlay", seedLocalStorage=seed)
    b, pg, errors = capture.new_page(p, scen, (300, 300))
    try:
        pg.wait_for_timeout(1200)
        click_action(pg, "break")      # first-rest badge toast
        pg.wait_for_timeout(1500)
        # complete the quest -> +15 XP -> level 2 -> level-up toast + message
        box = pg.evaluate(
            """() => { const el = document.querySelector('.quest-done');
               if (!el) return null; const r = el.getBoundingClientRect();
               return { x: r.x + r.width/2, y: r.y + r.height/2 }; }""")
        assert box, "no quest Done button"
        click(pg, box["x"], box["y"])
        pg.wait_for_timeout(1200)
        shot(pg, "toasts")
    finally:
        b.close()
    return errors


def scen_levelup(p):
    seed = {"nudge.pet.v1": json.dumps(
        {"panda": {"name": "Mochi", "xp": 95, "focusSessions": 0,
                   "questsDone": 0, "fullBreaks": 0}})}
    b, pg, errors = new_overlay(p, "bottom_right", "panda",
                                seedLocalStorage=seed)
    try:
        click_action(pg, "break")
        pg.wait_for_timeout(1500)
        box = pg.evaluate(
            """() => { const el = document.querySelector('.quest-done');
               if (!el) return null; const r = el.getBoundingClientRect();
               return { x: r.x + r.width/2, y: r.y + r.height/2 }; }""")
        click(pg, box["x"], box["y"])
        pg.wait_for_timeout(2500)  # level-up message typing
        path = shot(pg, "levelup")
        corner_crop(path, "bottom_right")
    finally:
        b.close()
    return errors


def scen_snooze_off(p):
    b, pg, errors = new_overlay(p, "bottom_right", "panda")
    try:
        click_action(pg, "snooze")
        pg.wait_for_timeout(400)
        click_action(pg, "snooze")   # level 2 -> "Snooze off" label
        pg.wait_for_timeout(400)
        c = char_center(pg)
        click(pg, c["x"], c["y"])
        pg.wait_for_timeout(500)
        path = shot(pg, "snooze-off")
        corner_crop(path, "bottom_right")
    finally:
        b.close()
    return errors


def scen_escape(p):
    b, pg, errors = new_overlay(p, "bottom_right", "panda",
                                windowMode="panel")
    try:
        click_action(pg, "focus")
        pg.wait_for_timeout(800)
        shot(pg, "escape-before")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(600)
        open_state = pg.evaluate(
            "() => !!document.querySelector('.focus-panel')")
        print("[c2] focus panel open after Escape:", open_state, flush=True)
        shot(pg, "escape-after")
    finally:
        b.close()
    return errors


def scen_backdrop(p):
    scen = dict(BASE, windowMode="panel")
    b, pg, errors = capture.new_page(p, scen, PANEL_VIEWPORT)
    try:
        pg.wait_for_timeout(6000)
        click_action(pg, "settings")
        pg.wait_for_timeout(800)
        pg.mouse.click(10, 290)  # backdrop, left edge mid-height
        pg.wait_for_timeout(600)
        open_state = pg.evaluate(
            "() => !!document.querySelector('.settings-panel')")
        print("[c2] settings panel open after backdrop click:", open_state,
              flush=True)
        shot(pg, "backdrop-after")
    finally:
        b.close()
    return errors


SCENARIOS = {
    "corners-idle": scen_corners_idle,
    "corners-radial": scen_corners_radial,
    "corners-radial-break": scen_corners_radial_break,
    "corners-hover": scen_corners_hover,
    "corners-msg": scen_corners_msg,
    "corners-focus": scen_corners_focus,
    "corners-quest": scen_corners_quest,
    "corners-sleep": scen_corners_sleep,
    "longname": scen_longname,
    "summary-empty": scen_summary_empty,
    "note-panel": scen_note_panel,
    "note-pinned": scen_note_pinned,
    "onboarding": scen_onboarding,
    "settings-bottom": scen_settings_bottom,
    "toasts": scen_toasts,
    "levelup": scen_levelup,
    "snooze-off": scen_snooze_off,
    "escape": scen_escape,
    "backdrop": scen_backdrop,
}


def main():
    extend_mock()
    capture.SINGLE_HTML = capture.build_single_html()
    print("[c2] single html built (%d bytes)" % len(capture.SINGLE_HTML),
          flush=True)
    only = sys.argv[1:] or list(SCENARIOS)
    with sync_playwright() as p:
        for name in only:
            print("[c2] scenario:", name, flush=True)
            errors = SCENARIOS[name](p)
            if errors:
                print("[c2] %s page errors: %s" % (name, errors[:3]), flush=True)


if __name__ == "__main__":
    main()
