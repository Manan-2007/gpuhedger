import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeries } from "../hooks/useOption";
import { useGpuPrice } from "../hooks/useOracle";
import { calculateCappedOptionPrice, summarizeTrade, yearsUntil } from "../utils/optionsPricing";
import { formatDate, formatNumber, formatPrice, formatUsd } from "../utils/formatters";
import { PriceChart } from "../components/PriceChart";
import { PayoffChart } from "../components/PayoffChart";
import { TradePanel } from "../components/TradePanel";
import { indicativeBid } from "../components/MarketTable";
import { EmptyState, ExplorerLink, KeyValue, OnchainTag, OptionTypeBadge, OracleUnavailable, Skeleton } from "../components/ui";
import { SeriesHeader } from "../components/SeriesHeader";
import { StickyOrderBar } from "../components/StickyOrderBar";

export function MarketDetailPage() {
  const { id } = useParams();
  const seriesId = id !== undefined && /^\d+$/.test(id) ? Number(id) : undefined;
  const { series, isLoading, notFound } = useSeries(seriesId);
  const [contracts, setContracts] = useState(10);

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
  const utilization = s.maxContracts > 0 ? (s.soldContracts / s.maxContracts) * 100 : 0;
  const expired = s.expiration * 1000 <= Date.now();

  const stats: { k: string; v: string; hint?: string; simulated?: boolean }[] = [
    { k: "Ask (premium)", v: `${formatPrice(s.premium)}`, hint: "Executable onchain premium per GPU-hour" },
    { k: "Bid*", v: formatPrice(indicativeBid(s.premium)), hint: "Indicative bid (simulated). No secondary market yet.", simulated: true },
    { k: "Per contract", v: formatUsd(s.premium * s.contractSize), hint: `${formatNumber(s.contractSize)} GPU-hours per contract` },
    { k: "Model price", v: formatPrice(model), hint: "Black-Scholes, for demonstration purposes" },
    { k: "Implied vol", v: `${Math.round(volatility * 100)}%`, hint: "Set onchain in the oracle" },
    { k: "Open interest", v: formatNumber(s.openContracts), hint: "Open contracts onchain" },
    { k: "Available", v: formatNumber(s.availableContracts), hint: "Contracts left to buy" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 lg:pb-8">
      <Link to="/markets" className="text-sm text-muted hover:text-fg">← All markets</Link>

      <div className="mt-4">
        <SeriesHeader series={s} spot={spot} updatedAt={updatedAt} as="h1" />
      </div>

      <dl className="panel-solid mt-6 grid grid-cols-2 divide-line sm:grid-cols-4 lg:grid-cols-7 lg:divide-x">
        {stats.map(({ k, v, hint, simulated }) => (
          <div key={k} className="px-4 py-3" title={hint}>
            <dt className="label flex items-center gap-1 text-[10px]">
              {k}
              {simulated && <span className="text-warn">sim</span>}
            </dt>
            <dd className="num mt-1 text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <div className="panel p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Payoff at expiry · {contracts || 0} contract{contracts === 1 ? "" : "s"}</h2>
              <span className="text-xs text-muted">Drag the scenario slider to test any {s.gpu} price</span>
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
            <h2 className="mb-3 font-semibold">{s.gpu} price</h2>
            <PriceChart gpu={s.gpu} price={spot} volatility={volatility} />
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Who holds the risk</h2>
              <OnchainTag />
            </div>
            <p className="mb-4 text-sm text-muted">
              Fully collateralized: the writer locked <span className="num text-fg">{formatUsd(s.collateralPerContract)}</span> per contract
              up front, so every payout is funded before you buy.{" "}
              <span className="num text-fg">{formatUsd(summary.collateralBacking)}</span> backs your selected {contracts || 0} contracts.
            </p>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted">
                <span>Capacity sold</span>
                <span className="num">{formatNumber(s.soldContracts)} / {formatNumber(s.maxContracts)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.min(utilization, 100)}%` }} />
              </div>
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
                <KeyValue label="Exercised contracts" value={formatNumber(s.exercisedContracts)} />
                <KeyValue label="Paid out" value={formatUsd(s.totalPaidOut)} />
                <KeyValue label="Option contract" value={<ExplorerLink address={s.address} />} />
                <KeyValue label="Writer" value={<ExplorerLink address={s.writer} />} />
                <KeyValue label="Oracle" value={<ExplorerLink address={s.oracle} />} />
                <KeyValue label="Series" value={`#${s.id}`} />
              </div>
            </div>
          </div>
          <p className="text-xs text-dim">*Bid is indicative (simulated); secondary trading is on the roadmap. The ask is the executable onchain premium.</p>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <TradePanel series={s} spot={spot} volatility={volatility} contracts={contracts} onContractsChange={setContracts} />
        </div>
      </div>

      {/* Mobile sticky CTA */}
      {!expired && <StickyOrderBar total={summary.totalPremium} />}
    </div>
  );
}
