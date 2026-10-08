import type { OptionSeries } from "../types/options";
import { GPU_META } from "../data/marketData";
import { formatDate, formatPct, formatPrice } from "../utils/formatters";
import { Ago, Countdown, OptionTypeBadge } from "./ui";
import { chainNow } from "../lib/clock";

/** Plain-language distance between the oracle price and the strike. */
export function moneyness(s: Pick<OptionSeries, "kind" | "strike" | "maxPayoutPerUnit">, spot: number) {
  const itm = s.kind === "CALL" ? spot > s.strike : spot < s.strike;
  const intrinsic = itm ? Math.min(Math.abs(spot - s.strike), s.maxPayoutPerUnit) : 0;
  const movePct = spot > 0 ? ((s.strike - spot) / spot) * 100 : 0;
  return { itm, intrinsic, movePct };
}

/**
 * Identity + live state of one option series: what it is, when it expires, where the oracle is,
 * and how far the price has to move before it pays.
 */
export function SeriesHeader({
  series: s,
  spot,
  updatedAt,
  as: Heading = "h2",
}: {
  series: OptionSeries;
  spot: number;
  updatedAt?: number;
  as?: "h1" | "h2";
}) {
  const { itm, intrinsic, movePct } = moneyness(s, spot);
  const expired = s.expiration * 1000 <= chainNow();
  const direction = s.kind === "CALL" ? "rises above" : "falls below";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <Heading className="text-2xl font-bold tracking-tight sm:text-3xl">{s.gpu}</Heading>
          <OptionTypeBadge kind={s.kind} className="text-xs" />
          <span className="num text-xl font-semibold sm:text-2xl">{formatPrice(s.strike)}</span>
          <span className="text-sm text-muted">strike / GPU-h</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
          <span>{GPU_META[s.gpu].name}</span>
          <span aria-hidden className="text-dim">·</span>
          <span>
            Expires <span className="num text-fg">{formatDate(s.expiration)}</span>
            {!expired && (
              <>
                {" "}(<Countdown expiration={s.expiration} />)
              </>
            )}
          </span>
          <span aria-hidden className="text-dim">·</span>
          <span className="chip border-line-2 text-muted">{s.region}</span>
          {expired ? (
            <span className="chip border-line-2 text-dim">{s.settled ? "Settled" : "Expired"}</span>
          ) : itm ? (
            <span className="chip border-pos/40 bg-pos/10 text-pos">In the money</span>
          ) : (
            <span className="chip border-line-2 text-muted">Out of the money</span>
          )}
        </div>
      </div>

      <div className="shrink-0 sm:text-right">
        <div className="label flex items-center gap-1.5 sm:justify-end">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden />
          {s.gpu} oracle price
        </div>
        <div className="num mt-1 text-3xl font-semibold">
          {formatPrice(spot)}
          <span className="ml-1 text-sm font-normal text-dim">/GPU-h</span>
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {updatedAt ? (
            <>
              Updated <Ago timestamp={updatedAt} /> · onchain
            </>
          ) : (
            "Onchain"
          )}
        </div>
        {!expired && (
          <div className={`mt-1 text-xs ${itm ? "text-pos" : "text-muted"}`}>
            {itm
              ? `In the money by ${formatPrice(intrinsic)}/GPU-h`
              : `Pays if ${s.gpu} ${direction} ${formatPrice(s.strike)} (${formatPct(movePct)} from here)`}
          </div>
        )}
      </div>
    </div>
  );
}
