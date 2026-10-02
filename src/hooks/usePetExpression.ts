import { useEffect, useState } from "react";
import type { PetActivity } from "./usePetBehavior";
import type { PetPose } from "../types/pixelPets";
import type { CompanionId } from "../types/appearance";

interface ExpressionContext {
  character: CompanionId; activity: PetActivity; outing: "rest" | "walk" | "sniff" | "home";
  adventurePose?: PetPose;
  transitioning: boolean; hovered: boolean; dragging: boolean; petted: number;
  near: boolean; busy: boolean; energy: number; reducedMotion: boolean;
}
export function usePetExpression(c: ExpressionContext) {
  const [reaction, setReaction] = useState<PetPose | null>(null);
  const [habit, setHabit] = useState<PetPose | null>(null);
  const [blinking, setBlinking] = useState(false);
  const [step, setStep] = useState(false);
  useEffect(() => {
    if (!c.petted) return;
    setReaction("happy");
    if (c.reducedMotion) {
      const finish = setTimeout(() => setReaction(null), 2200);
      return () => clearTimeout(finish);
    }
    const laugh = setTimeout(() => setReaction("delighted"), 450);
    const settle = setTimeout(() => setReaction("happy"), 1350);
    const finish = setTimeout(() => setReaction(null), 2200);
    return () => { clearTimeout(laugh); clearTimeout(settle); clearTimeout(finish); };
  }, [c.petted, c.reducedMotion]);
  useEffect(() => {
    setHabit(null);
    setBlinking(false);
    if (c.reducedMotion || c.dragging || c.hovered || c.busy || c.transitioning || c.outing !== "rest" || c.activity === "sleep" || reaction) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (callback: () => void, ms: number) => {
      const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms);
      timers.add(timer);
    };
    const working = c.activity !== "idle";
    let last: PetPose | null = null;
    const blink = () => later(() => {
      setBlinking(true);
      later(() => { setBlinking(false); blink(); }, 140);
    }, 3800 + Math.random() * 4200);
    const habit = () => later(() => {
      const options: PetPose[] = c.energy <= 2 ? ["yawn", "groom", "stretch"]
        : c.character === "cat" ? ["groom", "stretch", "curious"]
        : c.character === "capybara" ? ["yawn", "curious", "stretch"]
        : ["stretch", "groom", "curious"];
      const choices = options.filter(pose => pose !== last);
      last = choices[Math.floor(Math.random() * choices.length)];
      setHabit(last);
      later(() => { setHabit(null); habit(); }, last === "curious" ? 1600 : 2600);
    }, (working ? 42000 : c.energy <= 2 ? 10000 : 16000) + Math.random() * (working ? 22000 : 12000));
    if (!working) blink();
    habit();
    return () => timers.forEach(clearTimeout);
  }, [c.character, c.activity, c.outing, c.reducedMotion, c.dragging, c.hovered, c.busy, c.transitioning, c.energy, reaction]);
  useEffect(() => {
    if (c.reducedMotion || (c.outing !== "walk" && c.outing !== "home")) return;
    const timer = setInterval(() => setStep(value => !value), 260);
    return () => clearInterval(timer);
  }, [c.outing, c.reducedMotion]);

  let pose: PetPose;
  if (c.dragging) pose = "lifted";
  else if (reaction) pose = reaction;
  else if (c.hovered) pose = "curious";
  else if (c.transitioning) pose = "idle";
  else if (c.adventurePose && c.outing === "rest") pose = c.adventurePose;
  else if (c.activity === "sleep" && c.outing === "rest") pose = "sleep";
  else if (c.outing === "walk" || c.outing === "home") pose = step ? "walkA" : "walkB";
  else if (c.outing === "sniff") pose = c.adventurePose ?? "curious";
  else if (habit) pose = habit;
  else if (c.activity === "idle") pose = blinking ? "blink" : c.near ? "curious" : "idle";
  else if (c.activity === "social") pose = "curious";
  else pose = c.activity;
  return { pose, reacting: reaction !== null };
}
