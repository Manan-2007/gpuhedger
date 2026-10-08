import { Link } from "react-router-dom";
import { useAllGpuPrices } from "../hooks/useOracle";
import { useProtocolStats } from "../hooks/useProtocol";
import { GPU_META, marketData } from "../data/marketData";
import { formatNumber, formatPct, formatPrice, formatUsd } from "../utils/formatters";
import { OnchainTag, SimulatedTag } from "../components/ui";
import { activeChain } from "../lib/chain";

export function LandingPage() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <Problem />
      <HowItWorks />
      <Products />
      <ExampleHedge />
      <Users />
      <WhyMonad />
      <Roadmap />
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_75%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-line-2 text-muted">Onchain options · {activeChain.name}</span>
          </div>
          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            HEDGE THE
            <br />
            FUTURE OF <span className="text-primary">COMPUTE</span>
          </h1>
          <p className="mt-6 text-xl font-medium text-fg sm:text-2xl">Onchain options for GPU compute.</p>
          <p className="mt-3 max-w-xl text-base text-muted sm:text-lg">
            GpuHedger gives AI companies a programmable way to hedge future GPU compute prices — turning an unpredictable
            infrastructure expense into a hedgeable financial asset.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/trade" className="btn-primary px-6 py-3.5 text-base">
              TRADE COMPUTE →
            </Link>
            <Link to="/markets" className="btn-secondary px-6 py-3.5 text-base">
              EXPLORE MARKETS
            </Link>
          </div>
        </div>
        <MarketWidget />
      </div>
    </section>
  );
}

function MarketWidget() {
  const prices = useAllGpuPrices();
  const live = prices.some((p) => p.isLive);
  return (
    <div className="panel overflow-hidden shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="label">GPU compute · $ / GPU-hour</span>
        {live ? <OnchainTag label="Live oracle" /> : <SimulatedTag />}
      </div>
      <div className="divide-y divide-line">
        {prices.map((p) => {
          const stats = marketData.getStats(p.gpu);
          return (
            <Link key={p.gpu} to={`/markets?gpu=${p.gpu}`} className="flex items-center justify-between px-5 py-4 hover:bg-panel-2">
              <div>
                <div className="text-lg font-bold">{p.gpu}</div>
                <div className="text-xs text-muted">{GPU_META[p.gpu].name}</div>
              </div>
              <div className="text-right">
                <div className="num text-2xl font-semibold">
                  {formatPrice(p.price)}
                  <span className="ml-1 text-xs font-normal text-dim">/ GPU-HOUR</span>
                </div>
                <div className={`num text-sm ${stats.change24h >= 0 ? "text-pos" : "text-neg"}`}>
                  {formatPct(stats.change24h)} <span className="text-dim">24h</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="border-t border-line bg-bg/40 px-5 py-2.5 text-[11px] text-dim">
        Prices: {live ? "ComputeOracle on " + activeChain.name + " (admin-controlled demo feed)" : "simulated fallback"} · 24h change:
        simulated
      </div>
    </div>
  );
}

function StatsStrip() {
  const { stats } = useProtocolStats();
  const items = [
    { k: "Option series", v: stats ? formatNumber(stats.series) : "—" },
    { k: "Onchain trades", v: stats ? formatNumber(stats.trades) : "—" },
    { k: "Premium volume", v: stats ? formatUsd(stats.premiumVolume, 0) : "—" },
    { k: "Settled payouts", v: stats ? formatUsd(stats.payouts, 0) : "—" },
    { k: "Block time", v: "~400ms" },
    { k: "Finality", v: "~800ms" },
  ];
  return (
    <section className="border-b border-line bg-panel/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-6">
        {items.map((i) => (
          <div key={i.k} className="py-5 md:px-4 md:first:pl-0">
            <div className="label">{i.k}</div>
            <div className="num mt-1 text-xl font-semibold">{i.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({ eyebrow, title, children, id }: { eyebrow: string; title: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
      <div className="label text-primary">{eyebrow}</div>
      <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Problem() {
  const cards = [
    {
      t: "Compute is a commodity — without a market",
      b: "GPU-hours are now a core input for every AI company, yet pricing is opaque and negotiated in bilateral, illiquid contracts.",
    },
    {
      t: "Future costs are unpredictable",
      b: "Spot rates for H100 and B200 capacity swing with model launches and supply shocks. A startup's runway can move with them.",
    },
    {
      t: "There is no way to hedge",
      b: "Airlines hedge fuel. Manufacturers hedge metals. AI companies have no instrument to lock in or cap tomorrow's compute bill.",
    },
  ];
  return (
    <Section eyebrow="The problem" title="GPU compute is becoming a commodity. It needs financial infrastructure.">
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c, i) => (
          <div key={c.t} className="panel p-6">
            <div className="num text-sm text-primary">0{i + 1}</div>
            <h3 className="mt-3 text-lg font-semibold">{c.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.b}</p>
          </div>
        ))}
      </div>
      <div className="panel mt-4 flex flex-col gap-2 border-primary/30 bg-primary/[0.04] p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-semibold">
          GpuHedger: <span className="text-primary">a programmable market for compute risk.</span>
        </p>
        <p className="text-sm text-muted">Options make the hedge standard. The blockchain makes it programmable. Monad makes it instant.</p>
      </div>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Choose your GPU", b: "H100 · A100 · B200 — standardized contracts on GPU-hours." },
    { n: "02", t: "Choose your option", b: "CALL or PUT, depending on which price move you need protection from." },
    { n: "03", t: "Choose your protection", b: "Strike price, expiration and contract size (100 GPU-hours each)." },
    { n: "04", t: "Settle onchain", b: "Buy → Exercise → Settlement in USDC, enforced by smart contracts." },
  ];
  return (
    <Section eyebrow="How it works" title="Four steps from uncertain compute costs to a capped budget.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="panel relative p-6">
            <div className="num text-3xl font-semibold text-line-2">{s.n}</div>
            <h3 className="mt-4 font-semibold">{s.t}</h3>
            <p className="mt-2 text-sm text-muted">{s.b}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="panel p-6">
          <span className="chip border-pos/30 bg-pos/10 text-pos">CALL</span>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <span className="font-semibold text-fg">A CALL protects against rising compute prices.</span> An AI startup that
            needs H100 capacity next month buys calls. If the H100 price rises above the strike, the option pays the difference.
          </p>
        </div>
        <div className="panel p-6">
          <span className="chip border-neg/30 bg-neg/10 text-neg">PUT</span>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <span className="font-semibold text-fg">A PUT protects a compute provider against falling prices.</span> A GPU cloud
            with idle capacity buys puts to lock in a revenue floor for the hours it expects to sell.
          </p>
        </div>
      </div>
    </Section>
  );
}

function Products() {
  const items = [
    { to: "/hedge", t: "Hedge calculator", b: "Tell us your GPU-hours and budget. Get the cheapest hedge that caps your bill.", tag: "For AI startups" },
    { to: "/trade", t: "Options", b: "Calls cap compute costs, puts floor rental revenue. Fully collateralized, cash-settled." },
    { to: "/futures", t: "Futures", b: "Lock in an exact price per GPU-hour with zero premium, fully margined." },
    { to: "/vault", t: "LP vault", b: "Deposit USDC, earn the premiums AI companies pay to hedge." },
    { to: "/portfolio", t: "Transferable hedges", b: "Every position is an NFT. Move a hedge to a treasury wallet or sell it." },
    { to: "/activity", t: "Onchain traction", b: "Every trade, exercise and payout, linked to its Monad transaction." },
  ];
  return (
    <Section eyebrow="The platform" title="Everything needed to manage compute price risk.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className={`panel group p-6 transition-colors hover:border-line-2 ${i.tag ? "border-primary/50 bg-primary/[0.04]" : ""}`}>
            {i.tag && <span className="chip mb-3 border-primary/40 text-primary">{i.tag}</span>}
            <h3 className="font-semibold">{i.t} <span className="text-dim transition-colors group-hover:text-primary">→</span></h3>
            <p className="mt-2 text-sm text-muted">{i.b}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function ExampleHedge() {
  const rows = [
    ["Need", "1,000 H100 GPU-hours next month"],
    ["Today's H100 price", "$2.00 / GPU-hour"],
    ["Hedge", "10 CALL contracts · strike $2.20 · 30 days"],
    ["Premium paid", "$35.00 (max loss)"],
  ];
  return (
    <Section eyebrow="Example" title="An AI startup caps its H100 bill.">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-6">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line py-3 last:border-0">
              <span className="text-sm text-muted">{k}</span>
              <span className="num text-right text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel p-6">
            <div className="label">If H100 → $4.00</div>
            <div className="num mt-3 text-3xl font-semibold text-pos">+$1,765</div>
            <p className="mt-2 text-sm text-muted">
              Payout $1,800 ((4.00 − 2.20) × 1,000) offsets most of the $2,000 price increase.
            </p>
          </div>
          <div className="panel p-6">
            <div className="label">If H100 → $1.50</div>
            <div className="num mt-3 text-3xl font-semibold text-muted">−$35</div>
            <p className="mt-2 text-sm text-muted">The option expires unused. Compute got cheaper; the cost of insurance was the premium.</p>
          </div>
          <p className="text-xs text-dim sm:col-span-2">
            Illustrative numbers matching the seeded demo market. Payouts are capped at the series' collateralized maximum.
          </p>
        </div>
      </div>
    </Section>
  );
}

function Users() {
  const users = [
    { t: "AI startups", b: "Companies buying significant GPU capacity that need predictable compute budgets. Our first customer.", primary: true },
    { t: "GPU providers", b: "Clouds and data centers hedging future rental revenue with puts." },
    { t: "Compute traders", b: "Participants seeking direct exposure to GPU price movements." },
    { t: "Market makers", b: "Liquidity providers writing collateralized options and earning premium." },
    { t: "DeFi protocols", b: "Future: compute derivatives as collateral and structured-product building blocks." },
  ];
  return (
    <Section eyebrow="Who it's for" title="Built first for the AI companies whose margins depend on GPU prices.">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {users.map((u) => (
          <div key={u.t} className={`panel p-5 ${u.primary ? "border-primary/50 bg-primary/[0.05] md:col-span-3 lg:col-span-1" : ""}`}>
            {u.primary && <span className="chip mb-3 border-primary/40 text-primary">First users</span>}
            <h3 className="font-semibold">{u.t}</h3>
            <p className="mt-2 text-sm text-muted">{u.b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WhyMonad() {
  const steps = [
    { t: "Order submitted", s: "0 ms" },
    { t: "Confirming", s: "~400 ms" },
    { t: "Settled ✓", s: "~800 ms" },
  ];
  return (
    <Section eyebrow="Why Monad" title="Hedging should settle as fast as markets move.">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {steps.map((s, i) => (
              <div key={s.t} className="flex flex-1 items-center gap-3">
                <div className={`flex-1 rounded-lg border p-4 ${i === 2 ? "border-pos/40 bg-pos/[0.06]" : "border-line-2"}`}>
                  <div className={`font-semibold ${i === 2 ? "text-pos" : ""}`}>{s.t}</div>
                  <div className="num mt-1 text-xs text-muted">{s.s}</div>
                </div>
                {i < 2 && <span className="hidden text-dim sm:block">→</span>}
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Monad's ~400ms blocks and ~800ms finality mean premium payment, oracle updates, exercise and USDC settlement confirm
            in about a second. Every trade in this app shows its measured settlement time and a link to the transaction.
          </p>
        </div>
        <div className="panel p-6">
          <ul className="space-y-4 text-sm">
            {[
              ["Real-time risk", "Positions mark against a live onchain oracle; exercise the moment you're in the money."],
              ["Full EVM", "Standard Solidity, OpenZeppelin and wallets — no new tooling for integrators."],
              ["Cheap enough to hedge small", "Low fees make 100 GPU-hour contracts viable, not just million-dollar deals."],
            ].map(([t, b]) => (
              <li key={t}>
                <div className="font-semibold">{t}</div>
                <div className="mt-0.5 text-muted">{b}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/** [phase, title, description, status shown on the card (if any)] */
export const ROADMAP: readonly (readonly [string, string, string, string?])[] = [
  ["Phase 1", "Testnet MVP", "Collateralized GPU calls & puts, oracle, settlement with automatic expiry claims.", "Live"],
  ["Phase 2", "Real compute price oracle", "Oracle updater fed by live GPU rental marketplace prices; next, decentralized reporters.", "Prototype"],
  ["Phase 3", "Liquidity providers", "ERC-4626 LP vault writes options with pooled USDC; next, permissionless writers.", "Prototype"],
  ["Phase 4", "Secondary option trading", "Positions are transferable ERC-721s today; next, an onchain order book.", "Partial"],
  ["Phase 5", "GPU futures", "Fully margined forwards that lock in a fixed compute price.", "Prototype"],
  ["Phase 6", "Compute-backed lending", "Borrow against reserved GPU capacity."],
  ["Phase 7", "SLA insurance", "Coverage for downtime and delivery failures."],
  ["Phase 8", "Institutional compute hedging", "Hedging desks and reporting for AI labs and clouds."],
];

function Roadmap() {
  return (
    <Section eyebrow="Roadmap" title="From a testnet primitive to the hedging layer for AI infrastructure.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROADMAP.map(([phase, t, b, status]) => (
          <div key={phase} className={`panel p-5 ${status ? "border-primary/50" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="num text-xs text-muted">{phase}</span>
              {status && <span className="chip border-primary/40 text-primary">{status}</span>}
            </div>
            <h3 className="mt-2 font-semibold">{t}</h3>
            <p className="mt-1.5 text-sm text-muted">{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <div className="panel relative overflow-hidden p-8 sm:p-12">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Turn GPU compute into a <span className="text-primary">hedgeable financial asset.</span>
          </h2>
          <p className="mt-3 text-muted">Connect a wallet, grab test USDC, and buy your first compute option in under a minute.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/trade" className="btn-primary px-6 py-3.5">TRADE COMPUTE →</Link>
            <Link to="/docs" className="btn-secondary px-6 py-3.5">READ THE DOCS</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
