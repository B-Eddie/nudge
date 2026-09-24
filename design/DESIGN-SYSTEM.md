# nudge — Design System v1 ("Bamboo Grove")

*Source: user-picked direction, 2026-09-24. User quote: "change the ui to a cozy bamboo vibe… per-character themes." Phase C exploration skipped by delegation — the user named the direction outright (panda = bamboo greens, red panda = autumn terracotta/amber, frog = pond teal). Product truth: a desktop companion for developers pulling long hours; the pixel pet on screen visibly tires and nags breaks (src/App.tsx:1-60, file:src/App.tsx). Emotional register: warm, gentle, hand-crafted. Defects from the category default (dark-neon SaaS panels, Inter, glassmorphism) by going warm-paper daylight.*

**The rule:** Bamboo Grove owns every surface — warm paper, 2px hand-drawn borders, generous radii, warm-only shadows. The pixel pet owns the voice — PPNeueBit display type, sticker-style character cards, ±2° playful rotation. Per-character theme owns the accent: token swap (`data-character-theme` on `<html>`), never component swap.

## Tokens

Shared (all themes): `--paper #F7F1E2` (panel bg, warm washi) · `--paper-deep #EEE3CB` (sunken wells, inputs) · `--card #FFFDF4` (raised cards; never pure #FFF) · `--ink #2E2A20` (text) · `--ink-soft #6F6450` (secondary text) · `--line #E0D2AC` (hairlines, 2px hand-drawn borders) · `--clay #C0563F` (danger — warm terracotta, never alarm red) · `--amber #D9A441` (warn) · `--pond #4E8FA3` (info).

Accent triad, swapped per theme: `--accent` (interactive highlights, energy fill) · `--accent-deep` (primary buttons, toggles-on, focus rings) · `--accent-soft` (washes, chips) · `--accent-glow` (shadow tint).
- panda/bamboo: `#5F8F4E` · `#3E6B33` · `#E2EDD2` · `rgba(95,143,78,.35)` — new-leaf green, the default.
- maple/autumn: `#C4703B` · `#96502A` · `#F6E4CC` · `rgba(196,112,59,.35)` — persimmon/terracotta.
- puddle/pond: `#3E9B8F` · `#2B6E64` · `#D9EEE8` · `rgba(62,155,143,.35)` — pond teal.

Shadows are always warm `rgba(93,74,44,…)` — never gray, black, or blue.

## Type

PPNeueBit-Bold = display: panel titles, stat numerals, the pet's speech bubble, energy readouts. Never below 18px, never in paragraphs or form labels — pixel type shouts; body copy must not. Nunito 400/600/700 = ALL UI text (imported via Google Fonts in App.css; fallback ui-rounded, system-ui). Banned: Inter, system-ui-only stacks, any condensed/technical grotesk.

## Signature components

**Paper panel** (settings, summary, onboarding, notes): `--paper` bg, `2px solid var(--line)`, `border-radius: 20px`, `box-shadow: 0 12px 32px rgba(93,74,44,.18), 0 2px 6px rgba(93,74,44,.10)`. Header: display type 22px, 1px `--line` rule below. Max-width 380px. Backdrop: no dim — the user's desktop stays visible; panels float.

**Primary button**: `--accent-deep` fill, `--paper` text, Nunito 700, `border-radius: 999px`, padding 12px 22px. Press = translateY(1px) + shadow crush, 120ms. Secondary: `--card` fill, 2px `--line` border, `--ink` text. Destructive: `--clay` text on transparent, never filled.

**Sticker card** (character picker, showcase): portrait in `--card` frame, `2px solid var(--ink)` outline, `border-radius: 18px`, resting rotation ±2° alternating, warm shadow. Selected = `--accent-deep` outline + `--accent-soft` wash. The one playful material — never used for data.

**Energy meter**: 5 rounded cells (`border-radius: 6px`); filled = `--accent` with `0 0 8px var(--accent-glow)`; low energy = `--clay`. Recharging pulses 1.2s.

## Material rules

1. Paper is the only surface: structure from 2px `--line` borders and warm shadows, never from dark fills.
2. One texture, one place: 3%-opacity paper grain on `--paper` panels only (SVG feTurbulence data-URI).
3. Rotation budget: sticker cards ±2°; anything carrying a number or label sits at 0°.
4. Banned: glassmorphism, dark mode, neon glows, gradients on surfaces (flat fills only), inner shadows, pure #FFF/#000, emoji in UI chrome.
5. The pet sprite stays pixel-crisp (`image-rendering: pixelated`); AI portraits live inside sticker frames, never raw on the desktop.

## Motion (four named moves)

PANEL-IN: panels enter scale .97→1 + rise 8px, 220ms `cubic-bezier(.22,1,.36,1)` — the existing ease, kept. PET-BOB: overlay sprite bobs ±3px, 2.4s ease-in-out infinite. WOBBLE: radial-menu slice hover grows 1→1.04 with a 150ms spring; icons never rotate. RECHARGE: energy cells pulse opacity 1→.35, 1.2s ease-in-out, only while resting.

## Copy rules

Controls stay functional ("Save", "Take a break", "End break"). Voice lives in the pet's mouth, empty states, and break messages — see VOICE.md. Numbers render plainly with units ("2h 14m"), never "2.23 hours".

## Screen inventory (8)

Onboarding incl. companion picker★ (`onboarding`,`forms`) · Settings incl. character picker (`settings-account`,`forms`) · Activity report today/week★ (`dashboards`,`states`) · Reminder notes (`forms`,`states`) · Radial menu (`navigation-shell`) · Break & reminder overlay (`states`,`microcopy`) · Landing page (`landing-pages`,`marketing-copy`) · First-run empty states (`states`).
(★ = funnel-critical: onboarding, activity report.)
