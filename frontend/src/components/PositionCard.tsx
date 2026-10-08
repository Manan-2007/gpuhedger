import { useState } from "react";
import { Link } from "react-router-dom";
import { isAddress, type Address } from "viem";
import type { PositionView } from "../types/options";
import { calculateBreakEven } from "../utils/optionsPricing";
import { formatDate, formatNumber, formatPct, formatPrice, formatUsd } from "../utils/formatters";
import { Countdown, OptionTypeBadge, PnlValue, Spinner } from "./ui";
import { StatusChip } from "./PositionTable";

/**
 * One open (or claimable) hedge: what it is, what it's worth now, what it would pay if exercised,
 * and where the oracle sits against strike and break-even. Exercise/claim is the only lime action.
 */
export function PositionCard({
  p,
  busy,
  disabled,
  onExercise,
  onClaim,
  onTransfer,
}: {
  p: PositionView;
  busy: boolean; // this card's transaction is in flight
  disabled: boolean; // any transaction in flight, or wrong network
  onExercise: (p: PositionView) => void;
  onClaim: (p: PositionView) => void;
  onTransfer: (p: PositionView, to: Address) => void;
}) {
  const [showTransfer, setShowTransfer] = useState(false);
  const s = p.series;
  const gpuHours = p.contracts * s.contractSize;
  const breakEven = calculateBreakEven(s.kind, s.strike, s.premium);
  const maxPayout = s.maxPayoutPerUnit * gpuHours;
  const claimable = p.status === "CLAIMABLE";
  const pnlPct = p.premiumPaid > 0 ? (p.pnl / p.premiumPaid) * 100 : 0;
  const direction = s.kind === "CALL" ? ">" : "<";

  let action: React.ReactNode;
  if (claimable) {
    action = (
      <button onClick={() => onClaim(p)} disabled={disabled || p.claimValue <= 0} className="btn-primary w-full py-2.5 sm:w-auto">
        {busy && <Spinner />} CLAIM {formatUsd(p.claimValue)}
      </button>
    );
  } else if (p.canExercise) {
    action = (
      <button onClick={() => onExercise(p)} disabled={disabled} className="btn-primary w-full py-2.5 sm:w-auto">
        {busy && <Spinner />} EXERCISE · {formatUsd(p.exerciseValue)}
      </button>
    );
  } else {
    action = (
      <button disabled className="btn-secondary w-full py-2.5 sm:w-auto" title="Out of the money: nothing to exercise yet">
        OUT OF THE MONEY
      </button>
    );
  }

  return (
    <article className="panel flex flex-col p-4 sm:p-5" aria-label={`${s.gpu} ${s.kind} ${formatPrice(s.strike)} position`}>
      {/* Identity */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{s.gpu}</h3>
            <OptionTypeBadge kind={s.kind} />
            <span className="num font-semibold">{formatPrice(s.strike)}</span>
            <span className="text-xs text-muted">strike</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            {s.region} · {claimable ? "expired" : "expires"} <span className="num">{formatDate(s.expiration)}</span>
            {!claimable && (
              <>
                {" "}· <Countdown expiration={s.expiration} /> left
              </>
            )}
          </div>
        </div>
        <StatusChip p={p} />
      </div>

      {/* Value */}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-bg-deep/50 p-3">
        <div>
          <div className="text-[11px] text-muted">{claimable ? "P&L at expiry" : "Unrealized P&L*"}</div>
          <div className="mt-0.5 text-xl">
            <PnlValue value={p.pnl} />
          </div>
          <div className="num text-[11px] text-dim">{formatPct(pnlPct, 0)} on {formatUsd(p.premiumPaid)} premium</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted">{claimable ? "Claimable payout" : "Exercise value now"}</div>
          <div className={`num mt-0.5 text-xl font-semibold ${(claimable ? p.claimValue : p.exerciseValue) > 0 ? "text-pos" : "text-muted"}`}>
            {formatUsd(claimable ? p.claimValue : p.exerciseValue)}
          </div>
          <div className="text-[11px] text-dim">
            {claimable ? "at the expiry settlement price" : p.exerciseValue > 0 ? "paid in USDC on exercise" : `pays when ${s.gpu} ${direction} ${formatPrice(s.strike)}`}
          </div>
        </div>
      </div>

      {/* Where the price is */}
      {!claimable && <MoneynessBar p={p} breakEven={breakEven} />}

      {/* Facts */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
        <Fact k="Contracts" v={formatNumber(p.contracts)} sub={`${formatNumber(gpuHours)} GPU-h`} />
        <Fact k="Break-even" v={formatPrice(breakEven)} sub="per GPU-h" />
        <Fact k="Est. value*" v={claimable ? "—" : formatUsd(p.estimatedValue)} sub="model" />
        <Fact k="Max payout" v={formatUsd(maxPayout)} sub="capped" />
      </dl>

      {/* Actions */}
      <div className="mt-auto pt-4">
        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          {action}
          <div className="flex items-center justify-center gap-4 text-xs sm:justify-end">
            <button onClick={() => setShowTransfer((v) => !v)} className="text-muted hover:text-fg" aria-expanded={showTransfer}>
              Transfer NFT #{p.tokenId.toString()}
            </button>
            <Link to={`/markets/${p.seriesId}`} className="text-secondary hover:underline">
              Market →
            </Link>
          </div>
        </div>
        {showTransfer && <TransferForm p={p} disabled={disabled} onTransfer={onTransfer} />}
      </div>
    </article>
  );
}

function Fact({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="num font-semibold">{v}</dd>
      {sub && <dd className="text-[10px] text-dim">{sub}</dd>}
    </div>
  );
}

/** Strike, break-even and live oracle on one scale; the shaded band is where the option pays. */
function MoneynessBar({ p, breakEven }: { p: PositionView; breakEven: number }) {
  const s = p.series;
  const K = s.strike;
  const capEdge = s.kind === "CALL" ? K + s.maxPayoutPerUnit : Math.max(K - s.maxPayoutPerUnit, 0);
  const pts = [K, breakEven, p.spot];
  const span = Math.max(Math.max(...pts) - Math.min(...pts), K * 0.2);
  const lo = Math.max(Math.min(...pts) - span * 0.35, 0);
  const hi = Math.max(...pts) + span * 0.35;
  const x = (v: number) => `${Math.min(Math.max(((v - lo) / (hi - lo)) * 100, 0), 100)}%`;
  const payStart = s.kind === "CALL" ? K : Math.max(capEdge, lo);
  const payEnd = s.kind === "CALL" ? Math.min(capEdge, hi) : K;

  return (
    <div className="mt-4" aria-hidden>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-pos/35"
          style={{ left: x(payStart), width: `calc(${x(payEnd)} - ${x(payStart)})` }}
        />
        <div className="absolute top-0.5 h-5 w-px bg-chart-ref" style={{ left: x(K) }} />
        <div className="absolute top-1 h-4 w-px border-l border-dashed border-chart-ref" style={{ left: x(breakEven) }} />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-secondary"
          style={{ left: x(p.spot) }}
        />
      </div>
      <div className="num mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-secondary" /> Oracle {formatPrice(p.spot)}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-chart-ref" /> Strike {formatPrice(K)}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px border-l border-dashed border-chart-ref" /> Break-even {formatPrice(breakEven)}</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-pos/35" /> Pays here</span>
      </div>
    </div>
  );
}

function TransferForm({ p, disabled, onTransfer }: { p: PositionView; disabled: boolean; onTransfer: (p: PositionView, to: Address) => void }) {
  const [to, setTo] = useState("");
  const valid = isAddress(to);
  return (
    <div className="mt-3 rounded-lg border border-line bg-bg-deep/50 p-3">
      <p className="text-xs text-muted">
        Whoever holds position NFT <span className="num text-fg">#{p.tokenId.toString()}</span> owns this hedge and its payout. Move it
        to another wallet, e.g. your treasury.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          className="input mono py-1.5 text-xs"
          placeholder="0x… recipient address"
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          aria-label="Recipient address"
          aria-invalid={to !== "" && !valid}
        />
        <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" disabled={disabled || !valid} onClick={() => onTransfer(p, to as Address)}>
          TRANSFER
        </button>
      </div>
      {to !== "" && !valid && <p className="mt-1.5 text-xs text-neg">That isn't a valid address.</p>}
    </div>
  );
}
