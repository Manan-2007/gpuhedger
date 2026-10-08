import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isActive, useMarkets } from "../hooks/useOption";
import { useAllGpuPrices } from "../hooks/useOracle";
import { isGpuSymbol, type GpuSymbol } from "../types/markets";
import { OptionSelector, type Selection } from "../components/OptionSelector";
import { PayoffChart } from "../components/PayoffChart";
import { TradePanel } from "../components/TradePanel";
import { EmptyState, ErrorNote, SectionHeader, Skeleton } from "../components/ui";
import { formatPrice, formatTenor, formatUsd } from "../utils/formatters";
import { isConfigured } from "../contracts/addresses";

export function TradePage() {
  const [params, setParams] = useSearchParams();
  const { series: all, isLoading, isError } = useMarkets();
  const prices = useAllGpuPrices();
  const priceMap = useMemo(() => Object.fromEntries(prices.map((p) => [p.gpu, p.price])) as Record<GpuSymbol, number>, [prices]);
  const live = useMemo(() => all.filter((s) => isActive(s)), [all]);
  const [contracts, setContracts] = useState(10);

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
            {selected && price ? (
              <div className="panel p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {selected.gpu} {selected.kind} {formatPrice(selected.strike)} · {formatTenor(selected.expiration)}
                  </h2>
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
                  spot={price.price}
                  volatility={price.volatility}
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
            {selected && price ? (
              <TradePanel key={selected.id} series={selected} spot={price.price} volatility={price.volatility} contracts={contracts} onContractsChange={setContracts} />
            ) : (
              <EmptyState title="Select a market" body="Choose a GPU, option type, strike and expiry to see your quote." />
            )}
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 p-3 backdrop-blur lg:hidden">
          <a href="#trade-panel" className={`${selected.kind === "CALL" ? "btn-pos" : "btn-neg"} w-full py-3`}>
            BUY {selected.kind} · {formatUsd(selected.premium * selected.contractSize * contracts)}
          </a>
        </div>
      )}
    </div>
  );
}
