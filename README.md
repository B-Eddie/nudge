<p align="center">
  <img src="app-icon.png" alt="Nudge icon" height="180" />
</p>

<h1 align="center">Nudge</h1>

<p align="center">
  A friendly desktop companion that helps you take breaks before you burn out.
</p>

<p align="center">
  <a href="https://github.com/b-eddie/nudge/releases/latest">Download for macOS</a>
  ·
  <a href="https://github.com/b-eddie/nudge/releases/latest">Download for Linux</a>
</p>

---

## Platform support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS    | ✅ Full support | The reference platform. Focused-app detection, idle tracking, auto-break on idle/sleep, NSPanel overlay. |
| Linux    | ✅ Supported (X11) | `.deb` / `.AppImage` in Releases. Focused-app via WM_CLASS, idle via MIT-SCREEN-SAVER, sleep/wake via logind. On Wayland without XWayland, focused-app/idle detection degrades gracefully. |
| Windows  | 🔜 Planned | The Rust backend is already structured for it (`src-tauri/src/platform/windows.rs`); not built yet. |

---

It's easy to lose hours at your computer without noticing. Timers and notifications are easy to dismiss — so Nudge makes the time tangible instead. A little character lives on your screen and gets visibly more tired the longer you work. When you actually take a break, it recovers. Simple as that.

<!-- Screenshots: add app screenshots/screencast here
<p align="center">
  <img src="docs/screenshot-character.png" alt="Nudge character on the desktop" width="600" />
</p>
-->

## Features

- **A companion with energy** — the character's animation reflects how long you've been working without a break
- **App-aware** — detects your focused app and reacts to what you're doing (coding, gaming, social, and more)
- **Break reminders** — configurable intervals, plus gentle nudges when you've been stuck in games or social apps too long
- **Smart breaks** — rest long enough and your companion fully recovers; Nudge can also start a break automatically when you're idle or your Mac sleeps
- **Reminder notes** — queue notes for your character to say at the next reminder
- **Activity summary** — time per category, breaks taken and interrupted, longest stretch, with ~31 days of history
- **Stays out of the way** — click-through overlay pinned to any screen corner, hideable with a global shortcut
- **Launch at login** and **automatic updates**

## Install

**macOS:** download the latest `.dmg` from the [Releases page](https://github.com/b-eddie/nudge/releases/latest), open it, and drag Nudge into Applications.

> **Note:** On first launch, right-click the app and choose Open if Gatekeeper flags it.

**Linux (X11):** download the `.deb` or `.AppImage` from the [Releases page](https://github.com/b-eddie/nudge/releases/latest).

> **Note:** the Linux port targets X11. On Wayland, focused-app and idle detection gracefully degrade (the character still works; auto-break on idle won't trigger).

## Privacy

Nudge observes which app is focused and whether you're actively using the keyboard/mouse — that's how it knows when you're working and when you're resting. **All of this stays on your Mac.** There is no account, no analytics, and no data leaves your machine except checking GitHub Releases for updates.

## Development

Requirements: [Node.js](https://nodejs.org/) 20+, [Rust](https://rustup.rs/), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

**macOS:** the Tauri prerequisites above are enough.

**Linux (Debian/Ubuntu):**

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev
```

Then:

```bash
git clone https://github.com/b-eddie/nudge.git
cd nudge
npm install

# run in dev mode
npm run tauri dev

# build a release bundle
npm run tauri build
```

Useful checks:

```bash
npm run build        # typecheck + production frontend build
```

The Rust backend is organized per platform in `src-tauri/src/platform/` (`macos.rs`, `linux.rs`, `windows.rs`), selected at compile time — see the module docs there before adding OS-specific code.

CI runs the frontend build on Linux and `cargo check` on macOS *and* Linux for every push/PR. Pushing a tag like `v1.0.0` triggers the release workflow, which builds the macOS `.dmg` and the Linux `.deb`/`.AppImage`, and publishes them to GitHub Releases.

## Releasing a new version

1. Update the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
2. Add an entry to `CHANGELOG.md`
3. Commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`
4. The release workflow builds the `.dmg`, attaches it to a GitHub Release, and publishes the `latest.json` that powers in-app auto-updates

Signing secrets are documented at the top of `.github/workflows/release.yml`.

## Contributing

Bug reports and pull requests are welcome. Please keep the character's personality intact — the charm is the product.

## License

MIT — see [LICENSE](LICENSE).
