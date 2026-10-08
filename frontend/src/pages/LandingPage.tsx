import { Link } from "react-router-dom";
import { useAllGpuPrices } from "../hooks/useOracle";
import { useProtocolStats } from "../hooks/useProtocol";
import { useBlockTime } from "../hooks/useBlockTime";
import { GPU_META, marketData } from "../data/marketData";
import { ROADMAP } from "../data/roadmap";
import { formatNumber, formatPct, formatPrice, formatUsd } from "../utils/formatters";
import { Ago, OnchainTag, SimulatedTag } from "../components/ui";
import { activeChain } from "../lib/chain";

export function LandingPage() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <Problem />
      <ExampleHedge />
      <Users />
      <WhyMonad />
      <Products />
      <Roadmap />
      <ClosingCta />
    </>
  );
}

const TRUST = ["Fully collateralized", "Max loss = premium paid", "Cash-settled in USDC", "Every trade onchain"];

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden className="text-pos">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Hero() {
  return (
    <section className="relative border-b border-line">
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <span className="chip border-line-2 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            Onchain options on GPU compute · {activeChain.name}
          </span>
          <h1 className="mt-6 text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.25rem]">
            Hedge the future
            <br />
            of <span className="text-primary">compute.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted sm:text-xl">
            GpuHedger lets AI companies cap what they'll pay for GPU-hours next month. Buy a call on H100, A100 or B200 compute: if
            rental prices spike, the option pays the difference in USDC.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/trade" className="btn-primary px-6 py-3.5 text-base">
              Trade compute →
            </Link>
            <Link to="/hedge" className="btn-secondary px-6 py-3.5 text-base">
              Size my hedge
            </Link>
          </div>
          <ul className="mt-7 grid max-w-lg grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check />
                {t}
              </li>
            ))}
          </ul>
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
        {live ? <OnchainTag label="Live oracle" /> : prices[0].isLoading ? null : <span className="chip border-warn/40 text-warn">Oracle unavailable</span>}
      </div>
      <div className="divide-y divide-line">
        {prices.map((p) => {
          const stats = marketData.getStats(p.gpu);
          return (
            <Link key={p.gpu} to={`/markets?gpu=${p.gpu}`} className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-panel-2">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold">
                  {p.gpu}
                  <span className="text-sm font-normal text-dim transition-colors group-hover:text-fg">→</span>
                </div>
                <div className="text-xs text-muted">{GPU_META[p.gpu].name}</div>
              </div>
              <div className="text-right">
                <div className="num text-2xl font-semibold">
                  {p.price !== undefined ? formatPrice(p.price) : "—"}
                  <span className="ml-1 text-xs font-normal text-dim">/GPU-h</span>
                </div>
                <div className="num text-xs text-dim">
                  {p.updatedAt ? (
                    <>
                      oracle · <Ago timestamp={p.updatedAt} />
                    </>
                  ) : (
                    "oracle"
                  )}
                  <span className={`ml-2 ${stats.change24h >= 0 ? "text-pos" : "text-neg"}`}>{formatPct(stats.change24h)}</span> 24h*
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-bg-deep/40 px-5 py-2.5 text-[11px] text-dim">
        <span>{live ? `ComputeOracle on ${activeChain.name} · admin-controlled demo feed` : "Waiting for the onchain oracle"}</span>
        <span className="flex shrink-0 items-center gap-1.5">*24h <SimulatedTag className="py-0 text-[9px]" /></span>
      </div>
    </div>
  );
}

function StatsStrip() {
  const { stats } = useProtocolStats();
  const { blockTime } = useBlockTime();
  const items = [
    { k: "Option series", v: stats ? formatNumber(stats.series) : "—", sub: "onchain" },
    { k: "Trades", v: stats ? formatNumber(stats.trades) : "—", sub: "onchain" },
    { k: "Premium volume", v: stats ? formatUsd(stats.premiumVolume, 0) : "—", sub: "test USDC" },
    { k: "Settled payouts", v: stats ? formatUsd(stats.payouts, 0) : "—", sub: "test USDC" },
    blockTime
      ? { k: "Block time", v: `${blockTime.ms.toLocaleString("en-US")}ms`, sub: `measured · last ${blockTime.blocks} blocks` }
      : { k: "Block time", v: "~400ms", sub: "Monad network spec" },
  ];
  return (
    <section className="border-b border-line bg-bg-deep/40">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 px-4 sm:grid-cols-3 sm:px-6 md:grid-cols-5">
        {items.map((i) => (
          <div key={i.k} className="py-5">
            <div className="label">{i.k}</div>
            <div className="num mt-1 text-xl font-semibold">{i.v}</div>
            <div className="text-[11px] text-dim">{i.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({ eyebrow, title, intro, children, id }: { eyebrow: string; title: React.ReactNode; intro?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-28">
      <div className="label text-primary">{eyebrow}</div>
      <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {intro && <p className="mt-4 max-w-2xl text-muted">{intro}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Problem() {
  const cards = [
    {
      t: "Compute is a commodity without a market",
      b: "GPU-hours are now a core input for every AI company, yet pricing is opaque and negotiated in bilateral, illiquid contracts.",
    },
    {
      t: "Future costs are unpredictable",
      b: "Rental rates for H100 and B200 capacity swing with model launches and supply shocks. A startup's runway moves with them.",
    },
    {
      t: "There is no way to hedge",
      b: "Airlines hedge fuel. Manufacturers hedge metals. AI companies have no standard instrument to cap tomorrow's compute bill.",
    },
  ];
  return (
    <Section eyebrow="The problem" title="GPU compute is becoming a commodity. It needs a risk market.">
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c, i) => (
          <div key={c.t} className="panel p-6">
            <div className="num text-sm text-dim">0{i + 1}</div>
            <h3 className="mt-3 text-lg font-semibold">{c.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.b}</p>
          </div>
        ))}
      </div>
      <div className="panel mt-4 flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-semibold">GpuHedger is a programmable market for compute price risk.</p>
        <p className="text-sm text-muted">Options make the hedge standard. The chain makes it self-settling. Monad makes it fast.</p>
      </div>
    </Section>
  );
}

function ExampleHedge() {
  const rows = [
    ["Needs", "1,000 H100 GPU-hours next month"],
    ["H100 today", "$2.00 / GPU-hour"],
    ["Buys", "10 CALL contracts · strike $2.20 · 30 days"],
    ["Pays", "$35.00 premium (the most it can lose)"],
  ];
  return (
    <Section
      eyebrow="How a hedge works"
      title="An AI startup caps its H100 bill for $35."
      intro="Each contract covers 100 GPU-hours. The seller locks the maximum payout up front, so every payout is funded before you buy."
    >
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
            <div className="label">If H100 rises to $4.00</div>
            <div className="num mt-3 text-3xl font-semibold text-pos">▲ +$1,765</div>
            <p className="mt-2 text-sm text-muted">The option pays $1,800 ((4.00 − 2.20) × 1,000), covering most of the $2,000 extra compute cost.</p>
          </div>
          <div className="panel p-6">
            <div className="label">If H100 falls to $1.50</div>
            <div className="num mt-3 text-3xl font-semibold text-muted">−$35</div>
            <p className="mt-2 text-sm text-muted">The option expires unused. Compute got cheaper; the insurance cost the premium.</p>
          </div>
          <p className="text-xs text-dim sm:col-span-2">
            Illustrative numbers matching the seeded demo market. Payouts are capped at each series' collateralized maximum.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="panel p-6">
          <span className="chip border-call/35 bg-call/10 text-call">CALL</span>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <span className="font-semibold text-fg">Protects buyers of compute against rising prices.</span> If the GPU price rises above
            the strike, the call pays the difference.
          </p>
        </div>
        <div className="panel p-6">
          <span className="chip border-put/35 bg-put/10 text-put">PUT</span>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            <span className="font-semibold text-fg">Protects sellers of compute against falling prices.</span> A GPU cloud with idle capacity
            buys puts to lock in a floor on rental revenue.
          </p>
        </div>
      </div>
    </Section>
  );
}

function Users() {
  const users = [
    { t: "AI startups", b: "Companies renting significant GPU capacity month to month that need a predictable compute budget.", primary: true },
    { t: "GPU providers", b: "Clouds and data centers hedging future rental revenue with puts." },
    { t: "Compute traders", b: "Participants seeking direct exposure to GPU price movements." },
    { t: "Liquidity providers", b: "Write collateralized options through the vault and earn the premiums." },
  ];
  return (
    <Section eyebrow="Who it's for" title="Built first for AI companies whose margins depend on GPU prices.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {users.map((u) => (
          <div key={u.t} className={`panel p-5 ${u.primary ? "border-line-3 bg-panel-2" : ""}`}>
            {u.primary && <span className="chip mb-3 border-line-3 text-fg">First users</span>}
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
    { t: "Signature", s: "in your wallet" },
    { t: "Submitted", s: "0 ms" },
    { t: "Confirming", s: "~400 ms block" },
    { t: "Settled ✓", s: "~800 ms finality" },
  ];
  return (
    <Section eyebrow="Why Monad" title="A hedge should settle as fast as the market moves.">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="panel p-6">
          <ol className="grid gap-2 sm:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.t} className={`rounded-lg border p-3.5 ${i === 3 ? "border-pos/40 bg-pos/[0.07]" : "border-line-2"}`}>
                <div className={`h-1 rounded-full ${i === 3 ? "bg-pos" : "bg-secondary"}`} />
                <div className={`mt-3 text-sm font-semibold ${i === 3 ? "text-pos" : ""}`}>{s.t}</div>
                <div className="num mt-0.5 text-xs text-muted">{s.s}</div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Premium payment, oracle updates, exercise and USDC settlement each confirm in about a second on Monad. The timings above are
            Monad's published figures; every transaction in this app shows its own measured settle time and a link to the explorer.
          </p>
        </div>
        <div className="panel p-6">
          <ul className="space-y-4 text-sm">
            {[
              ["Real-time risk", "Positions mark against a live onchain oracle; exercise the moment you're in the money."],
              ["Full EVM", "Standard Solidity, OpenZeppelin and wallets. No new tooling for integrators."],
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

function Products() {
  const items = [
    { to: "/hedge", t: "Hedge calculator", b: "Enter your GPU-hours and the most you can pay. Get the hedge that caps your bill." },
    { to: "/markets", t: "Options chain", b: "Calls cap compute costs, puts floor rental revenue. Fully collateralized, cash-settled." },
    { to: "/futures", t: "Futures", b: "Lock an exact price per GPU-hour with zero premium, fully margined." },
    { to: "/vault", t: "LP vault", b: "Deposit USDC and earn the premiums AI companies pay to hedge." },
    { to: "/portfolio", t: "Transferable hedges", b: "Every position is an NFT. Move a hedge to a treasury wallet." },
    { to: "/activity", t: "Onchain activity", b: "Every trade, exercise and payout, linked to its transaction." },
  ];
  return (
    <Section eyebrow="The platform" title="Everything needed to manage compute price risk.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="panel group p-6 transition-colors hover:border-line-3">
            <h3 className="flex items-center justify-between font-semibold">
              {i.t} <span className="text-dim transition-colors group-hover:text-fg">→</span>
            </h3>
            <p className="mt-2 text-sm text-muted">{i.b}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function Roadmap() {
  return (
    <Section eyebrow="Roadmap" title="From a testnet primitive to the hedging layer for AI infrastructure.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROADMAP.map(([phase, t, b, status]) => (
          <div key={phase} className={`panel p-5 ${status ? "" : "opacity-80"}`}>
            <div className="flex items-center justify-between">
              <span className="num text-xs text-muted">{phase}</span>
              {status && <span className="chip border-secondary/40 text-secondary">{status}</span>}
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
      <div className="panel p-8 sm:p-12">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Turn GPU compute into a <span className="text-primary">hedgeable asset.</span>
        </h2>
        <p className="mt-3 text-muted">Connect a wallet, get test USDC, and buy your first compute option in under a minute.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/trade" className="btn-primary px-6 py-3.5">Trade compute →</Link>
          <Link to="/docs" className="btn-secondary px-6 py-3.5">Read the docs</Link>
        </div>
      </div>
    </section>
  );
}
