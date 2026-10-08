import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GpuSymbol, TimeRange } from "../types/markets";
import { marketData } from "../data/marketData";
import { useOracleHistory } from "../hooks/useOracle";
import { formatDateTime, formatPrice } from "../utils/formatters";
import { OnchainTag, SimulatedTag } from "./ui";

const RANGES: TimeRange[] = ["1H", "1D", "1W", "1M", "3M"];
type Mode = "simulated" | "oracle";

/** GPU price history. Market history is simulated; the "Oracle" tab shows real onchain updates. */
export function PriceChart({ gpu, price, volatility, height = 260 }: { gpu: GpuSymbol; price: number; volatility: number; height?: number }) {
  const [range, setRange] = useState<TimeRange>("1M");
  const [mode, setMode] = useState<Mode>("simulated");
  const oracle = useOracleHistory(gpu);

  const data = useMemo(() => {
    if (mode === "oracle") {
      const pts = [...oracle.points];
      // Extend the last update to "now" so a step chart reads correctly.
      if (pts.length) pts.push({ t: Date.now(), price: pts[pts.length - 1].price });
      return pts;
    }
    return marketData.getHistory(gpu, range, price, volatility);
  }, [mode, oracle.points, gpu, range, price, volatility]);

  const first = data[0]?.price ?? price;
  const change = first > 0 ? ((price - first) / first) * 100 : 0;
  const spanMs = data.length > 1 ? data[data.length - 1].t - data[0].t : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-bg p-0.5">
            {(["simulated", "oracle"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`seg ${mode === m ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
              >
                {m === "simulated" ? "Market" : "Oracle updates"}
              </button>
            ))}
          </div>
          {mode === "simulated" ? <SimulatedTag label="Simulated market data" /> : <OnchainTag label="Onchain oracle" />}
        </div>
        {mode === "simulated" && (
          <div className="flex rounded-lg border border-line bg-bg p-0.5">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`seg num ${range === r ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "simulated" && (
        <div className="num mt-3 text-xs text-muted">
          {range} change <span className={change >= 0 ? "text-pos" : "text-neg"}>{change >= 0 ? "+" : "−"}{Math.abs(change).toFixed(2)}%</span>
        </div>
      )}

      <div className="mt-2 w-full" style={{ height }}>
        {mode === "oracle" && data.length < 2 ? (
          <div className="grid h-full place-items-center text-sm text-muted">No oracle updates yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`pc-${gpu}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-secondary)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tickFormatter={(t: number) => tickLabel(t, spanMs)}
                tick={{ fill: "var(--color-dim)", fontSize: 11 }}
                stroke="var(--color-line-2)"
                minTickGap={40}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                tick={{ fill: "var(--color-dim)", fontSize: 11 }}
                stroke="var(--color-line-2)"
                width={52}
                orientation="right"
              />
              <Tooltip
                cursor={{ stroke: "var(--color-line-2)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-line-2 bg-panel px-3 py-2 text-xs shadow-xl">
                      <div className="text-muted">{formatDateTime((payload[0].payload as { t: number }).t / 1000)}</div>
                      <div className="num mt-0.5 font-semibold text-fg">{formatPrice(Number(payload[0].value))} / GPU-h</div>
                    </div>
                  ) : null
                }
              />
              <Area
                type={mode === "oracle" ? "stepAfter" : "monotone"}
                dataKey="price"
                stroke="var(--color-secondary)"
                strokeWidth={2}
                fill={`url(#pc-${gpu})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function tickLabel(t: number, spanMs: number) {
  const d = new Date(t);
  if (spanMs <= 2 * 3600_000) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (spanMs <= 2 * 86400_000) return d.toLocaleTimeString("en-US", { hour: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
