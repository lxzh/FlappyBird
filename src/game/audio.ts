import { useGameStore } from "../store";
let context: AudioContext | undefined;
export function unlockAudio() {
  if (!useGameStore.getState().sound) return;
  try {
    context ||= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    /* Audio is optional. */
  }
}
export function sound(kind: "flap" | "point" | "hit" | "start") {
  if (!useGameStore.getState().sound) return;
  try {
    unlockAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const time = context.currentTime;
    const [from, to, duration] =
      kind === "flap"
        ? [570, 880, 0.065]
        : kind === "point"
          ? [900, 1400, 0.14]
          : kind === "hit"
            ? [160, 45, 0.23]
            : [440, 880, 0.13];
    oscillator.type = kind === "hit" ? "triangle" : "square";
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
    gain.gain.setValueAtTime(0.035, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(time + duration);
  } catch {
    /* Browser audio can be unavailable without affecting gameplay. */
  }
}
