import { useMemo } from "react";
import { Link } from "react-router-dom";
import { usePublicClient, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Hash } from "viem";
import { computeFuturesAbi, optionFactoryAbi } from "../contracts/abis";
import { contracts, hasFutures, isConfigured } from "../contracts/addresses";
import { useProtocolStats, useRecentActivity } from "../hooks/useProtocol";
import { useBlockTime } from "../hooks/useBlockTime";
import { useVault } from "../hooks/useVault";
import { useMarkets } from "../hooks/useOption";
import { activeChain } from "../lib/chain";
import { formatDateTime, formatNumber, formatUsd, fromUsdc, shortAddress } from "../utils/formatters";
import { EmptyState, ExplorerLink, OnchainTag, SectionHeader, StatCard } from "../components/ui";

/** Resolve each activity record to its transaction hash via the factory's ActivityRecorded logs.
 *  Queries only the exact blocks recorded onchain, so it stays within RPC log-range limits. */
function useActivityTxHashes(activity: ReturnType<typeof useRecentActivity>["activity"]) {
  const client = usePublicClient({ chainId: activeChain.id });
  const blocks = useMemo(() => [...new Set(activity.map((a) => a.blockNumber))], [activity]);
  return useQuery({
    queryKey: ["activity-tx", blocks.map(String).join(",")],
    enabled: Boolean(client) && blocks.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const event = optionFactoryAbi.find((x) => x.type === "event" && x.name === "ActivityRecorded");
      const results = await Promise.all(
        blocks.map((b) =>
          client!
            .getLogs({ address: contracts.optionFactory, event: event as never, fromBlock: b, toBlock: b })
            .catch(() => []),
        ),
      );
      const map = new Map<string, Hash>();
      for (const logs of results) {
        for (const log of logs as unknown as { args: { kind: number; seriesId: bigint; account: string; amount: bigint }; transactionHash: Hash; blockNumber: bigint }[]) {
          const k = `${log.blockNumber}-${log.args.kind}-${log.args.seriesId}-${log.args.account.toLowerCase()}-${log.args.amount}`;
          map.set(k, log.transactionHash);
        }
      }
      return map;
    },
  });
}

const EVENT_STYLE: Record<string, string> = {
  Purchase: "border-secondary/40 text-secondary",
  Exercise: "border-pos/40 bg-pos/10 text-pos",
  Claim: "border-pos/40 bg-pos/10 text-pos",
  "Series created": "border-line-2 text-muted",
  Expiry: "border-line-2 text-dim",
};
const EVENT_LABEL: Record<string, string> = { "Series created": "Series listed", Expiry: "Settled at expiry" };

function EventChip({ kind }: { kind: string }) {
  return <span className={`chip whitespace-nowrap ${EVENT_STYLE[kind] ?? "border-line-2 text-muted"}`}>{EVENT_LABEL[kind] ?? kind}</span>;
}

export function ActivityPage() {
  const { stats } = useProtocolStats();
  const { activity } = useRecentActivity(100);
  const { series } = useMarkets();
  const vault = useVault();
  const hashes = useActivityTxHashes(activity);
  const { blockTime } = useBlockTime();
  const futuresPositions = useReadContract({ address: contracts.futures, abi: computeFuturesAbi, functionName: "totalPositions", query: { enabled: hasFutures, refetchInterval: 5_000 } });
  const futuresNotional = useReadContract({ address: contracts.futures, abi: computeFuturesAbi, functionName: "totalNotional", query: { enabled: hasFutures, refetchInterval: 5_000 } });

  const purchases = useMemo(() => [...activity].filter((a) => a.kind === "Purchase").sort((a, b) => a.timestamp - b.timestamp), [activity]);
  const cumulative = useMemo(() => {
    let vol = 0;
    let hours = 0;
    return purchases.map((p) => {
      vol += p.amount;
      const s = series.find((x) => x.id === p.seriesId);
      hours += p.contracts * (s?.contractSize ?? 100);
      return { t: p.timestamp * 1000, volume: Math.round(vol * 100) / 100, hours };
    });
  }, [purchases, series]);
  const gpuHoursHedged = cumulative.length ? cumulative[cumulative.length - 1].hours : 0;

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState title="Contracts not configured" body="Deploy the contracts to see protocol traction." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="Traction" title="Onchain activity">
        <OnchainTag label={`Live from ${activeChain.name}`} />
      </SectionHeader>
      <p className="-mt-2 mb-6 max-w-3xl text-sm text-muted">
        Every number on this page is read from GpuHedger's contracts. Every row links to its real transaction.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Option trades" value={stats ? formatNumber(stats.trades) : "—"} />
        <StatCard label="Unique wallets" value={stats ? formatNumber(stats.traders) : "—"} />
        <StatCard label="Premium volume" value={stats ? formatUsd(stats.premiumVolume) : "—"} />
        <StatCard label="GPU-hours hedged" value={formatNumber(gpuHoursHedged)} sub="last 100 records" />
        <StatCard label="Settled payouts" value={stats ? formatUsd(stats.payouts) : "—"} sub={stats ? `${stats.exercises} exercises & claims` : undefined} valueClass={stats && stats.payouts > 0 ? "text-pos" : ""} />
        <StatCard label="Option series" value={stats ? formatNumber(stats.series) : "—"} />
        <StatCard label="Futures positions" value={formatNumber(Number(futuresPositions.data ?? 0n))} sub={`${formatUsd(fromUsdc(futuresNotional.data), 0)} notional`} />
        <StatCard label="LP vault NAV" value={formatUsd(vault.tvl, 0)} sub={`${formatUsd(vault.premiumsEarned)} premiums earned`} />
      </div>
      {blockTime && (
        <p className="mt-3 text-xs text-muted">
          {activeChain.name} block time, measured from the chain:{" "}
          <span className="num font-semibold text-fg">{blockTime.ms.toLocaleString("en-US")} ms</span> average over the last{" "}
          {blockTime.blocks} blocks (to #{blockTime.latest.toString()}).
        </p>
      )}

      <div className="panel mt-6 p-4 sm:p-5">
        <h2 className="font-semibold">Cumulative premium volume</h2>
        <div className="mt-3 h-56 w-full">
          {cumulative.length < 2 ? (
            <div className="grid h-full place-items-center text-sm text-muted">Chart appears after the second trade.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-secondary)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} tick={{ fill: "var(--color-dim)", fontSize: 11 }} stroke="var(--color-line-2)" minTickGap={40} />
                <YAxis tickFormatter={(v: number) => `$${v}`} tick={{ fill: "var(--color-dim)", fontSize: 11 }} stroke="var(--color-line-2)" width={56} orientation="right" />
                <Tooltip
                  cursor={{ stroke: "var(--color-line-2)" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="popover px-3 py-2 text-xs">
                        <div className="text-muted">{formatDateTime((payload[0].payload as { t: number }).t / 1000)}</div>
                        <div className="num font-semibold text-fg">{formatUsd(Number(payload[0].value))}</div>
                      </div>
                    ) : null
                  }
                />
                <Area type="stepAfter" dataKey="volume" stroke="var(--color-secondary)" strokeWidth={2} fill="url(#vol)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="panel-solid mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {["Time", "Event", "Series", "Wallet", "Contracts", "Amount", "Transaction"].map((h) => (
                <th key={h} className="label px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No activity yet. <Link to="/trade" className="text-secondary hover:underline">Make the first trade →</Link></td></tr>
            ) : (
              activity.map((a, i) => {
                const key = `${a.blockNumber}-${a.kindIndex}-${a.seriesId}-${a.account.toLowerCase()}-${a.amountRaw}`;
                const hash = hashes.data?.get(key);
                return (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-xs text-muted">{formatDateTime(a.timestamp)}</td>
                    <td className="px-4 py-2.5"><EventChip kind={a.kind} /></td>
                    <td className="num px-4 py-2.5"><Link to={`/markets/${a.seriesId}`} className="hover:underline">#{a.seriesId}</Link></td>
                    <td className="px-4 py-2.5"><ExplorerLink address={a.account} label={shortAddress(a.account)} /></td>
                    <td className="num px-4 py-2.5">{formatNumber(a.contracts)}</td>
                    <td className="num px-4 py-2.5">{formatUsd(a.amount)}</td>
                    <td className="px-4 py-2.5">{hash ? <ExplorerLink hash={hash} /> : <span className="num text-xs text-dim">block {a.blockNumber.toString()}</span>}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
