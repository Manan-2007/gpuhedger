import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isActive, useMarkets } from "../hooks/useOption";
import { useAllGpuPrices, useLivePriceMap } from "../hooks/useOracle";
import { isGpuSymbol } from "../types/markets";
import { OptionSelector, type Selection } from "../components/OptionSelector";
import { PayoffChart } from "../components/PayoffChart";
import { TradePanel } from "../components/TradePanel";
import { EmptyState, ErrorNote, OracleUnavailable, SectionHeader, Skeleton } from "../components/ui";
import { formatPrice, formatUsd } from "../utils/formatters";
import { SeriesHeader } from "../components/SeriesHeader";
import { isConfigured } from "../contracts/addresses";

export function TradePage() {
  const [params, setParams] = useSearchParams();
  const { series: all, isLoading, isError } = useMarkets();
  const prices = useAllGpuPrices();
  const priceMap = useLivePriceMap();
  const live = useMemo(() => all.filter((s) => isActive(s)), [all]);
  const paramQty = Number(params.get("qty"));
  const [contracts, setContracts] = useState(Number.isInteger(paramQty) && paramQty > 0 ? paramQty : 10);

  const paramSeries = params.get("series");
  const paramGpu = params.get("gpu");
  const [selection, setSelection] = useState<Selection>({
    gpu: paramGpu && isGpuSymbol(paramGpu) ? paramGpu : "H100",
    kind: params.get("type") === "PUT" ? "PUT" : "CALL",
    seriesId: paramSeries !== null ? Number(paramSeries) : undefined,
  });

  // Resolve the selection once markets load: honour ?series=, otherwise pick nearest-to-money.
  useEffect(() => {
    if (live.length === 0) return;
    const current = live.find((s) => s.id === selection.seriesId);
    if (current) {
      if (current.gpu !== selection.gpu || current.kind !== selection.kind) setSelection({ gpu: current.gpu, kind: current.kind, seriesId: current.id });
      return;
    }
    const pool = live.filter((s) => s.gpu === selection.gpu && s.kind === selection.kind);
    const spot = priceMap[selection.gpu] ?? 0;
    const best = [...pool].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.expiration - b.expiration)[0];
    if (best?.id !== selection.seriesId) setSelection((s) => ({ ...s, seriesId: best?.id }));
  }, [live, selection, priceMap]);

  const onChange = (next: Selection) => {
    setSelection(next);
    const p = new URLSearchParams();
    if (next.seriesId !== undefined) p.set("series", String(next.seriesId));
    setParams(p, { replace: true });
  };

  const selected = live.find((s) => s.id === selection.seriesId);
  const price = prices.find((p) => p.gpu === selection.gpu);
  const spot = price?.price;
  const volatility = price?.volatility;
  const oracleReady = spot !== undefined && volatility !== undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-28 sm:px-6 lg:pb-10">
      <SectionHeader eyebrow="Trade" title="Buy compute protection">
        <p className="max-w-sm text-sm text-muted">Every order is a real transaction on Monad, settling in about a second.</p>
      </SectionHeader>

      {!isConfigured ? (
        <EmptyState title="Contracts not configured" body="Deploy the contracts and set the addresses to trade. See the README." />
      ) : isError ? (
        <ErrorNote>Couldn't load option series from the chain. Check your RPC connection and refresh.</ErrorNote>
      ) : isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-6">
            <OptionSelector series={live} selection={selection} onChange={onChange} prices={priceMap} />
            {selected && !oracleReady ? (
              price?.isLoading ? <Skeleton className="h-96" /> : <OracleUnavailable gpu={selection.gpu} />
            ) : selected && oracleReady ? (
              <div className="panel p-4 sm:p-5">
                <SeriesHeader series={selected} spot={spot} updatedAt={price?.updatedAt} />
                <div className="my-5 flex items-center justify-between gap-2 border-t border-line pt-4">
                  <h3 className="text-sm font-semibold">Payoff at expiry · {contracts || 0} contract{contracts === 1 ? "" : "s"}</h3>
                  <Link to={`/markets/${selected.id}`} className="text-xs text-secondary hover:underline">
                    Full market view →
                  </Link>
                </div>
                <PayoffChart
                  kind={selected.kind}
                  strike={selected.strike}
                  premium={selected.premium}
                  payoutCap={selected.maxPayoutPerUnit}
                  contractSize={selected.contractSize}
                  contracts={contracts}
                  spot={spot}
                  volatility={volatility}
                  expiration={selected.expiration}
                  gpuLabel={selected.gpu}
                />
                <p className="mt-3 text-sm text-muted">
                  {selected.kind === "CALL"
                    ? `If ${selected.gpu} rises above ${formatPrice(selected.strike)}, this option pays the difference — protecting the buyer from the increase.`
                    : `If ${selected.gpu} falls below ${formatPrice(selected.strike)}, this option pays the difference — protecting a provider's revenue.`}
                </p>
              </div>
            ) : null}
          </div>
          <div className="lg:sticky lg:top-20 lg:self-start">
            {selected && oracleReady ? (
              <TradePanel key={selected.id} series={selected} spot={spot} volatility={volatility} contracts={contracts} onContractsChange={setContracts} />
            ) : selected ? null : (
              <EmptyState title="Select a market" body="Choose a GPU, option type, strike and expiry to see your quote." />
            )}
          </div>
        </div>
      )}

      {selected && oracleReady && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 p-3 backdrop-blur lg:hidden">
          <a href="#trade-panel" className={"btn-primary w-full py-3"}>
            REVIEW ORDER · {formatUsd(selected.premium * selected.contractSize * contracts)}
          </a>
        </div>
      )}
    </div>
  );
}
