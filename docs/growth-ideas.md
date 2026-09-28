# Nudge — Growth Pass: Feature Brainstorm

Goal: (a) reduce friction so Nudge is easier to use, (b) incentivize continued
use so the pet stays on screen for months, not days. All ideas scored
**Impact (1–5) × Ease (1–5)** — higher is better, ease = inverse of effort.
Frontend-only (localStorage-persisted) is preferred: the Rust
`ActivityState` struct drops unknown JSON fields on save, so new persistent
state must live in localStorage or require a Rust change.

## (a) Reduce friction / easier to use

| # | Idea | Impact | Ease | Score | Notes |
|---|------|--------|------|-------|-------|
| A1 | **Snooze reminder (10/30 min) via radial menu** — frontend-only suppress timer on the existing `suppressReminderUntil` path; label cycles 10m → 30m → off | 5 | 5 | **25** | The #1 complaint-shaped gap: reminders are binary (break now or be nagged). No Rust change. |
| A2 | **Reminder bubble quick actions** — "Start break" / "Snooze 10m" buttons directly on the pinned reminder note | 4 | 4 | 16 | Cuts the click-the-pet → find-the-slice hunt at the exact moment of intent. Pairs with A1. |
| A3 | **Name-your-pet onboarding step** — text input with character default ("Mochi"), persisted per character | 4 | 5 | **20** | Bonding starts at setup; near-zero cost, feeds B5. |
| A4 | **Quick-break presets** — 5 / 10 / 20 min rest targets offered when starting a break (today: auto-computed from work time) | 3 | 3 | 9 | Nice, but auto-compute is already reasonable; lower priority. |
| A5 | **Escalating reminder intensity setting** — gentle bubble → megaphone → persistent note, user-chosen | 3 | 3 | 9 | Real need for deep-work users, but overlaps A1/A2; defer. |
| A6 | **Auto-pause reminders in meetings** — suppress while a video-call app is frontmost fullscreen | 3 | 2 | 6 | Needs reliable fullscreen detection; Rust-side. Defer. |
| A7 | **Onboarding resume** — persist draft so a quit mid-flow doesn't restart from step 1 | 2 | 3 | 6 | 7 short steps; low pain. Defer. |

## (b) Incentivize continued use (retention hooks)

| # | Idea | Impact | Ease | Score | Notes |
|---|------|--------|------|-------|-------|
| B1 | **Break streaks** — consecutive days with ≥3 breaks, derived from existing `DayRecord` history; shown in summary; 1-day gap tolerance | 5 | 5 | **25** | Pure derivation, zero new tracking. Streaks are the strongest retention mechanic in the category. |
| B2 | **Achievements / badges** — ~10 badges derived from stats + history + pet state; unlock toast; unlocked set in localStorage | 5 | 4 | **20** | Gives the summary panel a reason to be opened repeatedly. |
| B3 | **Focus sessions (Pomodoro 25/50m)** — start from radial menu; reminders suppressed while focusing; pet celebration + XP on complete | 5 | 3 | **15** | Turns Nudge from nagware into a work *tool*. Needs a small timer + picker UI. |
| B4 | **Break quests** — rotating micro-activity suggestions during breaks ("stretch", "water", "20-20-20 eyes"); mark-done → pet XP | 4 | 4 | **16** | Makes breaks *do* something; the trust-based check-in is honest for a companion app. |
| B5 | **Name your pet + pet level/XP** — localStorage per-character profile; XP from quests, full breaks, focus sessions; name + level in summary & radial; level-up celebration | 5 | 4 | **20** | The bonding layer that makes B2–B4 cohere. |
| B6 | **Daily challenge card** — "take 6 breaks today" progress ring on the overlay | 3 | 3 | 9 | Overlaps streaks/achievements; defer. |
| B7 | **Pet remembers yesterday** — morning greeting referencing yesterday's stats | 3 | 3 | 9 | Cute, but copy risk + marginal retention. Defer. |

## Chosen for this pass (top 6 by score, coherent as a system)

1. **A1 — Snooze reminder** (25)
2. **B1 — Break streaks** (25)
3. **A3 — Name your pet** (20) → folded into B5's implementation
4. **B2 — Achievements** (20)
5. **B5 — Pet level/XP** (20)
6. **B4 — Break quests** (16)
7. **B3 — Focus sessions** (15)

That's 6 workstreams (A3 ships inside B5). They form one loop: focus sessions
and break quests earn XP → XP levels the pet → levels, streaks and badges
surface in the summary → the summary becomes a place users *want* to open →
snooze keeps the nagging tolerable enough that the pet stays installed.

Cut for now: A2 (fold into a later pass), A4–A7, B6–B7.
