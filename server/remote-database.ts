import { createClient, type Client } from "@libsql/client/web";
import type { Leader, Snapshot, Submission } from "../shared/game.ts";
import { SCHEMA, BOARD_SQL, dayStart } from "./schema.ts";
import type { GameDatabase, StoredRun } from "./types.ts";
import { getTursoConfig } from "./config.ts";

export function createRemoteDatabase(injectedClient?: Client): GameDatabase {
  let client: Client;
  if (injectedClient) client = injectedClient;
  else {
    const { url, authToken } = getTursoConfig();
    client = createClient({ url, authToken, intMode: "number" });
  }
  let initialization: Promise<void> | undefined;
  async function ready() {
    initialization ||= client.executeMultiple(SCHEMA).catch((error) => {
      initialization = undefined;
      throw error;
    });
    await initialization;
  }
  return {
    close() {
      client.close();
    },
    async health() {
      await ready();
      await client.execute("SELECT 1");
    },
    async player(id, name) {
      await ready();
      await client.execute({
        sql: "INSERT INTO players VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at",
        args: [id, name, Date.now()],
      });
    },
    async newRun(id, playerId, seed, startedAt) {
      await ready();
      await client.execute({
        sql: "INSERT INTO runs (id,player_id,seed,started_at) VALUES (?,?,?,?)",
        args: [id, playerId, seed, startedAt],
      });
    },
    async getRun(id) {
      await ready();
      const result = await client.execute({
        sql: "SELECT * FROM runs WHERE id=?",
        args: [id],
      });
      return result.rows[0] as unknown as StoredRun | undefined;
    },
    async save(input: Submission) {
      await ready();
      await client.execute({
        sql: "UPDATE runs SET score=?,ticks=?,finished_at=? WHERE id=? AND score IS NULL",
        args: [input.score, input.ticks, Date.now(), input.runId],
      });
    },
    async touch(playerId) {
      await ready();
      // Also remove expired leases so anonymous visits don't accumulate forever.
      const now = Date.now();
      await client.batch(
        [
          {
            sql: "INSERT INTO presence VALUES (?,?) ON CONFLICT(player_id) DO UPDATE SET last_seen=excluded.last_seen",
            args: [playerId, now],
          },
          {
            sql: "DELETE FROM presence WHERE last_seen<?",
            args: [now - 45_000],
          },
        ],
        "write",
      );
    },
    async allowRequest(key) {
      await ready();
      const now = Date.now();
      const result = await client.execute({
        sql: `INSERT INTO request_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING count`,
        args: [key, now + 60_000, now, now, now + 60_000],
      });
      if (Number(result.rows[0].count) === 1)
        await client.execute({
          sql: "DELETE FROM request_limits WHERE expires_at<?",
          args: [now - 60_000],
        });
      return Number(result.rows[0].count) <= 240;
    },
    async snapshot(_online): Promise<Snapshot> {
      await ready();
      const now = Date.now();
      const [all, today, counts, presence] = await client.batch(
        [
          { sql: BOARD_SQL, args: [0] },
          { sql: BOARD_SQL, args: [dayStart(now)] },
          "SELECT COUNT(*) AS games,COUNT(DISTINCT player_id) AS players FROM runs WHERE score IS NOT NULL",
          {
            sql: "SELECT COUNT(*) AS n FROM presence WHERE last_seen>=?",
            args: [now - 45_000],
          },
        ],
        "read",
      );
      const board = (rows: typeof all.rows) =>
        (rows as unknown as Omit<Leader, "rank">[]).map((row, i) => ({
          ...row,
          rank: i + 1,
        }));
      return {
        all: board(all.rows),
        today: board(today.rows),
        online: Number(presence.rows[0].n),
        totalGames: Number(counts.rows[0].games),
        totalPlayers: Number(counts.rows[0].players),
        serverTime: now,
      };
    },
  };
}
