import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { AccessoryId } from "../lib/companion";
import { dateKey } from "../lib/companion";
import { MAX_LABEL } from "../lib/grudges";
import { drawScene, SCENE, SCENE_FONT, sceneGif, sceneLength, type SceneInput, type SceneKind, type SpriteSource } from "../lib/madScene";
import { madSprites } from "../lib/madSprites";
import type { CompanionId } from "../types/appearance";
import { PanelShell } from "./PanelShell";

/** Turns a moment into a looping picture worth sending to someone. */
export function MadPanel({ kind, label, character, accessory, petName, onClose }: {
  kind: SceneKind; label: string; character: CompanionId; accessory: AccessoryId | null; petName: string; onClose: () => void;
}) {
  const [text, setText] = useState([...label].slice(0, MAX_LABEL).join(""));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [sprites, setSprites] = useState<SpriteSource | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene: SceneInput = { kind, character, petName, label: text };
  const latest = useRef(scene);
  latest.current = scene;

  useEffect(() => {
    let cancelled = false;
    void document.fonts?.load?.(`700 30px ${SCENE_FONT}`).catch(() => undefined);
    madSprites(character, accessory).then(source => { if (!cancelled) setSprites(() => source); }).catch(error => {
      console.error("Could not draw the scene:", error);
      if (!cancelled) setStatus("The preview couldn’t be drawn. Close this and try again.");
    });
    return () => { cancelled = true; };
  }, [character, accessory]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!sprites || !ctx) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const started = Date.now();
    const draw = () => drawScene(ctx, latest.current, still ? sceneLength(latest.current) - 600 : (Date.now() - started) % sceneLength(latest.current), sprites);
    draw();
    const id = setInterval(draw, still ? 400 : 80);
    return () => clearInterval(id);
  }, [sprites]);

  const save = async () => {
    if (!sprites) return;
    setSaving(true); setStatus("");
    try {
      const gif = await sceneGif(scene, sprites);
      await invoke("export_gif", { fileName: `nudge-${kind}-${dateKey(Date.now())}.gif`, gif: Array.from(gif) });
      setStatus("Saved to Downloads.");
    } catch (error) {
      console.error("Failed to save the GIF:", error);
      setStatus("Couldn’t save the GIF. Please try again.");
    } finally { setSaving(false); }
  };

  return (
    <PanelShell title={kind === "won" ? "Worth showing off" : "Do-Nothing Expansion"} eyebrow={petName} closeLabel="Close GIF maker" onClose={onClose}
      footer={<>{status && <p className="panel-status spacer" role="status">{status}</p>}
        <button type="button" className="settings-btn primary" onClick={() => void save()} disabled={saving || !sprites}>{saving ? "Drawing…" : "Save GIF"}</button></>}>
      <canvas ref={canvas} className="mad-preview" width={SCENE} height={SCENE} role="img" aria-label={kind === "won" ? `${petName} celebrating` : `${petName} unleashing a technique on ${text || "this"}`} />
      <div className="panel-group">
        <label className="panel-label" htmlFor="mad-label">{kind === "won" ? "What you beat" : "What you’d rather not be doing"}</label>
        <input id="mad-label" className="panel-input" value={text} maxLength={MAX_LABEL} placeholder="this" onChange={e => setText(e.target.value)} />
        <p className="settings-hint">Only these words appear in the GIF. Change them before you share it.</p>
      </div>
    </PanelShell>
  );
}
