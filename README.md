<p align="center">
  <img src="app-icon.png" alt="Nudge icon" height="180" />
</p>

# Nudge
A friendly desktop companion that helps you stay balanced while you work

## The problem
It's easy to lock in at your computer for hours without noticing how quickly time passes. Timers and notifications are easy to ignore since they're repetative and easy to dismiss.

Nudge makes the time spent on your computer tangible. A desktop companion gets visibly more tired the longer you work and nudges you to rest. When you actually take a break, it the companion recovers.

## Features
- Visual progression: character animation depends on time spent on computer without a break
- Taking a break will restore the character: resting long enough to compensate for time spent without break will recover the companion
- App awareness: detects focused window and maps animation to a category (Developer tools -> companion is typing)
- Context-aware phrases: says phrases based on what you're doing (coding, gaming, social, etc.) and how tired the companion is
- Configurable reminders, screen position, monitor, per-app categories
- Activity summary: time per category, breaks taken/interrupted, longest stretch, ~31 days of history
- Customizable global pause shortcut: hides overlay

## Challenges
- Overlay window that stays out of the way: ignoring mouse events until you hover or click on character
- Mac-specific apis (focused app detection, idle-input monitoring, cursor tracking) not implemented on windows (cuz i only got a mac)
- Break awareness: watching for keyboard/mouse activity to end break early
- Character progression: needed to draw frames for different app categories + different faces based on how long user was working

## The future
- Smoother character transitions (idle -> moving to an app with enter/exit animations)
- More art - different characters, polish, **more categories/different appearance for time spent on computer**, accesories
- Launch at login
- Windows support
- Better actvity insights and more powerful break reminders

## Installation
**Requirements:** macOS, [Node.js](https://nodejs.org/), [Rust](https://rustup.rs/), and [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

Note: Not tested on Windows.

```bash
# dependencies
git clone [repo url]
cd nudge
npm install

# run in dev
npm run tauri dev

# or build a release bundle
npm run tauri build
```

TO ADD:
- weird thing on back (setting backdrop)
- change color of stat hover based on background
- adding notes for it to tell you on next timeevent
- onboarding
- no text select on settings popup

## Data and development
Activity and settings are stored locally in the application's configuration directory.
Activity writes are atomic and keep the previous valid snapshot as `activity.json.bak`.
If both files cannot be read, nudge will refuse to overwrite the existing history.
No account or cloud sync is required.

Run `npm test` for the activity rollover tests and `npm run build` for the
TypeScript/frontend build. On a Mac with Rust and Tauri prerequisites installed,
run `cargo test --manifest-path src-tauri/Cargo.toml --locked` for the native
persistence tests. Pull requests run these checks in CI. The unsigned macOS
release may require a manual Gatekeeper exception; do not disable quarantine
on software you do not trust.

Licensed under MIT; see [LICENSE](LICENSE).

## Controls and privacy
During setup, nudge explains the activity it records. Settings let you choose
reminder cadence (1–240 minutes), playful/gentle/direct reminder text, or turn
off ambient chatter while retaining timed reminders. The global hide shortcut
hides the pet but does not stop tracking; quit the app to stop tracking.
Settings > Your data > Clear activity history deletes both the current activity
snapshot and its backup, then begins a fresh session. It does not remove
settings. Review the confirmation carefully; deleted history cannot be restored.
