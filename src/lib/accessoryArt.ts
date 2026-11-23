import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";
import type { AccessoryId } from "./companion";
import type { PetRig } from "./petRig";
import { artWidth, type PixelArt } from "./pixelArt";

/* Drawn on the pet's 60-unit grid. `x`/`y` offset the art's bottom center from its anchor:
 * the crown of the head, or the neck. */
export interface WornArt extends PixelArt { at: "crown" | "neck"; x: number; y: number }
const art = (rows: string, palette: Record<string, string>) => ({ rows: rows.trim().split("\n").map(r => r.trim()), palette });

export const WORN: Record<AccessoryId, WornArt> = {
  leaf: { at: "crown", x: 1, y: 2, ...art(`
....ll.
..llgl.
.lggGl.
lgGggl.
lGggl..
.sl....
.s.....`, { l: "#94b56c", g: "#759b52", G: "#56783d", s: "#6b5238" }) },
  flower: { at: "crown", x: -8, y: 4, ...art(`
..pp.pp..
.pppPppp.
.pppPppp.
..pcccp..
.pPcCcPp.
.ppcccpp.
.pppPppp.
..pp.pp..`, { p: "#f3a7b8", P: "#dc8198", c: "#f5d06a", C: "#d9a43e" }) },
  bow_tie: { at: "neck", x: 0, y: 4, ...art(`
rr.......rr
rRrr...rrRr
rrRrrDrrRrr
rrRrDDDrRrr
rrRrrDrrRrr
rRrr...rrRr
rr.......rr`, { r: "#c65462", R: "#a13f4c", D: "#7f2f3b" }) },
  scarf: { at: "neck", x: 0, y: 7, ...art(`
tt.............tt
tTtt.........ttTt
.twwtttTTTtttwwt.
..tTtwwwwwwwtTt..
....ttTtttTtt....
..........tTtt...
..........twwt...
..........tTtt...
..........t.tt...`, { t: "#4f86a8", T: "#3b6a88", w: "#e9eef0" }) },
  beanie: { at: "crown", x: 0, y: 4, ...art(`
.........ww.........
........wwww........
.........ww.........
......rrrrrrrr......
....rrrrRrrrrrrr....
...rrrRrrrrRrrrrR...
..rrrrrrrRrrrrRrrR..
..rrRrrrrrrrrrrrRR..
.wwwwwwwwwwwwwwwwww.
.wWwWwWwWwWwWwWwWww.
.wwwwwwwwwwwwwwwwww.`, { r: "#d07a55", R: "#b05f3d", w: "#f4ead8", W: "#d9cbb2" }) },
  straw_hat: { at: "crown", x: 0, y: 4, ...art(`
........yyyyyyyy........
......yyyYyyyYyyyy......
.....yyYyyyYyyyYyyy.....
.....yyyyYyyyYyyyyY.....
.....rrrrrrrrrrrrrr.....
.....RrrrRrrrRrrrRR.....
yyyyyyyyyyyyyyyyyyyyyyyy
.YyyYyyyYyyyYyyyYyyyYyY.
...YYYYYYYYYYYYYYYYYY...`, { y: "#ecca7c", Y: "#cfa755", r: "#bd5d58", R: "#9b4743" }) },
  nightcap: { at: "crown", x: 1, y: 4, ...art(`
......bbbbbb..........
....bbbbbbbbbbb.......
...bbbybbbbbbbbbb.....
..bbbbbbbbybb.bbbbb...
..bbbbbbbbbbb...bbbb..
.bbbybbbbbbbbb...bbb..
.bbbbbbbybbbbb...www..
wwwwwwwwwwwwwwww.wwww.
wWwwWwwWwwWwwWww.wwww.
wwwwwwwwwwwwwwww..ww..`, { b: "#6f7fb8", y: "#f2d98b", w: "#f6f1e6", W: "#d9d2c3" }) },
  party_hat: { at: "crown", x: 0, y: 3, ...art(`
.....yy.....
....yyyy....
.....yy.....
.....pp.....
....pppp....
....pwpp....
...ppppbp...
...pbpppp...
..pppppwpp..
..pwppppppp.
.pppppbpppp.
.ppbppppwppp
yYyYyYyYyYyY`, { p: "#e27d9d", w: "#fdf3f0", b: "#7bb6cf", y: "#f3cf63", Y: "#d8ab3f" }) },
  flower_crown: { at: "crown", x: 0, y: 5, ...art(`
.........ppp.........
...yyy..pPcPp..bbb...
..yYcYy.ppcpp.bBcBb..
wwyycyyggpppggbbcbbww
wcwgyyygGgggGggbbbwcw
www.gGggg.g.gggGg.www`, { p: "#ee9db1", P: "#d6798f", y: "#f6da7e", Y: "#dcb74f", b: "#9fb4e4", B: "#7b92c9", w: "#fffaf0", c: "#d8963f", g: "#86a866", G: "#648549" }) },
  star: { at: "crown", x: 0, y: -2, ...art(`
.....yy.....
.....yy.....
....yyyy....
yyyyywyyyyyy
.yyywwyyyyY.
..yyyyyyYY..
...yyyyYY...
..yyyYYyyY..
..yyY..YyY..
..y......Y..`, { y: "#f5d25c", Y: "#d9a935", w: "#fff6cf" }) },
};

export interface WornPlace { left: number; top: number }

/** Where an outfit sits in one pose, measured from the artwork itself. Hats come off
 * under headphones and raised paws; neckwear comes off wherever the chest is covered. */
export function placeAccessory(id: AccessoryId, rig: PetRig, pose: PetPose, character: CompanionId,
  opaque: (x: number, y: number) => boolean): WornPlace | null {
  const worn = WORN[id];
  const width = artWidth(worn), height = worn.rows.length;
  const { head } = rig;
  const eyes = rig.eyes.map(e => e.bounds.x + e.bounds.width / 2);
  const center = eyes.length === 2 ? (eyes[0] + eyes[1]) / 2 : head.x + head.width / 2;
  if (worn.at === "crown") {
    if (pose === "music" && id !== "star") return null;
    if (pose === "lifted" && character === "crab") return null;
    if (pose === "stretch" && character !== "crab") return null;
    // The crown is the skin between the ears: the topmost row with fur across the middle.
    let crown = head.y;
    for (; crown < head.y + head.height; crown++) {
      let filled = 0;
      for (let dx = -3; dx <= 3; dx++) if (opaque(Math.round(center + dx), crown)) filled++;
      if (filled >= 6) break;
    }
    const left = Math.round(center - width / 2 + worn.x);
    const top = Math.round(crown - height + worn.y);
    // Tall hats would leave the canvas on a raised head; sit them lower instead.
    return { left: Math.max(0, Math.min(60 - width, left)), top: Math.max(0, top) };
  }
  // Books, laptops and raised paws cover the chest in these poses.
  if (["sleep", "lifted", "stretch", "groom", "focus", "read", "music", "play"].includes(pose)) return null;
  // Below the chin: the head mask stops at the neck join. A crab wears it under its smile.
  const y = head.y + head.height;
  let l = -1, r = -1;
  for (let x = head.x; x < head.x + head.width; x++) if (opaque(x, y)) { if (l < 0) l = x; r = x; }
  const chest = l < 0 || character === "crab" ? center : (l + r) / 2;
  return { left: Math.round((chest + center) / 2 - width / 2 + worn.x), top: Math.round(y - height + worn.y) };
}
