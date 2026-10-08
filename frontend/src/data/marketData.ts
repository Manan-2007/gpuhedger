/**
 * SIMULATED MARKET DATA.
 *
 * GpuHedger's settlement price comes from the onchain ComputeOracle. Everything in this
 * file (24h/7d change, rental-market volume, historical price paths) is simulated for the
 * hackathon MVP because there is no production GPU-compute price index yet.
 *
 * Swap `simulatedMarketData` for a real implementation of {@link MarketDataProvider}
 * (e.g. an index built from cloud GPU rental rates) without touching any UI code.
 */
import type { GpuMeta, GpuSymbol, PricePoint, SimulatedMarketStats, TimeRange } from "../types/markets";

export const GPU_META: Record<GpuSymbol, GpuMeta> = {
  H100: {
    symbol: "H100",
    name: "NVIDIA H100 SXM",
    memory: "80GB HBM3",
    generation: "Hopper",
    description: "The workhorse of frontier-model training and high-throughput inference.",
  },
  A100: {
    symbol: "A100",
    name: "NVIDIA A100 SXM",
    memory: "80GB HBM2e",
    generation: "Ampere",
    description: "Mature, widely available capacity for fine-tuning and batch inference.",
  },
  B200: {
    symbol: "B200",
    name: "NVIDIA B200",
    memory: "192GB HBM3e",
    generation: "Blackwell",
    description: "Next-generation capacity with tight supply and volatile pricing.",
  },
};

/** Fallback reference prices if the oracle is unreachable (displayed as simulated). */
export const FALLBACK_PRICES: Record<GpuSymbol, number> = { H100: 2.14, A100: 1.31, B200: 3.82 };
export const FALLBACK_VOLATILITY: Record<GpuSymbol, number> = { H100: 0.42, A100: 0.35, B200: 0.55 };

export interface MarketDataProvider {
  readonly isSimulated: boolean;
  getStats(gpu: GpuSymbol): SimulatedMarketStats;
  /** Price history ending at `currentPrice`. */
  getHistory(gpu: GpuSymbol, range: TimeRange, currentPrice: number, volatility: number): PricePoint[];
}

const STATS: Record<GpuSymbol, SimulatedMarketStats> = {
  H100: { change24h: 4.8, change7d: 9.6, volume24h: 1_840_000, openInterestGpuHours: 125_000 },
  A100: { change24h: -1.7, change7d: -3.2, volume24h: 2_310_000, openInterestGpuHours: 64_000 },
  B200: { change24h: 7.2, change7d: 15.4, volume24h: 420_000, openInterestGpuHours: 38_500 },
};

const RANGE_CONFIG: Record<TimeRange, { points: number; spanMs: number }> = {
  "1H": { points: 60, spanMs: 60 * 60 * 1000 },
  "1D": { points: 96, spanMs: 24 * 60 * 60 * 1000 },
  "1W": { points: 84, spanMs: 7 * 24 * 60 * 60 * 1000 },
  "1M": { points: 90, spanMs: 30 * 24 * 60 * 60 * 1000 },
  "3M": { points: 90, spanMs: 90 * 24 * 60 * 60 * 1000 },
};

/** Deterministic PRNG so the simulated chart doesn't jump around between renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(gpu: string, range: string) {
  let h = 2166136261;
  for (const c of gpu + range) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const simulatedMarketData: MarketDataProvider = {
  isSimulated: true,

  getStats(gpu) {
    return STATS[gpu];
  },

  getHistory(gpu, range, currentPrice, volatility) {
    const { points, spanMs } = RANGE_CONFIG[range];
    const rand = mulberry32(seedFor(gpu, range));
    const dtYears = spanMs / points / (365 * 24 * 3600 * 1000);
    const sigma = Math.max(volatility, 0.05) * Math.sqrt(dtYears);
    // Walk backwards from the current price so the series always ends at the oracle value.
    const prices = [currentPrice];
    for (let i = 1; i < points; i++) {
      const u = Math.max(rand(), 1e-9);
      const v = rand();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      const drift = range === "1M" || range === "3M" ? 0.0015 : 0; // gentle uptrend
      prices.push(Math.max(prices[i - 1] * Math.exp(-(sigma * z) - drift), 0.05));
    }
    prices.reverse();
    const now = Date.now();
    return prices.map((price, i) => ({
      t: now - spanMs + (spanMs * i) / (points - 1),
      price: Math.round(price * 10000) / 10000,
    }));
  },
};

export const marketData: MarketDataProvider = simulatedMarketData;
