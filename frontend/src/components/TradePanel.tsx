import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import type { OptionSeries } from "../types/options";
import { useUSDC, useUSDCActions, useMonBalance } from "../hooks/useUSDC";
import { isActive, useOptionActions } from "../hooks/useOption";
import { useAdminRoles } from "../hooks/useProtocol";
import { calculateCappedOptionPrice, calculateIntrinsicValue, isStalePremium, summarizeTrade, yearsUntil } from "../utils/optionsPricing";
import { formatDate, formatNumber, formatPrice, formatTenor, formatUsd } from "../utils/formatters";
import { MONAD_FAUCET_URL, isLocalChain } from "../lib/chain";
import { ConnectButton, SwitchNetworkButton, useWrongNetwork } from "./WalletButton";
import { RiskDisclosure } from "./RiskDisclosure";
import { TransactionStatus } from "./TransactionStatus";
import { OptionTypeBadge, Spinner } from "./ui";

const QUICK = [1, 5, 10, 25];
const MAX_QTY = 999_999;

/**
 * Order ticket for one option series. Everything a buyer needs (total cost, maximum loss,
 * break-even, capped profit, collateral) is visible above the button. Cost is computed in raw
 * 6-decimal USDC (bigint) for the transaction; floats are display only.
 */
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
  const stale = active && isStalePremium(series.kind, spot, series.strike, series.premium, series.maxPayoutPerUnit);
  const exerciseNow = calculateIntrinsicValue(series.kind, spot, series.strike, series.maxPayoutPerUnit);
  const overCapacity = qty > series.availableContracts;
  const insufficientUsdc = usdc.balanceRaw !== undefined && usdc.balanceRaw < costRaw;
  const needsApproval = usdc.allowanceRaw < costRaw;
  const noGas = mon.data !== undefined && mon.data.value === 0n;
  const busy = usdcTx.isBusy || optionTx.isBusy;
  const txState = last === "buy" ? optionTx.state : usdcTx.state;
  const approvedHere = last === "approve" && usdcTx.state.phase === "confirmed";
  const ready = isConnected && !wrongNetwork && active && !paused && qty > 0 && !overCapacity && !insufficientUsdc;

  const setQty = (raw: string) => {
    const clean = raw.replace(/[^\d]/g, "").slice(0, 6);
    setInput(clean);
    onContractsChange(clean === "" ? 0 : parseInt(clean, 10));
  };
  const step = (delta: number) => setQty(String(Math.min(Math.max(qty + delta, 1), MAX_QTY)));

  const onApprove = async () => {
    setLast("approve");
    optionTx.reset();
    await usdcTx.approve(series.address, costRaw);
  };
  const onBuy = async () => {
    setLast("buy");
    usdcTx.reset();
    const receipt = await optionTx.buy(series, qty, costRaw);
    // Each new order needs its own risk acknowledgement.
    if (receipt) setAccepted(false);
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
  else if (overCapacity) action = <button className="btn-secondary w-full py-3" disabled>ONLY {formatNumber(series.availableContracts)} CONTRACTS AVAILABLE</button>;
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
      <button className="btn-primary w-full py-3 text-base" onClick={onBuy} disabled={busy}>
        {busy && <Spinner />} BUY {formatNumber(qty)} {series.kind} · {formatUsd(summary.totalPremium)}
      </button>
    );

  return (
    <div className="panel-solid overflow-hidden" id="trade-panel">
      {/* Ticket header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{series.gpu}</span>
          <OptionTypeBadge kind={series.kind} />
          <span className="num text-sm text-fg">{formatPrice(series.strike)}</span>
          <span className="num text-xs text-muted">· {formatTenor(series.expiration)}</span>
        </div>
        <span className="label">Order ticket</span>
      </div>

      <div className="p-4 sm:p-5">
        {/* Quantity */}
        <label htmlFor="qty" className="label">Contracts</label>
        <div className="mt-1.5 flex items-stretch gap-2">
          <div className="flex flex-1 items-stretch overflow-hidden rounded-lg border border-line-2 bg-bg-deep focus-within:border-secondary">
            <button type="button" onClick={() => step(-1)} className="px-3 text-lg text-muted hover:text-fg" aria-label="One fewer contract">−</button>
            <input
              id="qty"
              inputMode="numeric"
              className="num w-full min-w-0 bg-transparent py-2.5 text-center text-lg font-semibold text-fg focus:outline-none"
              value={input}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              aria-describedby="qty-help"
            />
            <button type="button" onClick={() => step(1)} className="px-3 text-lg text-muted hover:text-fg" aria-label="One more contract">+</button>
          </div>
          <div className="flex gap-1">
            {QUICK.map((n) => (
              <button
                key={n}
                onClick={() => setQty(String(n))}
                className={`seg num border px-2.5 ${qty === n ? "border-line-3 bg-panel-2 text-fg" : "border-line text-muted hover:text-fg"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <p id="qty-help" className="mt-2 text-xs text-muted">
          1 contract = {formatNumber(series.contractSize)} GPU-hours · covers{" "}
          <span className="num text-fg">{formatNumber(summary.gpuHours)}</span> GPU-hours ·{" "}
          <span className="num">{formatNumber(series.availableContracts)}</span> available
        </p>

        {/* Cost */}
        <div className="mt-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="label">Total cost</div>
            <div className="num mt-1 truncate text-xs text-muted">
              {formatPrice(series.premium)}/GPU-h × {formatNumber(summary.gpuHours)} GPU-h
            </div>
          </div>
          <div className="num text-3xl font-semibold text-fg">{formatUsd(summary.totalPremium)}</div>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-dim">
          <span title="Black-Scholes model price for comparison only. The executable price is the onchain premium.">
            Model price {formatPrice(modelPrice)}/GPU-h — for demonstration purposes
          </span>
        </div>

        {/* Risk summary: visible before any button */}
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
          <RiskCell label="Maximum loss" sub="Premium paid. Nothing more.">
            <span className="text-neg">−{formatUsd(summary.maxLoss)}</span>
          </RiskCell>
          <RiskCell label="Break-even" sub={`${series.gpu} price at expiry`}>
            <span className="text-fg">{formatPrice(summary.breakEven)}<span className="text-xs font-normal text-muted">/GPU-h</span></span>
          </RiskCell>
          <RiskCell label="Potential profit" sub={`Capped: pays at most ${formatPrice(series.maxPayoutPerUnit)}/GPU-h`}>
            <span className="text-pos">{summary.maxProfit > 0 ? `up to +${formatUsd(summary.maxProfit)}` : formatUsd(summary.maxProfit)}</span>
          </RiskCell>
          <RiskCell label="Collateral locked" sub="Fully funded by the writer">
            <span className="text-fg">{formatUsd(summary.collateralBacking)} <span className="text-pos" aria-label="fully collateralized">✓</span></span>
          </RiskCell>
        </dl>

        {stale && (
          <div role="alert" className="mt-4 rounded-lg border border-warn/50 bg-warn/[0.08] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6M12 16.5h.01" />
              </svg>
              Stale premium
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg">
              This option already pays <span className="num font-semibold">{formatPrice(exerciseNow)}/GPU-h</span> if exercised now, but its
              premium is still <span className="num font-semibold">{formatPrice(series.premium)}/GPU-h</span>. Premiums are fixed when a series
              is written and don't follow the oracle, so this price is out of date.
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              Known limitation of this hackathon build (no dynamic pricing yet). On a production market this order would be repriced.
            </p>
          </div>
        )}

        <div className="mt-4">
          <RiskDisclosure kind={series.kind} maxLoss={summary.maxLoss} accepted={accepted} onAcceptedChange={setAccepted} />
        </div>

        {/* Two-step flow, explained */}
        {ready && accepted && (needsApproval || approvedHere) && (
          <ol className="mt-4 space-y-1.5 text-xs" aria-label="Purchase steps">
            <StepRow n={1} done={!needsApproval} current={needsApproval}>
              Approve exactly {formatUsd(summary.totalPremium)} USDC for this series
            </StepRow>
            <StepRow n={2} done={false} current={!needsApproval}>
              Buy {formatNumber(qty)} {series.kind} · {formatNumber(summary.gpuHours)} GPU-hours
            </StepRow>
          </ol>
        )}

        <div className="mt-4">{action}</div>

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

        {txState.phase !== "idle" && (
          <div className="mt-3">
            <TransactionStatus
              state={txState}
              onDismiss={() => (last === "buy" ? optionTx.reset() : usdcTx.reset())}
              successNote={
                last === "buy" ? (
                  <span className="text-muted">
                    Position opened.{" "}
                    <Link to="/portfolio" className="font-semibold text-secondary hover:underline">
                      View in portfolio →
                    </Link>
                  </span>
                ) : last === "approve" ? (
                  <span className="text-muted">USDC approved. Step 2: buy the option.</span>
                ) : (
                  <span className="text-muted">Test USDC received.</span>
                )
              }
            />
          </div>
        )}

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
          Series #{series.id} · {series.region} · expires {formatDate(series.expiration)}. Cash-settled in test USDC; exercise any time
          before expiry while in the money.
        </p>
      </div>
    </div>
  );
}

function RiskCell({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-deep px-3 py-2.5">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num mt-0.5 text-base font-semibold">{children}</dd>
      <dd className="mt-0.5 text-[11px] leading-snug text-dim">{sub}</dd>
    </div>
  );
}

function StepRow({ n, done, current, children }: { n: number; done: boolean; current: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${current ? "text-fg" : "text-muted"}`} aria-current={current ? "step" : undefined}>
      <span
        className={`num grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
          done ? "border-pos/50 bg-pos/15 text-pos" : current ? "border-line-3 text-fg" : "border-line text-dim"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span>
        <span className="text-dim">Step {n} of 2 · </span>
        {children}
      </span>
    </li>
  );
}
