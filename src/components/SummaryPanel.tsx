import { useMemo, useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import { useDialogFocus } from "../hooks/useDialogFocus";
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
  "Developer Tools": "#7998d8",
  Productivity: "#8ca78b",
  "Social Networking": "#c991a7",
  Games: "#a398cb",
  Entertainment: "#d7a080",
  Video: "#c3a270",
  Music: "#77a8b7",
  Unknown: "#929aa6",
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
        Your day is just getting started. Activity appears here as you use
        your computer.
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
  const tabListRef = useRef<HTMLDivElement>(null);
  const panelRef = useDialogFocus(onClose, ".summary-close");

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

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const nextTab = e.key === "Home" ? "today" : e.key === "End" ? "week"
      : tab === "today" ? "week" : "today";
    setTab(nextTab);
    tabListRef.current?.querySelector<HTMLButtonElement>(`#summary-tab-${nextTab}`)?.focus();
  };

  return (
    <div
      className="summary-backdrop interactive"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="summary-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-title"
        tabIndex={-1}
      >
        <header className="summary-header">
          <div>
            <p className="summary-eyebrow">Your time, in view</p>
            <h2 id="summary-title">Activity</h2>
          </div>
          <button
            type="button"
            className="summary-close"
            onClick={onClose}
            aria-label="Close activity report"
          >
            <LuX size={18} aria-hidden="true" />
          </button>
        </header>

        <div ref={tabListRef} className="summary-tabs" role="tablist" aria-label="Report range" onKeyDown={handleTabKeyDown}>
          <button
            type="button"
            role="tab"
            id="summary-tab-today"
            aria-selected={tab === "today"}
            aria-controls="summary-content"
            tabIndex={tab === "today" ? 0 : -1}
            className={`summary-tab ${tab === "today" ? "active" : ""}`}
            onClick={() => setTab("today")}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            id="summary-tab-week"
            aria-selected={tab === "week"}
            aria-controls="summary-content"
            tabIndex={tab === "week" ? 0 : -1}
            className={`summary-tab ${tab === "week" ? "active" : ""}`}
            onClick={() => setTab("week")}
          >
            Past week
          </button>
        </div>

        {tab === "today" ? (
          <div className="summary-body" role="tabpanel" id="summary-content" aria-labelledby="summary-tab-today" tabIndex={0}>
            {categories.entries.length !== 0 ? (
              <>
                <h3 className="summary-persona">Your day, at a glance</h3>
                <div className="summary-persona-row">
                  <span className="summary-persona-chip">
                    {categories.entries[0] && categories.entries[0][0]}
                  </span>
                  <span className="summary-persona-caption">Most used</span>
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
                    ? "Resting"
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
                  {onBreak ? "Recharging" : `${energy}/${ENERGY_CELLS}`}
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
              <h3 className="summary-section-title">Day details</h3>
              <ul className="summary-log">
                <li>Started at {formatClock(stats.startedAt)}</li>
                {topCategory && activeSeconds > 0 && (
                  <li>
                    Most used: {topCategory[0]} (
                    {Math.round((topCategory[1] / activeSeconds) * 100)}%)
                  </li>
                )}
                <li>
                  Longest active stretch:{" "}
                  {formatDuration(stats.longestStretchSeconds)}
                </li>
                <li>
                  Rested {formatDuration(stats.restSeconds)} across{" "}
                  {stats.breaksTaken}{" "}
                  {stats.breaksTaken === 1 ? "break" : "breaks"}
                </li>
                {stats.breaksInterrupted > 0 && (
                  <li className="summary-log-warn">
                    {stats.breaksInterrupted}{" "}
                    {stats.breaksInterrupted === 1 ? "break" : "breaks"} cut
                    short when activity resumed.
                  </li>
                )}
              </ul>
            </section>
          </div>
        ) : (
          <div className="summary-body" role="tabpanel" id="summary-content" aria-labelledby="summary-tab-week" tabIndex={0}>
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
                          : "0m"}
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
              <h3 className="summary-section-title">Week details</h3>
              <ul className="summary-log">
                <li>Active on {week.activeDayCount} of the last 7 days</li>
                {week.bestDay && (
                  <li>
                    Most active day:{" "}
                    {week.bestDay.isToday ? "today" : week.bestDay.label} (
                    {formatDuration(week.bestDay.activeSeconds)})
                  </li>
                )}
                {week.activeDayCount > 0 && (
                  <li>
                    Daily average:{" "}
                    {formatDuration(week.total / week.activeDayCount)}
                  </li>
                )}
                <li>
                  Longest active stretch:{" "}
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
