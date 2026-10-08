import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import type { OptionSeries } from "../types/options";
import { useUSDC, useUSDCActions, useMonBalance } from "../hooks/useUSDC";
import { isActive, useOptionActions } from "../hooks/useOption";
import { useAdminRoles } from "../hooks/useProtocol";
import { calculateCappedOptionPrice, summarizeTrade, yearsUntil } from "../utils/optionsPricing";
import { formatNumber, formatPrice, formatUsd } from "../utils/formatters";
import { MONAD_FAUCET_URL, isLocalChain } from "../lib/chain";
import { ConnectButton, SwitchNetworkButton, useWrongNetwork } from "./WalletButton";
import { RiskDisclosure } from "./RiskDisclosure";
import { TransactionStatus } from "./TransactionStatus";
import { KeyValue, OptionTypeBadge, Spinner } from "./ui";

const QUICK = [1, 5, 10, 25];

export function TradePanel({ series, spot, volatility, contracts, onContractsChange }: {
  series: OptionSeries;
  spot: number;
  volatility: number;
  contracts: number;
  onContractsChange: (n: number) => void;
}) {
  const { isConnected } = useAccount();
  const wrongNetwork = useWrongNetwork();
  const usdc = useUSDC(series.address);
  const mon = useMonBalance();
  const usdcTx = useUSDCActions();
  const optionTx = useOptionActions();
  const { paused } = useAdminRoles();
  const [accepted, setAccepted] = useState(false);
  const [last, setLast] = useState<"approve" | "buy" | "faucet">("buy");
  const [input, setInput] = useState(String(contracts));

  const qty = Number.isInteger(contracts) && contracts > 0 ? contracts : 0;
  const summary = summarizeTrade({
    kind: series.kind,
    strike: series.strike,
    premium: series.premium,
    payoutCap: series.maxPayoutPerUnit,
    contractSize: series.contractSize,
    contracts: qty,
  });
  // Exact onchain cost: premium (6dp) × contractSize × contracts
  const costRaw = series.premiumRaw * BigInt(series.contractSize) * BigInt(qty);
  const modelPrice = useMemo(
    () =>
      calculateCappedOptionPrice(
        series.kind,
        { spot, strike: series.strike, timeToExpiry: yearsUntil(series.expiration), volatility },
        series.maxPayoutPerUnit,
      ),
    [series, spot, volatility],
  );

  const active = isActive(series);
  const overCapacity = qty > series.availableContracts;
  const insufficientUsdc = usdc.balanceRaw !== undefined && usdc.balanceRaw < costRaw;
  const needsApproval = usdc.allowanceRaw < costRaw;
  const noGas = mon.data !== undefined && mon.data.value === 0n;
  const busy = usdcTx.isBusy || optionTx.isBusy;
  const txState = last === "buy" ? optionTx.state : usdcTx.state;

  const setQty = (raw: string) => {
    const clean = raw.replace(/[^\d]/g, "").slice(0, 6);
    setInput(clean);
    onContractsChange(clean === "" ? 0 : parseInt(clean, 10));
  };

  const onApprove = async () => {
    setLast("approve");
    optionTx.reset();
    await usdcTx.approve(series.address, costRaw);
  };
  const onBuy = async () => {
    setLast("buy");
    usdcTx.reset();
    await optionTx.buy(series, qty, costRaw);
  };
  const onFaucet = async () => {
    setLast("faucet");
    await usdcTx.faucet();
  };

  let action: React.ReactNode;
  if (!isConnected) action = <ConnectButton className="w-full py-3" label="CONNECT WALLET TO TRADE" />;
  else if (wrongNetwork) action = <SwitchNetworkButton className="w-full py-3" />;
  else if (!active) action = <button className="btn-secondary w-full py-3" disabled>{series.settled ? "SERIES SETTLED" : "OPTION EXPIRED"}</button>;
  else if (paused) action = <button className="btn-secondary w-full py-3" disabled>TRADING PAUSED</button>;
  else if (qty === 0) action = <button className="btn-secondary w-full py-3" disabled>ENTER QUANTITY</button>;
  else if (overCapacity) action = <button className="btn-secondary w-full py-3" disabled>ONLY {series.availableContracts} CONTRACTS AVAILABLE</button>;
  else if (insufficientUsdc)
    action = (
      <button className="btn-secondary w-full py-3" onClick={onFaucet} disabled={busy}>
        {busy && <Spinner />} INSUFFICIENT USDC — GET TEST USDC
      </button>
    );
  else if (!accepted) action = <button className="btn-secondary w-full py-3" disabled>ACKNOWLEDGE RISK TO CONTINUE</button>;
  else if (needsApproval)
    action = (
      <button className="btn-primary w-full py-3" onClick={onApprove} disabled={busy}>
        {busy && <Spinner />} APPROVE {formatUsd(summary.totalPremium)} USDC
      </button>
    );
  else
    action = (
      <button className={`${series.kind === "CALL" ? "btn-pos" : "btn-neg"} w-full py-3 text-base`} onClick={onBuy} disabled={busy}>
        {busy && <Spinner />} BUY {series.kind}
      </button>
    );

  return (
    <div className="panel p-4 sm:p-5" id="trade-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{series.gpu}</span>
          <OptionTypeBadge kind={series.kind} />
          <span className="num text-sm text-muted">K {formatPrice(series.strike)}</span>
        </div>
        <span className="text-xs text-muted">Series #{series.id}</span>
      </div>

      <div className="mt-4">
        <label htmlFor="qty" className="label">Quantity (contracts)</label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="qty"
            inputMode="numeric"
            className="input text-base"
            value={input}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            aria-describedby="qty-help"
          />
          <span className="num shrink-0 text-xs text-muted">× {series.contractSize} GPU-h</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {QUICK.map((n) => (
            <button key={n} onClick={() => setQty(String(n))} className={`seg num border ${qty === n ? "border-primary/50 text-primary" : "border-line text-muted hover:text-fg"}`}>
              {n}
            </button>
          ))}
        </div>
        <p id="qty-help" className="mt-2 text-xs text-muted">
          Covers <span className="num text-fg">{formatNumber(summary.gpuHours)}</span> GPU-hours ·{" "}
          <span className="num">{formatNumber(series.availableContracts)}</span> contracts available
        </p>
      </div>

      <div className="mt-4 divide-y divide-line rounded-lg border border-line bg-bg/50 px-3.5 py-1.5">
        <KeyValue label="Premium / GPU-hour" value={formatPrice(series.premium)} />
        <KeyValue label="Premium / contract" value={formatUsd(series.premium * series.contractSize)} />
        <KeyValue label="Model price (demo)" value={formatPrice(modelPrice)} valueClass="text-muted" hint="Black-Scholes model price — for demonstration purposes" />
        <KeyValue label="Break-even" value={`${formatPrice(summary.breakEven)}/h`} />
        <KeyValue label="Maximum loss" value={formatUsd(summary.maxLoss)} valueClass="text-neg" />
        <KeyValue label="Potential profit (capped)" value={`up to ${formatUsd(summary.maxProfit)}`} valueClass="text-pos" hint={`Payout capped at ${formatPrice(series.maxPayoutPerUnit)}/GPU-h`} />
        <KeyValue label="Collateral backing" value={formatUsd(summary.collateralBacking)} hint="Writer collateral locked onchain for these contracts" />
        <div className="flex items-baseline justify-between py-2.5">
          <span className="text-sm font-semibold">Total cost</span>
          <span className="num text-lg font-semibold text-primary">{formatUsd(summary.totalPremium)}</span>
        </div>
      </div>

      {isConnected && !wrongNetwork && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            Balance <span className="num text-fg">{formatUsd(usdc.balance)}</span> USDC
          </span>
          <button onClick={onFaucet} disabled={busy} className="font-semibold text-secondary hover:underline disabled:opacity-40">
            GET TEST USDC
          </button>
        </div>
      )}
      {noGas && !isLocalChain && (
        <p className="mt-2 text-xs text-warn">
          You have no MON for gas.{" "}
          <a className="underline" href={MONAD_FAUCET_URL} target="_blank" rel="noreferrer">
            Get testnet MON ↗
          </a>
        </p>
      )}

      <div className="mt-4">
        <RiskDisclosure kind={series.kind} maxLoss={summary.maxLoss} accepted={accepted} onAcceptedChange={setAccepted} />
      </div>

      <div className="mt-4">{action}</div>

      {txState.phase !== "idle" && (
        <div className="mt-3">
          <TransactionStatus
            state={txState}
            onDismiss={() => (last === "buy" ? optionTx.reset() : usdcTx.reset())}
            successNote={
              last === "buy" ? (
                <span className="text-muted">
                  Position opened.{" "}
                  <Link to="/portfolio" className="font-semibold text-primary hover:underline">
                    View in portfolio →
                  </Link>
                </span>
              ) : last === "approve" ? (
                <span className="text-muted">USDC approved. You can now buy the option.</span>
              ) : (
                <span className="text-muted">Test USDC received.</span>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
