import type { CompanionId } from "../types/appearance";
import { artWidth, pixelRuns, type PixelArt } from "./pixelArt";

const art = (rows: string, palette: Record<string, string>): PixelArt => ({ rows: rows.trim().split("\n").map(r => r.trim()), palette });
const ROUND = `
...dddd...
..drrrrd..
.drhrrrrd.
drhrrrrrrd
drrrrrrrrd
drrrrrrrsd
drrrrrrssd
.drrrrssd.
..drrssd..
...dddd...`;
const round = (r: string, h: string, s: string, d: string) => art(ROUND, { r, h, s, d });

/** Each pet has its own ammunition. All of it washes out. */
export const AMMO: Record<CompanionId, PixelArt> = {
  crab: round("#e0564b", "#f7a493", "#b93d38", "#6d2226"), // a tomato
  panda: art(`
....dd....
..dwwwdd..
.dwwgwwwd.
dwgwwwwgwd
dwwwgwwwwd
.dwgwwwgwd
dwwwwgwwwd
.dwgwwwwd.
..ddwwdd..
....dd....`, { w: "#faf7ef", g: "#c9c5ba", d: "#77726a" }), // a crumpled page
  cat: art(`
...dddd...
..drhrrd..
.drrrhrrd.
drhrrrhrrd
drrhrrrhrd
drrrhrrrrd
.drhrrhrd.
..drrhrd..
...dddddr.
........rr`, { r: "#7f9fd0", h: "#b6cbea", d: "#42598a" }), // yarn
  capybara: round("#f3b13f", "#fbdc8c", "#d18a25", "#7a4c14"), // a yuzu
};

const SPLAT = `
......ss.......s..
...s..sss.ss......
....ssrrrsrrs..ss.
.s.srrrrrrrrrsss..
..srrrhhrrrrrrs...
.srrrhhrrrrrrrrs..
ssrrrhrrrrrrrrrss.
.srrrrrrrrrrrrrs..
..srrrrrrrrrrrs.s.
..ssrrrrrrrrrss...
.s..srrsrrrsrs..s.
....srs.srrs.s....
.....r...rr.......
.....r....r.......
..........r.......`;
const splat = (r: string, h: string, s: string) => art(SPLAT, { r, h, s });
export const SPLATS: Record<CompanionId, PixelArt> = {
  crab: splat("#e0564b", "#f7a493", "#b93d38"), panda: splat("#f4f0e5", "#ffffff", "#c9c5ba"),
  cat: splat("#7f9fd0", "#b6cbea", "#5b7bb0"),
  capybara: splat("#f3b13f", "#fbdc8c", "#d18a25"),
};

/** From the first drawings: how a pet announces a break. */
export const MEGAPHONE = art(`
............rr...
.........wwwrr.w.
......wwwwwwrrw..
.rrrrwwwwwwwrr.ww
.rrrrwwwwwwwrr...
.rrrrwwwwwwwrr.ww
......wwwwwwrrw..
..kk.....wwwrr.w.
..kk........rr...`, { r: "#e02b20", w: "#f4f1ea", k: "#2a2a30" });

/** The comic-book vein. */
export const VEIN = art(`
.rr...rr.
rrr...rrr
rr.....rr
.........
.........
.........
rr.....rr
rrr...rrr
.rr...rr.`, { r: "#d9423f" });

export function drawPixelArt(ctx: CanvasRenderingContext2D, piece: PixelArt, centerX: number, centerY: number, scale: number): void {
  const left = Math.round(centerX - artWidth(piece) * scale / 2), top = Math.round(centerY - piece.rows.length * scale / 2);
  for (const run of pixelRuns(piece)) {
    ctx.fillStyle = run.fill;
    ctx.fillRect(left + run.x * scale, top + run.y * scale, run.width * scale, scale);
  }
}
