import { Fragment, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { OptionKind, OptionSeries } from "../types/options";
import { formatDate, formatNumber, formatPrice, formatTenor } from "../utils/formatters";
import { indicativeBid } from "./MarketTable";
import { isStalePremium } from "../utils/optionsPricing";

/** Series expiring on the same UTC calendar day share a chain. */
export const expiryKey = (expiration: number) => new Date(expiration * 1000).toISOString().slice(0, 10);

export interface ExpiryGroup {
  key: string;
  expiration: number; // earliest in the group
  count: number;
}

export function groupExpiries(series: OptionSeries[]): ExpiryGroup[] {
  const map = new Map<string, ExpiryGroup>();
  for (const s of series) {
    const key = expiryKey(s.expiration);
    const g = map.get(key);
    if (g) {
      g.count += 1;
      g.expiration = Math.min(g.expiration, s.expiration);
    } else map.set(key, { key, expiration: s.expiration, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.expiration - b.expiration);
}

interface Row {
  strike: number;
  call?: OptionSeries;
  put?: OptionSeries;
}

/** One row per strike; if two regions list the same strike and type, each gets its own row. */
function buildRows(series: OptionSeries[]): Row[] {
  const strikes = [...new Set(series.map((s) => s.strike))].sort((a, b) => a - b);
  return strikes.flatMap((strike) => {
    const calls = series.filter((s) => s.strike === strike && s.kind === "CALL");
    const puts = series.filter((s) => s.strike === strike && s.kind === "PUT");
    return Array.from({ length: Math.max(calls.length, puts.length) }, (_, i) => ({ strike, call: calls[i], put: puts[i] }));
  });
}

const isItm = (kind: OptionKind, strike: number, spot?: number) =>
  spot !== undefined && (kind === "CALL" ? spot > strike : spot < strike);

/**
 * Options chain for one GPU and one expiry: calls on the left, puts on the right, strikes in the
 * middle. In-the-money cells are tinted teal; the blue rule marks the live oracle price.
 * Ask = executable onchain premium per GPU-hour. Bid* is indicative (simulated).
 */
export function OptionsChain({ series, spot, gpu }: { series: OptionSeries[]; spot?: number; gpu: string }) {
  const rows = buildRows(series);
  // Oracle marker goes before the first strike at or above spot.
  const markerAt = spot === undefined ? -1 : (() => {
    const i = rows.findIndex((r) => r.strike >= spot);
    return i === -1 ? rows.length : i;
  })();
  const [mobileSide, setMobileSide] = useState<OptionKind>(rows.some((r) => r.call) ? "CALL" : "PUT");

  const marker = (colSpan: number) => (
    <tr aria-label={`${gpu} oracle price ${spot !== undefined ? formatPrice(spot) : ""}`}>
      <td colSpan={colSpan} className="px-4 py-1.5">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-secondary/70" />
          <span className="num rounded-full border border-secondary/40 bg-secondary/10 px-2.5 py-0.5 text-[11px] font-semibold text-secondary">
            {gpu} oracle {spot !== undefined ? formatPrice(spot) : "—"}
          </span>
          <span className="h-px flex-1 bg-secondary/70" />
        </div>
      </td>
    </tr>
  );

  return (
    <div>
      {/* Desktop: full chain */}
      <div className="panel-solid hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th colSpan={4} className="px-4 pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-wider text-call">Calls</th>
              <th className="px-4 pb-1 pt-3" />
              <th colSpan={4} className="px-4 pb-1 pt-3 text-right text-xs font-semibold uppercase tracking-wider text-put">Puts</th>
            </tr>
            <tr className="border-b border-line">
              {["Region", "Open int.", "Bid*", "Ask"].map((h, i) => (
                <th key={`c${h}`} className={`label px-4 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
              <th className="label bg-bg-deep/60 px-4 py-2 text-center font-medium">Strike</th>
              {["Ask", "Bid*", "Open int.", "Region"].map((h, i) => (
                <th key={`p${h}`} className={`label px-4 py-2 font-medium ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Fragment key={`${r.strike}-${i}`}>
                {i === markerAt && marker(9)}
                <tr className="border-b border-line/70 last:border-0">
                  <Side s={r.call} itm={isItm("CALL", r.strike, spot)} spot={spot} align="call" />
                  <td className="num bg-bg-deep/60 px-4 py-3 text-center text-base font-semibold">{formatPrice(r.strike)}</td>
                  <Side s={r.put} itm={isItm("PUT", r.strike, spot)} spot={spot} align="put" />
                </tr>
              </Fragment>
            ))}
            {markerAt === rows.length && marker(9)}
          </tbody>
        </table>
      </div>

      {/* Mobile: one side at a time */}
      <div className="md:hidden">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg-deep p-1">
          {(["CALL", "PUT"] as OptionKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setMobileSide(k)}
              className={`seg py-2 ${mobileSide === k ? (k === "CALL" ? "bg-call/15 text-call" : "bg-put/15 text-put") : "text-muted"}`}
            >
              {k === "CALL" ? "Calls" : "Puts"}
            </button>
          ))}
        </div>
        <MobileSide rows={rows} side={mobileSide} spot={spot} gpu={gpu} markerAt={markerAt} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-dim">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-pos/40 bg-pos/15" /> In the money</span>
        <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-secondary" /> Live oracle price</span>
        <span>Ask = executable onchain premium per GPU-hour · 1 contract = {formatNumber(series[0]?.contractSize ?? 100)} GPU-hours</span>
        <span className="flex items-center gap-1.5"><StaleDot /> Stale premium (below exercise value)</span>
        <span>*Bid is indicative (simulated)</span>
      </div>
    </div>
  );
}

function Side({ s, itm, spot, align }: { s?: OptionSeries; itm: boolean; spot?: number; align: "call" | "put" }) {
  const navigate = useNavigate();
  const tint = s && itm ? "bg-pos/[0.11]" : "";
  if (!s) {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <td key={i} className={`px-4 py-3 text-dim ${align === "call" ? (i === 0 ? "text-left" : "text-right") : i === 3 ? "text-right" : "text-left"}`}>
            {i === (align === "call" ? 3 : 0) ? "—" : ""}
          </td>
        ))}
      </>
    );
  }
  const go = () => navigate(`/trade?series=${s.id}`);
  const stale = spot !== undefined && isStalePremium(s.kind, spot, s.strike, s.premium, s.maxPayoutPerUnit);
  const ask = (
    <span className="inline-flex items-center gap-1.5">
      {stale && align === "call" && <StaleDot />}
      <Link
        to={`/trade?series=${s.id}`}
        aria-label={`Buy ${s.gpu} ${s.kind} strike ${formatPrice(s.strike)}, premium ${formatPrice(s.premium)} per GPU-hour`}
        title={`${formatPrice(s.premium * s.contractSize)} per contract`}
        className="num inline-flex min-w-[4.5rem] justify-center rounded-md border border-line-2 bg-panel-2 px-2.5 py-1 font-semibold text-fg transition-colors hover:border-primary/70 hover:bg-primary/10 hover:text-primary"
      >
        {formatPrice(s.premium)}
      </Link>
      {stale && align === "put" && <StaleDot />}
    </span>
  );
  const td = (key: string, className: string, content: React.ReactNode) => (
    <td key={key} className={`${className} ${tint} cursor-pointer`} onClick={go}>
      {content}
    </td>
  );
  const cells =
    align === "call"
      ? [
          td("r", "px-4 py-3 text-left text-xs text-muted", s.region),
          td("oi", "num px-4 py-3 text-right", formatNumber(s.openContracts)),
          td("bid", "num px-4 py-3 text-right text-muted", formatPrice(indicativeBid(s.premium))),
          td("ask", "px-4 py-2 text-right", ask),
        ]
      : [
          td("ask", "px-4 py-2 text-left", ask),
          td("bid", "num px-4 py-3 text-left text-muted", formatPrice(indicativeBid(s.premium))),
          td("oi", "num px-4 py-3 text-left", formatNumber(s.openContracts)),
          td("r", "px-4 py-3 text-right text-xs text-muted", s.region),
        ];
  return <>{cells}</>;
}

function MobileSide({ rows, side, spot, gpu, markerAt }: { rows: Row[]; side: OptionKind; spot?: number; gpu: string; markerAt: number }) {
  const items = rows.map((r, i) => ({ r, i, s: side === "CALL" ? r.call : r.put })).filter((x) => x.s);
  if (items.length === 0) return <p className="panel-solid p-4 text-sm text-muted">No {side === "CALL" ? "calls" : "puts"} listed at this expiry.</p>;
  const spotLine = (
    <li className="flex items-center gap-2 px-3 py-1">
      <span className="h-px flex-1 bg-secondary/70" />
      <span className="num text-[11px] font-semibold text-secondary">{gpu} oracle {spot !== undefined ? formatPrice(spot) : "—"}</span>
      <span className="h-px flex-1 bg-secondary/70" />
    </li>
  );
  let markerShown = markerAt < 0;
  return (
    <ul className="panel-solid divide-y divide-line/70">
      {items.map(({ r, i, s }) => {
        const showMarker = !markerShown && i >= markerAt;
        if (showMarker) markerShown = true;
        const itm = isItm(side, r.strike, spot);
        return (
          <Fragment key={s!.id}>
            {showMarker && spotLine}
            <li>
              <Link to={`/trade?series=${s!.id}`} className={`flex items-center justify-between gap-3 px-3 py-3 ${itm ? "bg-pos/[0.11]" : ""}`}>
                <div>
                  <div className="num text-base font-semibold">{formatPrice(r.strike)}</div>
                  <div className="text-[11px] text-dim">
                    {s!.region} · OI <span className="num">{formatNumber(s!.openContracts)}</span>
                    {itm && <span className="ml-1.5 font-semibold text-pos">ITM</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num flex items-center justify-end gap-1.5 font-semibold">
                    {spot !== undefined && isStalePremium(side, spot, r.strike, s!.premium, s!.maxPayoutPerUnit) && <StaleDot />}
                    {formatPrice(s!.premium)}
                  </div>
                  <div className="num text-[11px] text-dim">{formatPrice(s!.premium * s!.contractSize)}/contract</div>
                </div>
              </Link>
            </li>
          </Fragment>
        );
      })}
      {!markerShown && spotLine}
    </ul>
  );
}

function StaleDot() {
  return (
    <span
      className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-warn/60 bg-warn/15 text-[10px] font-bold text-warn"
      title="Stale premium: the option pays more if exercised now than it costs. Premiums are fixed when a series is written."
      aria-label="Stale premium"
    >
      !
    </span>
  );
}

/** Expiry tabs for the chain. */
export function ExpiryTabs({ groups, value, onChange }: { groups: ExpiryGroup[]; value?: string; onChange: (key: string) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Expiry">
      {groups.map((g) => {
        const active = g.key === value;
        return (
          <button
            key={g.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(g.key)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-left transition-colors ${
              active ? "border-line-3 bg-panel-2 text-fg" : "border-line text-muted hover:border-line-2 hover:text-fg"
            }`}
          >
            <div className="num text-sm font-semibold">{formatDate(g.expiration).replace(/, \d{4}$/, "")}</div>
            <div className="num text-[10px] uppercase tracking-wider opacity-80">
              {formatTenor(g.expiration)} · {g.count} series
            </div>
          </button>
        );
      })}
    </div>
  );
}
