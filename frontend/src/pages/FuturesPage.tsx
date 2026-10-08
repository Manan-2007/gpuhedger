import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { contracts, hasFutures } from "../contracts/addresses";
import { futuresPnlPerUnit, useFuturesActions, useFuturesMarkets, type FuturesMarket, type FuturesSide } from "../hooks/useFutures";
import { useAllGpuPrices } from "../hooks/useOracle";
import { useUSDC, useUSDCActions } from "../hooks/useUSDC";
import { GPU_META } from "../data/marketData";
import { formatNumber, formatPrice, formatSignedUsd, formatTenor, formatUsd, pnlClass } from "../utils/formatters";
import { FuturesPositions } from "../components/FuturesPositions";
import { TransactionStatus } from "../components/TransactionStatus";
import { ConnectButton, SwitchNetworkButton, useWrongNetwork } from "../components/WalletButton";
import { EmptyState, KeyValue, OnchainTag, SectionHeader, Skeleton, Spinner } from "../components/ui";

export function FuturesPage() {
  const { markets, isLoading } = useFuturesMarkets();
  const prices = useAllGpuPrices();
  const [selectedId, setSelectedId] = useState<number>();
  const now = Date.now() / 1000;
  const live = markets.filter((m) => m.expiration > now);
  const selected = markets.find((m) => m.id === selectedId) ?? live[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="GPU futures" title="Lock in a compute price">
        <OnchainTag label="ComputeFutures" />
      </SectionHeader>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="panel p-4 text-sm">
          <span className="chip border-pos/30 bg-pos/10 text-pos">LONG</span>
          <p className="mt-2 text-muted">
            <b className="text-fg">For AI startups.</b> Lock in what you'll pay per GPU-hour. If the price rises above the forward,
            the gain offsets your higher compute bill; if it falls, you pay the difference — your net cost stays near the forward.
          </p>
        </div>
        <div className="panel p-4 text-sm">
          <span className="chip border-neg/30 bg-neg/10 text-neg">SHORT</span>
          <p className="mt-2 text-muted">
            <b className="text-fg">For GPU providers.</b> Lock in what you'll earn per GPU-hour. If rental prices fall, the short pays
            you the difference.
          </p>
        </div>
      </div>

      {!hasFutures ? (
        <EmptyState title="Futures not deployed" body="Deploy the latest contracts to enable GPU futures." />
      ) : isLoading ? (
        <Skeleton className="h-80" />
      ) : markets.length === 0 ? (
        <EmptyState title="No futures markets yet" body="An admin can create one from the Admin page." action={<Link to="/admin" className="btn-secondary">GO TO ADMIN</Link>} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {markets.map((m) => {
              const spot = prices.find((p) => p.gpu === m.gpu)?.price ?? 0;
              const basis = spot > 0 ? ((m.forwardPrice - spot) / spot) * 100 : 0;
              const expired = m.expiration <= now;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`panel p-4 text-left transition-colors ${selected?.id === m.id ? "border-primary/60" : "hover:border-line-2"} ${expired ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-bold">{m.gpu} <span className="text-xs font-normal text-muted">{m.region}</span></div>
                      <div className="text-xs text-muted">{GPU_META[m.gpu].name}</div>
                    </div>
                    <span className="num text-xs text-muted">{formatTenor(m.expiration)}</span>
                  </div>
                  <div className="num mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
                    <div><div className="text-[10px] uppercase text-dim">Forward</div><div className="text-sm font-semibold">{formatPrice(m.forwardPrice)}</div></div>
                    <div><div className="text-[10px] uppercase text-dim">Spot</div><div className="text-sm">{formatPrice(spot)}</div></div>
                    <div><div className="text-[10px] uppercase text-dim">Basis</div><div className="text-sm">{basis >= 0 ? "+" : "−"}{Math.abs(basis).toFixed(1)}%</div></div>
                  </div>
                  <div className="mt-2 text-[11px] text-dim">
                    OI {formatNumber(m.longContracts)} long / {formatNumber(m.shortContracts)} short · band ±{formatPrice(m.band)}
                  </div>
                </button>
              );
            })}
          </div>
          {selected && <FuturesTrade market={selected} spot={prices.find((p) => p.gpu === selected.gpu)?.price ?? selected.forwardPrice} />}
        </>
      )}
      <FuturesPositions title="Your futures positions" />
    </div>
  );
}

function FuturesTrade({ market: m, spot }: { market: FuturesMarket; spot: number }) {
  const { isConnected } = useAccount();
  const wrong = useWrongNetwork();
  const usdc = useUSDC(contracts.futures);
  const usdcTx = useUSDCActions();
  const tx = useFuturesActions();
  const [side, setSide] = useState<FuturesSide>("LONG");
  const [qty, setQty] = useState(10);
  const [accepted, setAccepted] = useState(false);
  const [last, setLast] = useState<"approve" | "open">("open");

  const gpuHours = m.contractSize * qty;
  const marginRaw = m.bandRaw * BigInt(m.contractSize) * BigInt(qty > 0 ? qty : 0);
  const margin = m.band * gpuHours;
  const pnlNow = futuresPnlPerUnit(side, spot, m.forwardPrice, m.band) * gpuHours;
  const expired = m.expiration <= Date.now() / 1000;
  const busy = tx.isBusy || usdcTx.isBusy;

  const data = useMemo(() => {
    const lo = Math.max(m.forwardPrice - m.band * 1.6, 0);
    const hi = m.forwardPrice + m.band * 1.6;
    return Array.from({ length: 81 }, (_, i) => {
      const s = lo + ((hi - lo) * i) / 80;
      return { spot: Math.round(s * 1000) / 1000, pnl: Math.round(futuresPnlPerUnit(side, s, m.forwardPrice, m.band) * gpuHours * 100) / 100 };
    });
  }, [m, side, gpuHours]);

  let action: React.ReactNode;
  if (!isConnected) action = <ConnectButton className="w-full py-3" label="CONNECT WALLET" />;
  else if (wrong) action = <SwitchNetworkButton className="w-full py-3" />;
  else if (expired) action = <button className="btn-secondary w-full py-3" disabled>MARKET EXPIRED</button>;
  else if (!(qty > 0)) action = <button className="btn-secondary w-full py-3" disabled>ENTER QUANTITY</button>;
  else if (qty > m.availableContracts) action = <button className="btn-secondary w-full py-3" disabled>ONLY {m.availableContracts} AVAILABLE</button>;
  else if (usdc.balanceRaw !== undefined && usdc.balanceRaw < marginRaw)
    action = <button className="btn-secondary w-full py-3" onClick={() => usdcTx.faucet()} disabled={busy}>INSUFFICIENT USDC — GET TEST USDC</button>;
  else if (!accepted) action = <button className="btn-secondary w-full py-3" disabled>ACKNOWLEDGE RISK TO CONTINUE</button>;
  else if (usdc.allowanceRaw < marginRaw)
    action = (
      <button className="btn-primary w-full py-3" disabled={busy} onClick={() => { setLast("approve"); usdcTx.approve(contracts.futures, marginRaw); }}>
        {busy && <Spinner />} APPROVE {formatUsd(margin)} MARGIN
      </button>
    );
  else
    action = (
      <button className={`${side === "LONG" ? "btn-pos" : "btn-neg"} w-full py-3`} disabled={busy} onClick={() => { setLast("open"); tx.open(m, side, qty); }}>
        {busy && <Spinner />} OPEN {side}
      </button>
    );

  const state = last === "open" ? tx.state : usdcTx.state;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="panel min-w-0 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{m.gpu} future · forward {formatPrice(m.forwardPrice)} · {formatTenor(m.expiration)}</h2>
          <span className="text-xs text-muted">P&L at expiry, {formatNumber(gpuHours)} GPU-h</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 16, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="spot" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fill: "var(--color-dim)", fontSize: 11 }} stroke="var(--color-line-2)" />
              <YAxis tickFormatter={(v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(0)}`} tick={{ fill: "var(--color-dim)", fontSize: 11 }} stroke="var(--color-line-2)" width={60} />
              <Tooltip
                cursor={{ stroke: "var(--color-line-2)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-line-2 bg-panel px-3 py-2 text-xs shadow-xl">
                      <div className="num text-muted">{m.gpu} at expiry {formatPrice(Number((payload[0].payload as { spot: number }).spot))}/h</div>
                      <div className={`num font-semibold ${pnlClass(Number(payload[0].value))}`}>{formatSignedUsd(Number(payload[0].value))}</div>
                    </div>
                  ) : null
                }
              />
              <ReferenceLine y={0} stroke="var(--color-dim)" />
              <ReferenceLine x={m.forwardPrice} stroke="var(--color-muted)" strokeDasharray="4 4" label={{ value: `Forward ${formatPrice(m.forwardPrice)}`, position: "insideTopLeft", fill: "var(--color-muted)", fontSize: 11 }} />
              <ReferenceLine x={spot} stroke="var(--color-fg)" strokeOpacity={0.6} label={{ value: `Oracle ${formatPrice(spot)}`, position: "top", fill: "var(--color-fg)", fontSize: 11 }} />
              <Line type="linear" dataKey="pnl" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-muted">
          {side === "LONG"
            ? `Locks your ${m.gpu} cost near ${formatPrice(m.forwardPrice)}/GPU-hour for moves within ±${formatPrice(m.band)}. Beyond the band, gains and losses are capped so both sides stay fully funded.`
            : `Locks your ${m.gpu} revenue near ${formatPrice(m.forwardPrice)}/GPU-hour for moves within ±${formatPrice(m.band)}.`}
        </p>
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-0.5">
          {(["LONG", "SHORT"] as FuturesSide[]).map((s) => (
            <button key={s} onClick={() => setSide(s)} className={`seg py-2 ${side === s ? (s === "LONG" ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg") : "text-muted"}`}>
              {s}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="label">Contracts</span>
          <div className="mt-1.5 flex items-center gap-2">
            <input className="input" inputMode="numeric" value={qty || ""} onChange={(e) => setQty(parseInt(e.target.value.replace(/\D/g, "").slice(0, 6) || "0", 10))} />
            <span className="num shrink-0 text-xs text-muted">× {m.contractSize} GPU-h</span>
          </div>
        </label>
        <div className="mt-4 divide-y divide-line rounded-lg border border-line bg-bg/50 px-3.5 py-1.5">
          <KeyValue label="Forward price" value={`${formatPrice(m.forwardPrice)}/h`} />
          <KeyValue label="Oracle price" value={`${formatPrice(spot)}/h`} />
          <KeyValue label="P&L if settled now" value={formatSignedUsd(pnlNow)} valueClass={pnlClass(pnlNow)} />
          <KeyValue label="Max gain / max loss" value={`±${formatUsd(margin)}`} />
          <KeyValue label="Premium" value="None" />
          <div className="flex items-baseline justify-between py-2.5">
            <span className="text-sm font-semibold">Margin posted</span>
            <span className="num text-lg font-semibold text-primary">{formatUsd(margin)}</span>
          </div>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-fg/90">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
          I understand futures can lose up to the full margin if the price moves against me by the band or more.
        </label>
        <div className="mt-4">{action}</div>
        {state.phase !== "idle" && (
          <div className="mt-3">
            <TransactionStatus
              state={state}
              onDismiss={() => (last === "open" ? tx.reset() : usdcTx.reset())}
              successNote={<span className="text-muted">{last === "open" ? "Position opened — see it below." : "Margin approved. Open your position."}</span>}
            />
          </div>
        )}
      </div>
    </div>
  );
}
