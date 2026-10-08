import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMarkets } from "../hooks/useOption";
import { useFuturesMarkets } from "../hooks/useFutures";
import { useAllGpuPrices } from "../hooks/useOracle";
import { GPU_SYMBOLS, type GpuSymbol } from "../types/markets";
import { DAY, hedgeCurve, rankHedges, type HedgeCandidate, type HedgeRole } from "../utils/hedge";
import { formatDate, formatNumber, formatPct, formatPrice, formatTenor, formatUsd } from "../utils/formatters";
import { EmptyState, OptionTypeBadge, OracleUnavailable, SectionHeader } from "../components/ui";
import { chainNow } from "../lib/clock";

const HORIZONS = [
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
];

const describe = (c: HedgeCandidate, role: HedgeRole) =>
  c.series
    ? `${c.series.kind} ${formatPrice(c.series.strike)} · ${formatTenor(c.expiration)} · ${c.series.region}`
    : `${role === "BUYER" ? "LONG" : "SHORT"} future @ ${formatPrice(c.future!.forwardPrice)} · ${formatTenor(c.expiration)}`;

const tradeLink = (c: HedgeCandidate) => (c.series ? `/trade?series=${c.series.id}&qty=${c.contracts}` : "/futures");

export function HedgePage() {
  const prices = useAllGpuPrices();
  const { series } = useMarkets();
  const { markets: futures } = useFuturesMarkets();
  const [role, setRole] = useState<HedgeRole>("BUYER");
  const [gpu, setGpu] = useState<GpuSymbol>("H100");
  const [hours, setHours] = useState(5000);
  const [horizon, setHorizon] = useState(30);
  const [targetInput, setTargetInput] = useState("");
  const [stressInput, setStressInput] = useState("");

  const oracle = prices.find((p) => p.gpu === gpu);
  // 0 disables every calculation below; the UI shows "Oracle unavailable" instead of a made-up price.
  const spot = oracle?.price ?? 0;
  const target = targetInput === "" ? (role === "BUYER" ? spot * 1.15 : spot * 0.88) : Number(targetInput);
  const stress = stressInput === "" ? (role === "BUYER" ? spot * 2 : spot * 0.5) : Number(stressInput);
  const now = Math.floor(chainNow() / 1000);
  const needBy = now + horizon * DAY;

  const candidates = useMemo(
    () => rankHedges(series, futures, { role, gpu, hours, target, stress, needBy, now }),
    // `now` moves every render; needBy captures the horizon at day granularity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, futures, role, gpu, hours, target, stress, horizon],
  );
  const best = candidates[0];
  const bestOption = candidates.find((c) => c.kind === "option");
  const bestFuture = candidates.find((c) => c.kind === "future");
  const chart = useMemo(
    () => hedgeCurve(role, hours, spot, stress, bestOption?.series, bestFuture?.future),
    [role, hours, spot, stress, bestOption, bestFuture],
  );

  const noun = role === "BUYER" ? "cost" : "revenue";
  const unhedgedStress = stress * hours;
  const resetPrices = () => {
    setTargetInput("");
    setStressInput("");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="Hedge calculator" title="Cap next month's GPU bill">
        <p className="max-w-sm text-sm text-muted">
          Tell us how much compute you need and when. We'll find the onchain hedge that protects that budget.
        </p>
      </SectionHeader>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Inputs */}
        <div className="panel space-y-5 self-start p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg-deep p-0.5">
            {([["BUYER", "I buy compute"], ["PROVIDER", "I sell compute"]] as [HedgeRole, string][]).map(([r, l]) => (
              <button key={r} onClick={() => { setRole(r); resetPrices(); }} aria-pressed={role === r} className={`seg py-2 ${role === r ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
                {l}
              </button>
            ))}
          </div>

          <Field label="GPU">
            <div className="grid grid-cols-3 gap-1.5">
              {GPU_SYMBOLS.map((g) => (
                <button key={g} onClick={() => { setGpu(g); resetPrices(); }} aria-pressed={gpu === g} className={`seg border py-2 ${gpu === g ? "border-line-3 bg-panel-2 text-fg" : "border-line text-muted hover:text-fg"}`}>
                  {g}
                </button>
              ))}
            </div>
          </Field>

          <Field label={role === "BUYER" ? "GPU-hours you'll need" : "GPU-hours you'll sell"} htmlFor="hedge-hours">
            <input id="hedge-hours" className="input" inputMode="numeric" value={hours || ""} onChange={(e) => setHours(parseInt(e.target.value.replace(/\D/g, "").slice(0, 8) || "0", 10))} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[1000, 5000, 20000, 100000].map((h) => (
                <button key={h} onClick={() => setHours(h)} className={`seg num border ${hours === h ? "border-line-3 bg-panel-2 text-fg" : "border-line text-muted hover:text-fg"}`}>
                  {formatNumber(h)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={role === "BUYER" ? "When do you buy it?" : "When do you sell it?"}>
            <div className="grid grid-cols-4 gap-1.5">
              {HORIZONS.map((h) => (
                <button key={h.days} onClick={() => setHorizon(h.days)} aria-pressed={horizon === h.days} className={`seg border px-1 py-2 ${horizon === h.days ? "border-line-3 bg-panel-2 text-fg" : "border-line text-muted hover:text-fg"}`}>
                  {h.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-dim">The hedge must still be live on {formatDate(needBy)}.</p>
          </Field>

          <Field label={role === "BUYER" ? "Most you can pay ($/GPU-h)" : "Least you can accept ($/GPU-h)"} htmlFor="hedge-target">
            <input id="hedge-target" className="input" inputMode="decimal" placeholder={target.toFixed(2)} value={targetInput} onChange={(e) => setTargetInput(e.target.value.replace(/[^\d.]/g, ""))} />
            <p className="mt-1.5 text-[11px] text-dim">Default: today's price {role === "BUYER" ? "+15%" : "−12%"}.</p>
          </Field>

          <Field label={`What if ${gpu} goes to… ($/GPU-h)`} htmlFor="hedge-stress">
            <input id="hedge-stress" className="input" inputMode="decimal" placeholder={stress.toFixed(2)} value={stressInput} onChange={(e) => setStressInput(e.target.value.replace(/[^\d.]/g, ""))} />
            <p className="mt-1.5 text-[11px] text-dim">Stress scenario. Default: today's price {role === "BUYER" ? "×2" : "×0.5"}.</p>
          </Field>

          <dl className="space-y-1.5 rounded-lg border border-line bg-bg-deep/50 p-3 text-sm">
            <Row k={`${gpu} today (oracle)`} v={oracle?.price !== undefined ? `${formatPrice(spot)}/GPU-h` : "—"} />
            <Row k={`${role === "BUYER" ? "Cost" : "Revenue"} at today's price`} v={oracle?.price !== undefined ? formatUsd(spot * hours, 0) : "—"} />
            <Row k={`Unhedged ${noun} in the scenario`} v={oracle?.price !== undefined ? formatUsd(unhedgedStress, 0) : "—"} />
          </dl>
        </div>

        {/* Results */}
        <div className="min-w-0 space-y-6">
          {oracle?.unavailable ? (
            <OracleUnavailable gpu={gpu} />
          ) : hours <= 0 || spot <= 0 ? (
            <EmptyState title="Enter your compute needs" body="Tell us how many GPU-hours you need to see hedge options." />
          ) : !best ? (
            <EmptyState
              title="No live hedge covers this size"
              body={`No ${gpu} series has capacity for ${formatNumber(hours)} GPU-hours right now. Try fewer hours or another GPU.`}
            />
          ) : (
            <>
              <Recommendation best={best} role={role} gpu={gpu} hours={hours} spot={spot} stress={stress} needBy={needBy} />

              <div className="panel p-4 sm:p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Total {noun} vs. {gpu} price</h2>
                  <span className="text-xs text-muted">{formatNumber(hours)} GPU-hours, at settlement</span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-muted" /> Unhedged</span>
                  {bestOption && <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" /> Best option hedge</span>}
                  {bestFuture && <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-secondary" /> Best futures hedge</span>}
                  <span className="flex items-center gap-2"><span className="h-3 w-px bg-secondary" /> Today</span>
                </div>
                <div className="mt-2 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} margin={{ top: 16, right: 12, bottom: 4, left: 8 }}>
                      <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                      <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fill: "var(--color-dim)", fontSize: 11 }} stroke="var(--color-line-2)" />
                      <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} tick={{ fill: "var(--color-dim)", fontSize: 11 }} stroke="var(--color-line-2)" width={56} />
                      <Tooltip
                        cursor={{ stroke: "var(--color-line-2)" }}
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <div className="popover px-3 py-2 text-xs">
                              <div className="num mb-1 text-muted">{gpu} at {formatPrice((payload[0].payload as { price: number }).price)}/GPU-h</div>
                              {payload.map((p) => (
                                <div key={String(p.dataKey)} className="flex justify-between gap-6">
                                  <span className="text-muted">{p.dataKey === "unhedged" ? "Unhedged" : p.dataKey === "option" ? "Option hedge" : "Futures hedge"}</span>
                                  <span className="num text-fg">{formatUsd(Number(p.value), 0)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null
                        }
                      />
                      <ReferenceLine x={spot} stroke="var(--color-secondary)" label={{ value: "Today", position: "top", fill: "var(--color-secondary)", fontSize: 11 }} />
                      <ReferenceLine x={stress} stroke="var(--color-chart-ref)" strokeDasharray="3 3" label={{ value: "Scenario", position: "top", fill: "var(--color-muted)", fontSize: 11 }} />
                      <Line type="linear" dataKey="unhedged" stroke="var(--color-muted)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      {bestOption && <Line type="linear" dataKey="option" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />}
                      {bestFuture && <Line type="linear" dataKey="future" stroke="var(--color-secondary)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h2 className="mb-3 font-semibold">All hedges that fit</h2>
                <div className="panel-solid overflow-x-auto">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left">
                        {["Hedge", "Expires", "Contracts", "Upfront", role === "BUYER" ? "Max price" : "Min price", "Protected to", "In scenario", ""].map((h, k) => (
                          <th key={h} className={`label px-4 py-3 font-medium ${k >= 2 && k <= 6 ? "text-right" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c, k) => (
                        <tr key={c.key} className={`border-b border-line/60 last:border-0 ${k === 0 ? "bg-panel-2" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{describe(c, role)}</div>
                            <div className="mt-0.5 flex gap-2 text-[10px] font-semibold uppercase tracking-wider">
                              {k === 0 && <span className="text-fg">Recommended</span>}
                              {c.meetsTarget && <span className="text-pos">Meets target</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="num">{formatDate(c.expiration)}</div>
                            {!c.coversNeed && <div className="text-[11px] text-warn">Ends before you need it</div>}
                          </td>
                          <td className="num px-4 py-3 text-right">{formatNumber(c.contracts)}</td>
                          <td className="num px-4 py-3 text-right">
                            {formatUsd(c.upfront)}
                            {c.kind === "future" && <div className="text-[10px] text-dim">margin</div>}
                          </td>
                          <td className="num px-4 py-3 text-right">{formatPrice(c.protectedPrice)}</td>
                          <td className="num px-4 py-3 text-right">{formatPrice(c.protectedUntil)}</td>
                          <td className="num px-4 py-3 text-right">{formatUsd(c.effectiveAtStress * hours, 0)}</td>
                          <td className="px-4 py-3 text-right">
                            <Link to={tradeLink(c)} className="text-xs font-semibold text-secondary hover:underline">
                              {c.series ? "Buy →" : "Open →"}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-dim">
                Settlement-value maths on live onchain series and oracle prices. It ignores time value and fees, and payouts are
                capped at each series' collateralized maximum. Not financial advice.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Recommendation({ best, role, gpu, hours, spot, stress, needBy }: {
  best: HedgeCandidate;
  role: HedgeRole;
  gpu: string;
  hours: number;
  spot: number;
  stress: number;
  needBy: number;
}) {
  const noun = role === "BUYER" ? "cost" : "revenue";
  const unhedged = stress * hours;
  const hedged = best.effectiveAtStress * hours;
  const difference = Math.abs(unhedged - hedged);
  const what = best.series
    ? `${formatNumber(best.contracts)} ${gpu} ${best.series.kind} contracts at a ${formatPrice(best.series.strike)} strike`
    : `${formatNumber(best.contracts)} ${gpu} ${role === "BUYER" ? "LONG" : "SHORT"} futures at ${formatPrice(best.future!.forwardPrice)}`;
  const capped = role === "BUYER" ? "capped at" : "floored at";

  return (
    <section className="panel border-line-3 p-4 sm:p-5" aria-labelledby="rec-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div id="rec-title" className="label">Recommended hedge</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-lg font-semibold">
            {best.series ? (
              <OptionTypeBadge kind={best.series.kind} />
            ) : (
              <span className={`chip ${role === "BUYER" ? "border-call/35 bg-call/10 text-call" : "border-put/35 bg-put/10 text-put"}`}>{role === "BUYER" ? "LONG" : "SHORT"}</span>
            )}
            {gpu} {describe(best, role)}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Buy {what}, expiring <span className="num text-fg">{formatDate(best.expiration)}</span>, for{" "}
            <span className="num text-fg">{formatUsd(best.upfront)}</span>
            {best.kind === "future" ? " of margin" : ""}. Your {gpu} {noun} is {capped}{" "}
            <span className="num text-fg">{formatPrice(best.protectedPrice)}/GPU-h</span> while {gpu} stays{" "}
            {role === "BUYER" ? "below" : "above"} <span className="num text-fg">{formatPrice(best.protectedUntil)}</span>.
            {stress !== spot && (
              <>
                {" "}At <span className="num text-fg">{formatPrice(stress)}</span> you {role === "BUYER" ? "pay" : "earn"}{" "}
                <span className="num text-fg">{formatUsd(hedged, 0)}</span> instead of <span className="num text-fg">{formatUsd(unhedged, 0)}</span>.
              </>
            )}
          </p>
        </div>
        <Link to={tradeLink(best)} className="btn-primary shrink-0">
          {best.series ? `Buy this hedge · ${formatUsd(best.upfront)}` : "Open on futures →"}
        </Link>
      </div>

      {!best.coversNeed && (
        <p role="alert" className="mt-4 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-xs text-warn">
          No live hedge lasts until {formatDate(needBy)}. This one expires {formatDate(best.expiration)}, so it only protects compute you
          buy before then.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
        <Metric
          label={best.kind === "option" ? "Cost of protection" : "Margin posted"}
          value={formatUsd(best.upfront)}
          sub={best.kind === "future" ? "returned ± P&L" : `${formatPct((best.premium / (spot * hours)) * 100, 2, false)} of today's ${noun}`}
        />
        <Metric label={role === "BUYER" ? "Locked max price" : "Locked min price"} value={`${formatPrice(best.protectedPrice)}/h`} sub={`protected to ${formatPrice(best.protectedUntil)}`} />
        <Metric label={`Hedged ${noun} in scenario`} value={formatUsd(hedged, 0)} sub={`vs ${formatUsd(unhedged, 0)} unhedged`} />
        <Metric
          label={role === "BUYER" ? "Saved in scenario" : "Protected in scenario"}
          value={difference > 0.5 ? `+${formatUsd(difference, 0)}` : formatUsd(0, 0)}
          cls={difference > 0.5 ? "text-pos" : ""}
          sub={best.meetsTarget ? "meets your price target ✓" : "closest to your price target"}
        />
      </dl>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="num text-right">{v}</dd>
    </div>
  );
}

function Metric({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`num mt-1 text-lg font-semibold ${cls}`}>{value}</dd>
      {sub && <dd className="text-[11px] text-dim">{sub}</dd>}
    </div>
  );
}
