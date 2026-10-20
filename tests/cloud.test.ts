import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { createRemoteDatabase } from "../server/remote-database.ts";
import { createApiWithDatabase } from "../server/app.ts";
import { dayStart } from "../server/schema.ts";
import { fly } from "./helpers.ts";
import type { Run, Snapshot, Submission } from "../shared/game.ts";

test("serverless instances share runs, scores, presence and rate limits through the database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "flappy-cloud-"));
  const url = `file:${join(directory, "remote.sqlite")}`;
  const admin = createClient({ url });
  const databases = [
    createRemoteDatabase(createClient({ url })),
    createRemoteDatabase(createClient({ url })),
  ];
  const apis = databases.map((database) =>
    createApiWithDatabase(database, 0, true),
  );
  const servers = apis.map((api) =>
    createServer(async (req, res) => {
      // Emulate Vercel's pre-parsed request body as well as the native request path.
      if (req.method === "POST") {
        let value = "";
        for await (const chunk of req) value += chunk;
        (req as typeof req & { body: unknown }).body = JSON.parse(value);
      }
      await api.handle(req, res);
    }),
  );
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)),
    ),
  );
  const bases = servers.map(
    (server) =>
      `http://127.0.0.1:${(server.address() as { port: number }).port}/api`,
  );
  const post = (instance: number, path: string, data: unknown) =>
    fetch(`${bases[instance]}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  const board = async (instance: number) =>
    (await (await fetch(`${bases[instance]}/leaderboard`)).json()) as Snapshot;
  const player = { playerId: "cloud-pilot-alice", name: "Cloud Alice" };
  try {
    assert.equal((await fetch(`${bases[0]}/health`)).status, 200);
    const info = await (await fetch(`${bases[0]}/info`)).json();
    assert.equal(info.mode, "public");
    assert.equal(info.transport, "poll");
    assert.deepEqual(info.addresses, []);
    assert.equal(
      (await fetch(`${bases[0]}/events?playerId=${player.playerId}`)).status,
      405,
    );
    assert.equal((await post(0, "presence", player)).status, 200);
    assert.equal((await post(1, "presence", player)).status, 200);
    await post(1, "presence", {
      playerId: "cloud-pilot-bobby",
      name: "Cloud Bob",
    });
    assert.equal((await board(0)).online, 2);
    const run = (await (await post(0, "runs", player)).json()) as Run;
    const { state, flaps } = fly(run.seed, 3);
    await admin.execute({
      sql: "UPDATE runs SET started_at=? WHERE id=?",
      args: [Date.now() - (state.tick / 60) * 1000, run.id],
    });
    const submission: Submission = {
      ...player,
      runId: run.id,
      score: state.score,
      ticks: state.tick,
      flaps,
    };
    assert.equal((await post(1, "scores", submission)).status, 201);
    const duplicates = await Promise.all([
      post(0, "scores", submission),
      post(1, "scores", submission),
    ]);
    assert.ok(duplicates.every((response) => response.status === 200));
    const a = await board(0),
      b = await board(1);
    assert.equal(a.totalGames, 1);
    assert.equal(b.totalGames, 1);
    assert.equal(b.all[0].score, state.score);
    await post(0, "profile", { ...player, name: "Renamed in A" });
    assert.equal((await board(1)).all[0].name, "Renamed in A");
    await admin.execute({
      sql: "UPDATE presence SET last_seen=? WHERE player_id=?",
      args: [Date.now() - 46_000, "cloud-pilot-bobby"],
    });
    assert.equal((await board(1)).online, 1);
    // Use alternating instances: in-memory rate counters would incorrectly allow this.
    for (let i = 0; i < 240; i++)
      assert.equal(
        await databases[i % 2].allowRequest!("test-shared-bucket"),
        true,
      );
    assert.equal(await databases[0].allowRequest!("test-shared-bucket"), false);
    await admin.execute({
      sql: "UPDATE request_limits SET expires_at=? WHERE key=?",
      args: [Date.now() - 1, "test-shared-bucket"],
    });
    assert.equal(await databases[1].allowRequest!("test-shared-bucket"), true);
    apis.forEach((api) => api.close());
    const fresh = createRemoteDatabase(createClient({ url }));
    assert.equal((await fresh.snapshot(0)).totalGames, 1);
    fresh.close();
  } finally {
    // Database clients are idempotent on close.
    apis.forEach((api) => api.close());
    admin.close();
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});
test("daily rankings use the explicit timezone, including the Shanghai midnight boundary", () => {
  const instant = Date.parse("2026-10-20T16:00:01Z");
  assert.equal(
    dayStart(instant, "Asia/Shanghai"),
    Date.parse("2026-10-20T16:00:00Z"),
  );
  assert.equal(
    dayStart(instant - 2000, "Asia/Shanghai"),
    Date.parse("2026-10-19T16:00:00Z"),
  );
  assert.equal(dayStart(instant, "UTC"), Date.parse("2026-10-20T00:00:00Z"));
});
test("cloud storage refuses missing credentials rather than writing a temporary SQLite file", () => {
  const keys = [
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "FLAPPY_BIRD_TURSO_DATABASE_URL",
    "FLAPPY_BIRD_TURSO_AUTH_TOKEN",
  ];
  const saved = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    assert.throws(() => createRemoteDatabase(), /TURSO_DATABASE_URL/);
  } finally {
    keys.forEach((key, i) => {
      if (saved[i] !== undefined) process.env[key] = saved[i];
    });
  }
});

test("default daily boundary stays in Shanghai even when the platform injects POSIX TZ", () => {
  const originalTZ = process.env.TZ;
  const originalRankingTZ = process.env.LEADERBOARD_TIMEZONE;
  const instant = Date.parse("2026-10-20T16:00:01Z");
  try {
    process.env.TZ = ":UTC";
    delete process.env.LEADERBOARD_TIMEZONE;
    assert.equal(dayStart(instant), Date.parse("2026-10-20T16:00:00Z"));
    process.env.LEADERBOARD_TIMEZONE = "UTC";
    assert.equal(dayStart(instant), Date.parse("2026-10-20T00:00:00Z"));
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
    if (originalRankingTZ === undefined)
      delete process.env.LEADERBOARD_TIMEZONE;
    else process.env.LEADERBOARD_TIMEZONE = originalRankingTZ;
  }
});
