/** Notices flicking between tabs and repeat visits. Kept in memory for today only. */

const HOP_WINDOW_MS = 3 * 60_000;
const HOPS = 14;
const HOP_QUIET_MS = 25 * 60_000;
const AWAY_MS = 2 * 60_000;
const VISITS_TO_MENTION = [5, 10, 20];

export class Wandering {
  private hops: number[] = [];
  private hopMentioned = 0;
  private visits = new Map<string, { count: number; last: number }>();
  private day = "";

  /** Call when the page in front changes. True when it has become a lot of hopping. */
  hop(now: number): boolean {
    this.hops = [...this.hops.filter(t => now - t < HOP_WINDOW_MS), now];
    if (this.hops.length < HOPS || now - this.hopMentioned < HOP_QUIET_MS) return false;
    this.hops = [];
    this.hopMentioned = now;
    return true;
  }

  /** Call each second on a site. Returns the visit number when it's worth a remark. */
  visit(site: string, now: number): number | null {
    const day = new Date(now).toDateString();
    if (day !== this.day) { this.day = day; this.visits.clear(); }
    const seen = this.visits.get(site);
    const fresh = !seen || now - seen.last >= AWAY_MS;
    const count = (seen?.count ?? 0) + (fresh ? 1 : 0);
    this.visits.set(site, { count, last: now });
    return fresh && VISITS_TO_MENTION.includes(count) ? count : null;
  }

  clear(): void { this.hops = []; this.visits.clear(); }
}
