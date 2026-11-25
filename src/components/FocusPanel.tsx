import { useState } from "react";
import { FOCUS_CHOICES, focusTimeLabel, MAX_FOCUS_TEXT, recentIntentions, cleanText, type FocusRecord, type FocusSession } from "../lib/focus";
import { PanelShell } from "./PanelShell";
import { PixelPetSprite } from "./PixelPetSprite";
import type { CompanionId } from "../types/appearance";
import type { AccessoryId } from "../lib/companion";

interface Props {
  session: FocusSession | null;
  log: FocusRecord[];
  character: CompanionId;
  accessory: AccessoryId | null;
  petName: string;
  now: number;
  /** The page or document in front, offered as a starting point. */
  inFront?: string;
  onStart: (text: string, minutes: number | null) => void;
  onExtend: (minutes: number) => void;
  onPark: (text: string) => void;
  onEnd: () => void;
  onClose: () => void;
}

export function FocusPanel({ session, log, character, accessory, petName, now, inFront, onStart, onExtend, onPark, onEnd, onClose }: Props) {
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState<number | null>(25);
  const [thought, setThought] = useState("");
  const ready = cleanText(text) !== "";
  const start = () => { if (ready) onStart(text, minutes); };
  const park = () => { if (cleanText(thought)) { onPark(thought); setThought(""); } };
  const current = cleanText(inFront ?? "");
  const recent = recentIntentions(log).filter(item => item !== current);

  if (session) return (
    <PanelShell title="Focusing" eyebrow="One thing at a time" closeLabel="Close focus session" onClose={onClose} focus='[aria-label="Park a thought"]'
      footer={<><button type="button" className="settings-btn secondary" onClick={() => onExtend(10)}>10 more min</button>
        <button type="button" className="settings-btn primary" onClick={onEnd}>Finish</button></>}>
      <div className="focus-now">
        <PixelPetSprite character={character} pose="focus" accessory={accessory} />
        <div><strong>{session.text}</strong><span role="timer">{focusTimeLabel(session, now)}</span></div>
      </div>
      <div className="panel-group">
        <label className="panel-label" htmlFor="park-thought">Something on your mind?</label>
        <p className="settings-hint">Park it here. {petName} gives it back when you’re done.</p>
        <div className="panel-row">
          <input id="park-thought" aria-label="Park a thought" className="panel-input" value={thought} maxLength={120} placeholder="Reply to Sam, look up that recipe…"
            onChange={e => setThought(e.target.value)} onKeyDown={e => { if (e.key === "Enter") park(); }} />
          <button type="button" className="settings-btn secondary" onClick={park} disabled={!cleanText(thought)}>Park</button>
        </div>
        {session.parked.length > 0 && <ul className="panel-list">{session.parked.map((item, i) => <li key={i} className="settings-note-row"><span>{item}</span></li>)}</ul>}
      </div>
    </PanelShell>
  );

  return (
    <PanelShell title="What’s the one thing?" eyebrow="Focus session" closeLabel="Close focus session" onClose={onClose} focus="#focus-text"
      footer={<><button type="button" className="settings-btn secondary" onClick={onClose}>Not now</button>
        <button type="button" className="settings-btn primary" onClick={start} disabled={!ready}>Start</button></>}>
      <div className="panel-group">
        <input id="focus-text" className="panel-input" aria-label="What are you working on?" value={text} maxLength={MAX_FOCUS_TEXT} placeholder="Finish the intro paragraph"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") start(); }} />
        <p className="settings-hint">{petName} holds it on a little sign, keeps nudges for the end, and asks gently if you drift.</p>
      </div>
      {current && <div className="panel-group">
        <p className="panel-label">In front of you</p>
        <div className="panel-chips"><button type="button" className="panel-chip" aria-pressed={text === current} onClick={() => setText(current)}>{current}</button></div>
      </div>}
      {recent.length > 0 && <div className="panel-group">
        <p className="panel-label">Again?</p>
        <div className="panel-chips">{recent.map(item => <button key={item} type="button" className="panel-chip" aria-pressed={text === item} onClick={() => setText(item)}>{item}</button>)}</div>
      </div>}
      <div className="panel-group">
        <p className="panel-label" id="focus-length">For how long?</p>
        <div className="panel-chips" role="radiogroup" aria-labelledby="focus-length">
          {FOCUS_CHOICES.map(choice => <button key={choice.label} type="button" role="radio" className="panel-chip" aria-checked={minutes === choice.minutes} onClick={() => setMinutes(choice.minutes)}>{choice.label}</button>)}
        </div>
      </div>
    </PanelShell>
  );
}
