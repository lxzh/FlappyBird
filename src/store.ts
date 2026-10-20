import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Snapshot, Submission } from "../shared/game";

export type Phase = "ready" | "starting" | "playing" | "paused" | "over";
export type BirdColor = "gold" | "coral" | "mint" | "blue";
const empty: Snapshot = {
  all: [],
  today: [],
  online: 0,
  totalGames: 0,
  totalPlayers: 0,
  serverTime: 0,
};
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
type State = {
  playerId: string;
  name: string;
  color: BirdColor;
  sound: boolean;
  best: number;
  newBest: boolean;
  games: number;
  totalScore: number;
  phase: Phase;
  score: number;
  ticks: number;
  connected: boolean;
  mode: "lan" | "public";
  addresses: string[];
  snapshot: Snapshot;
  pending: Submission[];
  syncState: "idle" | "syncing" | "saved" | "pending" | "practice" | "error";
  set: (patch: Partial<State>) => void;
  finish: (score: number, ticks: number) => void;
  enqueue: (submission: Submission) => void;
  dequeue: (runId: string) => void;
};
export const useGameStore = create<State>()(
  persist(
    (set) => ({
      playerId: newId(),
      name: `飞行员 ${String(Math.floor(Math.random() * 900) + 100)}`,
      color: "gold",
      sound: true,
      best: 0,
      newBest: false,
      games: 0,
      totalScore: 0,
      phase: "ready",
      score: 0,
      ticks: 0,
      connected: false,
      mode: "lan",
      addresses: [],
      snapshot: empty,
      pending: [],
      syncState: "idle",
      set: (patch) => set(patch),
      finish: (score, ticks) =>
        set((s) => ({
          phase: "over",
          score,
          ticks,
          best: Math.max(s.best, score),
          newBest: score > s.best,
          games: s.games + 1,
          totalScore: s.totalScore + score,
        })),
      enqueue: (submission) =>
        set((s) => ({
          pending: [
            ...s.pending.filter((p) => p.runId !== submission.runId),
            submission,
          ],
          syncState: "pending",
        })),
      dequeue: (runId) =>
        set((s) => ({ pending: s.pending.filter((p) => p.runId !== runId) })),
    }),
    {
      name: "flappy-club-v1",
      partialize: (s) => ({
        playerId: s.playerId,
        name: s.name,
        color: s.color,
        sound: s.sound,
        best: s.best,
        games: s.games,
        totalScore: s.totalScore,
        pending: s.pending,
      }),
    },
  ),
);
