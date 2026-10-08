import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import type { PositionView } from "../types/options";
import type { useOptionActions } from "../hooks/useOption";
import { formatDate, formatDuration, formatNumber, formatPct, formatPrice, formatSignedUsd, formatTenor, formatUsd, pnlClass } from "../utils/formatters";
import { useWrongNetwork } from "./WalletButton";
import { OptionTypeBadge, Spinner } from "./ui";

const STATUS_STYLE = {
  OPEN: "border-secondary/30 text-secondary",
  EXERCISED: "border-pos/30 text-pos",
  EXPIRED: "border-line-2 text-dim",
} as const;

export type OptionActions = ReturnType<typeof useOptionActions>;

/** Exercise state lives in the parent so the settlement confirmation survives the row moving tabs. */
export function PositionTable({
  positions,
  actions,
  activeKey,
  onExercise,
}: {
  positions: PositionView[];
  actions: OptionActions;
  activeKey?: string;
  onExercise: (p: PositionView) => void;
}) {
  const wrongNetwork = useWrongNetwork();
  const [expanded, setExpanded] = useState<string>();
  const exercise = onExercise;

  const exerciseButton = (p: PositionView, className = "") => {
    if (p.status !== "OPEN") return <span className="text-xs text-dim">—</span>;
    const busy = actions.isBusy && activeKey === p.key;
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
      <div className="panel hidden overflow-x-auto lg:block">
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
                    <td className={`num px-4 py-3.5 text-right font-semibold ${pnlClass(p.pnl)}`}>{formatSignedUsd(p.pnl)}</td>
                    <td className="px-4 py-3.5"><span className={`chip ${STATUS_STYLE[p.status]}`}>{p.status}</span></td>
                    <td className="px-4 py-3.5 text-right">{exerciseButton(p)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line/70 bg-bg/40">
                      <td colSpan={10} className="px-4 py-4">
                        <PositionDetail p={p} />
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
                <span className={`chip ${STATUS_STYLE[p.status]}`}>{p.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <Cell k="Contracts" v={formatNumber(p.contracts)} />
                <Cell k="Entry" v={formatUsd(p.premiumPaid)} />
                <Cell k="Value*" v={formatUsd(value)} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="label">P&L</div>
                  <div className={`num text-lg font-semibold ${pnlClass(p.pnl)}`}>{formatSignedUsd(p.pnl)}</div>
                </div>
                {exerciseButton(p, "px-4 py-2.5")}
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <PositionDetail p={p} />
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

function PositionDetail({ p }: { p: PositionView }) {
  const items: [string, string, string?][] = [
    [`${p.series.gpu} oracle price`, `${formatPrice(p.spot)}/h`],
    ["Intrinsic / GPU-h", formatPrice(p.intrinsicPerUnit), p.intrinsicPerUnit > 0 ? "text-pos" : ""],
    ["Exercise value now", formatUsd(p.exerciseValue), p.exerciseValue > 0 ? "text-pos" : ""],
    ["Est. option value", p.status === "OPEN" ? formatUsd(p.estimatedValue) : "—"],
    ["Distance to strike", formatPct(p.distanceToStrike)],
    ["Time remaining", p.status === "OPEN" ? formatDuration(p.timeRemaining) : p.status === "EXERCISED" ? `Exercised ${formatDate(p.closedAt)}` : "Expired"],
    ["GPU-hours covered", formatNumber(p.contracts * p.series.contractSize)],
    ["Payout received", p.status === "EXERCISED" ? formatUsd(p.payout) : "—", p.status === "EXERCISED" ? "text-pos" : ""],
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
