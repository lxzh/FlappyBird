import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, stepGame, replay, WORLD } from "../shared/game.ts";
import { fly } from "./helpers.ts";

test("a real flight scores pipes, terminates on collision, and replays identically", () => {
  for (const seed of [1, 24, 58723, 0xfffffffe]) {
    const { state, flaps } = fly(seed, 8);
    assert.ok(state.score >= 3, `seed ${seed} should clear multiple pipes`);
    assert.equal(state.alive, false);
    assert.deepEqual(replay(seed, flaps, state.tick), state);
  }
});
test("gravity causes ground collision without input and stops at death", () => {
  const state = createGame(42);
  while (state.alive) stepGame(state);
  assert.equal(state.score, 0);
  assert.ok(state.y + WORLD.radius >= WORLD.floor);
  const tick = state.tick;
  stepGame(state, true);
  assert.equal(state.tick, tick);
});
test("excessive flapping hits the ceiling", () => {
  const state = createGame(12);
  while (state.alive) stepGame(state, true);
  assert.ok(state.y - WORLD.radius <= 0);
  assert.equal(state.score, 0);
});
test("seeded pipe tracks are deterministic and produce varied courses", () => {
  assert.deepEqual(createGame(55).pipes, createGame(55).pipes);
  assert.notDeepEqual(createGame(55).pipes, createGame(56).pipes);
  const state = createGame(55);
  assert.ok(
    state.pipes.every(
      (pipe) =>
        pipe.center - WORLD.gap / 2 > 0 &&
        pipe.center + WORLD.gap / 2 < WORLD.floor,
    ),
  );
});
