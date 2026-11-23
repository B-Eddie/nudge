/** Distracting time in a rolling window, so a two-second glance elsewhere can't reset it. */

const BUCKET_MS = 60_000;
export const REPEAT_MS = 15 * 60_000;

export class RollingUse {
  private buckets = new Map<number, number>();
  constructor(private readonly keepMs = 6 * 3600_000) {}

  add(now: number, seconds = 1): void {
    const bucket = Math.floor(now / BUCKET_MS);
    this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + seconds);
    const oldest = Math.floor((now - this.keepMs) / BUCKET_MS);
    for (const key of this.buckets.keys()) {
      if (key >= oldest) break;
      this.buckets.delete(key);
    }
  }

  within(now: number, windowMs: number): number {
    const first = Math.floor((now - windowMs) / BUCKET_MS);
    let total = 0;
    for (const [bucket, seconds] of this.buckets) if (bucket > first) total += seconds;
    return total;
  }

  clear(): void { this.buckets.clear(); }
}

/** Seconds of distraction in the window that matters for this limit. */
export function recentDistraction(use: RollingUse, limitMins: number, now: number): number {
  return use.within(now, limitMins * 1.5 * 60_000);
}

export function distractionDue(seconds: number, limitMins: number, lastNudgeAt: number, now: number): boolean {
  return seconds >= limitMins * 60 && now - lastNudgeAt >= REPEAT_MS;
}
