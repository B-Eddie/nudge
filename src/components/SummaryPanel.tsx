import { useEffect, useMemo, useState } from "react";
import { LuX } from "react-icons/lu";
import "./SummaryPanel.css";

// stats from memory for current session
export interface SessionStats {
  startedAt: number;
  // active seconds per category label
  categorySeconds: Record<string, number>;
  breaksTaken: number;
  breaksInterrupted: number;
  restSeconds: number;
  currentStretchSeconds: number;
  longestStretchSeconds: number;
}

// completed day's stats, archived when it passes midnight
export interface DayRecord {
  date: string; // format "YYYY-MM-DD"
  categorySeconds: Record<string, number>;
  breaksTaken: number;
  breaksInterrupted: number;
  restSeconds: number;
  longestStretchSeconds: number;
}

export function emptySessionStats(): SessionStats {
  return {
    startedAt: Date.now(),
    categorySeconds: {},
    breaksTaken: 0,
    breaksInterrupted: 0,
    restSeconds: 0,
    currentStretchSeconds: 0,
    longestStretchSeconds: 0,
  };
}

// date to detect day rollovers
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function dayRecordFromStats(stats: SessionStats): DayRecord {
  return {
    date: dayKey(stats.startedAt),
    categorySeconds: { ...stats.categorySeconds },
    breaksTaken: stats.breaksTaken,
    breaksInterrupted: stats.breaksInterrupted,
    restSeconds: stats.restSeconds,
    longestStretchSeconds: stats.longestStretchSeconds,
  };
}

interface SummaryPanelProps {
  stats: SessionStats;
  history: DayRecord[];
  // Current energy bars recharging live while on break.
  energy: number;
  onBreak: boolean;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Developer Tools": "#7aa2f7",
  Productivity: "#a2cc3a",
  "Social Networking": "#f7768e",
  Games: "#bb9af7",
  Entertainment: "#e0af68",
  Video: "#ff9e64",
  Music: "#7dcfff",
  Unknown: "#9aa0a6",
};
const FALLBACK_COLOR = "#9aa0a6";
const BAR_CELLS = 14;
const ENERGY_CELLS = 5;

export function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  return `${Math.max(0, Math.floor(totalSeconds))}s`;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sumSeconds(categorySeconds: Record<string, number>): number {
  return Object.values(categorySeconds).reduce((sum, secs) => sum + secs, 0);
}

interface WeekDay {
  key: string;
  label: string; // "mon", "tue", ...
  isToday: boolean;
  activeSeconds: number;
}

interface WeekSummary {
  days: WeekDay[];
  entries: [string, number][];
  total: number;
  restSeconds: number;
  breaksTaken: number;
  breaksInterrupted: number;
  longestStretchSeconds: number;
  activeDayCount: number;
  bestDay: WeekDay | null;
}

function buildWeekSummary(
  stats: SessionStats,
  history: DayRecord[],
): WeekSummary {
  const byDate = new Map(history.map((rec) => [rec.date, rec]));
  // Today comes from the live session, not archive
  const today = dayRecordFromStats(stats);
  byDate.set(today.date, today);

  const days: WeekDay[] = [];
  const categorySeconds: Record<string, number> = {};
  let restSeconds = 0;
  let breaksTaken = 0;
  let breaksInterrupted = 0;
  let longestStretchSeconds = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    const rec = byDate.get(key);

    days.push({
      key,
      label: d.toLocaleDateString([], { weekday: "short" }).toLowerCase(),
      isToday: i === 0,
      activeSeconds: rec ? sumSeconds(rec.categorySeconds) : 0,
    });

    if (!rec) continue;
    for (const [category, secs] of Object.entries(rec.categorySeconds)) {
      categorySeconds[category] = (categorySeconds[category] ?? 0) + secs;
    }
    restSeconds += rec.restSeconds;
    breaksTaken += rec.breaksTaken;
    breaksInterrupted += rec.breaksInterrupted;
    longestStretchSeconds = Math.max(
      longestStretchSeconds,
      rec.longestStretchSeconds,
    );
  }

  const entries = Object.entries(categorySeconds).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, secs]) => sum + secs, 0);
  const activeDays = days.filter((day) => day.activeSeconds > 0);
  const bestDay = activeDays.reduce<WeekDay | null>(
    (best, day) =>
      best === null || day.activeSeconds > best.activeSeconds ? day : best,
    null,
  );

  return {
    days,
    entries,
    total,
    restSeconds,
    breaksTaken,
    breaksInterrupted,
    longestStretchSeconds,
    activeDayCount: activeDays.length,
    bestDay,
  };
}

function CategoryBreakdown({
  entries,
  total,
}: {
  entries: [string, number][];
  total: number;
}) {
  if (entries.length === 0) {
    return (
      <p className="summary-hint">
        Nothing tracked yet. Your stats will show here as you use computer.
      </p>
    );
  }
  return (
    <ul className="summary-category-list">
      {entries.map(([category, seconds]) => {
        const fraction = total > 0 ? seconds / total : 0;
        const filled = Math.max(1, Math.round(fraction * BAR_CELLS));
        const color = CATEGORY_COLORS[category] ?? FALLBACK_COLOR;
        return (
          <li key={category} className="summary-category">
            <div className="summary-category-top">
              <span className="summary-category-name">{category}</span>
              <span className="summary-category-time">
                {formatDuration(seconds)} · {Math.round(fraction * 100)}%
              </span>
            </div>
            <div className="pixel-bar" aria-hidden>
              {Array.from({ length: BAR_CELLS }, (_, i) => (
                <span
                  key={i}
                  className="pixel-cell"
                  style={i < filled ? { background: color } : undefined}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SummaryPanel({
  stats,
  history,
  energy,
  onBreak,
  onClose,
}: SummaryPanelProps) {
  const [tab, setTab] = useState<"today" | "week">("today");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const categories = useMemo(() => {
    const entries = Object.entries(stats.categorySeconds).sort(
      (a, b) => b[1] - a[1],
    );
    const total = entries.reduce((sum, [, secs]) => sum + secs, 0);
    return { entries, total };
  }, [stats.categorySeconds]);

  const week = useMemo(
    () => buildWeekSummary(stats, history),
    [stats, history],
  );

  const activeSeconds = categories.total;
  const energyClass = energy >= 4 ? "high" : energy === 3 ? "mid" : "low";
  const topCategory = categories.entries[0];
  const maxDaySeconds = Math.max(
    1,
    ...week.days.map((day) => day.activeSeconds),
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="summary-backdrop interactive"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="summary-panel"
        role="dialog"
        aria-labelledby="summary-title"
      >
        <header className="summary-header">
          <h2 id="summary-title">Activity Report</h2>
          <button
            type="button"
            className="summary-close"
            onClick={onClose}
            aria-label="Close activity report"
          >
            <LuX size={15} />
          </button>
        </header>

        <div className="summary-tabs" role="tablist" aria-label="Report range">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "today"}
            className={`summary-tab ${tab === "today" ? "active" : ""}`}
            onClick={() => setTab("today")}
          >
            today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "week"}
            className={`summary-tab ${tab === "week" ? "active" : ""}`}
            onClick={() => setTab("week")}
          >
            week
          </button>
        </div>

        {tab === "today" ? (
          <div className="summary-body">
            {categories.entries.length !== 0 ? (
              <>
                <h3 className="summary-persona">
                  {(() => {
                    const [topCategory] = categories.entries[0] || [];
                    // titles based on top category
                    switch (topCategory) {
                      case "Developer Tools":
                        return "Bug Wrangler";
                      case "Productivity":
                        return "Locked In";
                      case "Social Networking":
                        return "Chronically Online";
                      case "Games":
                        return "Hardstuck addict";
                      case "Music":
                        return "DJ of procrastination";
                      case "Unknown":
                        return "Mystery Explorer";
                      default:
                        return `${topCategory} Enjoyer`;
                    }
                  })()}
                </h3>
                <div className="summary-persona-row">
                  <span className="summary-persona-chip">
                    {categories.entries[0] && categories.entries[0][0]}
                  </span>
                  <span className="summary-persona-caption">top category</span>
                </div>
              </>
            ) : null}

            <div className="summary-cards">
              <div className="summary-card">
                <span className="summary-card-value">
                  {formatDuration(activeSeconds)}
                </span>
                <span className="summary-card-label">screen time</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-value">
                  {onBreak
                    ? "zzz"
                    : formatDuration(stats.currentStretchSeconds)}
                </span>
                <span className="summary-card-label">since break</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-value">{stats.breaksTaken}</span>
                <span className="summary-card-label">
                  {stats.breaksTaken === 1 ? "break" : "breaks"}
                </span>
              </div>
            </div>

            <section className="summary-section">
              <h3 className="summary-section-title">Energy</h3>
              <div
                className={`energy-meter ${energyClass} ${
                  onBreak ? "recharging" : ""
                }`}
                role="img"
                aria-label={
                  onBreak
                    ? "Recharging"
                    : `Energy ${energy} out of ${ENERGY_CELLS}`
                }
              >
                <div className="energy-cells">
                  {Array.from({ length: ENERGY_CELLS }, (_, i) => (
                    <span
                      key={i}
                      className={`energy-cell ${i < energy ? "filled" : ""}`}
                    />
                  ))}
                </div>
                <span className="energy-label">
                  {onBreak ? "recharging..." : `${energy}/${ENERGY_CELLS}`}
                </span>
              </div>
            </section>

            <section className="summary-section">
              <h3 className="summary-section-title">Where your time went</h3>
              <CategoryBreakdown
                entries={categories.entries}
                total={activeSeconds}
              />
            </section>

            <section className="summary-section">
              <h3 className="summary-section-title">Log</h3>
              <ul className="summary-log">
                <li>session started at {formatClock(stats.startedAt)}</li>
                {topCategory && activeSeconds > 0 && (
                  <li>
                    top category: {topCategory[0].toLowerCase()} (
                    {Math.round((topCategory[1] / activeSeconds) * 100)}%)
                  </li>
                )}
                <li>
                  longest focus streak:{" "}
                  {formatDuration(stats.longestStretchSeconds)}
                </li>
                <li>
                  rested {formatDuration(stats.restSeconds)} across{" "}
                  {stats.breaksTaken}{" "}
                  {stats.breaksTaken === 1 ? "break" : "breaks"}
                </li>
                {stats.breaksInterrupted > 0 && (
                  <li className="summary-log-warn">
                    {stats.breaksInterrupted}{" "}
                    {stats.breaksInterrupted === 1 ? "break" : "breaks"} cut
                    short. stay off the keyboard next time!
                  </li>
                )}
              </ul>
            </section>
          </div>
        ) : (
          <div className="summary-body">
            <div className="summary-cards">
              <div className="summary-card">
                <span className="summary-card-value">
                  {formatDuration(week.total)}
                </span>
                <span className="summary-card-label">screen time</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-value">
                  {formatDuration(week.restSeconds)}
                </span>
                <span className="summary-card-label">rested</span>
              </div>
              <div className="summary-card">
                <span className="summary-card-value">{week.breaksTaken}</span>
                <span className="summary-card-label">
                  {week.breaksTaken === 1 ? "break" : "breaks"}
                </span>
              </div>
            </div>

            <section className="summary-section">
              <h3 className="summary-section-title">Last 7 days</h3>
              <ul className="week-day-list">
                {week.days.map((day) => {
                  const fraction = day.activeSeconds / maxDaySeconds;
                  const filled =
                    day.activeSeconds > 0
                      ? Math.max(1, Math.round(fraction * BAR_CELLS))
                      : 0;
                  return (
                    <li
                      key={day.key}
                      className={`week-day ${day.isToday ? "today" : ""}`}
                    >
                      <span className="week-day-label">
                        {day.isToday ? "today" : day.label}
                      </span>
                      <div className="pixel-bar week-day-bar" aria-hidden>
                        {Array.from({ length: BAR_CELLS }, (_, i) => (
                          <span
                            key={i}
                            className={`pixel-cell ${
                              i < filled ? "week-filled" : ""
                            }`}
                          />
                        ))}
                      </div>
                      <span className="week-day-time">
                        {day.activeSeconds > 0
                          ? formatDuration(day.activeSeconds)
                          : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="summary-section">
              <h3 className="summary-section-title">Where your week went</h3>
              <CategoryBreakdown entries={week.entries} total={week.total} />
            </section>

            <section className="summary-section">
              <h3 className="summary-section-title">Log</h3>
              <ul className="summary-log">
                <li>active on {week.activeDayCount} of the last 7 days</li>
                {week.bestDay && (
                  <li>
                    busiest day:{" "}
                    {week.bestDay.isToday ? "today" : week.bestDay.label} (
                    {formatDuration(week.bestDay.activeSeconds)})
                  </li>
                )}
                {week.activeDayCount > 0 && (
                  <li>
                    daily average:{" "}
                    {formatDuration(week.total / week.activeDayCount)}
                  </li>
                )}
                <li>
                  longest focus streak:{" "}
                  {formatDuration(week.longestStretchSeconds)}
                </li>
                {week.breaksInterrupted > 0 && (
                  <li className="summary-log-warn">
                    {week.breaksInterrupted}{" "}
                    {week.breaksInterrupted === 1 ? "break" : "breaks"} cut
                    short this week
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
