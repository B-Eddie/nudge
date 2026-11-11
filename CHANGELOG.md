# Changelog

## Unreleased
- **Settings that behave.** Minute fields no longer snap to 1 while you type (clearing "30" to enter "45" used to give 145). The show/hide shortcut is kept as soon as you press it, and Esc cancels; before, you had to hold the combo and press Esc to save. A stray click outside Settings no longer throws away your edits. Settings are grouped into Companion, Appearance, Reminders, Placement, General and App categories.
- **Match Mac appearance**, now the default for new installs, follows Light and Dark Mode live.
- **Shorter setup:** five steps instead of eight. The last one shows the three things people miss: click for the menu, drag anywhere, and the menu-bar icon.
- Desktop cards (nudges, speech, the menu) have a soft shadow so they stand out on bright pages. Clearer copy throughout; a break that ends early is no longer shown in alarm red.
- `preview.html` renders any panel or desktop state in a browser with the native bridge mocked, for design review.
- **Sharper companions.** Pets render at two to three times the detail on Retina displays (whiskers, eye shine and book covers are now legible), using area-averaged downsampling instead of nearest-neighbour, with no pale halo around the silhouette. CPU use is unchanged.
- **Grounded on the desktop.** A real contact shadow, an edge that reads on light and dark windows, an evening tint that follows the time of day, and a squash-and-settle when you drop your pet.
- **Menu-bar item** with Quit. Nudge has no Dock icon, so before this the only way to quit was Activity Monitor. It also has show/hide companion, take a break, summary, Settings and a quiet hour.
- **Quiet hour**: reminders wait for the hour to end or for Resume, instead of being dropped.
- **CSV export** of all activity history from the Activity panel, saved to Downloads.
- **Fix: settings could be silently lost.** A 500 ms background poll re-read and re-wrote `settings.json` without coordination, so it could undo a save made at the same time, and a corrupt file could be replaced with defaults. Settings now live in one locked in-memory store with atomic writes, and an unreadable file is moved aside instead of being replaced.
- Settings are no longer read from disk every second; the installed-app rescan runs at launch and when a panel opens.
- Gaze follows the pointer around a full circle, and a perched companion now follows its window at display rate.
- CI now runs the typecheck, `rustfmt`, and `clippy -D warnings`; Dependabot is configured.

## 0.3.0 (unsigned beta)
- MIT license added.
- Welcome step explains what nudge reads, and has a Skip setup button.
- Activity history is written atomically, keeps a backup, and refuses to overwrite unreadable history.
- Day rollover and restart handling moved into a tested module.
- CI for frontend tests/build and native tests; tag-triggered release workflow publishes a universal unsigned DMG with checksums.

## 0.2.0
- Five pixel companions (crab, panda, red panda, tuxedo cat, capybara) with sixteen poses each.
- Perches on windows, looks toward your pointer, enjoys petting, respects Reduce Motion.
- Universal macOS installer (Apple silicon and Intel).

## 0.1.x
- First public builds (Apple silicon only).
