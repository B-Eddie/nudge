# Website assets

## Current companion artwork

`pets/{character}/{pose}.webp` contains all sixteen current app poses for crab,
panda, red panda, cat, and capybara. These are technical exports of
`src/assets/pets/pixel/*.png`; no companion artwork was generated or changed.

The exporter uses the app's exact connected-component extraction from
`src/lib/spriteAtlas.ts`, then loads the pose order, placement, and walking
direction corrections from `src/types/pixelPets.ts`. It draws each pose on the
app's shared 60×60 transparent canvas and scales that canvas to 240×240 with
nearest-neighbor sampling. The shared floor is y=216. Sleeping poses preserve
their shorter height. `pets/manifest.json` records paths, placement, and sizes.

`fonts/ppneuebit-bold.otf` is copied from the app's display font. The website's
body text uses system fonts. `og-image.png` is a 1200×630 social preview composed
from the exported current pets, a simple sky card, and the website headline.

Regenerate these files with Node.js 24+ and an available Sharp module:

```sh
node website/scripts/export-pets.mjs
```

If Sharp is bundled outside this repository, set `SHARP_MODULE_PATH` to its
module file before running the exporter. Sharp is needed only while exporting;
the static website has no added production dependencies.

## Hero wallpaper

`cloudscape.png` is the original wallpaper generated with the built-in
`image_gen` tool. `cloudscape.webp` is the same artwork encoded at WebP quality
85, with no resizing or image-content edits. Both are 1672×941.

Final generation prompt:

> Wide horizontal premium digital wallpaper for a calm Mac desktop companion website. Soft volumetric white clouds floating over a pale sky-blue #d2e5ff atmosphere, almost-white horizon with a very subtle peach sun glow and sage-green rolling hills far below. Airy sophisticated Apple-like product launch backdrop, clean dimensional realism, gentle morning light, lots of uncluttered negative space in center/top for product UI. Clouds gathered more at outer sides, muted pastels, no dark areas. No people, no animals, no characters, no text, no logos, no devices, no UI, no borders. 16:9 landscape composition, tasteful minimal scene, high quality.

## Delivery optimizations

`fonts/nudge-wordmark.woff2` is a WOFF2 subset of the existing PP NeueBit font,
containing only the lowercase wordmark. Regenerate with FontTools and Brotli:

```sh
fonttools subset website/assets/fonts/ppneuebit-bold.otf --text=nudge --flavor=woff2 --output-file=website/assets/fonts/nudge-wordmark.woff2
```

`logo-96.png` and `logo-96.webp` are 96px versions of the existing application
icon. The PNG serves as the favicon; the WebP is used by page headers.
`cloudscape-mobile.webp` is a 960px-wide delivery variant of the same wallpaper,
encoded at quality 80. The original generated artwork is preserved above.
