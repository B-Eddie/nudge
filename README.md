<p align="center">
  <img src="app-icon.png" alt="Nudge icon" height="180" />
</p>

<h1 align="center">Nudge</h1>

<p align="center">
  A friendly desktop companion that helps you take breaks before you burn out.
</p>

<p align="center">
  <a href="https://github.com/b-eddie/nudge/releases/latest">Download for macOS</a>
</p>

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

Download the latest `.dmg` from the [Releases page](https://github.com/b-eddie/nudge/releases/latest), open it, and drag Nudge into Applications.

> **Note:** macOS only. On first launch, right-click the app and choose Open if Gatekeeper flags it.

## Privacy

Nudge observes which app is focused and whether you're actively using the keyboard/mouse — that's how it knows when you're working and when you're resting. **All of this stays on your Mac.** There is no account, no analytics, and no data leaves your machine except checking GitHub Releases for updates.

## Development

Requirements: macOS, [Node.js](https://nodejs.org/) 20+, [Rust](https://rustup.rs/), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

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

CI runs the frontend build on Linux and `cargo check` on macOS for every push/PR. Pushing a tag like `v1.0.0` triggers the release workflow, which builds the signed `.dmg` and publishes it to GitHub Releases.

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
