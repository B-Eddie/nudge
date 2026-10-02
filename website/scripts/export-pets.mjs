/**
 * Export the current app's companion artwork as static website assets.
 * Requires Node.js 24+ (native TypeScript support) and Sharp for image encoding.
 * Sharp is only an export-time dependency; it is not needed by the website.
 *
 * With Sharp installed in the project: node website/scripts/export-pets.mjs
 * With a bundled Sharp module: SHARP_MODULE_PATH=/absolute/path/to/sharp/dist/index.mjs \
 *   node website/scripts/export-pets.mjs
 *
 * Keep extraction, placement, and walk direction sourced from the app so the
 * website cannot silently drift to nominal atlas cells or different artwork.
 */
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { framePixels, isolateAtlas } from "../../src/lib/spriteAtlas.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputRoot = path.join(projectRoot, "website/assets/pets");
const characters = ["crab", "panda", "red_panda", "cat", "capybara"];
const appCanvasSize = 60;
const outputScale = 4;
const outputSize = appCanvasSize * outputScale;

let sharp;
try {
  const moduleName = process.env.SHARP_MODULE_PATH
    ? pathToFileURL(path.resolve(process.env.SHARP_MODULE_PATH)).href
    : "sharp";
  sharp = (await import(moduleName)).default;
} catch (cause) {
  throw new Error("Pet export requires Sharp. Set SHARP_MODULE_PATH to an available Sharp module; no production dependency is needed.", { cause });
}

// The app module also imports Vite image assets. Remove only those bindings and
// their two atlas exports, then load its unchanged pose/placement functions.
const pixelPetsSource = await readFile(path.join(projectRoot, "src/types/pixelPets.ts"), "utf8");
const placementSource = pixelPetsSource
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export const (?:PIXEL_PETS|PIXEL_FRAMES): .*;\r?\n/gm, "");
const placementModule = stripTypeScriptTypes(placementSource, { mode: "strip" });
const { PET_POSES, spritePlacement, mirrorWalkingFrame } = await import(
  `data:text/javascript;base64,${Buffer.from(placementModule).toString("base64")}`
);

const manifest = {
  canvas: { width: outputSize, height: outputSize, floor: 54 * outputScale },
  appCanvas: { width: appCanvasSize, height: appCanvasSize },
  format: "lossless WebP",
  source: "src/assets/pets/pixel",
  poses: Object.keys(PET_POSES),
  characters: {},
};
let totalBytes = 0;

for (const character of characters) {
  const atlasPath = path.join(projectRoot, "src/assets/pets/pixel", `${character}.png`);
  const { data, info } = await sharp(atlasPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const { frames, labels } = isolateAtlas(rgba, info.width, info.height);
  const characterOutput = path.join(outputRoot, character);
  await mkdir(characterOutput, { recursive: true });
  const poseMetadata = {};

  for (const [pose, index] of Object.entries(PET_POSES)) {
    const source = frames[index];
    const destination = spritePlacement(source, frames[PET_POSES.idle]);
    const pixels = framePixels(rgba, info.width, labels, source);
    let resized = sharp(Buffer.from(pixels), {
      raw: { width: source.width, height: source.height, channels: 4 },
    }).resize(destination.width, destination.height, { kernel: "nearest", fit: "fill" });
    const mirrored = mirrorWalkingFrame(character, pose);
    if (mirrored) resized = resized.flop();
    const sprite = await resized.png().toBuffer();
    const left = mirrored ? appCanvasSize - destination.x - destination.width : destination.x;
    const normalized = await sharp({
      create: { width: appCanvasSize, height: appCanvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: sprite, left, top: destination.y }]).png().toBuffer();
    const outputPath = path.join(characterOutput, `${pose}.webp`);
    await sharp(normalized)
      .resize(outputSize, outputSize, { kernel: "nearest", fit: "fill" })
      .webp({ lossless: true, effort: 6 })
      .toFile(outputPath);
    const { size } = await stat(outputPath);
    totalBytes += size;
    poseMetadata[pose] = {
      path: `${character}/${pose}.webp`,
      bytes: size,
      placement: {
        x: left * outputScale,
        y: destination.y * outputScale,
        width: destination.width * outputScale,
        height: destination.height * outputScale,
      },
      mirrored,
    };
  }
  manifest.characters[character] = poseMetadata;
  console.log(`${character}: ${Object.keys(poseMetadata).length} poses, ${Object.values(poseMetadata).reduce((sum, pose) => sum + pose.bytes, 0)} bytes`);
}

await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const fontOutput = path.join(projectRoot, "website/assets/fonts");
await mkdir(fontOutput, { recursive: true });
await copyFile(path.join(projectRoot, "src/assets/ppneuebit-bold.otf"), path.join(fontOutput, "ppneuebit-bold.otf"));
console.log(`Exported ${characters.length * Object.keys(PET_POSES).length} ${outputSize}×${outputSize} poses: ${totalBytes} bytes total.`);

// Social preview uses only existing companion art and text on a pale sky card.
const socialSvg = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6faff"/><stop offset="1" stop-color="#d2e5ff"/>
    </linearGradient>
    <radialGradient id="cloud"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#fff"/>
  <g font-family="Helvetica Neue, Arial, sans-serif" fill="#172026">
    <text x="80" y="91" font-size="36" font-weight="600" letter-spacing="-1.4">nudge</text>
    <text x="80" y="194" font-size="68" font-weight="600" letter-spacing="-2.9">A little company.</text>
    <text x="80" y="272" font-size="68" font-weight="600" letter-spacing="-2.9">A better workday.</text>
    <text x="82" y="323" font-size="26" fill="#67747c">Pixel desktop companions for macOS</text>
  </g>
  <rect x="40" y="364" width="1120" height="226" rx="32" fill="url(#sky)"/>
  <ellipse cx="153" cy="412" rx="195" ry="86" fill="url(#cloud)"/>
  <ellipse cx="1050" cy="425" rx="223" ry="108" fill="url(#cloud)"/>
</svg>`);
const socialPets = await Promise.all(characters.map(async (character, index) => ({
  input: await sharp(path.join(outputRoot, character, "idle.webp"))
    .resize(180, 180, { kernel: "nearest", fit: "fill" }).png().toBuffer(),
  left: 90 + index * 210,
  top: 381,
})));
const socialOutput = path.join(projectRoot, "website/assets/og-image.png");
await sharp(socialSvg).composite(socialPets).png({ compressionLevel: 9 }).toFile(socialOutput);
console.log(`Social preview: 1200×630, ${(await stat(socialOutput)).size} bytes.`);
