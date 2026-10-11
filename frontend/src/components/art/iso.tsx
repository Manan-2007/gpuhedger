import { useId } from "react";

/*
 * Isometric art system: original, decorative, inline SVG only (no rasters, no WebGL).
 * World axes: x runs right-down, y runs left-down, z runs up. One world unit = U px.
 * Face shading derives from a single colour token: top = 25% lighter, left = the token,
 * right = 35% darker. Decoration only: never use these colours to carry financial meaning.
 */

const U = 16;
const COS = Math.cos(Math.PI / 6);

export type Pt3 = [number, number, number];

export function project([x, y, z]: Pt3): [number, number] {
  return [(x - y) * U * COS, (x + y) * U * 0.5 - z * U];
}

const pts = (corners: Pt3[]) => corners.map((c) => project(c).map((v) => v.toFixed(2)).join(",")).join(" ");

export const shade = {
  top: (c: string) => `color-mix(in oklab, ${c} 75%, white)`,
  left: (c: string) => c,
  right: (c: string) => `color-mix(in oklab, ${c} 65%, black)`,
};

/** Deterministic PRNG so pixel mosaics are stable between renders. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Leds {
  face: "left" | "right";
  color: string;
  /** 0..1 share of lit cells. */
  density?: number;
  seed?: number;
  cell?: number; // world units
}

export interface BlockSpec {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  color: string;
  leds?: Leds;
  /** Pixel dither on the top face. */
  dither?: boolean;
  float?: number; // animation delay in seconds; undefined = static
  opacity?: number;
}

function face(points: string, fill: string) {
  return <polygon points={points} style={{ fill, stroke: fill }} strokeWidth={0.6} strokeLinejoin="round" />;
}

function LedCells({ b, leds }: { b: BlockSpec; leds: Leds }) {
  const z0 = b.z ?? 0;
  const cell = leds.cell ?? 0.42;
  const gap = cell * 0.35;
  const rand = rng(leds.seed ?? Math.round((b.x + 1) * 97 + (b.y + 1) * 31 + b.h * 7));
  const along = leds.face === "right" ? b.d : b.w;
  const cols = Math.max(1, Math.floor((along - gap) / (cell + gap)));
  const rows = Math.max(1, Math.floor((b.h - gap * 2) / (cell + gap)));
  const out: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = rand();
      if (v > (leds.density ?? 0.45)) continue;
      const a = gap + c * (cell + gap);
      const z = z0 + gap * 2 + r * (cell + gap);
      const corners: Pt3[] =
        leds.face === "right"
          ? [
              [b.x + b.w, b.y + a, z],
              [b.x + b.w, b.y + a + cell, z],
              [b.x + b.w, b.y + a + cell, z + cell],
              [b.x + b.w, b.y + a, z + cell],
            ]
          : [
              [b.x + a, b.y + b.d, z],
              [b.x + a + cell, b.y + b.d, z],
              [b.x + a + cell, b.y + b.d, z + cell],
              [b.x + a, b.y + b.d, z + cell],
            ];
      out.push(<polygon key={`${r}-${c}`} points={pts(corners)} style={{ fill: leds.color, opacity: 0.35 + v }} />);
    }
  }
  return <>{out}</>;
}

export function IsoBlock({ b, ditherId }: { b: BlockSpec; ditherId?: string }) {
  const z = b.z ?? 0;
  const { x, y, w, d, h, color } = b;
  const top = pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]);
  const left = pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]);
  const right = pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]);
  return (
    <g
      className={b.float !== undefined ? "iso-float" : undefined}
      style={{ opacity: b.opacity, animationDelay: b.float !== undefined ? `${b.float}s` : undefined }}
    >
      {face(left, shade.left(color))}
      {face(right, shade.right(color))}
      {face(top, shade.top(color))}
      {b.dither && ditherId && <polygon points={top} fill={`url(#${ditherId})`} />}
      {b.leds && <LedCells b={b} leds={b.leds} />}
    </g>
  );
}

/** A polyline in world space, e.g. the payoff "hockey stick" running through a scene. */
export interface Stroke {
  points: Pt3[];
  color: string;
  width?: number;
  glow?: boolean;
}

/** Renders blocks back to front (painter's order) with a viewBox fitted to the content. */
export function IsoScene({
  blocks,
  strokes = [],
  className = "",
  pad = 8,
  title,
}: {
  blocks: BlockSpec[];
  strokes?: Stroke[];
  className?: string;
  pad?: number;
  title?: string;
}) {
  const id = useId().replace(/:/g, "");
  const ditherId = `dither-${id}`;
  const glowId = `glow-${id}`;

  const all: Pt3[] = [];
  for (const b of blocks) {
    const z = b.z ?? 0;
    for (const dx of [0, b.w]) for (const dy of [0, b.d]) for (const dz of [0, b.h]) all.push([b.x + dx, b.y + dy, z + dz]);
  }
  for (const s of strokes) all.push(...s.points);
  const xy = all.map(project);
  const minX = Math.min(...xy.map((p) => p[0])) - pad;
  const maxX = Math.max(...xy.map((p) => p[0])) + pad;
  const minY = Math.min(...xy.map((p) => p[1])) - pad - 10; // headroom for floating
  const maxY = Math.max(...xy.map((p) => p[1])) + pad;

  const ordered = [...blocks].sort((a, b) => a.x + a.y - (b.x + b.y) || (a.z ?? 0) - (b.z ?? 0));

  return (
    <svg
      viewBox={`${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <pattern id={ditherId} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="white" opacity="0.18" />
          <rect x="2" y="2" width="2" height="2" fill="white" opacity="0.1" />
        </pattern>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {ordered.map((b, i) => (
        <IsoBlock key={i} b={b} ditherId={ditherId} />
      ))}
      {strokes.map((s, i) => (
        <polyline
          key={i}
          points={pts(s.points)}
          fill="none"
          style={{ stroke: s.color }}
          strokeWidth={s.width ?? 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={s.glow ? `url(#${glowId})` : undefined}
        />
      ))}
    </svg>
  );
}
