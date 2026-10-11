import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { OptionKind } from "../types/options";
import { addressUrl, txUrl } from "../lib/chain";
import { formatDuration, formatSignedUsd, shortAddress, shortHash, timeAgo } from "../utils/formatters";
import { useNow } from "../hooks/useNow";
import { Card, Stat } from "./primitives";

/** Mark: a GPU die carrying a capped payoff curve (flat, then protected, then capped): the product in one glyph. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <path
        d="M11 2v3M16 2v3M21 2v3M11 27v3M16 27v3M21 27v3M2 11h3M2 16h3M2 21h3M27 11h3M27 16h3M27 21h3"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="5" y="5" width="22" height="22" rx="5" fill="var(--color-primary)" />
      <path d="M9 20H14L18.5 12.5H23" fill="none" stroke="var(--color-primary-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`} aria-label="GpuHedger home">
      <LogoMark />
      <span className="font-heading text-[18px] font-extrabold tracking-[-0.02em] text-fg">GpuHedger</span>
    </Link>
  );
}

export function OptionTypeBadge({ kind, className = "" }: { kind: OptionKind; className?: string }) {
  return (
    <span
      className={`chip ${kind === "CALL" ? "border-call/35 bg-call/10 text-call" : "border-put/35 bg-put/10 text-put"} ${className}`}
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
    <span className={`chip border-secondary/30 bg-secondary/10 text-secondary ${className}`} title="Read live from Monad smart contracts">
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
    <div role="alert" className="rounded-lg border border-neg/30 bg-neg/10 px-3 py-2.5 text-sm text-neg">
      {children}
    </div>
  );
}

/** Shown wherever a screen needs the oracle price and the read failed. Trading stays disabled. */
export function OracleUnavailable({ gpu, className = "" }: { gpu?: string; className?: string }) {
  return (
    <div role="alert" className={`rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm ${className}`}>
      <div className="font-semibold text-warn">Oracle unavailable</div>
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
