import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "../server/app.ts";
import { dayStart } from "../server/schema.ts";
import { createDatabase } from "../server/database.ts";
import type { Run, Snapshot, Submission } from "../shared/game.ts";
import { fly } from "./helpers.ts";

async function fixture() {
  const api = createApi(":memory:", 0);
  const server = createServer((req, res) => {
    void api.handle(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, data: unknown, origin?: string) =>
    fetch(`${base}/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(data),
    });
  const board = async () =>
    (await (await fetch(`${base}/api/leaderboard`)).json()) as Snapshot;
  async function round(playerId: string, name: string, stop = 5) {
    const response = await post("runs", { playerId, name });
    assert.equal(response.status, 201);
    const run = (await response.json()) as Run;
    const { state, flaps } = fly(run.seed, stop);
    // Integration test advances server clock for the real replay, instead of sleeping.
    api.database.db
      .prepare("UPDATE runs SET started_at=? WHERE id=?")
      .run(Date.now() - (state.tick / 60) * 1000 - 100, run.id);
    const submission: Submission = {
      runId: run.id,
      playerId,
      name,
      score: state.score,
      ticks: state.tick,
      flaps,
    };
    return { run, submission };
  }
  async function close() {
    api.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return { api, base, post, board, round, close };
}

test("verified multiplayer scores rank by best result and are idempotent", async () => {
  const f = await fixture();
  try {
    const alice = await f.round("player-alice", "Alice", 7);
    const bob = await f.round("player-bobby", "Bob", 3);
    assert.equal((await f.post("scores", alice.submission)).status, 201);
    assert.equal((await f.post("scores", bob.submission)).status, 201);
    const duplicate = await f.post("scores", alice.submission);
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicate, true);
    const board = await f.board();
    assert.equal(board.totalGames, 2);
    assert.equal(board.totalPlayers, 2);
    assert.equal(board.all[0].id, "player-alice");
    assert.equal(board.all[0].score, alice.submission.score);
    assert.equal(board.today.length, 2);
    const low = await f.round("player-alice", "Alice renamed", 1);
    assert.equal((await f.post("scores", low.submission)).status, 201);
    const updated = await f.board();
    assert.equal(updated.totalGames, 3);
    assert.equal(updated.all[0].name, "Alice renamed");
    assert.equal(updated.all[0].score, alice.submission.score);
    assert.equal(updated.all[0].games, 2);
  } finally {
    await f.close();
  }
});

test("forged scores, unfinished flights, invalid inputs and another player are rejected", async () => {
  const f = await fixture();
  try {
    const { submission } = await f.round("player-alice", "Alice");
    assert.equal(
      (await f.post("scores", { ...submission, score: 9999 })).status,
      422,
    );
    assert.equal(
      (
        await f.post("scores", {
          ...submission,
          ticks: 1,
          score: 0,
          flaps: [0],
        })
      ).status,
      422,
    );
    assert.equal(
      (await f.post("scores", { ...submission, flaps: [0, 0] })).status,
      400,
    );
    assert.equal(
      (await f.post("scores", { ...submission, flaps: [-1] })).status,
      400,
    );
    assert.equal(
      (await f.post("scores", { ...submission, ticks: Infinity })).status,
      400,
    );
    assert.equal(
      (await f.post("scores", { ...submission, playerId: "player-other" }))
        .status,
      404,
    );
    assert.equal(
      (await f.post("runs", { playerId: "bad", name: "Alice" })).status,
      400,
    );
    assert.equal(
      (await f.post("runs", { playerId: "player-alice", name: "x".repeat(17) }))
        .status,
      400,
    );
    assert.equal((await f.post("runs", null)).status, 400);
    assert.equal(
      (
        await f.post(
          "runs",
          { playerId: "player-alice", name: "Alice" },
          "https://foreign.example",
        )
      ).status,
      403,
    );
    assert.equal((await f.board()).totalGames, 0);
  } finally {
    await f.close();
  }
});

test("a delayed upload after reconnect is accepted once", async () => {
  const f = await fixture();
  try {
    const { submission } = await f.round("player-alice", "Offline pilot", 4);
    f.api.database.db
      .prepare("UPDATE runs SET started_at=started_at-86400000 WHERE id=?")
      .run(submission.runId);
    assert.equal((await f.post("scores", submission)).status, 201);
    assert.equal((await f.post("scores", submission)).status, 200);
    assert.equal((await f.board()).totalGames, 1);
  } finally {
    await f.close();
  }
});

test("SSE pushes scores to two clients and deduplicates online player identities", async () => {
  const f = await fixture();
  const controllerA = new AbortController(),
    controllerB = new AbortController(),
    controllerC = new AbortController();
  try {
    const a = await fetch(`${f.base}/api/events?playerId=player-alice`, {
      signal: controllerA.signal,
    });
    const b = await fetch(`${f.base}/api/events?playerId=player-bobby`, {
      signal: controllerB.signal,
    });
    const c = await fetch(`${f.base}/api/events?playerId=player-alice`, {
      signal: controllerC.signal,
    });
    const readerA = a.body!.getReader(),
      readerB = b.body!.getReader();
    assert.equal((await f.board()).online, 2);
    const { submission } = await f.round("player-alice", "Alice", 2);
    assert.equal((await f.post("scores", submission)).status, 201);
    async function readScore(reader: ReadableStreamDefaultReader<Uint8Array>) {
      let data = "";
      const decoder = new TextDecoder();
      for (let count = 0; count < 10; count++) {
        const result = await reader.read();
        data += decoder.decode(result.value);
        const lines = data
          .split("\n")
          .slice(0, -1)
          .filter((line) => line.startsWith("data: "));
        if (
          lines.some(
            (line) => (JSON.parse(line.slice(6)) as Snapshot).totalGames === 1,
          )
        )
          return;
      }
      assert.fail("No score snapshot arrived");
    }
    await Promise.all([readScore(readerA), readScore(readerB)]);
    controllerB.abort();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal((await f.board()).online, 1);
    await c.body!.cancel();
  } finally {
    controllerA.abort();
    controllerB.abort();
    controllerC.abort();
    await f.close();
  }
});

test("SQLite persists records across restarts, separates days and uses best-score tie times", () => {
  const dir = mkdtempSync(join(tmpdir(), "flappy-test-")),
    path = join(dir, "scores.sqlite");
  let database = createDatabase(path);
  try {
    const now = dayStart() + 12 * 3600_000;
    database.player("player-alice", "Alice");
    database.player("player-bobby", "Bob");
    function insert(id: string, player: string, score: number, time: number) {
      database.newRun(id, player, 1, time - 1000);
      database.db
        .prepare("UPDATE runs SET score=?, ticks=100, finished_at=? WHERE id=?")
        .run(score, time, id);
    }
    insert("old-flight", "player-alice", 20, now - 3 * 86400000);
    insert("first-low", "player-alice", 0, now - 6000);
    insert("bobs-best", "player-bobby", 5, now - 5000);
    insert("alices-best", "player-alice", 5, now - 4000);
    assert.equal(database.snapshot(0).all[0].score, 20);
    assert.equal(database.snapshot(0).today[0].id, "player-bobby");
    database.db.close();
    database = createDatabase(path);
    assert.equal(database.snapshot(0).totalGames, 4);
    assert.equal(
      database.snapshot(0).today.find((p) => p.id === "player-alice")!.score,
      5,
    );
  } finally {
    database.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
