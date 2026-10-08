import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isActive, useMarkets } from "../hooks/useOption";
import { useFuturesMarkets } from "../hooks/useFutures";
import { useAllGpuPrices } from "../hooks/useOracle";
import { GPU_SYMBOLS, type GpuSymbol } from "../types/markets";
import type { OptionSeries } from "../types/options";
import type { FuturesMarket } from "../hooks/useFutures";
import { formatNumber, formatPrice, formatTenor, formatUsd } from "../utils/formatters";
import { EmptyState, OptionTypeBadge, OracleUnavailable, SectionHeader, SimulatedTag } from "../components/ui";

type Role = "BUYER" | "PROVIDER";

/** Effective $/GPU-hour for a buyer (cost) or provider (revenue) at underlying price S. */
function optionEffective(role: Role, s: OptionSeries, price: number) {
  if (role === "BUYER") {
    const payout = Math.min(Math.max(price - s.strike, 0), s.maxPayoutPerUnit);
    return price - payout + s.premium;
  }
  const payout = Math.min(Math.max(s.strike - price, 0), s.maxPayoutPerUnit);
  return price + payout - s.premium;
}

function futuresEffective(m: FuturesMarket, price: number) {
  // Long cost and short revenue are both: S − clamp(S − F, −B, +B)
  return price - Math.max(Math.min(price - m.forwardPrice, m.band), -m.band);
}

interface Candidate {
  key: string;
  kind: "option" | "future";
  label: string;
  series?: OptionSeries;
  future?: FuturesMarket;
  contracts: number;
  upfront: number; // premium paid ($), or margin posted for futures
  premium: number; // cost of protection ($) — 0 for futures
  protectedPrice: number; // worst effective $/h within the protected range
  protectedUntil: number; // underlying price beyond which protection stops
  effectiveAtStress: number;
  meetsTarget: boolean;
}

export function HedgePage() {
  const prices = useAllGpuPrices();
  const { series } = useMarkets();
  const { markets: futures } = useFuturesMarkets();
  const [role, setRole] = useState<Role>("BUYER");
  const [gpu, setGpu] = useState<GpuSymbol>("H100");
  const [hours, setHours] = useState(5000);
  const oracle = prices.find((p) => p.gpu === gpu);
  // 0 disables every calculation below; the UI shows "Oracle unavailable" instead of a made-up price.
  const spot = oracle?.price ?? 0;
  const [targetInput, setTargetInput] = useState("");
  const [stressInput, setStressInput] = useState("");
  const target = targetInput === "" ? (role === "BUYER" ? spot * 1.15 : spot * 0.88) : Number(targetInput);
  const stress = stressInput === "" ? (role === "BUYER" ? spot * 2 : spot * 0.5) : Number(stressInput);

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    const kind = role === "BUYER" ? "CALL" : "PUT";
    for (const s of series.filter((x) => x.gpu === gpu && x.kind === kind && isActive(x))) {
      const contracts = Math.ceil(hours / s.contractSize);
      if (contracts > s.availableContracts) continue;
      const premiumTotal = s.premium * s.contractSize * contracts;
      const protectedPrice = role === "BUYER" ? s.strike + s.premium : s.strike - s.premium;
      const protectedUntil = role === "BUYER" ? s.strike + s.maxPayoutPerUnit : Math.max(s.strike - s.maxPayoutPerUnit, 0);
      out.push({
        key: `o${s.id}`,
        kind: "option",
        label: `${s.kind} ${formatPrice(s.strike)} · ${formatTenor(s.expiration)} · ${s.region}`,
        series: s,
        contracts,
        upfront: premiumTotal,
        premium: premiumTotal,
        protectedPrice,
        protectedUntil,
        effectiveAtStress: optionEffective(role, s, stress),
        meetsTarget: role === "BUYER" ? protectedPrice <= target : protectedPrice >= target,
      });
    }
    for (const m of futures.filter((f) => f.gpu === gpu && f.expiration > Date.now() / 1000)) {
      const contracts = Math.ceil(hours / m.contractSize);
      if (contracts > m.availableContracts) continue;
      out.push({
        key: `f${m.id}`,
        kind: "future",
        label: `${role === "BUYER" ? "LONG" : "SHORT"} future @ ${formatPrice(m.forwardPrice)} · ${formatTenor(m.expiration)}`,
        future: m,
        contracts,
        upfront: m.band * m.contractSize * contracts,
        premium: 0,
        protectedPrice: m.forwardPrice,
        protectedUntil: role === "BUYER" ? m.forwardPrice + m.band : m.forwardPrice - m.band,
        effectiveAtStress: futuresEffective(m, stress),
        meetsTarget: role === "BUYER" ? m.forwardPrice <= target : m.forwardPrice >= target,
      });
    }
    // Best first: meets target, then lowest protection cost (options) / best locked price.
    return out.sort((a, b) => {
      if (a.meetsTarget !== b.meetsTarget) return a.meetsTarget ? -1 : 1;
      const better = role === "BUYER" ? a.effectiveAtStress - b.effectiveAtStress : b.effectiveAtStress - a.effectiveAtStress;
      return Math.abs(better) > 1e-9 ? better : a.premium - b.premium;
    });
  }, [series, futures, gpu, role, hours, target, stress]);

  const best = candidates[0];
  const bestOption = candidates.find((c) => c.kind === "option");
  const bestFuture = candidates.find((c) => c.kind === "future");

  const chart = useMemo(() => {
    if (spot <= 0) return [];
    const lo = spot * 0.4;
    const hi = Math.max(spot * 2.4, stress * 1.1);
    return Array.from({ length: 81 }, (_, i) => {
      const p = lo + ((hi - lo) * i) / 80;
      return {
        price: Math.round(p * 1000) / 1000,
        unhedged: Math.round(p * hours),
        option: bestOption?.series ? Math.round(optionEffective(role, bestOption.series, p) * hours) : undefined,
        future: bestFuture?.future ? Math.round(futuresEffective(bestFuture.future, p) * hours) : undefined,
      };
    });
  }, [spot, stress, hours, role, bestOption, bestFuture]);

  const noun = role === "BUYER" ? "cost" : "revenue";
  const unhedgedStress = stress * hours;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="Hedge calculator" title="How much compute risk do you carry?">
        <p className="max-w-sm text-sm text-muted">Built for AI teams planning GPU spend — and providers planning revenue.</p>
      </SectionHeader>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="panel space-y-4 self-start p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-0.5">
            {([["BUYER", "I buy compute"], ["PROVIDER", "I sell compute"]] as [Role, string][]).map(([r, l]) => (
              <button key={r} onClick={() => { setRole(r); setTargetInput(""); setStressInput(""); }} className={`seg py-2 ${role === r ? "bg-panel-2 text-fg" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          <Field label="GPU">
            <div className="grid grid-cols-3 gap-1.5">
              {GPU_SYMBOLS.map((g) => (
                <button key={g} onClick={() => { setGpu(g); setTargetInput(""); setStressInput(""); }} className={`seg border py-2 ${gpu === g ? "border-primary/60 bg-primary/10 text-primary" : "border-line text-muted"}`}>{g}</button>
              ))}
            </div>
          </Field>
          <Field label={role === "BUYER" ? "GPU-hours you'll need" : "GPU-hours you'll sell"}>
            <input className="input" inputMode="numeric" value={hours || ""} onChange={(e) => setHours(parseInt(e.target.value.replace(/\D/g, "").slice(0, 8) || "0", 10))} />
            <div className="mt-1.5 flex gap-1.5">
              {[1000, 5000, 20000, 100000].map((h) => (
                <button key={h} onClick={() => setHours(h)} className="seg num border border-line text-muted hover:text-fg">{formatNumber(h)}</button>
              ))}
            </div>
          </Field>
          <Field label={role === "BUYER" ? "Most you can pay ($/GPU-h)" : "Least you can accept ($/GPU-h)"}>
            <input className="input" inputMode="decimal" placeholder={target.toFixed(2)} value={targetInput} onChange={(e) => setTargetInput(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label={`Stress scenario: ${gpu} price ($/GPU-h)`}>
            <input className="input" inputMode="decimal" placeholder={stress.toFixed(2)} value={stressInput} onChange={(e) => setStressInput(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <div className="rounded-lg border border-line bg-bg/50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">{gpu} today (oracle)</span><span className="num">{oracle?.price !== undefined ? `${formatPrice(spot)}/h` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Exposure today</span><span className="num">{oracle?.price !== undefined ? formatUsd(spot * hours, 0) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Unhedged {noun} in stress</span><span className={`num ${"text-neg"}`}>{formatUsd(unhedgedStress, 0)}</span></div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {oracle?.unavailable ? (
            <OracleUnavailable gpu={gpu} />
          ) : hours <= 0 || spot <= 0 ? (
            <EmptyState title="Enter your compute needs" body="Tell us how many GPU-hours you need to see hedge options." />
          ) : !best ? (
            <EmptyState title="No live hedge covers this size" body="Try fewer GPU-hours or another GPU. Admins can create more capacity." />
          ) : (
            <>
              <div className="panel border-primary/50 bg-primary/[0.04] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="label text-primary">Recommended hedge</div>
                    <div className="mt-1.5 flex items-center gap-2 text-lg font-semibold">
                      {best.series ? <OptionTypeBadge kind={best.series.kind} /> : <span className={`chip ${role === "BUYER" ? "border-call/35 text-call" : "border-put/35 text-put"}`}>{role === "BUYER" ? "LONG" : "SHORT"}</span>}
                      {gpu} {best.label}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {formatNumber(best.contracts)} contracts · covers {formatNumber(best.contracts * (best.series?.contractSize ?? best.future?.contractSize ?? 100))} GPU-hours
                    </div>
                  </div>
                  <Link
                    to={best.series ? `/trade?series=${best.series.id}&qty=${best.contracts}` : "/futures"}
                    className="btn-primary"
                  >
                    {best.series ? `BUY THIS HEDGE · ${formatUsd(best.upfront)}` : "OPEN ON FUTURES →"}
                  </Link>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric label={best.kind === "option" ? "Cost of protection" : "Margin posted"} value={formatUsd(best.upfront)} sub={best.kind === "future" ? "returned ± P&L" : `${((best.premium / (spot * hours)) * 100).toFixed(2)}% of exposure`} />
                  <Metric label={role === "BUYER" ? "Locked max price" : "Locked min price"} value={`${formatPrice(best.protectedPrice)}/h`} sub={`protected until ${formatPrice(best.protectedUntil)}`} />
                  <Metric label={`Hedged ${noun} in stress`} value={formatUsd(best.effectiveAtStress * hours, 0)} sub={`vs ${formatUsd(unhedgedStress, 0)} unhedged`} />
                  <Metric
                    label={role === "BUYER" ? "Saved in stress" : "Protected in stress"}
                    value={formatUsd(Math.abs(unhedgedStress - best.effectiveAtStress * hours), 0)}
                    cls="text-pos"
                    sub={best.meetsTarget ? "meets your target ✓" : "closest to your target"}
                  />
                </div>
              </div>

              <div className="panel p-4 sm:p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Total {noun} vs. {gpu} price</h2>
                  <span className="text-xs text-muted">{formatNumber(hours)} GPU-hours, at settlement</span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-muted" /> Unhedged</span>
                  {bestOption && <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" /> Best option hedge</span>}
                  {bestFuture && <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-secondary" /> Best futures hedge</span>}
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
                              <div className="num mb-1 text-muted">{gpu} at {formatPrice((payload[0].payload as { price: number }).price)}/h</div>
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
                      <ReferenceLine x={stress} stroke="var(--color-neg)" strokeOpacity={0.6} strokeDasharray="3 3" label={{ value: "Stress", position: "top", fill: "var(--color-muted)", fontSize: 11 }} />
                      <Line type="linear" dataKey="unhedged" stroke="var(--color-muted)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      {bestOption && <Line type="linear" dataKey="option" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />}
                      {bestFuture && <Line type="linear" dataKey="future" stroke="var(--color-secondary)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      {["Hedge", "Contracts", "Upfront", role === "BUYER" ? "Max price" : "Min price", "Protected until", `In stress`, ""].map((h) => (
                        <th key={h} className="label px-4 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => (
                      <tr key={c.key} className={`border-b border-line/60 last:border-0 ${i === 0 ? "bg-primary/[0.04]" : ""}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium">{c.label}</span>
                          {c.meetsTarget && <span className="ml-2 text-[10px] font-semibold text-pos">MEETS TARGET</span>}
                        </td>
                        <td className="num px-4 py-3">{formatNumber(c.contracts)}</td>
                        <td className="num px-4 py-3">{formatUsd(c.upfront)}{c.kind === "future" && <span className="text-[10px] text-dim"> margin</span>}</td>
                        <td className="num px-4 py-3">{formatPrice(c.protectedPrice)}</td>
                        <td className="num px-4 py-3">{formatPrice(c.protectedUntil)}</td>
                        <td className="num px-4 py-3">{formatUsd(c.effectiveAtStress * hours, 0)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link to={c.series ? `/trade?series=${c.series.id}&qty=${c.contracts}` : "/futures"} className="text-xs font-semibold text-secondary hover:underline">
                            {c.series ? "Buy →" : "Open →"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex items-center gap-2 text-xs text-dim">
                <SimulatedTag label="Illustrative" /> Settlement-value maths using live onchain series and oracle prices; ignores time value and fees.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-dim">{sub}</div>}
    </div>
  );
}
