import { formatUnits, hexToString, parseUnits, stringToHex, type Hex } from "viem";

export const USDC_DECIMALS = 6;

/** Convert an onchain 6-decimal amount to a JS number (for display / maths only). */
export function fromUsdc(value: bigint | undefined | null): number {
  if (value === undefined || value === null) return 0;
  return Number(formatUnits(value, USDC_DECIMALS));
}

/** Convert a USD number to a 6-decimal bigint. Rounds to the nearest micro-dollar. */
export function toUsdc(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) return 0n;
  return parseUnits(value.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

export function bytes32ToString(value: Hex): string {
  try {
    return hexToString(value, { size: 32 }).replace(/\0/g, "");
  } catch {
    return "";
  }
}

export function stringToBytes32(value: string): Hex {
  return stringToHex(value, { size: 32 });
}

const usdFormatters = new Map<number, Intl.NumberFormat>();
function usdFmt(decimals: number) {
  let f = usdFormatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    usdFormatters.set(decimals, f);
  }
  return f;
}

/** $1,234.56 */
export function formatUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return usdFmt(decimals).format(value);
}

/** Price per GPU-hour: $2.14, or $0.035 for sub-dollar premiums. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.1) return usdFmt(3).format(value);
  return usdFmt(2).format(value);
}

/** +$240.00 / −$12.50 */
export function formatSignedUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const abs = usdFmt(decimals).format(Math.abs(value));
  if (Math.abs(value) < 0.005) return abs;
  return value > 0 ? `+${abs}` : `−${abs}`;
}

export function formatPct(value: number, decimals = 1, signed = true): string {
  if (!Number.isFinite(value)) return "—";
  const s = Math.abs(value).toFixed(decimals) + "%";
  if (!signed) return s;
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s;
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function shortAddress(address?: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function shortHash(hash?: string): string {
  if (!hash) return "";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/** Remaining time, e.g. "29d 23h", "4h 12m", "38s". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds)}s`;
}

/** Tenor label from now, e.g. "30D". */
export function formatTenor(expiration: number, nowMs = Date.now()): string {
  const secs = expiration - nowMs / 1000;
  if (secs <= 0) return "EXP";
  const days = secs / 86400;
  if (days >= 1) return `${Math.round(days)}D`;
  const hours = secs / 3600;
  return hours >= 1 ? `${Math.round(hours)}H` : `${Math.max(Math.round(secs / 60), 1)}M`;
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(unixSeconds: number, nowMs = Date.now()): string {
  const s = Math.max(Math.floor(nowMs / 1000 - unixSeconds), 0);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function pnlClass(value: number): string {
  if (value > 0.004) return "text-pos";
  if (value < -0.004) return "text-neg";
  return "text-muted";
}
