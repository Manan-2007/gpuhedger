import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { usePortfolio } from "../hooks/usePortfolio";
import { useOptionActions } from "../hooks/useOption";
import type { PositionView } from "../types/options";
import { useMonBalance, useUSDC, useUSDCActions } from "../hooks/useUSDC";
import { useAllGpuPrices } from "../hooks/useOracle";
import { activeChain, MONAD_FAUCET_URL, isLocalChain } from "../lib/chain";
import { formatNumber, formatPrice, formatSignedUsd, formatUsd, pnlClass, timeAgo } from "../utils/formatters";
import { PositionTable } from "../components/PositionTable";
import { TransactionStatus } from "../components/TransactionStatus";
import { ConnectButton, SwitchNetworkButton, useWrongNetwork } from "../components/WalletButton";
import { EmptyState, ErrorNote, ExplorerLink, OnchainTag, SectionHeader, Skeleton, Spinner, StatCard } from "../components/ui";

type Tab = "OPEN" | "EXERCISED" | "EXPIRED" | "ALL";

export function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const wrong = useWrongNetwork();

  if (!isConnected || !address) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState
          title="Connect your wallet"
          body="Your positions are read directly from the GpuHedger contracts on Monad. Connect a wallet to see them."
          action={<ConnectButton label="CONNECT WALLET" />}
        />
      </div>
    );
  }
  if (wrong) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState title="WRONG NETWORK" body={`Positions live on ${activeChain.name}.`} action={<SwitchNetworkButton />} />
      </div>
    );
  }
  return <Portfolio />;
}

function Portfolio() {
  const { address } = useAccount();
  const { positions, summary, isLoading, isError } = usePortfolio();
  const usdc = useUSDC();
  const mon = useMonBalance();
  const faucet = useUSDCActions();
  const prices = useAllGpuPrices();
  const [tab, setTab] = useState<Tab>("OPEN");
  const actions = useOptionActions();
  const [activeKey, setActiveKey] = useState<string>();
  const [settled, setSettled] = useState<{ payout: number; label: string }>();

  const onExercise = async (p: PositionView) => {
    setActiveKey(p.key);
    setSettled(undefined);
    const expected = p.exerciseValue;
    const receipt = await actions.exercise(p.series, p.positionId);
    if (receipt) {
      setSettled({ payout: expected, label: `${p.series.gpu} ${p.series.kind} ${formatPrice(p.series.strike)}` });
      setTab("EXERCISED");
    }
  };

  const shown = tab === "ALL" ? positions : positions.filter((p) => p.status === tab);
  const counts: Record<Tab, number> = {
    OPEN: summary.open.length,
    EXERCISED: summary.exercised.length,
    EXPIRED: summary.expired.length,
    ALL: positions.length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="Portfolio" title="Your compute hedges">
        <OnchainTag label="Live · updates every block" />
      </SectionHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Portfolio value" value={formatUsd(summary.portfolioValue)} sub="Open positions · model est." />
          <StatCard label="Total P&L" value={formatSignedUsd(summary.totalPnl)} valueClass={pnlClass(summary.totalPnl)} sub={`Unrealized ${formatSignedUsd(summary.unrealized)}`} />
          <StatCard label="Open positions" value={formatNumber(summary.open.length)} sub={`${formatNumber(summary.open.reduce((a, p) => a + p.contracts, 0))} contracts`} />
          <StatCard label="Settled payouts" value={formatUsd(summary.payouts)} valueClass={summary.payouts > 0 ? "text-pos" : ""} sub={`${summary.exercised.length} exercised · ${summary.expired.length} expired`} />
          <div className="panel col-span-2 p-4 md:col-span-4">
            <div className="label mb-2">Live oracle</div>
            <div className="grid grid-cols-3 gap-3">
              {prices.map((p) => (
                <div key={p.gpu}>
                  <span className="text-sm font-semibold">{p.gpu}</span>{" "}
                  <span className="num text-sm">{formatPrice(p.price)}</span>
                  <div className="text-[11px] text-dim">{p.updatedAt ? `updated ${timeAgo(p.updatedAt)}` : "simulated"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel p-4">
          <div className="label">Wallet</div>
          <div className="mt-1"><ExplorerLink address={address} /></div>
          <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
            <Row k="Network" v={activeChain.name} />
            <Row k="MON" v={mon.data ? formatNumber(Number(mon.data.formatted), 4) : "—"} />
            <Row k="USDC" v={formatUsd(usdc.balance)} />
          </div>
          <button onClick={() => faucet.faucet()} disabled={faucet.isBusy} className="btn-secondary mt-4 w-full py-2 text-xs">
            {faucet.isBusy && <Spinner />} GET TEST USDC <span className="chip border-warn/30 text-warn">Testnet only</span>
          </button>
          {!isLocalChain && (
            <a href={MONAD_FAUCET_URL} target="_blank" rel="noreferrer" className="mt-2 block text-center text-xs text-secondary hover:underline">
              Need MON for gas? Monad faucet ↗
            </a>
          )}
          {faucet.state.phase !== "idle" && (
            <div className="mt-3">
              <TransactionStatus state={faucet.state} onDismiss={faucet.reset} compact successNote={<span className="text-muted">+{formatUsd(usdc.faucetAmount, 0)} test USDC</span>} />
            </div>
          )}
        </div>
      </div>

      {actions.state.phase !== "idle" && (
        <div className="mt-6">
          <TransactionStatus
            state={actions.state}
            onDismiss={() => {
              actions.reset();
              setActiveKey(undefined);
            }}
            successNote={
              <span className="text-muted">
                {settled?.label} exercised · payout{" "}
                <span className="num font-semibold text-pos">{formatUsd(settled?.payout ?? 0)}</span> settled in USDC directly to your wallet.
              </span>
            }
          />
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {(["OPEN", "EXERCISED", "EXPIRED", "ALL"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`seg border ${tab === t ? "border-primary/50 bg-primary/10 text-primary" : "border-line text-muted hover:text-fg"}`}>
            {t === "ALL" ? "All" : t.charAt(0) + t.slice(1).toLowerCase()} <span className="num ml-1 opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {isError ? (
          <ErrorNote>Couldn't load your positions from the chain. Check your connection and refresh.</ErrorNote>
        ) : isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState
            title={positions.length === 0 ? "No positions yet" : `No ${tab.toLowerCase()} positions`}
            body={positions.length === 0 ? "Buy your first GPU compute option to hedge future compute costs." : undefined}
            action={positions.length === 0 ? <Link to="/trade" className="btn-primary">TRADE COMPUTE</Link> : undefined}
          />
        ) : (
          <PositionTable positions={shown} actions={actions} activeKey={activeKey} onExercise={onExercise} />
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
