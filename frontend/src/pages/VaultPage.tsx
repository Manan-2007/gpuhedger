import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { contracts, hasVault } from "../contracts/addresses";
import { useVault, useVaultActions } from "../hooks/useVault";
import { useMarkets } from "../hooks/useOption";
import { useUSDC, useUSDCActions } from "../hooks/useUSDC";
import { formatNumber, formatPrice, formatTenor, formatUsd, toUsdc } from "../utils/formatters";
import { TransactionStatus } from "../components/TransactionStatus";
import { ConnectButton, SwitchNetworkButton, useWrongNetwork } from "../components/WalletButton";
import { EmptyState, ExplorerLink, OnchainTag, OptionTypeBadge, SectionHeader, Spinner, StatCard } from "../components/ui";

export function VaultPage() {
  const vault = useVault();
  const { series } = useMarkets();
  const actions = useVaultActions();
  const vaultSeries = series.filter((s) => vault.allSeries.some((a) => a.toLowerCase() === s.address.toLowerCase()));
  const now = Date.now() / 1000;

  if (!hasVault) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState title="Vault not deployed" body="Deploy the latest contracts to enable the LP vault." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="Liquidity" title="GPU options LP vault">
        <OnchainTag label="ERC-4626 · ComputeVault" />
      </SectionHeader>
      <p className="-mt-2 mb-6 max-w-3xl text-sm text-muted">
        Deposit test USDC and earn the premiums AI companies pay to hedge compute. The vault writes fully collateralized option series
        with pooled liquidity; LPs take the other side of the hedge, so large GPU price moves can reduce vault value.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Vault value (NAV)" value={formatUsd(vault.tvl, 0)} />
        <StatCard label="Share price" value={`$${vault.sharePrice.toFixed(4)}`} sub="per ghLP" valueClass={vault.sharePrice >= 1 ? "text-pos" : "text-neg"} />
        <StatCard label="Idle liquidity" value={formatUsd(vault.idle, 0)} sub="withdrawable" />
        <StatCard label="Deployed as collateral" value={formatUsd(vault.deployed, 0)} sub="net of liabilities" />
        <StatCard label="Premiums earned" value={formatUsd(vault.premiumsEarned)} valueClass={vault.premiumsEarned > 0 ? "text-pos" : ""} />
        <StatCard label="Series written" value={formatNumber(vault.allSeries.length)} sub={`${vault.activeSeries.length} active`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="panel min-w-0 p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Series written by the vault</h2>
          {vaultSeries.length === 0 ? (
            <p className="text-sm text-muted">The vault hasn't written any series yet. The vault manager can write one from the Admin page.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["Series", "Type", "Strike", "Expiry", "Sold / Max", "Premiums", "Collateral", ""].map((h) => (
                      <th key={h} className="label px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vaultSeries.map((s) => {
                    const active = vault.activeSeries.some((a) => a.toLowerCase() === s.address.toLowerCase());
                    const canHarvest = active && ((s.expiration <= now && !s.settled) || s.collateralBalance > s.lockedCollateral + (s.maxContracts - s.soldContracts) * s.collateralPerContract + 0.000001);
                    return (
                      <tr key={s.id} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-2.5"><Link className="font-semibold hover:underline" to={`/markets/${s.id}`}>{s.gpu} #{s.id}</Link></td>
                        <td className="px-3 py-2.5"><OptionTypeBadge kind={s.kind} /></td>
                        <td className="num px-3 py-2.5">{formatPrice(s.strike)}</td>
                        <td className="num px-3 py-2.5">{formatTenor(s.expiration)}</td>
                        <td className="num px-3 py-2.5">{formatNumber(s.soldContracts)} / {formatNumber(s.maxContracts)}</td>
                        <td className="num px-3 py-2.5 text-pos">{formatUsd(s.premium * s.contractSize * s.soldContracts)}</td>
                        <td className="num px-3 py-2.5">{formatUsd(s.collateralBalance, 0)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {canHarvest ? (
                            <button className="btn-secondary px-2.5 py-1 text-xs" disabled={actions.isBusy} onClick={() => actions.harvest(s)}>Harvest</button>
                          ) : (
                            <span className="text-xs text-dim">{s.settled ? "Settled" : "Live"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {actions.state.phase !== "idle" && <div className="mt-3"><TransactionStatus state={actions.state} onDismiss={actions.reset} compact /></div>}
          <p className="mt-3 text-xs text-dim">
            NAV = idle USDC + collateral in live series − what holders could exercise for at the current oracle price. Harvest settles expired
            series and returns collateral to the vault; anyone can call it.
          </p>
        </div>
        <DepositPanel />
      </div>
    </div>
  );
}

function DepositPanel() {
  const { address, isConnected } = useAccount();
  const wrong = useWrongNetwork();
  const vault = useVault();
  const usdc = useUSDC(contracts.vault);
  const usdcTx = useUSDCActions();
  const vaultTx = useVaultActions();
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("1000");
  const [last, setLast] = useState<"approve" | "vault">("vault");

  const n = Number(amount);
  const raw = toUsdc(n);
  const busy = usdcTx.isBusy || vaultTx.isBusy;
  const state = last === "vault" ? vaultTx.state : usdcTx.state;

  let action: React.ReactNode;
  if (!isConnected || !address) action = <ConnectButton className="w-full py-3" label="CONNECT WALLET" />;
  else if (wrong) action = <SwitchNetworkButton className="w-full py-3" />;
  else if (!(n > 0)) action = <button className="btn-secondary w-full py-3" disabled>ENTER AMOUNT</button>;
  else if (mode === "deposit" && usdc.balanceRaw !== undefined && usdc.balanceRaw < raw)
    action = <button className="btn-secondary w-full py-3" onClick={() => usdcTx.faucet()} disabled={busy}>INSUFFICIENT USDC — GET TEST USDC</button>;
  else if (mode === "deposit" && usdc.allowanceRaw < raw)
    action = <button className="btn-primary w-full py-3" disabled={busy} onClick={() => { setLast("approve"); usdcTx.approve(contracts.vault, raw); }}>{busy && <Spinner />} APPROVE USDC</button>;
  else if (mode === "deposit")
    action = <button className="btn-primary w-full py-3" disabled={busy} onClick={() => { setLast("vault"); vaultTx.deposit(raw, address); }}>{busy && <Spinner />} DEPOSIT</button>;
  else if (raw > vault.userMaxWithdrawRaw)
    action = <button className="btn-secondary w-full py-3" disabled>MAX WITHDRAWABLE {formatUsd(vault.userMaxWithdraw)}</button>;
  else action = <button className="btn-primary w-full py-3" disabled={busy} onClick={() => { setLast("vault"); vaultTx.withdraw(raw, address); }}>{busy && <Spinner />} WITHDRAW</button>;

  return (
    <div className="panel self-start p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-0.5">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`seg py-2 uppercase ${mode === m ? "bg-panel-2 text-fg" : "text-muted"}`}>{m}</button>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="label">Amount (USDC)</span>
        <input className="input mt-1.5 text-base" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
      </label>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>Wallet <span className="num text-fg">{formatUsd(usdc.balance)}</span></span>
        {mode === "withdraw" && (
          <button className="text-secondary hover:underline" onClick={() => setAmount(vault.userMaxWithdraw.toFixed(2))}>Max {formatUsd(vault.userMaxWithdraw)}</button>
        )}
      </div>
      <div className="mt-4 space-y-1.5 rounded-lg border border-line bg-bg/50 p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted">Your shares</span><span className="num">{formatNumber(vault.userShares, 2)} ghLP</span></div>
        <div className="flex justify-between"><span className="text-muted">Your position value</span><span className="num">{formatUsd(vault.userValue)}</span></div>
        <div className="flex justify-between"><span className="text-muted">You receive</span><span className="num">{mode === "deposit" ? `${formatNumber(n / vault.sharePrice || 0, 2)} ghLP` : formatUsd(n || 0)}</span></div>
      </div>
      <p className="mt-3 text-xs text-warn">
        LPs are option writers: if GPU prices move sharply, holders' payouts come out of vault collateral. Withdrawals are limited to idle
        liquidity. Testnet only.
      </p>
      <div className="mt-4">{action}</div>
      {state.phase !== "idle" && <div className="mt-3"><TransactionStatus state={state} onDismiss={() => (last === "vault" ? vaultTx.reset() : usdcTx.reset())} compact /></div>}
      <div className="mt-3 text-xs text-dim">Vault <ExplorerLink address={contracts.vault} /></div>
    </div>
  );
}
