/** Soft synthesized sounds and spoken steps. Both are off unless turned on in Settings. */

let context: AudioContext | null = null;
export type SoundId = "start" | "step" | "end" | "bloom";
const NOTES: Record<SoundId, number[]> = {
  start: [523.25, 659.25], step: [587.33], end: [659.25, 523.25, 783.99], bloom: [523.25, 659.25, 783.99, 1046.5],
};

export function playSound(id: SoundId, enabled: boolean): void {
  if (!enabled || typeof AudioContext === "undefined") return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const start = context.currentTime + 0.02;
    NOTES[id].forEach((frequency, index) => {
      const at = start + index * 0.13;
      const tone = context!.createOscillator(), gain = context!.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.05, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      tone.connect(gain).connect(context!.destination);
      tone.start(at);
      tone.stop(at + 0.55);
    });
  } catch (error) {
    console.error("Could not play a sound:", error);
  }
}

export function speak(text: string, enabled: boolean): void {
  if (!enabled || typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.volume = 0.8;
  speechSynthesis.speak(utterance);
}
export function stopSpeaking(): void {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
