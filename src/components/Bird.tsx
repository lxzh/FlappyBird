import type { BirdColor } from "../store";
export const birdColors: Record<BirdColor, string> = {
  gold: "#f8c74e",
  coral: "#f49a80",
  mint: "#9ec9a1",
  blue: "#96bfd9",
};
export function Bird({
  color = "gold",
  className = "",
}: {
  color?: BirdColor;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 36"
      fill="none"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        d="M12 4h22v4h5v6h4v14h-5v4H12v-4H5v-5H1V13h5V8h6z"
        fill="#334536"
      />
      <path
        d="M13 8h19v4h6v13h-5v3H13v-4H8v-5H5v-4h8z"
        fill={birdColors[color]}
      />
      <path d="M14 22h18v6H14z" fill="#eaa942" />
      <path d="M7 13h12v4h5v6H9v-4H5v-4h2z" fill="#ffedaa" />
      <path d="M26 8h9v4h4v11H26z" fill="#fffdf4" />
      <path d="M32 12h4v8h-4z" fill="#334536" />
      <path d="M31 22h16v7H31z" fill="#334536" />
      <path d="M34 23h12v3H34z" fill="#ed8650" />
    </svg>
  );
}
