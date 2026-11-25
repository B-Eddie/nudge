/**
 * Exports the app's drawn companions as static website assets and the share image.
 * Needs Sharp at export time only, for WebP:
 *
 *   SHARP_MODULE_PATH=/absolute/path/to/sharp/dist/index.mjs node website/scripts/export-pets.mjs
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { N, OX, OY } from "../../art/canvas.mjs";
import { PETS as characters, POSES, whole } from "../../art/pets.mjs";
import { rgb } from "../../art/png.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputRoot = path.join(projectRoot, "website/assets/pets");
const sharp = (await import(process.env.SHARP_MODULE_PATH ? pathToFileURL(path.resolve(process.env.SHARP_MODULE_PATH)).href : "sharp")).default;
// A 72-unit window around the 64 the pet is drawn in, so raised arms fit.
const VIEW = 72, size = 288;
const manifest = { canvas: { width: size, height: size, floor: 70 * 4 }, format: "lossless WebP", source: "art/pets.mjs", poses: POSES, characters: {} };

for (const character of characters) {
  await mkdir(path.join(outputRoot, character), { recursive: true });
  manifest.characters[character] = {};
  for (const pose of POSES) {
    const pet = whole(character, pose);
    const raw = Buffer.alloc(N * N * 4);
    pet.px.forEach((c, i) => { if (c) raw.set([...rgb(c), 255], i * 4); });
    const file = path.join(outputRoot, character, `${pose}.webp`);
    await sharp(raw, { raw: { width: N, height: N, channels: 4 } }).extract({ left: OX - 4, top: OY - 10, width: VIEW, height: VIEW }).resize(size, size, { kernel: "nearest" }).webp({ lossless: true, effort: 6 }).toFile(file);
    manifest.characters[character][pose] = { bytes: (await stat(file)).size };
  }
}
await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

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
    <text x="80" y="194" font-size="68" font-weight="600" letter-spacing="-2.9">Master the art</text>
    <text x="80" y="272" font-size="68" font-weight="600" letter-spacing="-2.9">of doing nothing.</text>
    <text x="82" y="323" font-size="26" fill="#67747c">Pixel desktop companions for macOS</text>
  </g>
  <rect x="40" y="364" width="1120" height="226" rx="32" fill="url(#sky)"/>
  <ellipse cx="153" cy="412" rx="195" ry="86" fill="url(#cloud)"/>
  <ellipse cx="1050" cy="425" rx="223" ry="108" fill="url(#cloud)"/>
</svg>`);
const socialPets = await Promise.all(characters.map(async (character, index) => ({
  input: await sharp(path.join(outputRoot, character, "idle.webp"))
    .resize(180, 180, { kernel: "nearest", fit: "fill" }).png().toBuffer(),
  left: 120 + index * 260,
  top: 381,
})));
const socialOutput = path.join(projectRoot, "website/assets/og-image.png");
await sharp(socialSvg).composite(socialPets).png({ compressionLevel: 9 }).toFile(socialOutput);
console.log(`Social preview: 1200×630, ${(await stat(socialOutput)).size} bytes.`);
