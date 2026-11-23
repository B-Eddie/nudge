import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { newCompanion, readCompanion, type CompanionState } from "../lib/companion";

const SAVE_DELAY_MS = 800;

/** The companion's memory, loaded once and saved shortly after each change. If it can't be
 * loaded it still works for this session, but nothing is written over what's on disk. */
export function useCompanion() {
  const [state, setState] = useState<CompanionState>(() => newCompanion(Date.now()));
  const [ready, setReady] = useState(false);
  const latest = useRef(state);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canSave = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      invoke<unknown>("get_companion"),
      // People who already used nudge met their companion on their first recorded day.
      invoke<{ history?: { date: string }[] } | null>("get_activity").catch(() => null),
    ]).then(([saved, activity]) => {
      if (cancelled) return;
      const first = activity?.history?.[0]?.date;
      const met = first ? new Date(`${first}T12:00:00`).getTime() : Date.now();
      latest.current = readCompanion(saved, Date.now(), Number.isFinite(met) ? met : Date.now());
      canSave.current = true;
      setState(latest.current);
      setReady(true);
    }).catch(error => console.error("Failed to load the companion; its changes won't be saved:", error));
    return () => { cancelled = true; };
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (canSave.current) void invoke("save_companion", { companion: latest.current })
      .catch(error => console.error("Failed to save the companion:", error));
  }, []);
  useEffect(() => () => { if (timer.current) flush(); }, [flush]);

  const update = useCallback((change: (state: CompanionState) => CompanionState): CompanionState => {
    const next = change(latest.current);
    if (next !== latest.current) {
      latest.current = next;
      setState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    }
    return next;
  }, [flush]);

  /** Saves without keeping the previous copy, for erasing history. */
  const replace = useCallback(async (next: CompanionState) => {
    clearTimeout(timer.current);
    timer.current = undefined;
    latest.current = next;
    setState(next);
    if (canSave.current) await invoke("replace_companion", { companion: next });
  }, []);

  return { state, ready, latest, update, replace };
}
