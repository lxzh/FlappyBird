import { createGame, stepGame, WORLD } from "../shared/game.ts";
export function fly(seed: number, stopAtScore = 5) {
  const state = createGame(seed);
  const flaps: number[] = [];
  while (state.alive) {
    const target = state.pipes.find(
      (pipe) => pipe.x + WORLD.pipeWidth > WORLD.birdX - WORLD.radius,
    )!.center;
    const flap =
      state.tick === 0 ||
      (state.score < stopAtScore &&
        state.y > target + 12 &&
        state.velocity > 0);
    if (flap) flaps.push(state.tick);
    stepGame(state, flap);
  }
  return { state, flaps };
}
