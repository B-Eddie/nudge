# Nudge website design

## Direction

The website is a playful introduction to a small macOS desktop companion. Its main job is to let someone meet the pets, understand the break reminders, and download the app with confidence.

The user's reference is [Refero's Bevel style](https://styles.refero.design/style/c0717d1a-b446-4166-a445-6497fe287fea): white space, generous rounded surfaces, charcoal pill buttons, large compact typography, and pale blue visual fields. This redesign adopts that visual language while keeping Nudge's actual pixel characters and original navigation anchors. It uses native CSS, not an Apple component library.

Design dials: variance **6**, motion **6**, density **3**. The centered hero follows the reference deliberately. The asymmetrical feature grid, interactive playground, and alternating section layouts keep the rest of the page varied. Motion gives the pets character and guides attention without making reading depend on animation.

## Audit and decisions

- Replace the previous dark landing page, runtime Tailwind CDN, external font requests, and abrupt demo state changes with a light, self-contained static site.
- Keep the Features and How it works anchors, project identity, source links, and verified universal macOS release. Add direct paths to the companion playground and installer.
- Show real exported app poses with transparent, isolated boundaries and consistent floors. The browser playground is explicitly a preview, not a screenshot of native macOS controls.
- Use a generated cloud wallpaper only as atmosphere. Keep all product claims grounded in the application source and release.
- Give users a draggable pet, keyboard movement, petting, play, five companion choices, and focus/music/break moods. Rhythm sliders update an explanatory preview and never claim to modify the installed app.
- Explain local activity storage, privacy, and the current build's installation requirements. No invented endorsements, usage metrics, or ratings.

## Visual system

- Canvas: `#ffffff`; text: `#222326`; secondary text: `#60656c`.
- Buttons: `#1f2025`; feature surfaces: `#ebf0f8`; focus ring: `#415eee`.
- Pale sky and warm cream gradients are confined to the illustrated hero and download fields.
- Typography: the system sans serif for readable copy; local PP NeueBit for the existing wordmark.
- Desktop content width: 1120px; mobile gutters: 20px. Rounded surfaces: 24–36px. Spacing decreases at mobile breakpoints while retaining readable copy.
- Official Phosphor icon paths from the project's installed `react-icons` package, exported as a local SVG sprite.

## Motion and interaction

Entrance and scroll reveals use opacity and transforms. Pointer parallax is subtle and scoped to the playground. The pet uses decoded pose images, generation guards, pointer capture, bounded movement, and independent facing transforms. It blinks and explores while idle, then pauses when hidden or offscreen.

Reduced motion disables ambient movement, parallax, animated travel, reveals, and CSS flourishes while preserving every control and response. Native disclosures, anchor navigation, readable content, and downloads work without JavaScript. A tiny synchronous script enables the collapsed mobile navigation before CSS paints, avoiding a layout jump. Without JavaScript, all navigation links remain visible and the rhythm preview sliders stay disabled.

## Delivery checks

Verify desktop and narrow mobile layouts, navigation, disclosure content, petting, playing, companion/mood selection, drag boundaries, keyboard movement, reset, and range outputs. The unit suite covers stale decoded frames, cancelled capture, bounded keyboard placement, blocked storage, and unavailable animation. Check local links, structured data, social metadata, image dimensions, and browser errors. Keep performance audits scoped to the static website.
