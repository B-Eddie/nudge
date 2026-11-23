import { useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LuDownload, LuMoon, LuX } from "react-icons/lu";
import { activityCsv, exportFileName } from "../lib/activityExport";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { NudgeRecord } from "../lib/reminderPolicy";
import { daysBefore, type Letter } from "../lib/weeklyLetter";
import type { CompanionId } from "../types/appearance";
import type { AccessoryId } from "../lib/companion";
import { PixelPetSprite } from "./PixelPetSprite";
import "./SummaryPanel.css";
import "./PanelShell.css";

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
  /** Active seconds per hour of the day; missing on days saved by older versions. */
  hourlySeconds?: number[];
  nudges?: NudgeRecord[];
  focusSeconds?: number;
  focusSessions?: number;
  /** 1 (rough) to 5 (great), if the person said. */
  mood?: number | null;
}

// completed day's stats, archived when it passes midnight
export interface DayRecord {
  date: string; // format "YYYY-MM-DD"
  categorySeconds: Record<string, number>;
  breaksTaken: number;
  breaksInterrupted: number;
  restSeconds: number;
  longestStretchSeconds: number;
  /** Active seconds per hour of the day; missing on days saved by older versions. */
  hourlySeconds?: number[];
  nudges?: NudgeRecord[];
  focusSeconds?: number;
  focusSessions?: number;
  /** 1 (rough) to 5 (great), if the person said. */
  mood?: number | null;
}

export function emptySessionStats(now = Date.now()): SessionStats {
  return {
    startedAt: now,
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
    hourlySeconds: [...(stats.hourlySeconds ?? [])],
    nudges: [...(stats.nudges ?? [])],
    focusSeconds: stats.focusSeconds ?? 0,
    focusSessions: stats.focusSessions ?? 0,
    mood: stats.mood ?? null,
  };
}

interface SummaryPanelProps {
  stats: SessionStats;
  history: DayRecord[];
  // Current energy bars recharging live while on break.
  energy: number;
  onBreak: boolean;
  onClose: () => void;
  letter?: Letter | null;
  character?: CompanionId;
  accessory?: AccessoryId | null;
  initialTab?: SummaryTab;
  /** Applies a letter's suggestion; resolves once it is saved. */
  onApply?: (letter: Letter) => Promise<void>;
  onWrapUp?: () => void;
}
export type SummaryTab = "today" | "week" | "letter";
const TABS: { id: SummaryTab; label: string }[] = [{ id: "today", label: "Today" }, { id: "week", label: "Past week" }, { id: "letter", label: "Letter" }];

const CATEGORY_COLORS: Record<string, string> = {
  "Developer Tools": "#7998d8",
  Productivity: "#8ca78b",
  "Social Networking": "#c991a7",
  Games: "#a398cb",
  Entertainment: "#d7a080",
  Video: "#c3a270",
  Music: "#77a8b7",
  Learning: "#6fae9a",
  Messages: "#b39ac4",
  News: "#b5a58c",
  Shopping: "#d09aa0",
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

function HourStrip({ hours, label }: { hours: number[]; label: string }) {
  const most = Math.max(...hours);
  if (most === 0) return null;
  return (
    <div role="img" aria-label={label}>
      <div className="hours">
        {hours.map((seconds, hour) => <i key={hour} className={seconds > 0 ? "active" : ""} style={{ height: `${Math.max(6, seconds / most * 100)}%` }} />)}
      </div>
      <div className="hours-axis" aria-hidden="true"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
    </div>
  );
}

const hoursOf = (day: { hourlySeconds?: number[] }) => Array.from({ length: 24 }, (_, hour) => day.hourlySeconds?.[hour] ?? 0);

export function SummaryPanel({
  stats,
  history,
  energy,
  onBreak,
  onClose,
  letter = null,
  character = "crab",
  accessory = null,
  initialTab = "today",
  onApply,
  onWrapUp,
}: SummaryPanelProps) {
  const [tab, setTab] = useState<SummaryTab>(initialTab);
  const [applied, setApplied] = useState<"no" | "saving" | "yes" | "failed">("no");
  const [exportStatus, setExportStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    setExportStatus(null);
    try {
      await invoke<string>("export_activity_csv", {
        fileName: exportFileName(),
        contents: activityCsv(stats, history),
      });
      setExportStatus({ ok: true, text: "Saved to Downloads." });
    } catch (err) {
      console.error("Failed to export activity:", err);
      setExportStatus({ ok: false, text: "Couldn't save the export. Please try again." });
    } finally {
      setExporting(false);
    }
  };
  const tabListRef = useRef<HTMLDivElement>(null);
  const panelRef = useDialogFocus(onClose, ".summary-dismiss");

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

  const weekHours = useMemo(() => {
    const recent = [...daysBefore(history, Date.now(), 6), stats];
    return Array.from({ length: 24 }, (_, hour) => recent.reduce((sum, day) => sum + hoursOf(day)[hour], 0));
  }, [stats, history]);
  // Whole days only, so a half-finished today never looks like an improvement.
  const comparison = useMemo(() => {
    const average = (days: DayRecord[]) => days.reduce((sum, day) => sum + sumSeconds(day.categorySeconds), 0) / days.length;
    const recent = daysBefore(history, Date.now(), 7), before = daysBefore(history, Date.now(), 7, 7);
    if (recent.length < 3 || before.length < 3) return null;
    const change = average(recent) - average(before);
    if (Math.abs(change) < 600) return "About the same each day as the week before.";
    return `${formatDuration(Math.abs(change))} ${change < 0 ? "less" : "more"} a day than the week before.`;
  }, [history]);

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
    const current = TABS.findIndex(t => t.id === tab);
    const nextTab = TABS[e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1
      : (current + (e.key === "ArrowLeft" ? -1 : 1) + TABS.length) % TABS.length].id;
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
          <div className="summary-header-actions">
            {onWrapUp && <button type="button" className="summary-close" onClick={onWrapUp} aria-label="Wrap up the day" title="Wrap up the day">
              <LuMoon size={17} aria-hidden="true" />
            </button>}
            <button
              type="button"
              className="summary-close"
              onClick={() => void exportCsv()}
              disabled={exporting}
              aria-label="Export activity as CSV"
              title="Export as CSV"
            >
              <LuDownload size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="summary-close summary-dismiss"
              onClick={onClose}
              aria-label="Close activity report"
            >
              <LuX size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {exportStatus && (
          <p
            className={`summary-export-status${exportStatus.ok ? "" : " summary-export-status--error"}`}
            role={exportStatus.ok ? "status" : "alert"}
          >
            {exportStatus.text}
          </p>
        )}

        <div ref={tabListRef} className="summary-tabs" role="tablist" aria-label="Report range" onKeyDown={handleTabKeyDown}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`summary-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="summary-content"
              tabIndex={tab === id ? 0 : -1}
              className={`summary-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
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

            {Math.max(...hoursOf(stats)) > 0 && (
              <section className="summary-section">
                <h3 className="summary-section-title">Your hours</h3>
                <HourStrip hours={hoursOf(stats)} label="Active time by hour today" />
              </section>
            )}

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
                {(stats.focusSeconds ?? 0) >= 60 && (
                  <li>
                    Focused {formatDuration(stats.focusSeconds ?? 0)} in {stats.focusSessions ?? 0}{" "}
                    {stats.focusSessions === 1 ? "session" : "sessions"}
                  </li>
                )}
                {(stats.nudges?.length ?? 0) > 0 && (
                  <li>
                    Took {stats.nudges?.filter((n) => n.outcome === "taken").length} of {stats.nudges?.length}{" "}
                    {stats.nudges?.length === 1 ? "nudge" : "nudges"}
                  </li>
                )}
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
        ) : tab === "letter" ? (
          <div className="summary-body" role="tabpanel" id="summary-content" aria-labelledby="summary-tab-letter" tabIndex={0}>
            {letter ? (
              <article className="letter">
                <p>{letter.greeting}</p>
                <p className="letter-lead">{letter.observation}</p>
                <ul>{letter.details.map((line) => <li key={line}>{line}</li>)}</ul>
                <p>{letter.suggestion}</p>
                {letter.apply && onApply && (
                  <p>
                    <button type="button" className="letter-apply" disabled={applied === "saving" || applied === "yes"} onClick={() => {
                      setApplied("saving");
                      onApply(letter).then(() => setApplied("yes"), () => setApplied("failed"));
                    }}>
                      {applied === "yes" ? "Done" : letter.apply.label}
                    </button>
                    {applied === "failed" && <span role="alert"> Couldn’t save that. Please try again.</span>}
                  </p>
                )}
                <div className="letter-sign">
                  <span>{letter.signature}</span>
                  <PixelPetSprite character={character} pose="happy" displaySize={64} accessory={accessory} />
                </div>
              </article>
            ) : (
              <p className="summary-hint">After a few days together, your companion writes you a short letter about your week. It’s written on this Mac, from your own summaries.</p>
            )}
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

            {comparison && <p className="week-compare">{comparison}</p>}

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

            {Math.max(...weekHours) > 0 && (
              <section className="summary-section">
                <h3 className="summary-section-title">Your usual hours</h3>
                <HourStrip hours={weekHours} label="Active time by hour over the past week" />
              </section>
            )}

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
