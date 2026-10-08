import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMarkets } from "../hooks/useOption";
import { useAllGpuPrices } from "../hooks/useOracle";
import { GPU_META, marketData } from "../data/marketData";
import { GPU_SYMBOLS, isGpuSymbol, type GpuSymbol } from "../types/markets";
import type { OptionKind } from "../types/options";
import { formatCompact, formatPct, formatPrice } from "../utils/formatters";
import { MarketTable } from "../components/MarketTable";
import { EmptyState, ErrorNote, OnchainTag, SectionHeader, SimulatedTag, Skeleton } from "../components/ui";
import { isConfigured } from "../contracts/addresses";

type ExpiryBucket = "ALL" | "SHORT" | "MID" | "LONG";
const EXPIRY_LABEL: Record<ExpiryBucket, string> = { ALL: "All", SHORT: "≤ 14D", MID: "15–45D", LONG: "> 45D" };

export function MarketsPage() {
  const [params, setParams] = useSearchParams();
  const { series, isLoading, isError } = useMarkets();
  const prices = useAllGpuPrices();
  const priceMap = Object.fromEntries(prices.map((p) => [p.gpu, p.price])) as Record<GpuSymbol, number>;

  const gpuParam = params.get("gpu") ?? "ALL";
  const gpu: GpuSymbol | "ALL" = isGpuSymbol(gpuParam) ? gpuParam : "ALL";
  const [kind, setKind] = useState<OptionKind | "ALL">("ALL");
  const [region, setRegion] = useState("ALL");
  const [expiry, setExpiry] = useState<ExpiryBucket>("ALL");
  const [minStrike, setMinStrike] = useState("");
  const [maxStrike, setMaxStrike] = useState("");
  const [showExpired, setShowExpired] = useState(false);

  const regions = useMemo(() => ["ALL", ...new Set(series.map((s) => s.region))], [series]);

  const filtered = useMemo(() => {
    const now = Date.now() / 1000;
    return series
      .filter((s) => gpu === "ALL" || s.gpu === gpu)
      .filter((s) => kind === "ALL" || s.kind === kind)
      .filter((s) => region === "ALL" || s.region === region)
      .filter((s) => {
        const days = (s.expiration - now) / 86400;
        if (expiry === "SHORT") return days <= 14;
        if (expiry === "MID") return days > 14 && days <= 45;
        if (expiry === "LONG") return days > 45;
        return true;
      })
      .filter((s) => (minStrike === "" ? true : s.strike >= Number(minStrike)))
      .filter((s) => (maxStrike === "" ? true : s.strike <= Number(maxStrike)))
      .filter((s) => showExpired || (!s.settled && s.expiration > now))
      .sort((a, b) => a.gpu.localeCompare(b.gpu) || a.kind.localeCompare(b.kind) || a.strike - b.strike || a.expiration - b.expiration);
  }, [series, gpu, kind, region, expiry, minStrike, maxStrike, showExpired]);

  const setGpu = (g: GpuSymbol | "ALL") => {
    if (g === "ALL") params.delete("gpu");
    else params.set("gpu", g);
    setParams(params, { replace: true });
  };

  const reset = () => {
    setGpu("ALL");
    setKind("ALL");
    setRegion("ALL");
    setExpiry("ALL");
    setMinStrike("");
    setMaxStrike("");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="Markets" title="GPU compute options">
        <OnchainTag label="Series read from OptionFactory" />
      </SectionHeader>

      {/* Underlying overview */}
      <div className="grid gap-3 md:grid-cols-3">
        {prices.map((p) => {
          const st = marketData.getStats(p.gpu);
          return (
            <button
              key={p.gpu}
              onClick={() => setGpu(gpu === p.gpu ? "ALL" : p.gpu)}
              className={`panel p-4 text-left transition-colors ${gpu === p.gpu ? "border-primary/60" : "hover:border-line-2"}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold">{p.gpu}</div>
                  <div className="text-xs text-muted">{GPU_META[p.gpu].name}</div>
                </div>
                <div className="text-right">
                  <div className="num text-xl font-semibold">{formatPrice(p.price)}</div>
                  <div className="text-[11px] text-dim">{p.isLive ? "oracle · $/GPU-h" : "simulated"}</div>
                </div>
              </div>
              <div className="num mt-3 grid grid-cols-4 gap-2 border-t border-line pt-3 text-xs">
                <Stat k="24h" v={formatPct(st.change24h)} cls={st.change24h >= 0 ? "text-pos" : "text-neg"} />
                <Stat k="7d" v={formatPct(st.change7d)} cls={st.change7d >= 0 ? "text-pos" : "text-neg"} />
                <Stat k="Vol (IV)" v={`${Math.round(p.volatility * 100)}%`} />
                <Stat k="24h GPU-h" v={formatCompact(st.volume24h)} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-dim">
        <SimulatedTag /> 24h/7d change and rental volume are simulated. Prices and implied vol come from the onchain oracle.
      </div>

      {/* Filters */}
      <div className="panel mt-8 flex flex-wrap items-end gap-4 p-4">
        <Filter label="GPU">
          <Seg options={["ALL", ...GPU_SYMBOLS]} value={gpu} onChange={(v) => setGpu(v as GpuSymbol | "ALL")} />
        </Filter>
        <Filter label="Type">
          <Seg options={["ALL", "CALL", "PUT"]} value={kind} onChange={(v) => setKind(v as OptionKind | "ALL")} />
        </Filter>
        <Filter label="Region">
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="input py-1.5 text-xs">
            {regions.map((r) => (
              <option key={r} value={r}>{r === "ALL" ? "All regions" : r}</option>
            ))}
          </select>
        </Filter>
        <Filter label="Expiration">
          <Seg options={Object.keys(EXPIRY_LABEL)} labels={EXPIRY_LABEL} value={expiry} onChange={(v) => setExpiry(v as ExpiryBucket)} />
        </Filter>
        <Filter label="Strike ($)">
          <div className="flex items-center gap-1.5">
            <input className="input w-20 py-1.5 text-xs" placeholder="min" inputMode="decimal" value={minStrike} onChange={(e) => setMinStrike(e.target.value.replace(/[^\d.]/g, ""))} />
            <span className="text-dim">–</span>
            <input className="input w-20 py-1.5 text-xs" placeholder="max" inputMode="decimal" value={maxStrike} onChange={(e) => setMaxStrike(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        </Filter>
        <label className="flex items-center gap-2 pb-1.5 text-xs text-muted">
          <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} className="accent-[var(--color-primary)]" />
          Show expired
        </label>
        <button onClick={reset} className="btn-ghost ml-auto px-3 py-1.5 text-xs">Reset</button>
      </div>

      <div className="mt-4">
        {!isConfigured ? (
          <EmptyState title="Contracts not configured" body="Deploy the contracts and set the addresses to load markets. See the README." />
        ) : isError ? (
          <ErrorNote>Couldn't load markets from the OptionFactory. Check your RPC connection and try again.</ErrorNote>
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No markets match these filters"
            body={series.length === 0 ? "No option series have been created yet. An admin can create one." : "Try widening your filters."}
            action={series.length === 0 ? <Link to="/admin" className="btn-secondary">GO TO ADMIN</Link> : <button onClick={reset} className="btn-secondary">RESET FILTERS</button>}
          />
        ) : (
          <MarketTable series={filtered} prices={priceMap} />
        )}
      </div>
    </div>
  );
}

function Stat({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-dim">{k}</div>
      <div className={`mt-0.5 ${cls}`}>{v}</div>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Seg({ options, value, onChange, labels }: { options: string[]; value: string; onChange: (v: string) => void; labels?: Record<string, string> }) {
  return (
    <div className="flex rounded-lg border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={`seg ${value === o ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
