# Changelog

## 0.5.0 (unreleased)

### Pets you can tell the time by
- **No numbers needed.** The panda eats down a bamboo stalk, the capybara drops yuzu from a tower, the cat's pupils open to full moons, and the crab's claw gets out of hand. A break puts it right, and you can watch it happen.
- The red panda has retired; anyone who had one now has the panda.
- **They get tired with you.** First the lids droop, then come the eye bags, blue lines and a flat mouth, then crossed-out eyes and fumes, with a slump and slower breathing. Sleeping is the cure, and now there's a bed for it. A megaphone announces each nudge.
- **They move between poses** instead of swapping: a dip, then head and paws travel across and settle, props get picked up and put down, and tails, stalks and towers sway.
- **All four pets redrawn** as pixel art with real animal proportions, in sixteen poses.

### Napjutsu
- **The pets are fighters, and the strongest technique is doing nothing.** Choose **Expand** and your pet opens its **Do-Nothing Expansion** over the window in front: Moonevolent Shrine, Unlimited Bamvoid, Chillmera Citrus Garden, or Shell-Embodiment of Perfection. It fills that window and nothing else: pixel art, burning eyes, and a straight face afterwards.
- Friendship is now a napper rank, breaks are training arcs, and rest is the power system.
- Only when you ask, never during a call, and never with Reduce Motion. Two soft flashes at most.

### Mad at it for you
- On something you'd rather not be doing? Choose **Expand** from your pet's menu or the menu bar. Your pet glares, stomps and throws something soft at the window in front, then offers to start it with you for ten minutes.
- Every pet does it its own way: the cat pretends nothing happened, the capybara takes its time.
- **Stay mad at it** and your pet bristles when it sees that site, document or app again, at most every 45 minutes and never in calls, videos or focus sessions. Forgive it any time under Garden → Us.
- In a focus session, it takes a drift out on the tab, not on you.
- Finish something you dreaded and it counts: two milestones, a fighting headband, and a picture worth sharing.
- Save either moment as a GIF, with only the words you choose.
- Throwing can be turned off in Settings. Reduce Motion keeps the scowl and skips the rest.

## 0.4.0 (unsigned beta)

### Nudges that know when to speak
- Nudges wait for a pause in typing or the gap between two apps, with a limit set by how firm you want them to be. They used to appear mid-sentence.
- **Fix: audio detection never worked.** It read a CoreAudio property that does not exist, so automatic breaks could start during calls and browser videos. Detection now uses the macOS process list (14.2 and later; older systems fall back to the app in front).
- Calls hold nudges for as long as they last. Videos hold them for a while. Background music holds nothing.
- The nudge card starts a suggested reset in one click, and snoozes for 5 minutes, your usual time, or until you finish what you're doing. Left unanswered, it folds away and your pet dozes off; pet it to wake it.
- Distracting time is added up over a rolling window with an adjustable limit, so a quick look elsewhere no longer starts it over.
- **Fix:** nudges that came due while the companion was hidden were dropped; they now wait.
- **Fix:** coming back fully rested was counted as an interrupted break, and the minutes before an automatic break were counted as work.
- Active hours, weekends off, and more ways to go quiet from the menu bar.

### Someone to rest with
- **Focus sessions:** your pet holds what you're doing on a sign, keeps nudges for the end, asks if you drift, and looks after stray thoughts.
- **A garden that grows when you rest.** Fourteen kinds of plant, some seasonal or nocturnal. Nothing wilts.
- **Friendship and outfits:** ten things to find and wear, and moments to remember. Screen time never counts.
- Fourteen step-by-step resets your pet performs with you, suggested for the moment and by what has helped before. Optional sounds and spoken steps.
- Breaks survive a bumped desk, can be resumed if cut short, and never ask for more than 20 minutes.
- Name your companion, choose how much it chats, and watch it sway to your music.

### Part of your Mac
- **Knows which tab you're on**, in any browser, from the window's title. Opt-in, needs Accessibility, never reads addresses or pages, and never saves titles. Add your own rules, including private ones.
- A video about what you're working on counts as working. Drift cards name the site; focus sessions offer the page in front of you; coming back from a break, your pet tells you where you were.
- Notices tabs flying by and repeat visits, and has something to say about where you are.
- Locking the screen starts a break. Full-screen video makes the pet step out of the picture.
- Optionally hops onto the window you're using, when there's room above it.
- **Fix:** video in Zen and other Firefox-based browsers is recognized.

### Your day
- Wrap up the day: how it felt, and one thing to leave for tomorrow.
- Wind-down before bedtime, and optional eye, posture and water rhythms.
- A weekly letter, active hours, and week-over-week comparison in Activity. New columns in the CSV export.
- Save a postcard of your garden.

### Privacy and settings
- Settings are grouped into tabs, with a plain list of what nudge knows.
- Mark an app private so its time is never recorded, choose how long history is kept, or erase it.
- The overlay is slightly larger so a card sits above the pet instead of covering it.

### Earlier
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
