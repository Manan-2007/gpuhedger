import { Fragment, useState } from "react";
import { isAddress, type Address } from "viem";
import { Link } from "react-router-dom";
import type { PositionView } from "../types/options";
import type { useOptionActions } from "../hooks/useOption";
import { formatDate, formatDuration, formatNumber, formatPct, formatPrice, formatTenor, formatUsd } from "../utils/formatters";
import { useWrongNetwork } from "./WalletButton";
import { OptionTypeBadge, PnlValue, Spinner } from "./ui";

const DAY = 86_400;

/** Position state chip: ITM teal, OTM neutral (not red), <24h to expiry amber, exercised lime, expired dim. */
function statusChip(p: PositionView): { label: string; cls: string } {
  switch (p.status) {
    case "OPEN":
      if (p.timeRemaining < DAY) return { label: `Expires in ${formatDuration(p.timeRemaining)}`, cls: "border-warn/40 bg-warn/10 text-warn" };
      return p.intrinsicPerUnit > 0
        ? { label: "Open · ITM", cls: "border-pos/40 bg-pos/10 text-pos" }
        : { label: "Open · OTM", cls: "border-line-2 text-muted" };
    case "CLAIMABLE":
      return { label: "Claimable", cls: "border-pos/40 bg-pos/10 text-pos" };
    case "EXERCISED":
      return { label: "Exercised", cls: "border-primary/40 bg-primary/10 text-primary" };
    case "EXPIRED":
      return { label: "Expired", cls: "border-line-2 text-dim" };
  }
}

export function StatusChip({ p }: { p: PositionView }) {
  const { label, cls } = statusChip(p);
  return <span className={`chip whitespace-nowrap ${cls}`}>{label}</span>;
}

export type OptionActions = ReturnType<typeof useOptionActions>;

/** Exercise state lives in the parent so the settlement confirmation survives the row moving tabs. */
export function PositionTable({
  positions,
  actions,
  activeKey,
  onExercise,
  onClaim,
  onTransfer,
}: {
  positions: PositionView[];
  actions: OptionActions;
  activeKey?: string;
  onExercise: (p: PositionView) => void;
  onClaim: (p: PositionView) => void;
  onTransfer: (p: PositionView, to: Address) => void;
}) {
  const wrongNetwork = useWrongNetwork();
  const [expanded, setExpanded] = useState<string>();
  const exercise = onExercise;

  const exerciseButton = (p: PositionView, className = "") => {
    const busy = actions.isBusy && activeKey === p.key;
    if (p.status === "CLAIMABLE") {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClaim(p);
          }}
          disabled={actions.isBusy || wrongNetwork || p.claimValue <= 0}
          title={`Claim ${formatUsd(p.claimValue)} at the expiry settlement price`}
          className={`btn-primary whitespace-nowrap px-3 py-1.5 text-xs ${className}`}
        >
          {busy && <Spinner className="h-3 w-3" />}
          CLAIM
        </button>
      );
    }
    if (p.status !== "OPEN") return <span className="text-xs text-dim">—</span>;
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          exercise(p);
        }}
        disabled={!p.canExercise || actions.isBusy || wrongNetwork}
        title={p.canExercise ? `Settle ${formatUsd(p.exerciseValue)} onchain` : "Out of the money — nothing to exercise yet"}
        className={`${p.canExercise ? "btn-primary" : "btn-secondary"} whitespace-nowrap px-3 py-1.5 text-xs ${className}`}
      >
        {busy && <Spinner className="h-3 w-3" />}
        {p.canExercise ? "EXERCISE" : "OTM"}
      </button>
    );
  };


  return (
    <>
      {/* Desktop */}
      <div className="panel-solid hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {["GPU", "Type", "Strike", "Expiry", "Contracts", "Entry Premium", "Current Value", "P&L", "Status", ""].map((h, i) => (
                <th key={i} className={`label px-4 py-3 font-medium ${i >= 2 && i <= 7 ? "text-right" : ""}`}>
                  {h === "Current Value" ? <span title="Model estimate (open) or settled payout">{h}*</span> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const value = p.status === "OPEN" ? p.estimatedValue : p.status === "EXERCISED" ? p.payout : 0;
              const isOpen = expanded === p.key;
              return (
                <Fragment key={p.key}>
                  <tr
                    onClick={() => setExpanded(isOpen ? undefined : p.key)}
                    className={`cursor-pointer border-b border-line/70 hover:bg-panel-2 ${p.status !== "OPEN" ? "opacity-70" : ""}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-semibold">{p.series.gpu}</div>
                      <div className="text-[11px] text-dim">{p.series.region}</div>
                    </td>
                    <td className="px-4 py-3.5"><OptionTypeBadge kind={p.series.kind} /></td>
                    <td className="num px-4 py-3.5 text-right">{formatPrice(p.series.strike)}</td>
                    <td className="num px-4 py-3.5 text-right text-muted">{formatTenor(p.series.expiration)}</td>
                    <td className="num px-4 py-3.5 text-right">{formatNumber(p.contracts)}</td>
                    <td className="num px-4 py-3.5 text-right">{formatUsd(p.premiumPaid)}</td>
                    <td className="num px-4 py-3.5 text-right">{formatUsd(value)}</td>
                    <td className="px-4 py-3.5 text-right"><PnlValue value={p.pnl} /></td>
                    <td className="px-4 py-3.5"><StatusChip p={p} /></td>
                    <td className="px-4 py-3.5 text-right">{exerciseButton(p)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line/70 bg-bg/40">
                      <td colSpan={10} className="px-4 py-4">
                        <PositionDetail p={p} />
                <TransferForm p={p} disabled={actions.isBusy || wrongNetwork} onTransfer={onTransfer} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet cards */}
      <div className="grid gap-3 lg:hidden">
        {positions.map((p) => {
          const value = p.status === "OPEN" ? p.estimatedValue : p.status === "EXERCISED" ? p.payout : 0;
          return (
            <div key={p.key} className={`panel p-4 ${p.status !== "OPEN" ? "opacity-80" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.series.gpu}</span>
                  <OptionTypeBadge kind={p.series.kind} />
                  <span className="num text-sm text-muted">{formatPrice(p.series.strike)}</span>
                </div>
                <StatusChip p={p} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <Cell k="Contracts" v={formatNumber(p.contracts)} />
                <Cell k="Entry" v={formatUsd(p.premiumPaid)} />
                <Cell k="Value*" v={formatUsd(value)} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="label">P&L</div>
                  <div className="text-lg"><PnlValue value={p.pnl} /></div>
                </div>
                {exerciseButton(p, "px-4 py-2.5")}
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <PositionDetail p={p} />
                <TransferForm p={p} disabled={actions.isBusy || wrongNetwork} onTransfer={onTransfer} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-dim">
        *Current value of open positions is a model estimate (Black-Scholes, floored at exercise value) — not a production market mark.
        Exercise value uses the live onchain oracle price.
      </p>
    </>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="label text-[10px]">{k}</div>
      <div className="num mt-0.5">{v}</div>
    </div>
  );
}

function TransferForm({ p, disabled, onTransfer }: { p: PositionView; disabled: boolean; onTransfer: (p: PositionView, to: Address) => void }) {
  const [to, setTo] = useState("");
  if (p.status !== "OPEN" && p.status !== "CLAIMABLE") return null;
  const valid = isAddress(to);
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center" onClick={(e) => e.stopPropagation()}>
      <span className="shrink-0 text-xs text-muted">
        Position NFT <span className="num text-fg">#{p.tokenId.toString()}</span> · transfer hedge to
      </span>
      <input className="input py-1.5 text-xs" placeholder="0x… recipient address" value={to} onChange={(e) => setTo(e.target.value.trim())} aria-label="Recipient address" />
      <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" disabled={disabled || !valid} onClick={() => onTransfer(p, to as Address)}>
        TRANSFER
      </button>
    </div>
  );
}

function PositionDetail({ p }: { p: PositionView }) {
  const items: [string, string, string?][] = [
    [`${p.series.gpu} oracle price`, `${formatPrice(p.spot)}/h`],
    ["Intrinsic / GPU-h", formatPrice(p.intrinsicPerUnit), p.intrinsicPerUnit > 0 ? "text-pos" : ""],
    ["Exercise value now", formatUsd(p.exerciseValue), p.exerciseValue > 0 ? "text-pos" : ""],
    ["Est. option value", p.status === "OPEN" ? formatUsd(p.estimatedValue) : "—"],
    ["Distance to strike", formatPct(p.distanceToStrike)],
    ["Time remaining", p.status === "OPEN" ? formatDuration(p.timeRemaining) : p.status === "EXERCISED" ? `Settled ${formatDate(p.closedAt)}` : p.status === "CLAIMABLE" ? "Expired ITM — claim" : "Expired"],
    ["GPU-hours covered", formatNumber(p.contracts * p.series.contractSize)],
    [p.status === "CLAIMABLE" ? "Claimable payout" : "Payout received", p.status === "EXERCISED" ? formatUsd(p.payout) : p.status === "CLAIMABLE" ? formatUsd(p.claimValue) : "—", p.status === "EXERCISED" || p.status === "CLAIMABLE" ? "text-pos" : ""],
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {items.map(([k, v, cls]) => (
          <div key={k}>
            <div className="text-[11px] text-dim">{k}</div>
            <div className={`num text-sm ${cls ?? ""}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-dim">
        Position #{p.positionId.toString()} in{" "}
        <Link to={`/markets/${p.seriesId}`} className="text-secondary hover:underline">
          series #{p.seriesId}
        </Link>{" "}
        · opened {formatDate(p.openedAt)}
      </div>
    </div>
  );
}
