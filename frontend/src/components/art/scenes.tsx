import { IsoScene, type BlockSpec, type Stroke } from "./iso";

/* Decorative palette (tokens in index.css). */
const SLATE = "var(--color-art-2)";
const SLATE_DARK = "var(--color-art-1)";
const LIME = "var(--color-primary)";
const BLUE = "var(--color-secondary)";
const PURPLE = "var(--color-put)";
const TEAL = "var(--color-pos)";
const AMBER = "var(--color-warn)";

const HEIGHTS = [
  [7, 9.5, 6, 10.5, 8, 5.5],
  [5, 7, 4, 8, 6, 4.5],
  [3, 4.5, 2.5, 5, 3.5, 2.5],
];
const LED_COLORS = [BLUE, LIME, TEAL, BLUE, PURPLE, LIME];

/** Data-centre skyline: GPU racks on a platform, floating cubes, and the payoff hockey-stick through it. */
export function HeroSkyline({ className = "" }: { className?: string }) {
  const blocks: BlockSpec[] = [{ x: -0.4, y: -0.4, z: -0.7, w: 14.4, d: 9.4, h: 0.7, color: SLATE_DARK, dither: true }];
  HEIGHTS.forEach((row, j) =>
    row.forEach((h, i) => {
      const accent = (i === 3 && j === 0 && BLUE) || (i === 1 && j === 1 && PURPLE) || undefined;
      blocks.push({
        x: 0.4 + i * 2.25,
        y: 0.4 + j * 2.9,
        w: 1.6,
        d: 2.1,
        h,
        color: accent || SLATE,
        leds: { face: (i + j) % 2 ? "right" : "left", color: LED_COLORS[(i + j * 2) % LED_COLORS.length], density: 0.5, seed: i * 13 + j * 7 + 1 },
      });
    }),
  );
  // Lime highlight blocks on top of two racks
  blocks.push({ x: 0.4 + 3 * 2.25 + 0.3, y: 0.4 + 0.4, z: 10.5, w: 1, d: 1, h: 1, color: LIME });
  blocks.push({ x: 0.4 + 4 * 2.25 + 0.3, y: 0.4 + 2.9 + 0.5, z: 6, w: 1, d: 1, h: 1, color: LIME });
  // Floating cubes at different depths
  blocks.push({ x: 2.5, y: -3, z: 13.5, w: 1.3, d: 1.3, h: 1.3, color: PURPLE, float: 0 });
  blocks.push({ x: 11.5, y: 0.5, z: 14.5, w: 1.1, d: 1.1, h: 1.1, color: LIME, float: 1.6 });
  blocks.push({ x: 14, y: 6, z: 9, w: 0.9, d: 0.9, h: 0.9, color: AMBER, float: 3.1, opacity: 0.9 });

  // Capped call payoff: flat (premium) → protection kicks in at the strike → capped. Drawn along the
  // (1, −1, 0) direction, which projects to a screen-horizontal line, so it reads as a chart, not a zigzag.
  const on = (t: number, z: number): [number, number, number] => [10 + t, 10 - t, z];
  const strokes: Stroke[] = [{ points: [on(-8, 1.4), on(-1, 1.4), on(5, 7.8), on(9, 7.8)], color: LIME, width: 3, glow: true }];
  return <IsoScene blocks={blocks} strokes={strokes} className={className} />;
}

/** A wide skyline of racks laid along the screen-horizontal (1, −1, 0) direction, two rows deep. */
export function SkylineStrip({ className = "" }: { className?: string }) {
  const back = [5, 7.5, 4, 8.5, 6, 9, 5.5, 7, 4.5, 8, 6.5, 5, 9.5, 6, 4, 7.5, 5.5, 8, 4.5, 6.5, 7, 5];
  const front = [2.5, 4, 2, 3.5, 5, 2.5, 3, 4.5, 2, 3.5, 2.5, 4, 3, 5.5, 2.5, 3.5, 2, 4.5, 3, 2.5, 4, 3];
  const at = (t: number, depth: number) => ({ x: 10 + t * 1.5 - depth, y: 10 - t * 1.5 - depth });
  const blocks: BlockSpec[] = [];
  back.forEach((h, i) =>
    blocks.push({
      ...at(i, 1.6),
      w: 1.2,
      d: 1.2,
      h,
      color: i === 5 ? BLUE : i === 12 ? PURPLE : SLATE,
      leds: { face: i % 2 ? "left" : "right", color: [BLUE, LIME, TEAL][i % 3], density: 0.4, seed: i + 3, cell: 0.32 },
    }),
  );
  front.forEach((h, i) => blocks.push({ ...at(i, 0), w: 1.2, d: 1.2, h, color: SLATE_DARK, leds: { face: "left", color: [TEAL, BLUE][i % 2], density: 0.3, seed: i + 40, cell: 0.32 } }));
  const crown = at(5, 1.6);
  blocks.push({ x: crown.x + 0.25, y: crown.y + 0.25, z: 9, w: 0.7, d: 0.7, h: 0.7, color: LIME });
  return <IsoScene blocks={blocks} className={className} pad={2} />;
}

/** Small cluster for empty, loading and error states. */
export function MiniCluster({ accent = LIME, className = "" }: { accent?: string; className?: string }) {
  const blocks: BlockSpec[] = [
    { x: 0, y: 0, z: -0.4, w: 4, d: 3, h: 0.4, color: SLATE_DARK },
    { x: 0.4, y: 0.4, w: 1.2, d: 1.2, h: 2.6, color: SLATE, leds: { face: "left", color: BLUE, density: 0.5, seed: 4, cell: 0.3 } },
    { x: 2.1, y: 0.6, w: 1.2, d: 1.2, h: 1.6, color: SLATE },
    { x: 2.35, y: 0.85, z: 1.6, w: 0.7, d: 0.7, h: 0.7, color: accent, float: 0.5 },
  ];
  return <IsoScene blocks={blocks} className={className} pad={3} />;
}
