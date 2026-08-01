import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { LuX } from "react-icons/lu";
import "./SettingsPanel.css";

interface ReminderNotePanelProps {
  onClose: () => void;
}

export function ReminderNotePanel({ onClose }: ReminderNotePanelProps) {
  const [noteInput, setNoteInput] = useState("");
  const [queued, setQueued] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void invoke<string[]>("get_pending_notes")
      .then((notes) => {
        setQueued(notes);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError("Could not load reminder notes.");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const addNote = useCallback(async () => {
    const text = noteInput.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("add_pending_note", { note: text });
      setNoteInput("");
      refresh();
    } catch (err) {
      console.error(err);
      setError("Could not save that note.");
    } finally {
      setSaving(false);
    }
  }, [noteInput, saving, refresh]);

  const removeNote = useCallback(
    async (index: number) => {
      setError(null);
      try {
        await invoke("remove_pending_note", { index });
        refresh();
      } catch (err) {
        console.error(err);
        setError("Could not remove that note.");
      }
    },
    [refresh],
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="settings-backdrop interactive"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="settings-panel"
        role="dialog"
        aria-labelledby="reminder-note-title"
      >
        <header className="settings-header">
          <h2 id="reminder-note-title">Reminder note</h2>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="Close reminder notes"
          >
            <LuX size={15} />
          </button>
        </header>

        <div className="settings-body">
          <p className="settings-hint">
            Your character will say the next queued note at the next reminder,
            then move on to the one after that.
          </p>

          {error && <p className="settings-hint settings-error">{error}</p>}

          <div className="settings-note-add">
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addNote();
              }}
              placeholder="What should I remind you?"
              aria-label="New reminder note"
            />
            <button
              type="button"
              className="settings-btn primary"
              onClick={() => void addNote()}
              disabled={!noteInput.trim() || saving}
            >
              Add
            </button>
          </div>

          {queued.length > 0 ? (
            <ul className="settings-note-list">
              {queued.map((note, index) => (
                <li key={`${index}-${note}`} className="settings-note-row">
                  <span>{note}</span>
                  <button
                    type="button"
                    className="settings-note-remove"
                    onClick={() => void removeNote(index)}
                    aria-label={`Remove note: ${note}`}
                  >
                    <LuX size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-hint">No notes queued yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
