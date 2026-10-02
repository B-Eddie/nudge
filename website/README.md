# Nudge website

Static product website for the free Nudge macOS companion. Serve this directory directly; the desktop app has its own Vite build at the repository root.

## Preview locally

From the repository root:

```sh
python3 -m http.server 4174 --directory website
```

Open `http://localhost:4174/`. Check the desktop, mobile, keyboard, and Reduce Motion experiences, plus `/privacy.html` and `/404.html`.

## Deployment and canonical URL

The repository homepage and live HTTP response were verified on October 1, 2026:

`https://nudge-nine-flame.vercel.app/`

GitHub Pages is not configured. The site is currently served by Vercel. Deploy `website/` as the static output directory, with no SPA fallback; unknown routes should retain HTTP 404 status and use `404.html` where supported. Canonical URLs, Open Graph URLs, and sitemap entries use the verified Vercel origin.

For a domain change, update the origin consistently in `index.html`, `privacy.html`, `robots.txt`, and `sitemap.xml`. Use fully qualified HTTPS URLs. Keep the home canonical at `/`; the existing `#features` and `#how-it-works` links are page anchors and do not need sitemap entries. Do not add `404.html` to the sitemap.

After deployment, verify `/`, `/privacy.html`, `/robots.txt`, `/sitemap.xml`, `/assets/og-image.png`, and an unknown route. Submit the sitemap in the actual site's Google Search Console property once ownership is verified.

## Content and privacy

- Product facts come from the repository README and app source. Current release: `v0.2.0`, with a universal Apple silicon and Intel DMG. The verified release installer is 23,930,232 bytes; avoid the old “~10 MB” claim.
- Nudge has five companions: crab, panda, red panda, tuxedo cat, and capybara. It reads the active app/category, input idle time, pointer state, and window geometry; summaries and settings are saved locally.
- `src-tauri/src/activity.rs` stores activity data in `activity.json`; `src-tauri/src/settings.rs` stores preferences, app-category metadata, and pending notes in `settings.json`. `src/App.tsx` retains up to 31 daily activity records. `src-tauri/src/pet_desktop.rs` uses window bounds without screenshots.
- Keep the privacy page accurate when adding browser storage, analytics, external resources, accounts, or new desktop data handling. The current site uses local assets and has no analytics scripts or advertising trackers. Vercel still handles normal request metadata as the host.
- Keep download instructions honest about the community build's lack of notarization. Do not invent testimonials, ratings, medical outcomes, resource benchmarks, or supported Windows behavior.

## Search and sharing

The home page should contain a unique title and description, absolute canonical and Open Graph URLs, a 1200 × 630 local share image, and factual `SoftwareApplication` JSON-LD. The privacy page is indexable; the 404 page has `noindex`.

The app is free, so an `Offer` price of `0` is appropriate. There is no verified review or aggregate rating. Do not fabricate these to satisfy Google’s software app rich-result requirements. Structured data can describe the app without promising a rich result or ranking improvement.

Primary references:

- [Google: software app structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Google: building and submitting a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Vercel privacy notice](https://vercel.com/legal/privacy-notice)
- [Nudge releases](https://github.com/B-Eddie/nudge/releases/latest)

## Interaction checks

```sh
npx vitest run website/site.test.js
```

The five regression checks cover stale pose decoding, drag cancellation and
bounds, keyboard reset, unavailable session storage, and unavailable animation.
The demo remembers the selected pet and mood in this tab's session storage.
