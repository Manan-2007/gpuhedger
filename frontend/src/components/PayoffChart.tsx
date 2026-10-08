import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OptionKind } from "../types/options";
import {
  buildPayoffCurve,
  calculateCappedOptionPrice,
  calculatePayoff,
  summarizeTrade,
  yearsUntil,
} from "../utils/optionsPricing";
import { formatPrice, formatSignedUsd, formatUsd, pnlClass } from "../utils/formatters";

export interface PayoffChartProps {
  kind: OptionKind;
  strike: number;
  premium: number; // $ per GPU-hour
  payoutCap: number; // $ per GPU-hour
  contractSize: number;
  contracts: number;
  spot: number; // current oracle price
  volatility: number;
  expiration: number; // unix seconds
  gpuLabel?: string;
  height?: number;
}

/**
 * Payoff at expiry (solid) and estimated model value today (dashed) for the selected
 * position. The user can drag a scenario price to read the P&L at any underlying price.
 */
export function PayoffChart(props: PayoffChartProps) {
  const { kind, strike, premium, payoutCap, contractSize, contracts, spot, volatility, expiration, gpuLabel = "GPU", height = 300 } = props;
  const gpuHours = contractSize * Math.max(contracts, 0);
  const [scenario, setScenario] = useState(spot);

  // Follow the oracle when it moves.
  useEffect(() => {
    setScenario(spot);
  }, [spot]);

  const range = useMemo(() => {
    const hi = Math.max(spot, strike) * 2.1;
    const lo = Math.max(Math.min(spot, strike) * 0.35, 0);
    return { lo, hi };
  }, [spot, strike]);

  const T = yearsUntil(expiration);
  const data = useMemo(
    () =>
      buildPayoffCurve({
        kind,
        strike,
        premium,
        payoutCap,
        gpuHours: Math.max(gpuHours, 1e-9),
        volatility,
        timeToExpiry: T,
        spotMin: range.lo,
        spotMax: range.hi,
      }),
    // T changes every render by microseconds; rounding avoids churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, strike, premium, payoutCap, gpuHours, volatility, range.lo, range.hi, Math.round(T * 1e5)],
  );

  const summary = summarizeTrade({ kind, strike, premium, payoutCap, contractSize, contracts });
  const pnlNowAtExpiry = calculatePayoff(kind, spot, strike, premium, payoutCap) * gpuHours;
  const pnlScenario = calculatePayoff(kind, scenario, strike, premium, payoutCap) * gpuHours;
  const modelNow =
    (calculateCappedOptionPrice(kind, { spot, strike, timeToExpiry: T, volatility }, payoutCap) - premium) * gpuHours;

  // Gradient split at y = 0 so profit fills green and loss fills red.
  const ys = data.map((d) => d.expiry);
  const yMax = Math.max(...ys, 0);
  const yMin = Math.min(...ys, 0);
  const zeroOffset = yMax === yMin ? 0.5 : yMax / (yMax - yMin);
  const gradId = `pf-${kind}-${strike}`.replace(/\W/g, "");

  if (gpuHours <= 0) {
    return <div className="grid h-40 place-items-center text-sm text-muted">Enter a quantity to see the payoff profile.</div>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Metric label="Maximum loss" value={formatUsd(-summary.maxLoss)} cls="text-neg" hint="Premium paid" />
        <Metric label="Break-even" value={`${formatPrice(summary.breakEven)}/h`} hint={`${gpuLabel} price at expiry`} />
        <Metric
          label="Potential profit"
          value={summary.maxProfit > 0 ? `up to ${formatUsd(summary.maxProfit)}` : formatUsd(summary.maxProfit)}
          cls="text-pos"
          hint={`Capped: payout limited to ${formatPrice(payoutCap)}/GPU-h (fully collateralized)`}
        />
        <Metric label="Current P&L" value={formatSignedUsd(pnlNowAtExpiry)} cls={pnlClass(pnlNowAtExpiry)} hint={`If settled at ${formatPrice(spot)} today`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted" aria-label="Legend">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5 bg-primary" /> P&L at expiry
        </span>
        <span className="flex items-center gap-2">
          <span className="w-5 border-t-2 border-dashed border-secondary" /> Est. value today (model)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-0.5 bg-fg/60" /> Oracle price
        </span>
      </div>

      <div className="mt-2 w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 18, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="var(--color-pos)" stopOpacity={0.28} />
                <stop offset={zeroOffset} stopColor="var(--color-pos)" stopOpacity={0.04} />
                <stop offset={zeroOffset} stopColor="var(--color-neg)" stopOpacity={0.04} />
                <stop offset={1} stopColor="var(--color-neg)" stopOpacity={0.28} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="spot"
              type="number"
              domain={[range.lo, range.hi]}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              tick={{ fill: "var(--color-dim)", fontSize: 11 }}
              stroke="var(--color-line-2)"
              tickCount={7}
            />
            <YAxis
              tickFormatter={(v: number) => compactUsd(v)}
              tick={{ fill: "var(--color-dim)", fontSize: 11 }}
              stroke="var(--color-line-2)"
              width={56}
            />
            <Tooltip content={<PayoffTooltip />} cursor={{ stroke: "var(--color-line-2)", strokeWidth: 1 }} />
            <ReferenceLine y={0} stroke="var(--color-dim)" />
            <ReferenceLine
              x={strike}
              stroke="var(--color-muted)"
              strokeDasharray="4 4"
              label={{ value: `Strike ${formatPrice(strike)}`, position: "insideTopLeft", fill: "var(--color-muted)", fontSize: 11 }}
            />
            {summary.breakEven > range.lo && summary.breakEven < range.hi && (
              <ReferenceLine
                x={summary.breakEven}
                stroke="var(--color-dim)"
                strokeDasharray="2 4"
                label={{ value: "B/E", position: "insideBottomLeft", fill: "var(--color-dim)", fontSize: 10 }}
              />
            )}
            <ReferenceLine
              x={spot}
              stroke="var(--color-fg)"
              strokeOpacity={0.6}
              label={{ value: `Oracle ${formatPrice(spot)}`, position: "top", fill: "var(--color-fg)", fontSize: 11 }}
            />
            {Math.abs(scenario - spot) > 1e-6 && (
              <ReferenceLine x={scenario} stroke="var(--color-secondary)" strokeOpacity={0.7} strokeDasharray="1 3" />
            )}
            <Area type="linear" dataKey="expiry" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} />
            <Line type="linear" dataKey="expiry" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} name="At expiry" />
            <Line
              type="monotone"
              dataKey="today"
              stroke="var(--color-secondary)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              name="Today (model)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-bg/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="scenario" className="label">
            Scenario: {gpuLabel} price at expiry
          </label>
          <div className="num text-sm">
            <span className="text-fg">{formatPrice(scenario)}/h</span>
            <span className="mx-2 text-dim">→</span>
            <span className={pnlClass(pnlScenario)}>{formatSignedUsd(pnlScenario)}</span>
          </div>
        </div>
        <input
          id="scenario"
          type="range"
          min={range.lo}
          max={range.hi}
          step={0.01}
          value={scenario}
          onChange={(e) => setScenario(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--color-secondary)]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-dim">
          <span>Model value today: <span className={`num ${pnlClass(modelNow)}`}>{formatSignedUsd(modelNow)}</span></span>
          <button className="hover:text-fg" onClick={() => setScenario(spot)}>
            Reset to oracle
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, cls = "", hint }: { label: string; value: string; cls?: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="label">{label}</div>
      <div className={`num mt-1 text-base font-semibold ${cls}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-dim">{hint}</div>}
    </div>
  );
}

function compactUsd(v: number) {
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `$${a.toFixed(0)}`;
  return v < 0 ? `−${s}` : s;
}

interface TooltipPayload {
  payload: { spot: number; expiry: number; today: number };
}

function PayoffTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line-2 bg-panel px-3 py-2 text-xs shadow-xl">
      <div className="num mb-1 text-muted">Underlying {formatPrice(p.spot)}/h</div>
      <div className="flex justify-between gap-6">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-0.5 w-3 bg-primary" />
          At expiry
        </span>
        <span className={`num font-semibold ${pnlClass(p.expiry)}`}>{formatSignedUsd(p.expiry)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="w-3 border-t border-dashed border-secondary" />
          Today (model)
        </span>
        <span className={`num ${pnlClass(p.today)}`}>{formatSignedUsd(p.today)}</span>
      </div>
    </div>
  );
}
