import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA, BOARD_SQL, dayStart } from "./schema.ts";
import type { StoredRun } from "./types.ts";
import type { Leader, Snapshot, Submission } from "../shared/game.ts";

export function createDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; ${SCHEMA}`);
  return {
    db,
    close() {
      db.close();
    },
    player(id: string, name: string) {
      db.prepare(
        "INSERT INTO players VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at",
      ).run(id, name, Date.now());
    },
    newRun(id: string, playerId: string, seed: number, startedAt: number) {
      db.prepare(
        "INSERT INTO runs (id,player_id,seed,started_at) VALUES (?,?,?,?)",
      ).run(id, playerId, seed, startedAt);
    },
    getRun(id: string) {
      return db.prepare("SELECT * FROM runs WHERE id=?").get(id) as
        | StoredRun
        | undefined;
    },
    save(submission: Submission) {
      db.prepare(
        "UPDATE runs SET score=?, ticks=?, finished_at=? WHERE id=? AND score IS NULL",
      ).run(submission.score, submission.ticks, Date.now(), submission.runId);
    },
    snapshot(online: number): Snapshot {
      const board = (since: number) =>
        (db.prepare(BOARD_SQL).all(since) as Omit<Leader, "rank">[]).map(
          (row, i) => ({ ...row, rank: i + 1 }),
        );
      return {
        all: board(0),
        today: board(dayStart()),
        online,
        totalGames: Number(
          db
            .prepare("SELECT COUNT(*) AS n FROM runs WHERE score IS NOT NULL")
            .get()!.n,
        ),
        totalPlayers: Number(
          db
            .prepare(
              "SELECT COUNT(DISTINCT player_id) AS n FROM runs WHERE score IS NOT NULL",
            )
            .get()!.n,
        ),
        serverTime: Date.now(),
      };
    },
  };
}
