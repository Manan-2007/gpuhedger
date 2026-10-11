import { Link } from "react-router-dom";
import { useAllGpuPrices } from "../hooks/useOracle";
import { useProtocolStats } from "../hooks/useProtocol";
import { useBlockTime } from "../hooks/useBlockTime";
import { GPU_META, marketData } from "../data/marketData";
import { ROADMAP } from "../data/roadmap";
import { formatNumber, formatPct, formatPrice, formatUsd } from "../utils/formatters";
import { Ago, SimulatedTag } from "../components/ui";
import { ButtonLink, Chip, MonoLabel } from "../components/primitives";
import { HeroSkyline, SkylineStrip } from "../components/art/scenes";
import { activeChain } from "../lib/chain";

export function LandingPage() {
  return (
    <>
      <Hero />
      <LiveStrip />
      <Why />
      <HowItWorks />
      <WorkedExample />
      <Roadmap />
      <Faq />
      <ClosingCta />
      <Logotype />
    </>
  );
}

const TRUST = ["Fully collateralized", "Max loss = premium paid", "Cash-settled in USDC", "Every trade onchain"];

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden className="shrink-0 text-pos">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Section({ id, eyebrow, title, intro, children, className = "" }: { id?: string; eyebrow: string; title: React.ReactNode; intro?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-[1360px] px-4 py-24 sm:px-8 sm:py-32 ${className}`}>
      <MonoLabel as="div" className="text-primary">{eyebrow}</MonoLabel>
      <h2 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">{title}</h2>
      {intro && <p className="mt-4 max-w-2xl text-muted sm:text-lg">{intro}</p>}
      <div className="mt-12">{children}</div>
    </section>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_80%_at_30%_20%,black_20%,transparent_75%)]" aria-hidden />
      {/* Art bleeds off the right edge and fades into the canvas on the left. */}
      <div
        className="pointer-events-none absolute inset-y-0 right-[-12%] hidden w-[70%] items-end lg:flex [mask-image:linear-gradient(to_right,transparent,black_28%)]"
        aria-hidden
      >
        <HeroSkyline className="h-[96%] w-full" />
      </div>
      <div className="relative mx-auto max-w-[1360px] px-4 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
        <div className="max-w-2xl">
          <Chip>Onchain options on GPU compute · {activeChain.name}</Chip>
          <h1 className="mt-7 font-heading text-[3.1rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-7xl lg:text-[5.5rem]">
            Hedge the future of <span className="text-primary">compute.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted sm:text-xl">
            GpuHedger lets AI companies cap what they'll pay for GPU-hours next month. Buy a call on H100, A100 or B200 compute: if
            rental prices spike, the option pays the difference in USDC.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/trade" arrow className="px-6 py-3.5">
              Trade compute
            </ButtonLink>
            <ButtonLink to="/hedge" variant="outline" className="px-6 py-3.5">
              Size my hedge
            </ButtonLink>
          </div>
          <ul className="mt-8 grid max-w-lg grid-cols-2 gap-x-6 gap-y-2.5 font-mono text-[12px] uppercase tracking-[0.06em] text-muted">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-12 lg:hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" aria-hidden>
          <HeroSkyline className="w-full" />
        </div>
      </div>
    </section>
  );
}

/** Live oracle prices + onchain traction, in one hairline strip. Every number is onchain or labelled. */
function LiveStrip() {
  const prices = useAllGpuPrices();
  const { stats } = useProtocolStats();
  const { blockTime } = useBlockTime();
  const cells: { k: string; v: string; sub: React.ReactNode }[] = [
    { k: "Trades", v: stats ? formatNumber(stats.trades) : "—", sub: "onchain" },
    { k: "Premium volume", v: stats ? formatUsd(stats.premiumVolume, 0) : "—", sub: "test USDC" },
    { k: "Settled payouts", v: stats ? formatUsd(stats.payouts, 0) : "—", sub: "test USDC" },
    blockTime
      ? { k: "Block time", v: `${blockTime.ms.toLocaleString("en-US")}ms`, sub: `measured · last ${blockTime.blocks} blocks` }
      : { k: "Block time", v: "~400ms", sub: "Monad network spec" },
  ];
  return (
    <section className="border-b border-line bg-card">
      <div className="mx-auto grid max-w-[1360px] grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line lg:border-b-0 lg:border-r">
          {prices.map((p) => {
            const st = marketData.getStats(p.gpu);
            return (
              <Link key={p.gpu} to={`/markets?gpu=${p.gpu}`} className="group px-4 py-6 transition-colors hover:bg-panel sm:px-8">
                <div className="flex items-center justify-between">
                  <MonoLabel>{p.gpu} · oracle</MonoLabel>
                  <span className="hidden text-dim transition-colors group-hover:text-fg sm:inline" aria-hidden>→</span>
                </div>
                <div className="num mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-4xl">
                  {p.price !== undefined ? formatPrice(p.price) : "—"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-dim">
                  {p.updatedAt ? <>updated <Ago timestamp={p.updatedAt} /></> : GPU_META[p.gpu].name}
                  <span className={`ml-2 hidden sm:inline ${st.change24h >= 0 ? "text-pos" : "text-neg"}`}>{formatPct(st.change24h)} 24h*</span>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 lg:grid-cols-2">
          {cells.map((c) => (
            <div key={c.k} className="px-4 py-5 sm:px-6">
              <MonoLabel>{c.k}</MonoLabel>
              <div className="num mt-1.5 font-heading text-xl font-semibold tracking-tight">{c.v}</div>
              <div className="font-mono text-[11px] text-dim">{c.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-[1360px] items-center gap-2 border-t border-line px-4 py-2.5 font-mono text-[11px] text-dim sm:px-8">
        <SimulatedTag className="py-0 text-[9.5px]" /> *24h change is simulated. Prices and every other number are read live from the {activeChain.name} contracts.
      </div>
    </section>
  );
}

function Why() {
  const points = [
    ["Compute is a commodity without a market", "GPU-hours are now a core input for every AI company, yet pricing is opaque and negotiated in bilateral, illiquid contracts."],
    ["Future costs are unpredictable", "Rental rates for H100 and B200 capacity swing with model launches and supply shocks. A startup's runway moves with them."],
    ["There is no way to hedge", "Airlines hedge fuel. Manufacturers hedge metals. AI companies have no standard instrument to cap tomorrow's compute bill."],
  ];
  return (
    <section className="mx-auto max-w-[1360px] px-4 py-24 sm:px-8 sm:py-32">
      <MonoLabel as="div" className="text-primary">Why</MonoLabel>
      <p className="mt-5 max-w-5xl font-heading text-3xl font-medium leading-[1.15] tracking-[-0.025em] sm:text-5xl">
        GPU compute is the commodity of AI. It's bought on opaque contracts, its price swings with every model launch, and{" "}
        <span className="text-muted">nobody can hedge it.</span> <span className="text-primary">GpuHedger is that missing market.</span>
      </p>
      <div className="mt-14 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line md:grid-cols-3">
        {points.map(([t, b], i) => (
          <div key={t} className="bg-bg p-6 sm:p-8">
            <div className="num font-mono text-[12px] text-dim">0{i + 1}</div>
            <h3 className="mt-4 font-heading text-lg font-semibold">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Pick a market", b: "H100, A100 or B200. Calls and puts at fixed strikes and expiries, each covering 100 GPU-hours per contract.", foot: "Options chain", to: "/markets" },
    { n: "02", t: "Buy protection", b: "Pay the premium up front. That's the most you can lose. The seller has already locked the maximum payout.", foot: "Max loss = premium", to: "/trade" },
    { n: "03", t: "Exercise", b: "If the GPU price moves through your strike, exercise any time before expiry at the live oracle price.", foot: "Pays at the oracle price", to: "/portfolio" },
    { n: "04", t: "Settle", b: "USDC lands in your wallet in about a second on Monad. Missed expiry? Claim at the price recorded at expiry.", foot: "Settles in ~1s", to: "/activity" },
  ];
  return (
    <Section id="how" eyebrow="How it works" title="From a volatile bill to a capped one, in four transactions.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Link key={s.n} to={s.to} className="panel group flex flex-col p-6 transition-colors hover:border-line-3">
            <div className="num font-heading text-5xl font-semibold tracking-tight text-line-3 transition-colors group-hover:text-primary">{s.n}</div>
            <h3 className="mt-6 font-heading text-lg font-semibold">{s.t}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{s.b}</p>
            <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
              <MonoLabel className="text-dim">{s.foot}</MonoLabel>
              <span className="text-dim transition-colors group-hover:text-fg" aria-hidden>→</span>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function WorkedExample() {
  const rows = [
    ["Needs", "1,000 H100 GPU-hours next month"],
    ["H100 today", "$2.00 / GPU-hour"],
    ["Buys", "10 CALL contracts · strike $2.20 · 30 days"],
    ["Pays", "$35.00 premium (the most it can lose)"],
  ];
  return (
    <Section
      eyebrow="Worked example"
      title="An AI startup caps its H100 bill for $35."
      intro="Each contract covers 100 GPU-hours. Payouts are capped at the series' collateralized maximum, so every one is funded before you buy."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="panel">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 border-b border-line px-6 py-4 last:border-0">
              <MonoLabel>{k}</MonoLabel>
              <span className="num text-right text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel p-6">
            <MonoLabel>If H100 rises to $4.00</MonoLabel>
            <div className="num mt-4 font-heading text-4xl font-semibold tracking-tight text-pos">▲ +$1,765</div>
            <p className="mt-2 text-sm text-muted">The option pays $1,800 ((4.00 − 2.20) × 1,000), covering most of the $2,000 extra compute cost.</p>
          </div>
          <div className="panel p-6">
            <MonoLabel>If H100 falls to $1.50</MonoLabel>
            <div className="num mt-4 font-heading text-4xl font-semibold tracking-tight text-muted">−$35</div>
            <p className="mt-2 text-sm text-muted">The option expires unused. Compute got cheaper; the insurance cost the premium.</p>
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <Chip tone="blue">CALL · protects buyers of compute</Chip>
            <Chip tone="purple">PUT · protects sellers</Chip>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Roadmap() {
  return (
    <Section eyebrow="Roadmap" title="From a testnet primitive to the hedging layer for AI infrastructure.">
      <div className="grid gap-x-16 md:grid-cols-2">
        {[ROADMAP.slice(0, 4), ROADMAP.slice(4)].map((col, c) => (
          <ol key={c} className="relative">
            {col.map(([phase, t, b, status], i) => {
              const now = c === 0 && i === 0;
              return (
                <li key={phase} className="relative pb-9 pl-8 last:pb-0">
                  {!(i === col.length - 1 && c === 1) && <span className="absolute left-[5px] top-3 h-full w-px bg-line-2" aria-hidden />}
                  <span className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 ${now ? "border-primary bg-primary" : status ? "border-line-3 bg-bg" : "border-line-2 bg-bg"}`} aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading font-semibold">{t}</span>
                    {now && <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-primary">Now</span>}
                    {status && !now && <Chip>{status}</Chip>}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-dim">{phase}</div>
                  <p className="mt-1.5 text-sm text-muted">{b}</p>
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </Section>
  );
}

const FAQ: [string, React.ReactNode][] = [
  ["What is GpuHedger?", "An onchain market for hedging GPU compute prices. Calls cap what a compute buyer pays; puts put a floor under what a provider earns; futures lock an exact price. Everything is cash-settled in USDC by smart contracts on Monad."],
  ["Who is it for first?", "AI startups that rent significant GPU capacity month to month and need a predictable compute budget. GPU providers hedge revenue with puts, and liquidity providers can earn the premiums through the vault."],
  ["Where does the GPU price come from?", "From the ComputeOracle contract. In this MVP it is permissioned: an admin, or a keeper script fed by GPU rental marketplace medians, publishes the price. A decentralized price index is the next step on the roadmap."],
  ["What can I lose?", "Buying an option, at most the premium you paid. Payouts are capped per series, and the seller locks that maximum before you buy, so every payout is funded. Futures can lose up to the margin you post."],
  ["Why Monad?", "Sub-second blocks make hedging feel like a trading venue: buy, oracle update, exercise and settlement each confirm in about a second, and low fees make 100 GPU-hour contracts worth trading."],
  ["Is this live with real money?", "No. It runs on Monad testnet with test USDC that has no value, and the contracts are unaudited hackathon code. Trades, settlement and oracle updates are real testnet transactions; figures labelled SIMULATED are not."],
  ["What are the known limitations?", "Premiums are fixed when a series is written, so after a big price move an option can be worth more than its price (the app flags this as a stale premium). There's one writer per series and no order book yet."],
];

function Faq() {
  return (
    <Section eyebrow="FAQ" title="Questions a CFO would ask.">
      <div className="border-t border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group border-b border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-heading text-lg font-medium [&::-webkit-details-marker]:hidden">
              {q}
              <span className="font-mono text-xl text-dim transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="max-w-3xl pb-6 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-[1360px] px-4 pb-24 sm:px-8 sm:pb-32">
      <div className="panel relative overflow-hidden">
        <div className="pt-8 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]" aria-hidden>
          <SkylineStrip className="h-32 w-full sm:h-44" />
        </div>
        <div className="relative border-t border-line p-8 sm:p-12">
          <MonoLabel as="div" className="text-primary">Start hedging</MonoLabel>
          <h2 className="mt-4 max-w-2xl font-heading text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Turn GPU compute into a <span className="text-primary">hedgeable asset.</span>
          </h2>
          <p className="mt-4 text-muted">Connect a wallet, get test USDC, and buy your first compute option in under a minute.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/trade" arrow className="px-6 py-3.5">Trade compute</ButtonLink>
            <ButtonLink to="/docs" variant="outline" className="px-6 py-3.5">Read the docs</ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Oversized wordmark above the footer. */
function Logotype() {
  return (
    <div className="overflow-hidden border-t border-line" aria-hidden>
      <div className="mx-auto max-w-[1360px] px-4 sm:px-8">
        <div className="select-none whitespace-nowrap py-6 text-center font-heading text-[15vw] font-semibold leading-[0.85] tracking-[-0.05em] text-transparent [-webkit-text-stroke:1px_var(--color-line-3)] xl:text-[13rem]">
          GpuHedger
        </div>
      </div>
    </div>
  );
}
