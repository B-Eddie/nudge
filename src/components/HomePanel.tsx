import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { CompanionId } from "../types/appearance";
import { ACCESSORIES, ACCESSORY_IDS, bondLevel, dateKey, daysTogether, MILESTONES, unlocked, type AccessoryId, type CompanionState } from "../lib/companion";
import { blooms, DROPS_TO_BLOOM, SPECIES, SPECIES_IDS, stageOf } from "../lib/garden";
import { WORN } from "../lib/accessoryArt";
import { postcardBytes } from "../lib/postcard";
import { ambientLightAt } from "../hooks/useAmbientLight";
import { PanelShell, PanelTabs } from "./PanelShell";
import { PixelArt, PlantArt } from "./PixelArt";
import { PixelPetSprite } from "./PixelPetSprite";

export type HomeTab = "garden" | "outfits" | "us";
const TABS: { id: HomeTab; label: string }[] = [{ id: "garden", label: "Garden" }, { id: "outfits", label: "Outfits" }, { id: "us", label: "Us" }];
const ROW = 6, MIN_PLOTS = 18;

export function HomePanel({ state, character, petName, now, initialTab = "garden", onWear, onForgive, onClose }: {
  state: CompanionState; character: CompanionId; petName: string; now: number; initialTab?: HomeTab;
  onForgive?: (key: string) => void;
  onWear: (id: AccessoryId | null) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<HomeTab>(initialTab);
  const [preview, setPreview] = useState<AccessoryId | null>(state.wearing);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const level = bondLevel(state.bond);
  const available = unlocked(state, now);
  const grown = blooms(state.plants);
  const newest = state.plants[state.plants.length - 1];
  const growing = newest && stageOf(newest) !== "bloom" ? newest : null;
  const plots = Math.max(MIN_PLOTS, Math.ceil(state.plants.length / ROW) * ROW);
  const kinds = new Set(state.plants.filter(p => stageOf(p) === "bloom").map(p => p.species)).size;

  const savePostcard = async () => {
    setSaving(true); setStatus("");
    try {
      const png = await postcardBytes({ character, accessory: state.wearing, petName, plants: state.plants, breaks: state.breaks, days: daysTogether(state, now), now });
      await invoke("export_postcard", { fileName: `nudge-postcard-${dateKey(now)}.png`, png });
      setStatus("Saved to Downloads.");
    } catch (error) {
      console.error("Failed to save the postcard:", error);
      setStatus("Couldn’t save the postcard. Please try again.");
    } finally { setSaving(false); }
  };
  const wear = (id: AccessoryId | null) => { setPreview(id); onWear(id); };

  return (
    <PanelShell title={`${petName}’s place`} eyebrow={`${level.name} · day ${daysTogether(state, now)}`} closeLabel="Close garden" onClose={onClose}
      footer={tab === "garden" ? <>{status && <p className="panel-status spacer" role="status">{status}</p>}
        <button type="button" className="settings-btn secondary" onClick={() => void savePostcard()} disabled={saving}>{saving ? "Drawing…" : "Save a postcard"}</button></> : undefined}>
      <PanelTabs tabs={TABS} value={tab} onChange={setTab} label="Your companion’s place" idPrefix="home" />

      {tab === "garden" && <div className="panel-group" role="tabpanel" id="home-panel-garden" aria-labelledby="home-tab-garden" style={{ gap: 18 }}>
        <div className="garden-scene" data-light={ambientLightAt(new Date(now))}>
          <span className="garden-sun" aria-hidden="true" />
          <ul className="garden-plots" aria-label={`Garden with ${grown} ${grown === 1 ? "bloom" : "blooms"}`}>
            {Array.from({ length: plots }, (_, i) => {
              const plant = state.plants[i];
              if (!plant) return <li key={i} className="garden-plot empty" aria-hidden="true" />;
              const stage = stageOf(plant);
              const name = stage === "bloom" ? `${SPECIES[plant.species].name}, bloomed ${new Date(plant.bloomedAt ?? plant.plantedAt).toLocaleDateString([], { month: "short", day: "numeric" })}` : "Something growing";
              return <li key={i} className="garden-plot" title={name}><PlantArt species={plant.species} stage={stage} scale={2.4} /><span className="sr-only">{name}</span></li>;
            })}
          </ul>
          <span className="garden-pet" aria-hidden="true"><PixelPetSprite character={character} pose="happy" accessory={state.wearing} /></span>
        </div>
        <div className="garden-next">
          <span className="garden-next-art" aria-hidden="true">{growing ? <PlantArt species={growing.species} stage={stageOf(growing)} scale={2.2} /> : <PlantArt species="daisy" stage="seed" scale={2.2} />}</span>
          <div className="garden-next-copy">
            <span>{growing ? `${DROPS_TO_BLOOM - growing.drops} more ${DROPS_TO_BLOOM - growing.drops === 1 ? "drop" : "drops"} until it blooms.` : "Your next pause plants a new seed."}</span>
            <span className="garden-drops" role="img" aria-label={`${growing?.drops ?? 0} of ${DROPS_TO_BLOOM} drops`}>{Array.from({ length: DROPS_TO_BLOOM }, (_, i) => <i key={i} className={i < (growing?.drops ?? 0) ? "full" : ""} />)}</span>
          </div>
        </div>
        <p className="settings-hint">{grown} {grown === 1 ? "bloom" : "blooms"}, {kinds} of {SPECIES_IDS.length} kinds found. Some only grow in their season, or at night. Nothing here ever wilts.</p>
      </div>}

      {tab === "outfits" && <div className="panel-group" role="tabpanel" id="home-panel-outfits" aria-labelledby="home-tab-outfits" style={{ gap: 14 }}>
        <div className="wardrobe-preview"><PixelPetSprite character={character} pose={preview ? "happy" : "idle"} accessory={preview} /></div>
        <div className="wardrobe-grid" role="radiogroup" aria-label="Outfit">
          {ACCESSORY_IDS.map(id => {
            const open = available.includes(id);
            return <button key={id} type="button" role="radio" aria-checked={state.wearing === id} disabled={!open} className="wardrobe-item"
              onClick={() => wear(state.wearing === id ? null : id)}>
              <span className="wardrobe-art"><PixelArt art={WORN[id]} scale={2} /></span>
              {open ? ACCESSORIES[id].name : ACCESSORIES[id].hint}
            </button>;
          })}
        </div>
        <p className="settings-hint">Choose the one it’s wearing again to take it off. Some come off under headphones or behind a book.</p>
      </div>}

      {tab === "us" && <div className="panel-group" role="tabpanel" id="home-panel-us" aria-labelledby="home-tab-us" style={{ gap: 18 }}>
        <div className="panel-group">
          <p className="panel-label">{level.name}</p>
          <div className="panel-meter" role="progressbar" aria-label="Friendship" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress * 100)}><span style={{ width: `${level.progress * 100}%` }} /></div>
          <p className="settings-hint">{level.next ? `Next: ${level.next.name}. ` : ""}You grow closer by resting, petting and playing. Screen time never counts, and it never goes down.</p>
        </div>
        <div className="panel-group">
          <p className="panel-label">Mad on your behalf</p>
          {state.grudges.length > 0 && <ul className="grudges">{state.grudges.map(g => <li key={g.key}>
            <span>{g.label}<small>Faced {g.faced} {g.faced === 1 ? "time" : "times"}{g.beaten ? `, finished ${g.beaten}` : ""}</small></span>
            {onForgive && <button type="button" aria-label={`Forgive ${g.label}`} onClick={() => onForgive(g.key)}>Forgive</button>}
          </li>)}</ul>}
          <p className="settings-hint">{state.tantrums > 0 ? `${state.tantrums} ${state.tantrums === 1 ? "tantrum" : "tantrums"} thrown for you, ${state.beaten} dreaded ${state.beaten === 1 ? "thing" : "things"} finished together.` : `On something you’d rather not be doing? Open the menu and choose “Expand”. ${petName} will take it from there.`}</p>
        </div>
        <div className="panel-group">
          <p className="panel-label">Moments</p>
          <ul className="milestones">{MILESTONES.map(m => <li key={m.id} className={m.reached(state, now) ? "reached" : ""}>{m.text}</li>)}</ul>
        </div>
      </div>}
    </PanelShell>
  );
}
