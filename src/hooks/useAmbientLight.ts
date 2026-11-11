import { useEffect, useState } from "react";

export type AmbientLight = "day" | "dusk" | "night";

/** Rough light of the room the Mac is in, by local time. The companion picks up a
 * warmer, dimmer tone in the evening, the way the screen around it does with Night
 * Shift, instead of staying the brightest thing on a dark desktop. */
export function ambientLightAt(date: Date): AmbientLight {
  const hour = date.getHours();
  if (hour >= 21 || hour < 6) return "night";
  if (hour >= 18) return "dusk";
  return "day";
}

export function useAmbientLight(): AmbientLight {
  const [light, setLight] = useState(() => ambientLightAt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setLight(ambientLightAt(new Date())), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return light;
}
