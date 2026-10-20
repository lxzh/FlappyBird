import { WORLD, type GameState } from "../../shared/game";
import { birdColors } from "../components/Bird";
import type { BirdColor, Phase } from "../store";
const sprite = [
  "....OOOOOOO.....",
  "...OYYYYYYYO....",
  "..OYYYYYWWWYO...",
  ".OYYYYYYWWKWWO..",
  "OYYHHYYYWWKWWO..",
  "OHHHHHYYWWWWWO..",
  "OHHHHHHYYYYOOOOO",
  ".OHHHYYYYYOAAAAO",
  "..OYYYYYYYOAAAAO",
  "...OOOOOOOOOOOO.",
];
function rect(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(Math.round(x), y);
  ctx.scale(scale, scale);
  const c = "#f3f9e9";
  rect(ctx, c, 0, 16, 100, 18);
  rect(ctx, c, 15, 5, 28, 29);
  rect(ctx, c, 42, 0, 30, 34);
  rect(ctx, c, 70, 11, 22, 23);
  rect(ctx, "#dfefe3", 4, 31, 92, 5);
  ctx.restore();
}
function pipe(ctx: CanvasRenderingContext2D, x: number, center: number) {
  const top = center - WORLD.gap / 2,
    bottom = center + WORLD.gap / 2,
    w = WORLD.pipeWidth;
  for (const [y, h] of [
    [-4, top + 4],
    [bottom, WORLD.floor - bottom],
  ]) {
    rect(ctx, "#426943", x, y, w, h);
    rect(ctx, "#85b96a", x + 4, y, w - 8, h);
    rect(ctx, "#c1da84", x + 8, y, 9, h);
    rect(ctx, "#a5ce75", x + 17, y, 10, h);
    rect(ctx, "#69a05b", x + w - 15, y, 10, h);
  }
  for (const y of [top - 26, bottom]) {
    rect(ctx, "#426943", x - 5, y, w + 10, 26);
    rect(ctx, "#91c174", x - 1, y + 4, w + 2, 18);
    rect(ctx, "#c4dc8d", x + 4, y + 4, 12, 18);
    rect(ctx, "#6ea45d", x + w - 12, y + 4, 11, 18);
    rect(ctx, "#d5e6a2", x - 1, y + 4, w + 2, 3);
  }
}
export function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState | null,
  phase: Phase,
  time: number,
  color: BirdColor,
  reduced: boolean,
) {
  const w = WORLD.width,
    floor = WORLD.floor;
  const moving =
    phase === "playing"
      ? state?.tick || 0
      : phase === "ready" || phase === "starting"
        ? reduced
          ? 0
          : time / 24
        : state?.tick || 0;
  rect(ctx, "#bee4df", 0, 0, w, WORLD.height);
  rect(ctx, "#d3eee3", 0, 285, w, 175);
  const scroll = moving * 0.15;
  cloud(ctx, ((((100 - scroll) % 1100) + 1100) % 1100) - 100, 70, 0.9);
  cloud(ctx, ((((505 - scroll * 0.6) % 1100) + 1100) % 1100) - 100, 48, 1.25);
  cloud(ctx, ((((900 - scroll) % 1100) + 1100) % 1100) - 100, 139, 0.8);
  // Quiet, layered pixel skyline.
  for (let i = -1; i < 21; i++) {
    const x = i * 55 - ((moving * 0.25) % 55),
      height = [49, 73, 104, 62, 83, 119, 57][(i + 21) % 7];
    rect(ctx, "#b1d8cd", x, 395 - height, 44, height + 32);
    rect(ctx, "#c0e1d4", x + 5, 400 - height, 6, height);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++)
        rect(ctx, "#cbe6d7", x + 13 + c * 9, 405 - height + r * 18, 4, 7);
  }
  for (let i = -1; i < 15; i++) {
    const x = i * 78 - ((moving * 0.5) % 78);
    rect(ctx, "#9fc4a7", x, 423, 79, 36);
    rect(ctx, "#a8cdb0", x + 9, 407, 53, 40);
    rect(ctx, "#b2d3b5", x + 19, 400, 31, 18);
    rect(ctx, "#c4deba", x + 23, 406, 10, 7);
  }
  if (state && phase !== "ready" && phase !== "starting")
    for (const p of state.pipes) pipe(ctx, p.x, p.center);
  else {
    pipe(ctx, -30, 255);
    pipe(ctx, 843, 250);
  }
  rect(ctx, "#527649", 0, floor, w, 5);
  rect(ctx, "#d2e3a2", 0, floor + 5, w, 13);
  for (let i = -1; i < 80; i++) {
    const x = i * 16 - ((moving * WORLD.speed) % 16);
    rect(ctx, "#9fbc6c", x, floor + 10, 8, 4);
    rect(ctx, "#9fbc6c", x - 4, floor + 14, 8, 4);
  }
  rect(ctx, "#6c8e51", 0, floor + 18, w, 4);
  rect(ctx, "#e6d9ad", 0, floor + 22, w, 39);
  rect(ctx, "#d7c99f", 0, floor + 28, w, 4);
  for (let i = 0; i < 70; i++)
    rect(ctx, "#cec095", i * 17 + 3, floor + 42 + (i % 3) * 6, 3, 3);
  const idle = phase === "ready" || phase === "starting";
  const x = idle ? w / 2 : WORLD.birdX,
    y = idle ? 236 + (reduced ? 0 : Math.sin(time / 230) * 7) : state?.y || 225;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  const angle = idle
    ? 0
    : Math.max(-0.34, Math.min(1.3, (state?.velocity || 0) * 0.065));
  ctx.rotate(angle);
  const palette: Record<string, string> = {
    O: "#364737",
    Y: birdColors[color],
    W: "#fffdf1",
    K: "#364737",
    H: "#fff0b1",
    A: "#ee8a51",
  };
  const pixel = idle ? 4 : 3;
  for (let row = 0; row < sprite.length; row++)
    for (let col = 0; col < sprite[row].length; col++)
      if (sprite[row][col] !== ".")
        rect(
          ctx,
          palette[sprite[row][col]],
          col * pixel - 8 * pixel,
          row * pixel - 5 * pixel,
          pixel,
          pixel,
        );
  if (!reduced && (idle || phase === "playing") && Math.floor(time / 110) % 2) {
    rect(ctx, "#e6aa45", -18, 3, 18, 6);
    rect(ctx, "#ffe8a0", -18, 0, 15, 6);
  }
  ctx.restore();
}
