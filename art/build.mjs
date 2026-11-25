/** Draws every companion: `npm run art`. Writes one layered sheet per pet and the rig that
 * goes with it. Rows are body, head, left paw, right paw, prop, the feature at each energy, then a tired body and head; columns are poses. */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { N, OX, OY } from "./canvas.mjs";
import { drawPet, ENERGIES, eyesShut, FEATURE, keepsBrows, PETS, POSES } from "./pets.mjs";
import { png, rgb } from "./png.mjs";

const out = fileURLToPath(new URL("../src/assets/pets/pixel/", import.meta.url));
mkdirSync(out, { recursive: true });
const ROWS = ["body", "head", "leftPaw", "rightPaw", "prop", ...ENERGIES.map(e => `feature${e}`), "tiredBody", "tiredHead"];
const rig = {};
for (const pet of PETS) {
  const W = N * POSES.length, H = N * ROWS.length, rgba = new Uint8Array(W * H * 4);
  rig[pet] = {};
  POSES.forEach((pose, column) => {
    const art = drawPet(pet, pose), worn = drawPet(pet, pose, true), drawn = { ...art, tiredBody: worn.body, tiredHead: worn.head, ...Object.fromEntries(ENERGIES.map((e, i) => [`feature${e}`, art.features[i]])) };
    ROWS.forEach((row, r) => drawn[row]?.px.forEach((c, i) => {
      if (c) rgba.set([...rgb(c), 255], ((r * N + Math.floor(i / N)) * W + column * N + i % N) * 4);
    }));
    const on = r => r && { ...r, x: r.x + OX, y: r.y + OY };
    const bounds = e => on({ x: e.x, y: e.y, width: e.width, height: e.height });
    const shut = eyesShut(pet, pose);
    const pupil = e => e.inner ? { ...on({ x: e.x + e.inner.x, y: e.y + e.inner.y, width: e.inner.width, height: e.inner.height }) } : bounds(e);
    rig[pet][pose] = {
      head: on(drawn.head.bounds()),
      leftPaw: on(drawn.leftPaw?.bounds()) ?? null, rightPaw: on(drawn.rightPaw?.bounds()) ?? (FEATURE[pet] === "rightPaw" ? on(drawn.feature5.bounds()) : null), feature: FEATURE[pet], prop: on(drawn.prop?.bounds()) ?? null,
      eyes: shut ? [] : drawn.eyes.map(e => {
        const p = pupil(e);
        return { bounds: bounds(e), pupil: p, byEnergy: e.byEnergy?.map(q => ({ ...on({ ...q, x: e.x + q.x, y: e.y + q.y }) })) ?? null, shine: e.highlight ? e.shine : null, color: e.pupil, sclera: e.sclera ?? null, lid: e.lid, line: e.line };
      }),
      brows: !shut || keepsBrows(pose) ? drawn.eyes.map(bounds) : [],
    };
  });
  writeFileSync(`${out}${pet}.png`, png(rgba, W, H));
}
writeFileSync(`${out}rig.json`, `${JSON.stringify(rig)}\n`);
console.log(`Drew ${PETS.length} pets in ${POSES.length} poses.`);
