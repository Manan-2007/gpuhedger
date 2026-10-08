import type { OptionKind, OptionSeries } from "../types/options";
import { GPU_SYMBOLS, type GpuSymbol } from "../types/markets";
import { formatPrice, formatTenor } from "../utils/formatters";

export interface Selection {
  gpu: GpuSymbol;
  kind: OptionKind;
  seriesId?: number;
}

/** Step-by-step picker: GPU → CALL/PUT → strike → expiry. Only live onchain series are selectable. */
export function OptionSelector({
  series,
  selection,
  onChange,
  prices,
}: {
  series: OptionSeries[];
  selection: Selection;
  onChange: (s: Selection) => void;
  prices: Partial<Record<GpuSymbol, number>>;
}) {
  const forGpuKind = series.filter((s) => s.gpu === selection.gpu && s.kind === selection.kind);
  const selected = series.find((s) => s.id === selection.seriesId);
  const strikes = [...new Set(forGpuKind.map((s) => s.strike))].sort((a, b) => a - b);
  // Cheapest live premium at each strike, shown on the chip so prices are comparable at a glance.
  const premiumAt = (k: number) => Math.min(...forGpuKind.filter((s) => s.strike === k).map((s) => s.premium));
  const expiries = selected ? forGpuKind.filter((s) => s.strike === selected.strike).sort((a, b) => a.expiration - b.expiration) : [];

  const pick = (gpu: GpuSymbol, kind: OptionKind, strike?: number) => {
    const pool = series.filter((s) => s.gpu === gpu && s.kind === kind && (strike === undefined || s.strike === strike));
    const spot = prices[gpu] ?? 0;
    // Default to the nearest-to-money strike, then the nearest expiry
    const best = [...pool].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot) || a.expiration - b.expiration)[0];
    onChange({ gpu, kind, seriesId: best?.id });
  };

  return (
    <div className="panel-solid space-y-5 p-4 sm:p-5">
      <Step n="01" title="Choose your GPU">
        <div className="grid grid-cols-3 gap-2">
          {GPU_SYMBOLS.map((g) => (
            <button
              key={g}
              onClick={() => pick(g, selection.kind)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                selection.gpu === g ? "border-primary/60 bg-primary/[0.07]" : "border-line hover:border-line-2"
              }`}
            >
              <div className="font-semibold">{g}</div>
              <div className="num text-xs text-muted">{prices[g] !== undefined ? `${formatPrice(prices[g]!)}/h` : "—"}</div>
            </button>
          ))}
        </div>
      </Step>

      <Step n="02" title="Choose your option">
        <div className="grid grid-cols-2 gap-2">
          {(["CALL", "PUT"] as OptionKind[]).map((k) => (
            <button
              key={k}
              onClick={() => pick(selection.gpu, k)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                selection.kind === k
                  ? k === "CALL"
                    ? "border-call/60 bg-call/[0.08]"
                    : "border-put/60 bg-put/[0.08]"
                  : "border-line hover:border-line-2"
              }`}
            >
              <div className={`font-semibold ${k === "CALL" ? "text-call" : "text-put"}`}>{k}</div>
              <div className="text-xs text-muted">{k === "CALL" ? "Protects against rising prices" : "Protects against falling prices"}</div>
            </button>
          ))}
        </div>
      </Step>

      <Step n="03" title="Choose your protection">
        {strikes.length === 0 ? (
          <p className="text-sm text-muted">No live {selection.gpu} {selection.kind} series yet. An admin can create one from the Admin page.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="label mb-1.5">Strike ($ / GPU-hour)</div>
              <div className="flex flex-wrap gap-1.5">
                {strikes.map((k) => (
                  <button
                    key={k}
                    onClick={() => pick(selection.gpu, selection.kind, k)}
                    className={`seg num border text-left ${selected?.strike === k ? "border-primary/60 bg-primary/10 text-primary" : "border-line text-muted hover:text-fg"}`}
                  >
                    <div className="text-sm">{formatPrice(k)}</div>
                    <div className="text-[10px] font-normal opacity-80">{formatPrice(premiumAt(k))} premium</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-1.5">Expiration</div>
              <div className="flex flex-wrap gap-1.5">
                {expiries.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onChange({ ...selection, seriesId: s.id })}
                    className={`seg num border ${selection.seriesId === s.id ? "border-primary/60 bg-primary/10 text-primary" : "border-line text-muted hover:text-fg"}`}
                  >
                    {formatTenor(s.expiration)} · {s.region}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Step>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="num text-xs text-primary">{n}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {children}
    </div>
  );
}
