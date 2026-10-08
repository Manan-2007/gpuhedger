import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeries } from "../hooks/useOption";
import { useGpuPrice } from "../hooks/useOracle";
import { GPU_META } from "../data/marketData";
import { calculateCappedOptionPrice, summarizeTrade, yearsUntil } from "../utils/optionsPricing";
import { formatDate, formatDuration, formatNumber, formatPrice, formatTenor, formatUsd, timeAgo } from "../utils/formatters";
import { PriceChart } from "../components/PriceChart";
import { PayoffChart } from "../components/PayoffChart";
import { TradePanel } from "../components/TradePanel";
import { indicativeBid } from "../components/MarketTable";
import { EmptyState, ExplorerLink, KeyValue, OnchainTag, OptionTypeBadge, OracleUnavailable, Skeleton } from "../components/ui";
import { useNow } from "../hooks/useNow";

export function MarketDetailPage() {
  const { id } = useParams();
  const seriesId = id !== undefined && /^\d+$/.test(id) ? Number(id) : undefined;
  const { series, isLoading, notFound } = useSeries(seriesId);
  const [contracts, setContracts] = useState(10);
  useNow(1_000);

  if (seriesId === undefined || notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState
          title="Invalid option"
          body="This option series doesn't exist on the OptionFactory."
          action={<Link to="/markets" className="btn-primary">BACK TO MARKETS</Link>}
        />
      </div>
    );
  }
  if (isLoading || !series) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  return <Detail series={series} contracts={contracts} setContracts={setContracts} />;
}

type SeriesView = NonNullable<ReturnType<typeof useSeries>["series"]>;

/** Gate: nothing on this page is priced until the oracle has answered. */
function Detail({ series: s, contracts, setContracts }: { series: SeriesView; contracts: number; setContracts: (n: number) => void }) {
  const oracle = useGpuPrice(s.gpu);
  if (oracle.price === undefined || oracle.volatility === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link to="/markets" className="text-sm text-muted hover:text-fg">← All markets</Link>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <h1 className="text-3xl font-bold tracking-tight">{s.gpu}</h1>
          <OptionTypeBadge kind={s.kind} className="text-xs" />
          <span className="num text-sm text-muted">Strike {formatPrice(s.strike)}/GPU-h · expires {formatDate(s.expiration)}</span>
        </div>
        {oracle.isLoading ? <Skeleton className="mt-6 h-80 w-full" /> : <OracleUnavailable gpu={s.gpu} className="mt-6" />}
      </div>
    );
  }
  return <DetailBody series={s} contracts={contracts} setContracts={setContracts} spot={oracle.price} volatility={oracle.volatility} updatedAt={oracle.updatedAt} />;
}

function DetailBody({ series: s, contracts, setContracts, spot, volatility, updatedAt }: {
  series: SeriesView;
  contracts: number;
  setContracts: (n: number) => void;
  spot: number;
  volatility: number;
  updatedAt?: number;
}) {
  const T = yearsUntil(s.expiration);
  const model = calculateCappedOptionPrice(s.kind, { spot, strike: s.strike, timeToExpiry: T, volatility }, s.maxPayoutPerUnit);
  const summary = summarizeTrade({ kind: s.kind, strike: s.strike, premium: s.premium, payoutCap: s.maxPayoutPerUnit, contractSize: s.contractSize, contracts });
  const itm = s.kind === "CALL" ? spot > s.strike : spot < s.strike;
  const utilization = s.maxContracts > 0 ? (s.soldContracts / s.maxContracts) * 100 : 0;
  const expired = s.expiration * 1000 <= Date.now();

  const stats: [string, string, string?][] = [
    ["Current price", `${formatPrice(spot)}`, "text-fg"],
    ["Strike", formatPrice(s.strike)],
    ["Expiration", formatTenor(s.expiration)],
    ["Contract size", `${formatNumber(s.contractSize)} GPU-h`],
    ["Premium", formatPrice(s.premium)],
    ["Implied vol", `${Math.round(volatility * 100)}%`],
    ["Open interest", formatNumber(s.openContracts)],
    ["Bid*", formatPrice(indicativeBid(s.premium))],
    ["Ask", formatPrice(s.premium)],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 lg:pb-8">
      <Link to="/markets" className="text-sm text-muted hover:text-fg">← All markets</Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">{s.gpu}</h1>
            <OptionTypeBadge kind={s.kind} className="text-xs" />
            <span className="chip border-line-2 text-muted">{s.region}</span>
            {itm && !expired && <span className="chip border-pos/30 bg-pos/10 text-pos">In the money</span>}
            {expired && <span className="chip border-line-2 text-dim">{s.settled ? "Settled" : "Expired"}</span>}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {GPU_META[s.gpu].name} · Strike <span className="num text-fg">{formatPrice(s.strike)}</span>/GPU-h · expires{" "}
            <span className="num text-fg">{formatDate(s.expiration)}</span> ({formatDuration(s.expiration - Date.now() / 1000)})
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className="label">{s.gpu} oracle price</div>
          <div className="num text-3xl font-semibold">{formatPrice(spot)}<span className="ml-1 text-sm text-dim">/GPU-h</span></div>
          <div className="text-xs text-dim">
            {updatedAt ? `Updated ${timeAgo(updatedAt)} · onchain` : "Onchain"}
          </div>
        </div>
      </div>

      <div className="panel-solid mt-6 grid grid-cols-3 divide-line sm:grid-cols-5 lg:grid-cols-9 lg:divide-x">
        {stats.map(([k, v, cls]) => (
          <div key={k} className="px-4 py-3">
            <div className="label text-[10px]">{k}</div>
            <div className={`num mt-1 text-sm font-semibold ${cls ?? ""}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <div className="panel p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">{s.gpu} price history</h2>
            <PriceChart gpu={s.gpu} price={spot} volatility={volatility} />
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Payoff · {contracts || 0} contract{contracts === 1 ? "" : "s"}</h2>
              <span className="text-xs text-muted">
                Model price <span className="num text-fg">{formatPrice(model)}</span> — for demonstration purposes
              </span>
            </div>
            <PayoffChart
              kind={s.kind}
              strike={s.strike}
              premium={s.premium}
              payoutCap={s.maxPayoutPerUnit}
              contractSize={s.contractSize}
              contracts={contracts}
              spot={spot}
              volatility={volatility}
              expiration={s.expiration}
              gpuLabel={s.gpu}
            />
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Series & collateral</h2>
              <OnchainTag />
            </div>
            <div className="grid gap-x-10 sm:grid-cols-2">
              <div className="divide-y divide-line">
                <KeyValue label="Settlement" value="Cash, test USDC" />
                <KeyValue label="Exercise style" value="Any time before expiry" />
                <KeyValue label="Payout cap / GPU-h" value={formatPrice(s.maxPayoutPerUnit)} />
                <KeyValue label="Collateral / contract" value={formatUsd(s.collateralPerContract)} />
                <KeyValue label="Locked collateral" value={formatUsd(s.lockedCollateral)} />
                <KeyValue label="Collateral held" value={formatUsd(s.collateralBalance)} />
              </div>
              <div className="divide-y divide-line">
                <KeyValue label="Capacity sold" value={`${formatNumber(s.soldContracts)} / ${formatNumber(s.maxContracts)}`} />
                <KeyValue label="Exercised contracts" value={formatNumber(s.exercisedContracts)} />
                <KeyValue label="Paid out" value={formatUsd(s.totalPaidOut)} />
                <KeyValue label="Option contract" value={<ExplorerLink address={s.address} />} />
                <KeyValue label="Writer" value={<ExplorerLink address={s.writer} />} />
                <KeyValue label="Oracle" value={<ExplorerLink address={s.oracle} />} />
              </div>
            </div>
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.min(utilization, 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">
                Fully collateralized: the writer locked {formatUsd(s.collateralPerContract)} per contract up front, so every payout
                is funded before you buy. {formatUsd(summary.collateralBacking)} backs your selected {contracts || 0} contracts.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <TradePanel series={s} spot={spot} volatility={volatility} contracts={contracts} onContractsChange={setContracts} />
        </div>
      </div>

      {/* Mobile sticky CTA */}
      {!expired && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 p-3 backdrop-blur lg:hidden">
          <a href="#trade-panel" className={"btn-primary w-full py-3"}>
            BUY {s.kind} · {formatUsd(summary.totalPremium)}
          </a>
        </div>
      )}
    </div>
  );
}
