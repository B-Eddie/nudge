/**
 * Builds website/mad.js and website/assets/mad/*.webp from the app's own renderer, so the
 * website's cross pets can't drift from the app's. Needs Sharp at build time only:
 *
 *   SHARP_MODULE_PATH=/absolute/path/to/sharp/dist/index.mjs node website/scripts/build-mad.mjs
 */
import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sharp = (await import(process.env.SHARP_MODULE_PATH ? pathToFileURL(path.resolve(process.env.SHARP_MODULE_PATH)).href : "sharp")).default;

await build({ entryPoints: [path.join(root, "src/web/mad.ts")], outfile: path.join(root, "website/mad.js"), bundle: true, minify: true, format: "esm", target: "es2022", loader: { ".png": "empty" },
  banner: { js: "/* Built from src/web/mad.ts by website/scripts/build-mad.mjs. Do not edit. */" } });

const art = path.join(os.tmpdir(), `nudge-mad-${process.pid}.mjs`);
await build({ bundle: true, format: "esm", outfile: art, loader: { ".png": "empty" }, stdin: { resolveDir: path.join(root, "src"), loader: "ts", contents: `
  export { sheetParts } from "./lib/petSheet";
  export { prepareSpritePixels, renderSpritePixels } from "./lib/petRenderer";
  export { samplePetMotion } from "./lib/petMotion";
  export { getPetRig } from "./lib/petRig";
  export { PET_POSES } from "./types/pixelPets";
  export { SHEET_POSES } from "./web/madSheet";` } });
const lib = await import(pathToFileURL(art).href);
await rm(art);

const scale = 3, size = 80 * scale;
await mkdir(path.join(root, "website/assets/mad"), { recursive: true });
for (const character of ["crab", "panda", "cat", "capybara"]) {
  const { data, info } = await sharp(path.join(root, `src/assets/pets/pixel/${character}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const cells = await Promise.all(lib.SHEET_POSES.map(async ({ pose, mad }, i) => {
    const drawn = lib.renderSpritePixels(lib.prepareSpritePixels(lib.sheetParts(rgba, info.width, lib.PET_POSES[pose]), lib.getPetRig(character, pose)),
      lib.samplePetMotion(pose, 0, character, false, true), { x: mad ? 1 : 0, y: 0 }, false, null, mad);
    return { input: await sharp(Buffer.from(drawn), { raw: { width: 80, height: 80, channels: 4 } }).resize(size, size, { kernel: "nearest" }).png().toBuffer(), left: i * size, top: 0 };
  }));
  const out = path.join(root, `website/assets/mad/${character}.webp`);
  await sharp({ create: { width: size * cells.length, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells).webp({ lossless: true, effort: 6 }).toFile(out);
  console.log(`${character}: ${(await stat(out)).size} bytes`);
}
console.log(`mad.js: ${(await stat(path.join(root, "website/mad.js"))).size} bytes`);
