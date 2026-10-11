import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { OptionKind } from "../types/options";
import { addressUrl, txUrl } from "../lib/chain";
import { formatDuration, formatSignedUsd, shortAddress, shortHash, timeAgo } from "../utils/formatters";
import { useNow } from "../hooks/useNow";
import { Card, Stat } from "./primitives";

/** Mark "G-stack": isometric slabs stacked into a G. Faces derive from the lime token (top lighter, side darker). */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const top = "color-mix(in oklab, var(--color-primary) 75%, white)";
  const left = "var(--color-primary)";
  const right = "color-mix(in oklab, var(--color-primary) 65%, black)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M5 24.5h17l4-2.5H9Z" style={{ fill: top }} opacity=".9" />
      <path d="M5 24.5h17v3H5Z" style={{ fill: right }} />
      <path d="M22 24.5l4-2.5v3l-4 2.5Z" style={{ fill: right }} opacity=".7" />
      <path d="M5 10.5h5v14H5Z" style={{ fill: left }} />
      <path d="M10 10.5l4-2.5v14l-4 2.5Z" style={{ fill: right }} />
      <path d="M15 16.5h11l-4 2.5H11Z" style={{ fill: top }} opacity=".9" />
      <path d="M22 19h4v-2.5l-4 2.5Z" style={{ fill: right }} />
      <path d="M22 19h4v6.5h-4Z" style={{ fill: left }} />
      <path d="M9 4.5h17l-4 2.5H5Z" style={{ fill: top }} />
      <path d="M5 7h17v3.5H5Z" style={{ fill: left }} />
      <path d="M22 7l4-2.5V8l-4 2.5Z" style={{ fill: right }} />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`} aria-label="GpuHedger home">
      <LogoMark />
      <span className="font-heading text-[18px] font-bold tracking-[-0.03em] text-fg">GpuHedger</span>
    </Link>
  );
}

export function OptionTypeBadge({ kind, className = "" }: { kind: OptionKind; className?: string }) {
  return (
    <span
      className={`chip ${kind === "CALL" ? "border-call/35 text-call" : "border-put/35 text-put"} ${className}`}
    >
      {kind}
    </span>
  );
}

export function SimulatedTag({ label = "Simulated", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      className={`chip border-warn/30 bg-warn/10 text-warn ${className}`}
      title="Simulated demo data — not from a production market data source"
    >
      {label}
    </span>
  );
}

export function OnchainTag({ label = "Onchain", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`chip border-secondary/30 text-secondary ${className}`} title="Read live from Monad smart contracts">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-secondary" />
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  valueClass = "",
  tag,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueClass?: string;
  tag?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <Stat label={label} value={value} sub={sub} valueClass={valueClass} tag={tag} />
    </Card>
  );
}

export function KeyValue({ label, value, valueClass = "", hint }: { label: string; value: ReactNode; valueClass?: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted" title={hint}>
        {label}
      </span>
      <span className={`num text-right text-sm text-fg ${valueClass}`}>{value}</span>
    </div>
  );
}

export function ExplorerLink({ hash, address, label }: { hash?: string; address?: string; label?: string }) {
  const url = hash ? txUrl(hash) : address ? addressUrl(address) : undefined;
  const text = label ?? (hash ? shortHash(hash) : shortAddress(address));
  if (!url) return <span className="mono text-muted">{text}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mono text-secondary underline-offset-4 hover:underline">
      {text} ↗
    </a>
  );
}

/** Signed P&L with an arrow, so profit and loss never rely on colour alone. */
export function PnlValue({ value, className = "", decimals = 2 }: { value: number; className?: string; decimals?: number }) {
  const flat = Math.abs(value) < 0.005;
  const cls = flat ? "text-muted" : value > 0 ? "text-pos" : "text-neg";
  return (
    <span className={`num inline-flex items-baseline gap-1 font-semibold ${cls} ${className}`}>
      {!flat && (
        <span aria-hidden className="text-[0.7em]">
          {value > 0 ? "▲" : "▼"}
        </span>
      )}
      {formatSignedUsd(value, decimals)}
    </span>
  );
}

/** Time left until `expiration` (unix seconds). Re-renders only itself. */
export function Countdown({ expiration, className = "" }: { expiration: number; className?: string }) {
  const now = useNow(1_000);
  return <span className={`num ${className}`}>{formatDuration(expiration - now / 1000)}</span>;
}

/** "12s ago" for an onchain timestamp (unix seconds). Re-renders only itself. */
export function Ago({ timestamp, className = "" }: { timestamp: number; className?: string }) {
  const now = useNow(1_000);
  return <span className={`num ${className}`}>{timeAgo(timestamp, now)}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[4px] bg-panel-2 ${className}`} />;
}

export { EmptyState } from "./primitives";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-[4px] border border-neg/60 bg-card px-3.5 py-3 text-sm">
      <div className="label mb-1 text-[10px] text-neg">Error</div>
      <div className="text-fg">{children}</div>
    </div>
  );
}

/** Shown wherever a screen needs the oracle price and the read failed. Trading stays disabled. */
export function OracleUnavailable({ gpu, className = "" }: { gpu?: string; className?: string }) {
  return (
    <div role="alert" className={`rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm ${className}`}>
      <div className="label text-warn">Oracle unavailable</div>
      <p className="mt-1 text-muted">
        The {gpu ? `${gpu} ` : ""}price couldn't be read from the ComputeOracle contract, so pricing and trading are paused on this
        screen. Check your connection; it retries automatically every few seconds.
      </p>
    </div>
  );
}

export { SectionHeader } from "./primitives";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
