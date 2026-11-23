import { useState } from "react";
import { formatDuration, type SessionStats } from "./SummaryPanel";
import { MoodPicker } from "./MoodPicker";
import { PanelShell } from "./PanelShell";
import type { FocusRecord } from "../lib/focus";

/** The end of the day: what happened, how it felt, and one thing to leave for tomorrow. */
export function WrapUpPanel({ stats, finished, petName, tomorrow, onDone, onClose }: {
  stats: SessionStats; finished: FocusRecord[]; petName: string; tomorrow: string;
  onDone: (mood: number | null, tomorrow: string) => void; onClose: () => void;
}) {
  const [mood, setMood] = useState<number | null>(stats.mood ?? null);
  const [note, setNote] = useState(tomorrow);
  const screen = Object.values(stats.categorySeconds).reduce((a, b) => a + b, 0);
  const done = () => onDone(mood, note.replace(/\s+/g, " ").trim().slice(0, 140));
  return (
    <PanelShell title="That’s a day" eyebrow="Wrap up" closeLabel="Close wrap-up" onClose={onClose}
      footer={<><button type="button" className="settings-btn secondary" onClick={onClose}>Not yet</button>
        <button type="button" className="settings-btn primary" onClick={done}>Say goodnight</button></>}>
      <dl className="day-facts">
        <div><dd>{formatDuration(screen)}</dd><dt>at the screen</dt></div>
        <div><dd>{stats.breaksTaken}</dd><dt>{stats.breaksTaken === 1 ? "pause" : "pauses"}</dt></div>
        <div><dd>{formatDuration(stats.focusSeconds ?? 0)}</dd><dt>focused</dt></div>
      </dl>
      {finished.length > 0 && <div className="panel-group">
        <p className="panel-label">You finished</p>
        <ul className="panel-list">{finished.map((f, i) => <li key={i}>{f.text}</li>)}</ul>
      </div>}
      <div className="panel-group">
        <p className="panel-label">How did today feel?</p>
        <MoodPicker value={mood} onChange={setMood} />
        <p className="settings-hint">Optional, and only kept on this Mac.</p>
      </div>
      <div className="panel-group">
        <label className="panel-label" htmlFor="tomorrow-note">First thing tomorrow</label>
        <input id="tomorrow-note" className="panel-input" value={note} maxLength={140} placeholder="Leave it here and let it go"
          onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") done(); }} />
        <p className="settings-hint">{petName} will remind you in the morning.</p>
      </div>
    </PanelShell>
  );
}
