import { useCallback, useEffect, useRef, useState } from "react";

const CHAR_MS = 45;
const ERASE_MS = 18;

/** The companion's speech bubble: types a line, leaves time to read it, then clears.
 * A pinned line stays until it is dismissed. */
export function useSpeech() {
  const [line, setLine] = useState({ text: "", pinned: false, id: 0 });
  const [shown, setShown] = useState("");
  const nextId = useRef(0);
  const say = useCallback((text: string) => setLine({ text, pinned: false, id: ++nextId.current }), []);
  const pin = useCallback((text: string) => setLine({ text, pinned: true, id: ++nextId.current }), []);
  const clear = useCallback(() => { setLine({ text: "", pinned: false, id: ++nextId.current }); setShown(""); }, []);

  useEffect(() => {
    const { text, pinned } = line;
    setShown("");
    if (!text) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const chars = [...text];
    let timer: ReturnType<typeof setInterval> | undefined;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const erase = () => {
      if (still) { setLine(current => ({ ...current, text: "" })); return; }
      let left = chars.length;
      timer = setInterval(() => {
        left -= 1;
        setShown(chars.slice(0, left).join(""));
        if (left <= 0) { clearInterval(timer); setLine(current => ({ ...current, text: "" })); }
      }, ERASE_MS);
    };
    const finished = () => { if (!pinned) wait = setTimeout(erase, 2200 + chars.length * 35); };
    if (still) { setShown(text); finished(); }
    else {
      let i = 0;
      timer = setInterval(() => {
        i += 1;
        setShown(chars.slice(0, i).join(""));
        if (i >= chars.length) { clearInterval(timer); finished(); }
      }, CHAR_MS);
    }
    return () => { clearInterval(timer); clearTimeout(wait); };
  }, [line.id]);

  return { shown, pinned: line.pinned && line.text !== "", say, pin, clear };
}
