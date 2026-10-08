import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { computeOracleAbi, optionFactoryAbi } from "../contracts/abis";
import { contracts, hasFutures, hasVault, isConfigured } from "../contracts/addresses";
import { useVault, useVaultActions } from "../hooks/useVault";
import { useFuturesActions, useFuturesMarkets } from "../hooks/useFutures";
import { useOracle } from "../hooks/useOracle";
import { useMarkets, useOptionActions } from "../hooks/useOption";
import { useAdminRoles, useProtocolStats, useRecentActivity } from "../hooks/useProtocol";
import { useTransaction } from "../hooks/useTransaction";
import { useUSDC, useUSDCActions } from "../hooks/useUSDC";
import { GPU_SYMBOLS, type GpuSymbol } from "../types/markets";
import type { OptionKind } from "../types/options";
import { calculateCappedOptionPrice, SECONDS_PER_YEAR } from "../utils/optionsPricing";
import {
  formatDateTime,
  formatNumber,
  formatPrice,
  formatTenor,
  formatUsd,
  shortAddress,
  stringToBytes32,
  timeAgo,
  toUsdc,
} from "../utils/formatters";
import { TransactionStatus } from "../components/TransactionStatus";
import { ConnectButton, useWrongNetwork } from "../components/WalletButton";
import { Ago, EmptyState, ExplorerLink, OnchainTag, OptionTypeBadge, SectionHeader, Spinner, StatCard } from "../components/ui";

export function AdminPage() {
  const { isConnected } = useAccount();
  const roles = useAdminRoles();
  const wrong = useWrongNetwork();

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <EmptyState title="Contracts not configured" body="Deploy the contracts first. See the README." />
      </div>
    );
  }

  const canWrite = isConnected && !wrong;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeader eyebrow="Admin · Demo controls" title="Protocol control room">
        <div className="flex flex-wrap gap-1.5">
          <RoleChip ok={roles.isOracle} label="Oracle" />
          <RoleChip ok={roles.isWriter} label="Writer" />
          <RoleChip ok={roles.isPauser} label="Pauser" />
          {hasVault && <RoleChip ok={roles.isVaultManager} label="Vault mgr" />}
          <span className={`chip ${roles.paused ? "border-warn/40 text-warn" : "border-pos/30 text-pos"}`}>{roles.paused ? "Paused" : "Live"}</span>
        </div>
      </SectionHeader>

      {!isConnected ? (
        <div className="panel mb-6 flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted">Connect the admin (deployer) wallet to update prices and create markets. Everything below is read live from chain.</p>
          <ConnectButton />
        </div>
      ) : !roles.isLoading && !roles.isOracle && !roles.isWriter ? (
        <div className="mb-6 rounded-lg border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          Read-only: the connected wallet has no admin roles. Oracle updates and series creation are restricted onchain to authorized
          accounts (ORACLE_ROLE / WRITER_ROLE) — transactions from this wallet would revert.
        </div>
      ) : null}

      <DemoControls enabled={canWrite && roles.isOracle} />

      <div className="mt-6">
        <DemoScript />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <OraclePanel enabled={canWrite && roles.isOracle} />
        <CreateSeriesPanel enabled={canWrite && roles.isWriter} vaultEnabled={canWrite && roles.isVaultManager} />
      </div>

      {hasFutures && <FuturesAdminPanel enabled={canWrite && roles.isFuturesWriter} />}

      <ProtocolPanel canPause={canWrite && roles.isPauser} paused={roles.paused} canMint={canWrite && roles.isUsdcOwner} />
      <SeriesPanel />
      <ActivityPanel />
    </div>
  );
}

function RoleChip({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`chip ${ok ? "border-pos/30 bg-pos/10 text-pos" : "border-line-2 text-dim"}`}>{ok ? "✓" : "✕"} {label}</span>;
}

function Panel({ title, tag, children }: { title: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {tag}
      </div>
      {children}
    </section>
  );
}

const SCENARIOS = [
  { price: 2, label: "Baseline", title: "H100 → $2.00", effect: "Reset. The $2.20 call is out of the money.", primary: false },
  { price: 4, label: "Price spike", title: "H100 → $4.00", effect: "Compute doubles. The $2.20 call pays $1.80/GPU-h.", primary: true },
  { price: 1.5, label: "Price drop", title: "H100 → $1.50", effect: "Compute gets cheaper. Calls expire unused; puts pay.", primary: false },
];

/** The three oracle moves the demo needs, one click each, with the live H100 price beside them. */
function DemoControls({ enabled }: { enabled: boolean }) {
  const { prices } = useOracle();
  const tx = useTransaction();
  const h100 = prices?.H100;
  const set = (value: number) =>
    tx.execute(`Set H100 price → ${formatPrice(value)}`, {
      address: contracts.oracle,
      abi: computeOracleAbi,
      functionName: "setPrice",
      args: [stringToBytes32("H100"), toUsdc(value)],
    });

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="demo-controls">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="demo-controls" className="font-semibold">Demo controls</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Move the H100 oracle price in one transaction. Every portfolio re-marks on the next block. Make sure the oracle keeper
            script isn't running, or it will overwrite these prices.
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="label flex items-center gap-1.5 sm:justify-end">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden />
            H100 oracle price
          </div>
          <div className="num mt-1 text-3xl font-semibold">{h100 ? formatPrice(h100.price) : "—"}</div>
          <div className="text-xs text-muted">{h100 ? <>updated <Ago timestamp={h100.updatedAt} /></> : "loading…"}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {SCENARIOS.map((sc) => {
          const current = h100 !== undefined && Math.abs(h100.price - sc.price) < 1e-9;
          return (
            <button
              key={sc.price}
              onClick={() => set(sc.price)}
              disabled={!enabled || tx.isBusy || current}
              className={`rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                current
                  ? "border-secondary/50 bg-secondary/[0.07]"
                  : sc.primary
                    ? "border-primary/50 bg-primary/[0.06] hover:bg-primary/[0.12] disabled:opacity-50"
                    : "border-line-2 hover:border-line-3 hover:bg-panel-2 disabled:opacity-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="label">{sc.label}</span>
                {current && <span className="chip border-secondary/40 text-secondary">Current</span>}
              </div>
              <div className={`num mt-2 text-xl font-semibold ${sc.primary && !current ? "text-primary" : "text-fg"}`}>{sc.title}</div>
              <div className="mt-1 text-xs text-muted">{sc.effect}</div>
            </button>
          );
        })}
      </div>
      {!enabled && <p className="mt-3 text-xs text-dim">Connect a wallet with ORACLE_ROLE to use these.</p>}
      {tx.state.phase !== "idle" && (
        <div className="mt-4">
          <TransactionStatus state={tx.state} onDismiss={tx.reset} successNote={<span className="text-muted">Oracle updated onchain. Portfolios re-mark on the next block.</span>} />
        </div>
      )}
    </section>
  );
}

function DemoScript() {
  const steps = [
    ["Connect wallet", "/portfolio"],
    ["Get test USDC", "/portfolio"],
    ["Open H100 market · $2.00/h", "/markets?gpu=H100"],
    ["Select CALL · strike $2.20 · 30D", "/trade?gpu=H100"],
    ["Review payoff chart", "/trade?gpu=H100"],
    ["Buy the option (real tx)", "/trade?gpu=H100"],
    ["Show position in portfolio", "/portfolio"],
    ["Admin: H100 $2.00 → $4.00", "#oracle"],
    ["Portfolio: option is ITM, P&L up", "/portfolio"],
    ["EXERCISE → SETTLED ✓", "/portfolio"],
  ];
  return (
    <details className="panel group p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <span className="font-semibold">Hackathon demo flow</span>
        <span className="text-xs text-muted group-open:hidden">Show</span>
        <span className="hidden text-xs text-muted group-open:inline">Hide</span>
      </summary>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map(([t, href], i) => (
          <li key={t}>
            {href.startsWith("#") ? (
              <a href={href} className="flex h-full gap-2 rounded-lg border border-line p-3 text-sm hover:border-line-2">
                <span className="num text-dim">{String(i + 1).padStart(2, "0")}</span>
                {t}
              </a>
            ) : (
              <Link to={href} className="flex h-full gap-2 rounded-lg border border-line p-3 text-sm hover:border-line-2">
                <span className="num text-dim">{String(i + 1).padStart(2, "0")}</span>
                {t}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

function OraclePanel({ enabled }: { enabled: boolean }) {
  const { prices } = useOracle();
  const tx = useTransaction();
  const [draft, setDraft] = useState<Partial<Record<GpuSymbol, string>>>({});
  const [volDraft, setVolDraft] = useState<Partial<Record<GpuSymbol, string>>>({});

  const setPrice = (gpu: GpuSymbol, value: number) =>
    tx.execute(`Set ${gpu} price → ${formatPrice(value)}`, {
      address: contracts.oracle,
      abi: computeOracleAbi,
      functionName: "setPrice",
      args: [stringToBytes32(gpu), toUsdc(value)],
    });

  const setVol = (gpu: GpuSymbol, pct: number) =>
    tx.execute(`Set ${gpu} volatility → ${pct}%`, {
      address: contracts.oracle,
      abi: computeOracleAbi,
      functionName: "setVolatility",
      args: [stringToBytes32(gpu), BigInt(Math.round(pct * 100))],
    });

  return (
    <div id="oracle" className="scroll-mt-24">
      <Panel title="Compute price oracle" tag={<OnchainTag label="ComputeOracle" />}>
        <p className="mb-4 text-sm text-muted">Set any GPU's price or implied volatility directly. For the demo, use the scenario buttons above.</p>
        <div className="space-y-3">
          {GPU_SYMBOLS.map((gpu) => {
            const p = prices?.[gpu];
            const priceInput = draft[gpu] ?? "";
            const volInput = volDraft[gpu] ?? "";
            const priceNum = Number(priceInput);
            const volNum = Number(volInput);
            return (
              <div key={gpu} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-semibold">{gpu}</span>
                    <span className="num text-lg">{p ? formatPrice(p.price) : "—"}</span>
                    <span className="num text-xs text-muted">IV {p ? `${(p.volatility * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                  <span className="text-xs text-dim">{p ? `updated ${timeAgo(p.updatedAt)}` : ""}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <input className="input py-2" placeholder="New price $" inputMode="decimal" value={priceInput} onChange={(e) => setDraft({ ...draft, [gpu]: e.target.value.replace(/[^\d.]/g, "") })} aria-label={`${gpu} new price`} />
                    <button
                      className="btn-secondary shrink-0 px-3 py-2 text-xs"
                      disabled={!enabled || tx.isBusy || !(priceNum > 0)}
                      onClick={async () => (await setPrice(gpu, priceNum)) && setDraft({ ...draft, [gpu]: "" })}
                    >
                      Set price
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input className="input py-2" placeholder="Vol %" inputMode="decimal" value={volInput} onChange={(e) => setVolDraft({ ...volDraft, [gpu]: e.target.value.replace(/[^\d.]/g, "") })} aria-label={`${gpu} volatility`} />
                    <button
                      className="btn-secondary shrink-0 px-3 py-2 text-xs"
                      disabled={!enabled || tx.isBusy || !(volNum > 0)}
                      onClick={async () => (await setVol(gpu, volNum)) && setVolDraft({ ...volDraft, [gpu]: "" })}
                    >
                      Set vol
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {tx.state.phase !== "idle" && (
          <div className="mt-4">
            <TransactionStatus state={tx.state} onDismiss={tx.reset} successNote={<span className="text-muted">Oracle updated onchain. Portfolios re-mark on the next block.</span>} />
          </div>
        )}
      </Panel>
    </div>
  );
}

const REGIONS = ["US-East", "US-West", "EU-West", "APAC"];

function CreateSeriesPanel({ enabled, vaultEnabled }: { enabled: boolean; vaultEnabled: boolean }) {
  const vault = useVault();
  const vaultTx = useVaultActions();
  const [writer, setWriter] = useState<"WALLET" | "VAULT">("WALLET");
  const viaVault = writer === "VAULT";
  const { prices } = useOracle();
  const usdc = useUSDC(contracts.optionFactory);
  const approveTx = useUSDCActions();
  const createTx = useTransaction();
  const [last, setLast] = useState<"approve" | "create">("create");

  const [gpu, setGpu] = useState<GpuSymbol>("H100");
  const [region, setRegion] = useState("US-East");
  const [kind, setKind] = useState<OptionKind>("CALL");
  const [strike, setStrike] = useState("2.20");
  const [days, setDays] = useState("30");
  const [size, setSize] = useState("100");
  const [premium, setPremium] = useState("");
  const [cap, setCap] = useState("");
  const [capacity, setCapacity] = useState("500");

  const strikeN = Number(strike);
  const daysN = Number(days);
  const sizeN = Math.floor(Number(size));
  const capN = cap === "" ? strikeN : Number(cap);
  const capacityN = Math.floor(Number(capacity));
  const spot = prices?.[gpu]?.price ?? 0;
  const vol = prices?.[gpu]?.volatility ?? 0.4;
  const model = useMemo(
    () => (spot > 0 && strikeN > 0 && daysN > 0 ? calculateCappedOptionPrice(kind, { spot, strike: strikeN, timeToExpiry: (daysN * 86400) / SECONDS_PER_YEAR, volatility: vol }, capN) : 0),
    [kind, spot, strikeN, daysN, vol, capN],
  );
  const premiumN = premium === "" ? Math.max(Math.ceil(model * 1.08 * 1000) / 1000, 0.001) : Number(premium);
  const collateral = capN * sizeN * capacityN;
  const collateralRaw = toUsdc(capN) * BigInt(sizeN > 0 ? sizeN : 0) * BigInt(capacityN > 0 ? capacityN : 0);

  const errors: string[] = [];
  if (!(strikeN > 0)) errors.push("Strike must be > 0");
  if (!(daysN > 0) || daysN > 730) errors.push("Expiry must be 1–730 days");
  if (!(sizeN > 0)) errors.push("Contract size must be ≥ 1");
  if (!(capN > 0)) errors.push("Payout cap must be > 0");
  if (kind === "PUT" && capN > strikeN) errors.push("Put cap cannot exceed strike");
  if (!(premiumN > 0) || premiumN >= capN) errors.push("Premium must be > 0 and below the cap");
  if (!(capacityN > 0)) errors.push("Capacity must be ≥ 1");
  const insufficient = viaVault ? vault.idle < collateral : usdc.balanceRaw !== undefined && usdc.balanceRaw < collateralRaw;
  const needsApproval = !viaVault && usdc.allowanceRaw < collateralRaw;
  const busy = approveTx.isBusy || createTx.isBusy || vaultTx.isBusy;
  const canCreate = viaVault ? vaultEnabled : enabled;

  const create = async () => {
    setLast("create");
    const label = `Create ${gpu} ${kind} ${formatPrice(strikeN)} · ${daysN}D${viaVault ? " (LP vault)" : ""}`;
    const params = {
          underlying: stringToBytes32(gpu),
          region: stringToBytes32(region),
          optionType: kind === "CALL" ? 0 : 1,
          strikePrice: toUsdc(strikeN),
          expiration: BigInt(Math.floor(Date.now() / 1000 + daysN * 86400)),
          contractSize: BigInt(sizeN),
          premium: toUsdc(premiumN),
          maxPayoutPerUnit: toUsdc(capN),
          maxContracts: BigInt(capacityN),
          oracle: contracts.oracle,
          settlementToken: contracts.usdc,
    };
    if (viaVault) await vaultTx.writeSeries(label, params);
    else await createTx.execute(label, { address: contracts.optionFactory, abi: optionFactoryAbi, functionName: "createOptionSeries", args: [params] });
  };
  const createState = viaVault ? vaultTx.state : createTx.state;

  return (
    <Panel title="Create option series" tag={<OnchainTag label="OptionFactory" />}>
      {hasVault && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-0.5">
          {([["WALLET", "Write from my wallet"], ["VAULT", "Write from LP vault"]] as const).map(([w, l]) => (
            <button key={w} onClick={() => setWriter(w)} className={`seg py-2 ${writer === w ? "bg-panel-2 text-fg" : "text-muted"}`}>{l}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="GPU">
          <select className="input py-2" value={gpu} onChange={(e) => setGpu(e.target.value as GpuSymbol)}>
            {GPU_SYMBOLS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className="input py-2" value={kind} onChange={(e) => setKind(e.target.value as OptionKind)}>
            <option>CALL</option>
            <option>PUT</option>
          </select>
        </Field>
        <Field label="Region">
          <select className="input py-2" value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Strike $/GPU-h"><input className="input py-2" inputMode="decimal" value={strike} onChange={(e) => setStrike(e.target.value)} /></Field>
        <Field label="Expiry (days)"><input className="input py-2" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label="Contract size (GPU-h)"><input className="input py-2" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} /></Field>
        <Field label={`Premium $/GPU-h`}>
          <input className="input py-2" inputMode="decimal" placeholder={premiumN.toFixed(3)} value={premium} onChange={(e) => setPremium(e.target.value)} />
        </Field>
        <Field label="Payout cap $/GPU-h">
          <input className="input py-2" inputMode="decimal" placeholder={strikeN > 0 ? strikeN.toFixed(2) : ""} value={cap} onChange={(e) => setCap(e.target.value)} />
        </Field>
        <Field label="Capacity (contracts)"><input className="input py-2" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-bg/50 p-3 text-sm sm:grid-cols-4">
        <div><div className="label text-[10px]">Spot</div><div className="num">{formatPrice(spot)}</div></div>
        <div><div className="label text-[10px]">Model price</div><div className="num">{formatPrice(model)}</div></div>
        <div><div className="label text-[10px]">Premium</div><div className="num">{formatPrice(premiumN)}{premium === "" && <span className="text-dim"> (model+8%)</span>}</div></div>
        <div><div className="label text-[10px]">Collateral required</div><div className="num font-semibold text-fg">{formatUsd(collateral, 0)}</div></div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Fully collateralized: cap × size × capacity is transferred from {viaVault ? "the LP vault" : "your wallet"} into the new series and
        locked until exercise or expiry. {viaVault ? "Vault idle liquidity" : "Your USDC"}:{" "}
        <span className="num text-fg">{formatUsd(viaVault ? vault.idle : usdc.balance, 0)}</span>
        {viaVault && " · premiums accrue to LPs"}
      </p>
      {errors.length > 0 && <p className="mt-2 text-xs text-neg">{errors[0]}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {insufficient ? (
          <span className="text-sm text-neg">{viaVault ? "Not enough idle vault liquidity. Reduce capacity or deposit more." : "Insufficient USDC for collateral. Mint USDC below (owner) or reduce capacity."}</span>
        ) : needsApproval ? (
          <button
            className="btn-primary"
            disabled={!canCreate || busy || errors.length > 0}
            onClick={() => {
              setLast("approve");
              approveTx.approve(contracts.optionFactory, collateralRaw);
            }}
          >
            {busy && <Spinner />} APPROVE {formatUsd(collateral, 0)} COLLATERAL
          </button>
        ) : (
          <button className="btn-primary" disabled={!canCreate || busy || errors.length > 0} onClick={create}>
            {busy && <Spinner />} CREATE SERIES
          </button>
        )}
      </div>
      {(last === "create" ? createState : approveTx.state).phase !== "idle" && (
        <div className="mt-4">
          <TransactionStatus
            state={last === "create" ? createState : approveTx.state}
            onDismiss={() => (last === "create" ? (createTx.reset(), vaultTx.reset()) : approveTx.reset())}
            successNote={last === "create" ? <Link to="/markets" className="font-semibold text-primary hover:underline">Series is live — view markets →</Link> : <span className="text-muted">Collateral approved. Create the series.</span>}
          />
        </div>
      )}
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block text-[10px]">{label}</span>
      {children}
    </label>
  );
}

function ProtocolPanel({ canPause, paused, canMint }: { canPause: boolean; paused: boolean; canMint: boolean }) {
  const { stats } = useProtocolStats();
  const { address } = useAccount();
  const tx = useTransaction();
  const mintTx = useUSDCActions();

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Series" value={stats ? formatNumber(stats.series) : "—"} tag={<OnchainTag label="" />} />
        <StatCard label="Trades" value={stats ? formatNumber(stats.trades) : "—"} />
        <StatCard label="Unique traders" value={stats ? formatNumber(stats.traders) : "—"} />
        <StatCard label="Contracts traded" value={stats ? formatNumber(stats.contractsTraded) : "—"} sub={stats ? `${formatNumber(stats.contractsTraded * 100)} GPU-h` : undefined} />
        <StatCard label="Premium volume" value={stats ? formatUsd(stats.premiumVolume) : "—"} />
        <StatCard label="Settled payouts" value={stats ? formatUsd(stats.payouts) : "—"} sub={stats ? `${stats.exercises} exercises` : undefined} />
      </div>
      <div className="panel mt-3 flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm text-muted">Emergency controls</span>
        <button
          className={paused ? "btn-pos px-3 py-1.5 text-xs" : "btn-neg px-3 py-1.5 text-xs"}
          disabled={!canPause || tx.isBusy}
          onClick={() => tx.execute(paused ? "Unpause protocol" : "Pause protocol", { address: contracts.optionFactory, abi: optionFactoryAbi, functionName: paused ? "unpause" : "pause" })}
        >
          {paused ? "UNPAUSE TRADING" : "PAUSE TRADING"}
        </button>
        <span className="text-xs text-dim">Pausing blocks new purchases and exercises across all series.</span>
        {canMint && address && (
          <button className="btn-secondary ml-auto px-3 py-1.5 text-xs" disabled={mintTx.isBusy} onClick={() => mintTx.mint(address, toUsdc(1_000_000))}>
            Mint 1,000,000 test USDC (owner)
          </button>
        )}
        {(tx.state.phase !== "idle" || mintTx.state.phase !== "idle") && (
          <div className="w-full">
            <TransactionStatus state={tx.state.phase !== "idle" ? tx.state : mintTx.state} onDismiss={() => { tx.reset(); mintTx.reset(); }} compact />
          </div>
        )}
      </div>
    </div>
  );
}

function SeriesPanel() {
  const { series } = useMarkets();
  const actions = useOptionActions();
  const [active, setActive] = useState<number>();
  const now = Date.now() / 1000;
  return (
    <div className="mt-6">
      <Panel title={`Option series (${series.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["#", "GPU", "Type", "Strike", "Cap", "Expiry", "Premium", "Sold / Max", "Collateral held", "Status", ""].map((h) => (
                  <th key={h} className="label px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const expired = s.expiration <= now;
                return (
                  <tr key={s.id} className="border-b border-line/60 last:border-0">
                    <td className="num px-3 py-2.5 text-muted">
                      <Link to={`/markets/${s.id}`} className="hover:text-fg">{s.id}</Link>
                    </td>
                    <td className="px-3 py-2.5 font-semibold">{s.gpu} <span className="text-xs font-normal text-dim">{s.region}</span></td>
                    <td className="px-3 py-2.5"><OptionTypeBadge kind={s.kind} /></td>
                    <td className="num px-3 py-2.5">{formatPrice(s.strike)}</td>
                    <td className="num px-3 py-2.5">{formatPrice(s.maxPayoutPerUnit)}</td>
                    <td className="num px-3 py-2.5">{formatTenor(s.expiration)}</td>
                    <td className="num px-3 py-2.5">{formatPrice(s.premium)}</td>
                    <td className="num px-3 py-2.5">{formatNumber(s.soldContracts)} / {formatNumber(s.maxContracts)}</td>
                    <td className="num px-3 py-2.5">{formatUsd(s.collateralBalance, 0)}</td>
                    <td className="px-3 py-2.5 text-xs">{s.settled ? <span className="text-dim">Settled</span> : expired ? <span className="text-warn">Expired</span> : <span className="text-pos">Live</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {expired && !s.settled && (
                        <button
                          className="btn-secondary px-2.5 py-1 text-xs"
                          disabled={actions.isBusy}
                          onClick={() => {
                            setActive(s.id);
                            actions.expire(s);
                          }}
                        >
                          Settle expiry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {active !== undefined && actions.state.phase !== "idle" && (
          <div className="mt-3"><TransactionStatus state={actions.state} onDismiss={actions.reset} compact /></div>
        )}
      </Panel>
    </div>
  );
}

function ActivityPanel() {
  const { activity } = useRecentActivity(25);
  return (
    <div className="mt-6">
      <Panel title="Protocol activity" tag={<OnchainTag label="Recorded onchain" />}>
        {activity.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Time", "Event", "Series", "Account", "Contracts", "Amount", "Block"].map((h) => (
                    <th key={h} className="label px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activity.map((a, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 text-xs text-muted">{formatDateTime(a.timestamp)}</td>
                    <td className={`px-3 py-2 font-medium ${a.kind === "Exercise" ? "text-pos" : a.kind === "Purchase" ? "text-secondary" : ""}`}>{a.kind}</td>
                    <td className="num px-3 py-2"><Link to={`/markets/${a.seriesId}`} className="hover:underline">#{a.seriesId}</Link></td>
                    <td className="px-3 py-2"><ExplorerLink address={a.account} label={shortAddress(a.account)} /></td>
                    <td className="num px-3 py-2">{formatNumber(a.contracts)}</td>
                    <td className="num px-3 py-2">{formatUsd(a.amount)}</td>
                    <td className="num px-3 py-2 text-dim">{a.blockNumber.toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function FuturesAdminPanel({ enabled }: { enabled: boolean }) {
  const { prices } = useOracle();
  const { markets } = useFuturesMarkets();
  const usdc = useUSDC(contracts.futures);
  const approveTx = useUSDCActions();
  const tx = useFuturesActions();
  const [last, setLast] = useState<"approve" | "create">("create");
  const [gpu, setGpu] = useState<GpuSymbol>("H100");
  const [forward, setForward] = useState("");
  const [band, setBand] = useState("");
  const [days, setDays] = useState("30");
  const [capacity, setCapacity] = useState("500");
  const spot = prices?.[gpu]?.price ?? 0;
  const forwardN = forward === "" ? Math.round(spot * 1.02 * 100) / 100 : Number(forward);
  const bandN = band === "" ? Math.round(spot * 0.5 * 100) / 100 : Number(band);
  const capacityN = Math.floor(Number(capacity));
  const collateral = bandN * 100 * capacityN;
  const collateralRaw = toUsdc(bandN) * 100n * BigInt(capacityN > 0 ? capacityN : 0);
  const valid = forwardN > 0 && bandN > 0 && bandN <= forwardN && Number(days) > 0 && capacityN > 0;
  const busy = approveTx.isBusy || tx.isBusy;
  const state = last === "create" ? tx.state : approveTx.state;

  return (
    <div className="mt-6">
      <Panel title={`GPU futures markets (${markets.length})`} tag={<OnchainTag label="ComputeFutures" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="GPU">
            <select className="input py-2" value={gpu} onChange={(e) => setGpu(e.target.value as GpuSymbol)}>
              {GPU_SYMBOLS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Forward $/GPU-h"><input className="input py-2" inputMode="decimal" placeholder={forwardN.toFixed(2)} value={forward} onChange={(e) => setForward(e.target.value)} /></Field>
          <Field label="Band ± $/GPU-h"><input className="input py-2" inputMode="decimal" placeholder={bandN.toFixed(2)} value={band} onChange={(e) => setBand(e.target.value)} /></Field>
          <Field label="Expiry (days)"><input className="input py-2" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <Field label="Capacity (contracts)"><input className="input py-2" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        </div>
        <p className="mt-3 text-xs text-muted">
          100 GPU-hours per contract. You take the other side of every position and post band × 100 × capacity ={" "}
          <span className="num font-semibold text-fg">{formatUsd(collateral, 0)}</span> collateral. Spot {formatPrice(spot)}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {usdc.allowanceRaw < collateralRaw ? (
            <button className="btn-primary" disabled={!enabled || busy || !valid} onClick={() => { setLast("approve"); approveTx.approve(contracts.futures, collateralRaw); }}>
              {busy && <Spinner />} APPROVE {formatUsd(collateral, 0)}
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={!enabled || busy || !valid}
              onClick={() => { setLast("create"); tx.createMarket({ gpu, region: "US-East", forward: forwardN, band: bandN, days: Number(days), contractSize: 100, capacity: capacityN }); }}
            >
              {busy && <Spinner />} CREATE FUTURES MARKET
            </button>
          )}
          <Link to="/futures" className="btn-ghost">View futures →</Link>
        </div>
        {state.phase !== "idle" && <div className="mt-3"><TransactionStatus state={state} onDismiss={() => (last === "create" ? tx.reset() : approveTx.reset())} compact /></div>}
      </Panel>
    </div>
  );
}
