/**
 * Re-exports website/assets/pets from the app's own renderer, so the site shows each of the
 * cast in their signature gear. Needs the dev server (`npm run dev`), Playwright and ImageMagick:
 *
 *   node website/scripts/export-app-pets.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const out = fileURLToPath(new URL("../assets/pets/", import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), "nudge-pets-"));
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto("http://localhost:1420/preview.html?view=export&still=1");
await page.waitForTimeout(3000);
const frames = await page.$$eval("[data-pose]", nodes => nodes.map(n => ({ pet: n.dataset.pet, pose: n.dataset.pose, png: n.querySelector("canvas").toDataURL("image/png") })));
await browser.close();
for (const { pet, pose, png } of frames) {
  const source = path.join(scratch, `${pet}-${pose}.png`);
  await writeFile(source, Buffer.from(png.split(",")[1], "base64"));
  // The same 72-unit window the art export uses: 4 units round the pet's 64, scaled ×4.
  execFileSync("magick", [source, "-crop", "72x72+4+4", "+repage", "-filter", "point", "-resize", "288x288", "-define", "webp:lossless=true", path.join(out, pet, `${pose}.webp`)]);
}
console.log(`Exported ${frames.length} poses.`);
