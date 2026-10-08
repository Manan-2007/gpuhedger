import { useState } from "react";
import { Link } from "react-router-dom";
import { PayoffChart } from "../components/PayoffChart";
import { RISK_TEXT } from "../components/RiskDisclosure";
import { ExplorerLink } from "../components/ui";
import { addresses } from "../contracts/addresses";
import { activeChain, explorerUrl } from "../lib/chain";
import type { OptionKind } from "../types/options";
import { formatPrice } from "../utils/formatters";
import { ROADMAP } from "./LandingPage";

const TOC = [
  ["overview", "Overview"],
  ["architecture", "Architecture"],
  ["contracts", "Smart contracts"],
  ["settlement", "Settlement & collateral"],
  ["pricing", "Pricing model"],
  ["playground", "Payoff playground"],
  ["security", "Security"],
  ["risks", "Risks & limitations"],
  ["roadmap", "Roadmap"],
];

export function DocsPage() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm">
          <div className="label mb-2">Docs</div>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-muted hover:bg-panel-2 hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 max-w-3xl space-y-14 text-[15px] leading-relaxed text-fg/90">
        <Doc id="overview" title="GpuHedger protocol">
          <p>
            GpuHedger is an onchain options market that lets AI companies hedge against future GPU compute price volatility. The
            underlying is <b>GPU compute</b> (H100, A100, B200) priced in <b>USD per GPU-hour</b>. The primary customer is an{" "}
            <b>AI startup</b> that will buy significant compute and wants a predictable budget.
          </p>
          <p>
            Traditional compute contracts are opaque and bilateral. Options give a standard way to cap future cost: pay a small premium
            today, receive the difference if prices rise above your strike. Smart contracts make that hedge programmable and
            self-settling; Monad's ~400ms blocks and ~800ms finality make it feel instant.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li><b className="text-fg">CALL</b> — pays max(spot − strike, 0) per GPU-hour. Protects buyers of compute against rising prices.</li>
            <li><b className="text-fg">PUT</b> — pays max(strike − spot, 0) per GPU-hour. Protects GPU providers against falling prices.</li>
            <li>One contract = 100 GPU-hours (configurable per series). Premium and strike are quoted per GPU-hour.</li>
          </ul>
        </Doc>

        <Doc id="architecture" title="Architecture">
          <div className="grid gap-4 sm:grid-cols-2">
            <Flow items={["User", "Frontend (React)", "wagmi / viem", "Monad", "OptionFactory", "ComputeOption (series)", "ComputeOracle", "MockUSDC"]} />
            <div className="space-y-4">
              <Flow items={["Admin", "ComputeOracle", "GPU price"]} />
              <p className="text-sm text-muted">
                The factory deploys each series as a minimal-proxy clone of one ComputeOption implementation, pulls the writer's
                collateral into it, and indexes every series, position and trade so the frontend can discover markets with a single
                call. Options read the settlement price from the oracle through the <code className="num">IComputeOracle</code>{" "}
                interface, so the permissioned demo oracle can later be swapped for a decentralized feed.
              </p>
            </div>
          </div>
        </Doc>

        <Doc id="contracts" title={`Smart contracts · ${activeChain.name}`}>
          <div className="panel divide-y divide-line">
            {[
              ["OptionFactory", addresses.optionFactory, "Creates series (createOptionSeries), indexes positions, records protocol activity, pause switch."],
              ["ComputeOracle", addresses.oracle, "Admin-controlled GPU prices + implied vol (setPrice / getPrice / getPriceWithTimestamp)."],
              ["MockUSDC", addresses.usdc, "6-decimal TESTNET ONLY settlement token with a public faucet."],
              ["ComputeOption", undefined, "One per series: buyOption, exercise, expire, getPosition, getOptionDetails, isInTheMoney, calculateExerciseValue."],
            ].map(([name, addr, desc]) => (
              <div key={name} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold">{name}</div>
                  <div className="text-sm text-muted">{desc}</div>
                </div>
                <div className="shrink-0 text-sm">{addr ? <ExplorerLink address={addr} /> : <span className="text-dim">per series</span>}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted">
            Chain ID <span className="num text-fg">{activeChain.id}</span>
            {explorerUrl && (
              <>
                {" "}· Explorer <a className="text-secondary hover:underline" href={explorerUrl} target="_blank" rel="noreferrer">{explorerUrl.replace("https://", "")}</a>
              </>
            )}
          </p>
        </Doc>

        <Doc id="settlement" title="Settlement & collateral">
          <Formula>
            CALL in the money when spot &gt; strike · exercise value = min(spot − strike, cap) × contractSize × contracts
            <br />
            PUT in the money when spot &lt; strike · exercise value = min(strike − spot, cap) × contractSize × contracts
          </Formula>
          <p>
            Every series is <b>fully collateralized</b>. When a writer creates a series they deposit{" "}
            <code className="num">cap × contractSize × capacity</code> USDC. Buyers pay the premium directly to the writer. Collateral
            backing open positions is locked until exercise or expiry and cannot be withdrawn; the writer can only reclaim collateral
            for unsold capacity, collateral freed by exercises that paid less than the cap, or everything after expiry.
          </p>
          <p>
            Because payouts are capped, a call behaves like a call spread: potential profit is large but finite, and always funded.
            Exercise is allowed any time before expiry while in the money. Unexercised positions expire worthless; anyone can then call{" "}
            <code className="num">expire()</code> to release the writer's collateral.
          </p>
        </Doc>

        <Doc id="pricing" title="Pricing model">
          <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            Model price — for demonstration purposes. Not institutional-grade options pricing.
          </p>
          <p>
            The frontend estimates fair value with Black-Scholes (<code className="num">src/utils/optionsPricing.ts</code>) using the
            oracle spot, strike, time to expiry, the oracle's implied volatility, and a 4% risk-free rate:
          </p>
          <Formula>
            d₁ = [ln(S/K) + (r + σ²/2)T] / (σ√T) · d₂ = d₁ − σ√T
            <br />
            C = S·N(d₁) − K·e^(−rT)·N(d₂) · P = K·e^(−rT)·N(−d₂) − S·N(−d₁)
            <br />
            Capped call = C(K) − C(K + cap) · Capped put = P(K) − P(K − cap)
          </Formula>
          <p className="text-sm text-muted">
            Seeded premiums are the model price plus ~8%. The executable premium is fixed onchain per series. Portfolio values for
            open positions are model estimates floored at exercise value; they are not production marks. GPU compute isn't
            continuously tradable, so Black-Scholes assumptions (continuous hedging, lognormal prices) only loosely apply.
          </p>
        </Doc>

        <Doc id="playground" title="Payoff playground">
          <Playground />
        </Doc>

        <Doc id="security" title="Security">
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            <li>OpenZeppelin AccessControl: ORACLE_ROLE for price updates; WRITER_ROLE and PAUSER_ROLE on the factory.</li>
            <li>ReentrancyGuard on all state-changing option functions; SafeERC20 for every transfer.</li>
            <li>Checks-effects-interactions; events emitted before external calls.</li>
            <li>Validation: non-zero strike, future expiry (≤ 2 years), contract size bounds, premium &lt; cap, put cap ≤ strike, allowlisted oracle & settlement token, oracle-supported underlying.</li>
            <li>Double exercise, exercise after expiry, out-of-the-money exercise, and non-owner exercise all revert.</li>
            <li>Locked collateral is never withdrawable; clones cannot be re-initialized; only registered series can record activity.</li>
            <li>30 Foundry tests including a fuzz test that payouts never exceed collateral.</li>
          </ul>
        </Doc>

        <Doc id="risks" title="Risks & limitations">
          <p className="rounded-lg border border-line bg-panel p-4 text-sm">{RISK_TEXT}</p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            <li>The oracle is a permissioned demo feed controlled by the admin — not a real GPU price index.</li>
            <li>24h/7d change, rental volume, historical charts and bids are simulated and labelled as such.</li>
            <li>Single writer per series, fixed premium, no secondary market yet.</li>
            <li>Test USDC has no value. Unaudited hackathon code — do not use with real funds.</li>
          </ul>
        </Doc>

        <Doc id="roadmap" title="Roadmap">
          <ol className="space-y-2">
            {ROADMAP.map(([phase, t, b]) => (
              <li key={phase} className="flex gap-4">
                <span className="num w-16 shrink-0 text-sm text-primary">{phase}</span>
                <span><b>{t}</b> <span className="text-muted">— {b}</span></span>
              </li>
            ))}
          </ol>
          <Link to="/trade" className="btn-primary mt-4">TRADE COMPUTE →</Link>
        </Doc>
      </article>
    </div>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="num overflow-x-auto rounded-lg border border-line bg-panel px-4 py-3 text-[13px] leading-7 text-secondary">{children}</div>;
}

function Flow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col items-stretch">
      {items.map((item, i) => (
        <div key={item} className="flex flex-col items-center">
          <div className="w-full rounded-lg border border-line-2 bg-panel px-4 py-2.5 text-center text-sm font-medium">{item}</div>
          {i < items.length - 1 && <div className="h-4 w-px bg-line-2" aria-hidden />}
        </div>
      ))}
    </div>
  );
}

function Playground() {
  const [kind, setKind] = useState<OptionKind>("CALL");
  const [strike, setStrike] = useState(2.2);
  const [premium, setPremium] = useState(0.035);
  const [qty, setQty] = useState(10);
  const [spot, setSpot] = useState(2.0);
  const sliders: [string, number, (n: number) => void, number, number, number, string][] = [
    ["Strike", strike, setStrike, 0.5, 6, 0.05, formatPrice(strike)],
    ["Premium", premium, setPremium, 0.005, 1, 0.005, formatPrice(premium)],
    ["Quantity (contracts)", qty, setQty, 1, 100, 1, String(qty)],
    ["Underlying price", spot, setSpot, 0.5, 6, 0.05, formatPrice(spot)],
  ];
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-bg p-0.5 sm:w-fit">
        {(["CALL", "PUT"] as OptionKind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`seg flex-1 ${kind === k ? (k === "CALL" ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg") : "text-muted"}`}>
            {k}
          </button>
        ))}
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        {sliders.map(([label, value, set, min, max, step, display]) => (
          <label key={label} className="block">
            <div className="flex justify-between text-xs">
              <span className="label">{label}</span>
              <span className="num text-fg">{display}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1.5 w-full accent-[var(--color-primary)]" />
          </label>
        ))}
      </div>
      <PayoffChart
        kind={kind}
        strike={strike}
        premium={premium}
        payoutCap={strike}
        contractSize={100}
        contracts={qty}
        spot={spot}
        volatility={0.42}
        expiration={Math.floor(Date.now() / 1000) + 30 * 86400}
        gpuLabel="H100"
        height={260}
      />
      <p className="mt-3 text-xs text-dim">Illustrative: 100 GPU-hour contracts, 30 days, 42% vol, payout capped at the strike (as in the seeded markets).</p>
    </div>
  );
}
