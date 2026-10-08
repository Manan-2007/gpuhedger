export const GPU_SYMBOLS = ["H100", "A100", "B200"] as const;
export type GpuSymbol = (typeof GPU_SYMBOLS)[number];

export function isGpuSymbol(value: string): value is GpuSymbol {
  return (GPU_SYMBOLS as readonly string[]).includes(value);
}

export interface GpuMeta {
  symbol: GpuSymbol;
  name: string;
  memory: string;
  generation: string;
  description: string;
}

/** Live oracle state for one GPU (onchain). */
export interface OraclePrice {
  gpu: GpuSymbol;
  price: number; // $ per GPU-hour
  priceRaw: bigint;
  updatedAt: number; // unix seconds
  volatility: number; // annualized, decimal (0.42 = 42%)
  volatilityBps: number;
}

/** Market statistics that are SIMULATED in the MVP (no production data source yet). */
export interface SimulatedMarketStats {
  change24h: number; // %
  change7d: number; // %
  volume24h: number; // GPU-hours traded in the spot/rental market
  openInterestGpuHours: number;
}

export type TimeRange = "1H" | "1D" | "1W" | "1M" | "3M";

export interface PricePoint {
  t: number; // unix ms
  price: number;
}
