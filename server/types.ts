import type { Snapshot, Submission } from "../shared/game.ts";
type MaybePromise<T> = T | Promise<T>;
export type StoredRun = {
  id: string;
  player_id: string;
  seed: number;
  started_at: number;
  score: number | null;
  ticks: number | null;
};
export interface GameDatabase {
  player(id: string, name: string): MaybePromise<void>;
  newRun(
    id: string,
    playerId: string,
    seed: number,
    startedAt: number,
  ): MaybePromise<void>;
  getRun(id: string): MaybePromise<StoredRun | undefined>;
  save(submission: Submission): MaybePromise<void>;
  snapshot(online: number): MaybePromise<Snapshot>;
  close(): void;
  health?(): Promise<void>;
  touch?(playerId: string): Promise<void>;
  allowRequest?(key: string): Promise<boolean>;
}
