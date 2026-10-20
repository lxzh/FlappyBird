import { useCallback, useEffect, useRef } from "react";
import {
  createGame,
  stepGame,
  type GameState,
  type Run,
} from "../../shared/game";
import { useGameStore } from "../store";
import { newRun, syncScores } from "../api";
import { sound, unlockAudio } from "./audio";
import { draw } from "./render";
export function useEngine(canvas: React.RefObject<HTMLCanvasElement | null>) {
  const state = useRef<GameState | null>(null);
  const run = useRef<Run | null>(null);
  const flaps = useRef<number[]>([]);
  const input = useRef(false);
  const starting = useRef(false);
  const accumulator = useRef(0);
  const pause = useCallback(() => {
    const s = useGameStore.getState();
    if (s.phase === "playing") s.set({ phase: "paused" });
    else if (s.phase === "paused") {
      accumulator.current = 0;
      s.set({ phase: "playing" });
    }
  }, []);
  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    unlockAudio();
    useGameStore
      .getState()
      .set({ phase: "starting", score: 0, ticks: 0, syncState: "idle" });
    let next: Run;
    try {
      next = await newRun();
    } catch {
      next = {
        id: "offline",
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
        startedAt: Date.now(),
      };
    }
    run.current = next;
    state.current = createGame(next.seed);
    flaps.current = [];
    accumulator.current = 0;
    input.current = true;
    useGameStore.getState().set({
      phase: document.hidden ? "paused" : "playing",
      syncState: next.id === "offline" ? "practice" : "idle",
    });
    starting.current = false;
    sound("start");
  }, []);
  const flap = useCallback(() => {
    unlockAudio();
    const phase = useGameStore.getState().phase;
    if (phase === "ready") void start();
    else if (phase === "playing") input.current = true;
  }, [start]);
  useEffect(() => {
    let frame = 0,
      previous = 0;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const loop = (time: number) => {
      const store = useGameStore.getState(),
        game = state.current;
      const elapsed = previous ? Math.min(time - previous, 100) : 0;
      previous = time;
      if (store.phase === "playing" && game) {
        accumulator.current += elapsed;
        while (accumulator.current >= 1000 / 60 && game.alive) {
          const pressed = input.current;
          input.current = false;
          if (pressed) {
            flaps.current.push(game.tick);
            sound("flap");
          }
          const oldScore = game.score;
          stepGame(game, pressed);
          accumulator.current -= 1000 / 60;
          if (game.score !== oldScore) {
            sound("point");
            store.set({ score: game.score });
          }
          if (!game.alive) {
            sound("hit");
            store.finish(game.score, game.tick);
            const current = run.current;
            if (current && current.id !== "offline") {
              store.enqueue({
                runId: current.id,
                playerId: store.playerId,
                name: store.name,
                score: game.score,
                ticks: game.tick,
                flaps: [...flaps.current],
              });
              void syncScores();
            } else store.set({ syncState: "practice" });
          }
        }
      } else accumulator.current = 0;
      const ctx = canvas.current?.getContext("2d");
      if (ctx) {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(900 * ratio);
        const height = Math.round(520 * ratio);
        if (
          canvas.current!.width !== width ||
          canvas.current!.height !== height
        ) {
          canvas.current!.width = width;
          canvas.current!.height = height;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.imageSmoothingEnabled = false;
        const latest = useGameStore.getState();
        draw(ctx, state.current, latest.phase, time, latest.color, reduced);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,[role="dialog"]')) return;
      if (event.code === "Space" || event.code === "ArrowUp") {
        if (target.closest('button,[role="tab"]')) return;
        event.preventDefault();
        if (!event.repeat) flap();
      } else if (event.code === "KeyP" || event.code === "Escape") {
        event.preventDefault();
        pause();
      }
    };
    const visibility = () => {
      if (document.hidden && useGameStore.getState().phase === "playing")
        useGameStore.getState().set({ phase: "paused" });
    };
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [canvas, flap, pause]);
  return { start, flap, pause };
}
