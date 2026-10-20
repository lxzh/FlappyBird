// Fixed 60 Hz simulation is shared by the browser and score-verifying server.
export const WORLD = {
  width: 900,
  height: 520,
  floor: 459,
  birdX: 226,
  radius: 13,
  pipeWidth: 72,
  gap: 156,
  speed: 2.75,
  gravity: 0.34,
  jump: -5.9,
  spacing: 244,
  maxTicks: 60 * 60 * 20,
} as const;
export type Pipe = { x: number; center: number; passed: boolean };
export type GameState = {
  tick: number;
  y: number;
  velocity: number;
  score: number;
  alive: boolean;
  pipes: Pipe[];
  random: number;
};
export function createGame(seed: number): GameState {
  const state: GameState = {
    tick: 0,
    y: 225,
    velocity: 0,
    score: 0,
    alive: true,
    pipes: [],
    random: seed >>> 0 || 1,
  };
  for (let i = 0; i < 5; i++)
    state.pipes.push(makePipe(state, 710 + i * WORLD.spacing));
  return state;
}
function makePipe(state: GameState, x: number): Pipe {
  state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0;
  return { x, center: 143 + (state.random / 4294967296) * 172, passed: false };
}
export function stepGame(state: GameState, flap = false): GameState {
  if (!state.alive) return state;
  if (flap) state.velocity = WORLD.jump;
  state.velocity += WORLD.gravity;
  state.y += state.velocity;
  state.tick++;
  for (const pipe of state.pipes) {
    pipe.x -= WORLD.speed;
    if (!pipe.passed && pipe.x + WORLD.pipeWidth < WORLD.birdX - WORLD.radius) {
      pipe.passed = true;
      state.score++;
    }
    const overlaps =
      WORLD.birdX + WORLD.radius > pipe.x &&
      WORLD.birdX - WORLD.radius < pipe.x + WORLD.pipeWidth;
    if (
      overlaps &&
      (state.y - WORLD.radius < pipe.center - WORLD.gap / 2 ||
        state.y + WORLD.radius > pipe.center + WORLD.gap / 2)
    )
      state.alive = false;
  }
  if (state.pipes[0].x < -WORLD.pipeWidth) {
    state.pipes.shift();
    state.pipes.push(makePipe(state, state.pipes.at(-1)!.x + WORLD.spacing));
  }
  if (
    state.y + WORLD.radius >= WORLD.floor ||
    state.y - WORLD.radius <= 0 ||
    state.tick >= WORLD.maxTicks
  )
    state.alive = false;
  return state;
}
export function replay(
  seed: number,
  flaps: number[],
  ticks: number,
): GameState {
  const state = createGame(seed);
  let next = 0;
  for (let tick = 0; tick < ticks && state.alive; tick++) {
    const flap = flaps[next] === tick;
    if (flap) next++;
    stepGame(state, flap);
  }
  return state;
}
export type Leader = {
  id: string;
  name: string;
  score: number;
  games: number;
  lastPlayed: number;
  rank: number;
};
export type Snapshot = {
  all: Leader[];
  today: Leader[];
  online: number;
  totalGames: number;
  totalPlayers: number;
  serverTime: number;
};
export type Run = { id: string; seed: number; startedAt: number };
export type Submission = {
  runId: string;
  playerId: string;
  name: string;
  score: number;
  ticks: number;
  flaps: number[];
};

export type ConnectionInfo = {
  mode: "lan" | "public";
  transport: "sse" | "poll";
  addresses: string[];
  pollInterval: number;
  port: number;
};
