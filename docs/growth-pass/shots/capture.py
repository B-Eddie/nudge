#!/usr/bin/env python3
"""Headless screenshot verification for the growth-pass features.

Builds a single self-contained HTML from the Vite dist (assets inlined as
data URIs — Chromium 152 blocks loopback HTTP so nothing is served), injects
a mocked Tauri bridge with an in-memory localStorage shim, drives the REAL
frontend via real `cursor://move` events (the same path as the production
overlay), and screenshots each new/changed screen.

Usage: python3 capture.py [scenario ...]
Scenarios: radial snooze focus-panel focus-active quest toast summary onboarding
"""
import base64
import json
import mimetypes
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.expanduser("~/workspace/nudge-polished/dist")
CHROME = "/opt/meta-chromium/chrome"
LAUNCH_ARGS = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]


# ---------- single-file inliner ----------

def inline_assets(text, dist):
    def repl(m):
        rel = m.group(1)
        p = os.path.join(dist, "assets", rel)
        if not os.path.exists(p):
            return m.group(0)
        mime, _ = mimetypes.guess_type(p)
        data = base64.b64encode(open(p, "rb").read()).decode()
        return "data:%s;base64,%s" % (mime or "application/octet-stream", data)

    return re.sub(r"/assets/([^\s\"'()]+)", repl, text)


def build_single_html():
    with open(os.path.join(DIST, "index.html")) as f:
        html = f.read()

    def repl_js(m):
        src = m.group(1)
        with open(os.path.join(DIST, src.lstrip("/"))) as f:
            js = inline_assets(f.read(), DIST)
        return "<script type=\"module\">\n" + js + "\n</script>"

    html = re.sub(
        r"<script[^>]*src=\"(/assets/[^\"]+\.js)\"[^>]*>\s*</script>",
        repl_js,
        html,
    )

    def repl_css(m):
        href = m.group(1)
        with open(os.path.join(DIST, href.lstrip("/"))) as f:
            css = inline_assets(f.read(), DIST)
        return "<style>\n" + css + "\n</style>"

    html = re.sub(r"<link[^>]*href=\"(/assets/[^\"]+\.css)\"[^>]*>", repl_css, html)
    html = inline_assets(html, DIST)
    return html


# ---------- tauri mock ----------

MOCK_JS = """
window.__SCENARIO__ = __SCENARIO_JSON__;
(() => {
  const S = window.__SCENARIO__;

  // In-memory localStorage (opaque origin has none); pre-seed from scenario.
  const store = new Map(Object.entries(S.seedLocalStorage || {}));
  const shim = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
  };
  try {
    Object.defineProperty(window, "localStorage", { value: shim, configurable: true });
  } catch (e) { /* real localStorage available; seed it instead */ 
    for (const [k, v] of store) window.localStorage.setItem(k, v);
  }
  window.__lsStore = store;

  const listeners = new Map();
  const callbacks = new Map();
  const internals = (window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {});
  internals.transformCallback = (cb, once) => {
    const id = (Math.random() * 0x7fffffff) | 0;
    callbacks.set(id, (data) => { if (once) callbacks.delete(id); if (cb) cb(data); });
    return id;
  };
  internals.unregisterCallback = (id) => callbacks.delete(id);

  function dayKeyOffset(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  internals.invoke = async (cmd, args) => {
    if (cmd === "plugin:event|listen") {
      const { event, handler } = args;
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
      return handler;
    }
    if (cmd === "plugin:event|unlisten") return null;
    if (cmd === "plugin:event|emit") return null;
    switch (cmd) {
      case "get_activity": {
        const history = (S.historySpec || []).map((h) => ({
          date: dayKeyOffset(h.daysAgo),
          categorySeconds: h.categorySeconds || {},
          breaksTaken: h.breaksTaken || 0,
          breaksInterrupted: h.breaksInterrupted || 0,
          restSeconds: h.restSeconds || 0,
          longestStretchSeconds: h.longestStretchSeconds || 0,
        }));
        return {
          timePassed: S.timePassed || 0,
          timeEvents: S.timeEvents == null ? 1 : S.timeEvents,
          stats: S.liveStats || {
            startedAt: Date.now(), categorySeconds: {},
            breaksTaken: 0, breaksInterrupted: 0, restSeconds: 0,
            currentStretchSeconds: 0, longestStretchSeconds: 0,
          },
          paused: false, history,
        };
      }
      case "get_settings":
        return {
          monitor_index: 0, reminder_interval_mins: 30,
          position: S.position || "bottom_right", pause_shortcut: "Cmd+Shift+KeyP",
          app_categories: {}, onboarding_complete: S.onboarding !== false,
          character_id: S.characterId || "panda", auto_idle_break_mins: 5,
          launch_at_login: false,
        };
      case "get_monitor_options": return [{ value: 0, label: "Main display" }];
      case "get_app_category_options":
        return [{ value: "productivity", label: "Productivity" }];
      case "get_auto_break_status":
        return { idle_seconds: 0, idle_threshold_seconds: 300,
                 should_auto_break: false, defer_auto_break: false, defer_reason: null };
      case "get_seconds_since_last_input": return 9999;
      case "pop_pending_note": return null;
      case "get_frontmost_app": return null;
      default: return null;
    }
  };
  window.__tauriFire = (event, payload) => {
    const arr = listeners.get(event) || [];
    for (const id of arr) { const cb = callbacks.get(id); if (cb) cb({ event, payload: payload ?? null }); }
  };
  // dark desktop backdrop so the overlay/panels read like the real product
  const css = document.createElement("style");
  const pos = S.position || "bottom_right";
  const cornerCss =
    pos === "bottom_left" ? "left: 0 !important; bottom: 0 !important;" :
    pos === "top_left" ? "left: 0 !important; top: 0 !important;" :
    pos === "top_right" ? "right: 0 !important; top: 0 !important;" :
    "right: 0 !important; bottom: 0 !important;";
  const overlayCss = `
    /* emulate the real 300x300 overlay window pinned to the screen corner */
    main.container { position: fixed !important; ${cornerCss}
      width: 300px !important; height: 300px !important; }
    .character { width: 120px !important; }
    .character.pos-bl, .character.pos-br { bottom: 30px !important; }
    .character.pos-tl, .character.pos-tr { top: 30px !important; }
    #hoverInfo { font-size: 30px !important; }
    .character.pos-bl.hovered #hoverInfo,
    .character.pos-tl.hovered #hoverInfo { left: 126px !important; }
    .character.pos-br.hovered #hoverInfo,
    .character.pos-tr.hovered #hoverInfo { right: 126px !important; }
    .messages { min-width: 30px !important; max-width: 120px !important; }`;
  css.textContent = `
    html, body { background: #20242e !important; margin: 0; }
    #nudge-wallpaper { position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background: radial-gradient(1200px 700px at 70% 18%, #3a4157 0%, #20242e 58%, #14161d 100%); }
    #nudge-wallpaper::after { content: ""; position: absolute; inset: 0;
      background-image: radial-gradient(rgba(255,255,255,.05) 1px, transparent 1.4px);
      background-size: 26px 26px; }
    #root { position: relative; z-index: 2; }
    ${S.windowMode === "overlay" ? overlayCss : ""}`;
  document.documentElement.appendChild(css);
  window.addEventListener("DOMContentLoaded", () => {
    const w = document.createElement("div");
    w.id = "nudge-wallpaper";
    document.body.prepend(w);
  });
})();
"""


def build_page_html(scenario):
    mock = MOCK_JS.replace("__SCENARIO_JSON__", json.dumps(scenario))
    html = SINGLE_HTML.replace(
        "</title>", "</title>\n<script>\n" + mock + "\n</script>", 1
    )
    return html


# ---------- drivers ----------

def fire(page, event, payload):
    page.evaluate(
        "([e, p]) => window.__tauriFire(e, p)", [event, payload]
    )


def char_center(page):
    return page.evaluate(
        """() => {
          const el = document.querySelector('#characterMain');
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }"""
    )


def click(page, x, y):
    fire(page, "cursor://move", {"x": x, "y": y, "inside": True, "pressed": True})
    page.wait_for_timeout(120)
    fire(page, "cursor://move", {"x": x, "y": y, "inside": True, "pressed": False})
    # The real runtime also delivers an OS-level DOM click alongside
    # cursor://move; plain buttons (quest Done, pill stop, panel buttons)
    # rely on it. Radial slices only use data-action so this is a no-op there.
    page.evaluate(
        "([cx, cy]) => { const el = document.elementFromPoint(cx, cy);"
        " if (el && typeof el.click === 'function') el.click(); }",
        [x, y],
    )
    page.wait_for_timeout(300)


def click_action(page, action):
    c = char_center(page)
    click(page, c["x"], c["y"])  # open the radial menu
    page.wait_for_timeout(400)
    box = page.evaluate(
        """(a) => {
          const el = document.querySelector('[data-action="' + a + '"]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }""",
        action,
    )
    assert box, "no slice for action %s" % action
    click(page, box["x"], box["y"])


def new_page(p, scenario, viewport=(1920, 1080)):
    b = p.chromium.launch(executable_path=CHROME, args=LAUNCH_ARGS)
    ctx = b.new_context(viewport={"width": viewport[0], "height": viewport[1]})
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg)
    pg.goto("about:blank")
    tree = cdp.send("Page.getFrameTree")
    frame_id = tree["frameTree"]["frame"]["id"]
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    cdp.send(
        "Page.setDocumentContent",
        {"frameId": frame_id, "html": build_page_html(scenario)},
    )
    pg.wait_for_selector("#characterMain", timeout=30000, state="attached")
    pg.wait_for_timeout(1500)
    return b, pg, errors


def shot(pg, name):
    path = os.path.join(HERE, name + ".png")
    pg.screenshot(path=path)
    print("[shots] wrote", path, flush=True)


# ---------- scenarios ----------

SUMMARY_HISTORY = [
    {"daysAgo": 1, "breaksTaken": 5, "categorySeconds": {"Developer Tools": 7200}, "restSeconds": 600, "longestStretchSeconds": 5400},
    {"daysAgo": 2, "breaksTaken": 4, "categorySeconds": {"Productivity": 3600}, "restSeconds": 300, "longestStretchSeconds": 2700},
    {"daysAgo": 3, "breaksTaken": 0, "categorySeconds": {}, "restSeconds": 0, "longestStretchSeconds": 0},
    {"daysAgo": 4, "breaksTaken": 3, "categorySeconds": {"Games": 1800}, "restSeconds": 1200, "longestStretchSeconds": 1500},
    {"daysAgo": 5, "breaksTaken": 5, "categorySeconds": {"Developer Tools": 9000}, "restSeconds": 3700, "longestStretchSeconds": 7500},
    {"daysAgo": 6, "breaksTaken": 4, "categorySeconds": {"Social Networking": 2400}, "restSeconds": 0, "longestStretchSeconds": 2000},
]
SUMMARY_LIVE = {
    "startedAt": 0,  # replaced per-run
    "categorySeconds": {"Developer Tools": 5400, "Productivity": 1800},
    "breaksTaken": 4, "breaksInterrupted": 0, "restSeconds": 900,
    "currentStretchSeconds": 1200, "longestStretchSeconds": 3600,
}
SUMMARY_SEEDS = {
    "nudge.pet.v1": json.dumps({
        "panda": {"name": "Mochi", "xp": 130, "focusSessions": 2,
                  "questsDone": 3, "fullBreaks": 6},
    }),
    "nudge.achievements.v1": json.dumps(["first-rest", "rest-regular"]),
}

BASE = {"characterId": "panda", "timePassed": 0, "timeEvents": 2,
        "windowMode": "overlay"}
PANEL_VIEWPORT = (420, 580)


def scen_radial(p):
    b, pg, errors = new_page(p, dict(BASE))
    try:
        c = char_center(pg)
        click(pg, c["x"], c["y"])
        pg.wait_for_timeout(600)
        shot(pg, "radial-menu")
    finally:
        b.close()
    return errors


def scen_snooze(p):
    b, pg, errors = new_page(p, dict(BASE))
    try:
        click_action(pg, "snooze")
        pg.wait_for_timeout(6000)  # typewriter: 100ms/char, ~52 chars
        shot(pg, "snooze-confirm")
        c = char_center(pg)
        click(pg, c["x"], c["y"])  # reopen: slice label now shows snoozed state
        pg.wait_for_timeout(600)
        shot(pg, "radial-snoozed")
    finally:
        b.close()
    return errors


def scen_focus_panel(p):
    b, pg, errors = new_page(p, dict(BASE, windowMode="panel"), PANEL_VIEWPORT)
    try:
        click_action(pg, "focus")
        pg.wait_for_timeout(800)
        shot(pg, "focus-panel")
    finally:
        b.close()
    return errors


def scen_focus_active(p):
    b, pg, errors = new_page(p, dict(BASE))
    try:
        click_action(pg, "focus")
        pg.wait_for_timeout(800)
        pg.evaluate("() => document.querySelector('.focus-option').click()")
        pg.wait_for_timeout(1500)
        shot(pg, "focus-active")
    finally:
        b.close()
    return errors


def scen_quest(p):
    b, pg, errors = new_page(p, dict(BASE))
    try:
        click_action(pg, "break")
        pg.wait_for_timeout(1800)
        shot(pg, "break-quest")
    finally:
        b.close()
    return errors


def scen_toast(p):
    b, pg, errors = new_page(p, dict(BASE))
    try:
        click_action(pg, "break")  # earns First Rest -> badge toast pops
        pg.wait_for_timeout(1200)  # toast up, "need to rest" note barely typed
        shot(pg, "achievement-toast")
    finally:
        b.close()
    return errors


def scen_summary(p):
    live = dict(SUMMARY_LIVE, startedAt=int(time.time() * 1000))
    scen = dict(
        BASE,
        windowMode="panel",
        liveStats=live,
        historySpec=SUMMARY_HISTORY,
        seedLocalStorage=SUMMARY_SEEDS,
    )
    b, pg, errors = new_page(p, scen, PANEL_VIEWPORT)
    try:
        # Wait out any badge-unlock toasts from the seeded history first.
        pg.wait_for_timeout(6000)
        click_action(pg, "summary")
        pg.wait_for_timeout(1000)
        shot(pg, "summary-today")
        pg.evaluate(
            "() => [...document.querySelectorAll('.summary-tab')]"
            ".find(b => b.textContent.trim() === 'week').click()"
        )
        pg.wait_for_timeout(800)
        shot(pg, "summary-week")
    finally:
        b.close()
    return errors


def scen_onboarding(p):
    scen = dict(BASE, onboarding=False, windowMode="panel")
    b, pg, errors = new_page(p, scen, PANEL_VIEWPORT)
    try:
        pg.wait_for_selector(".onboarding-btn.primary", timeout=15000)
        for _ in range(2):  # welcome -> companion -> name
            pg.evaluate(
                "() => document.querySelector('.onboarding-btn.primary').click()"
            )
            pg.wait_for_timeout(500)
        shot(pg, "onboarding-name")
    finally:
        b.close()
    return errors


def scen_settings(p):
    scen = dict(BASE, windowMode="panel", seedLocalStorage=SUMMARY_SEEDS)
    b, pg, errors = new_page(p, scen, PANEL_VIEWPORT)
    try:
        # Wait out badge-unlock toasts from the seeded history first.
        pg.wait_for_timeout(6000)
        click_action(pg, "settings")
        pg.wait_for_timeout(1000)
        shot(pg, "settings-top")
        pg.evaluate(
            """() => {
              const sec = [...document.querySelectorAll('.settings-section-title')]
                .find(el => el.textContent.trim() === 'Companion');
              if (sec) sec.scrollIntoView({ block: 'start' });
            }"""
        )
        pg.wait_for_timeout(600)
        shot(pg, "settings-companion")
    finally:
        b.close()
    return errors


SCENARIOS = {
    "radial": scen_radial,
    "snooze": scen_snooze,
    "focus-panel": scen_focus_panel,
    "focus-active": scen_focus_active,
    "quest": scen_quest,
    "toast": scen_toast,
    "summary": scen_summary,
    "onboarding": scen_onboarding,
    "settings": scen_settings,
}


def main():
    global SINGLE_HTML
    SINGLE_HTML = build_single_html()
    print("[shots] single html built (%d bytes)" % len(SINGLE_HTML), flush=True)
    only = sys.argv[1:] or list(SCENARIOS)
    with sync_playwright() as p:
        for name in only:
            print("[shots] scenario:", name, flush=True)
            errors = SCENARIOS[name](p)
            if errors:
                print("[shots] %s page errors: %s" % (name, errors[:3]), flush=True)


if __name__ == "__main__":
    main()
