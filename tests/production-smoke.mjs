// Run after `npm run build`: verifies the actual compiled server and static app.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createGame, stepGame, WORLD } from "../dist-server/shared/game.js";

const temp = mkdtempSync(join(tmpdir(), "flappy-production-"));
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
let child,
  output = "";
const controllers = [];
async function launch() {
  output = "";
  child = spawn(process.execPath, [resolve("dist-server/server/index.js")], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DATABASE_PATH: join(temp, "scores.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await delay(50);
  }
  throw new Error(`Production startup timed out: ${output}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
}
async function post(path, data) {
  const response = await fetch(`${base}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
}
function fly(seed, goal) {
  const state = createGame(seed),
    flaps = [];
  while (state.alive) {
    const target = state.pipes.find(
      (p) => p.x + WORLD.pipeWidth > WORLD.birdX - WORLD.radius,
    ).center;
    const pressed =
      state.tick === 0 ||
      (state.score < goal && state.y > target + 12 && state.velocity > 0);
    if (pressed) flaps.push(state.tick);
    stepGame(state, pressed);
  }
  return { state, flaps };
}
try {
  await launch();
  const html = await (await fetch(base)).text();
  assert.match(html, /Flappy Bird/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(
    (m) => m[1],
  );
  assert.ok(assets.length >= 2);
  for (const path of [
    ...assets,
    "/fonts/dm-sans-latin.woff2",
    "/fonts/space-grotesk-latin.woff2",
    "/favicon.svg",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  const readers = [];
  for (const playerId of ["smoke-alice", "smoke-bobby"]) {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${base}/api/events?playerId=${playerId}`, {
      signal: controller.signal,
    });
    readers.push(response.body.getReader());
  }
  const submissions = [];
  for (const [playerId, name, goal] of [
    ["smoke-alice", "Smoke Alice", 3],
    ["smoke-bobby", "Smoke Bob", 1],
  ]) {
    const run = await post("runs", { playerId, name });
    const { state, flaps } = fly(run.seed, goal);
    assert.ok(state.score >= goal);
    submissions.push({
      runId: run.id,
      playerId,
      name,
      score: state.score,
      ticks: state.tick,
      flaps,
    });
  }
  // Use real elapsed time, with no server clock or database manipulation.
  await delay(
    Math.ceil((Math.max(...submissions.map((s) => s.ticks)) / 60) * 1000) + 100,
  );
  await Promise.all(submissions.map((s) => post("scores", s)));
  for (const reader of readers) {
    let data = "";
    while (true) {
      const chunk = await reader.read();
      data += new TextDecoder().decode(chunk.value);
      if (
        data
          .split("\n")
          .slice(0, -1)
          .some(
            (line) =>
              line.startsWith("data: ") &&
              JSON.parse(line.slice(6)).totalGames === 2,
          )
      )
        break;
    }
  }
  const before = await (await fetch(`${base}/api/leaderboard`)).json();
  assert.equal(before.online, 2);
  assert.equal(before.totalGames, 2);
  assert.equal(before.all[0].name, "Smoke Alice");
  controllers.forEach((c) => c.abort());
  await stop();
  await launch();
  const after = await (await fetch(`${base}/api/leaderboard`)).json();
  assert.equal(after.totalGames, 2);
  assert.equal(after.all[0].score, before.all[0].score);
  assert.equal(after.online, 0);
  console.log(
    "PASS: compiled production server, HTML / JS / CSS / local fonts, real-time verified flights, two-client SSE, and persistence after restart.",
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  controllers.forEach((c) => c.abort());
  await stop();
  rmSync(temp, { recursive: true, force: true });
}
