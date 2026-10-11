# GpuHedger redesign plan (Monad / Metropolis visual language, our palette)

Branch `redesign`, cut from `main` at `1b108dc` ("Deploy to Monad testnet"). Rollback tag: **`p0-working` → `1b108dc`**.
Baseline on 2026-10-11 11:10 IST: typecheck clean, 30/30 unit tests, production build OK.

Visual change only. No changes to contracts, ABIs, hooks (behaviour or signatures), wagmi/viem config, routes, pricing
maths or the P0 flow (connect → test USDC → market → ticket → buy → portfolio → exercise → settled).

## 0. Time budget

| | |
|---|---|
| Now | Sun 2026-10-11 11:10 IST |
| UI freeze | end of Mon 2026-10-12 IST (≈ 37 h) |
| Deadline | Wed 2026-10-14 09:29 IST; videos recorded Tue 2026-10-13 |

More than 24 h remain, so all four phases are planned. **Cut line:** if Phase 3 isn't done by Mon 18:00 IST, Phase 4
shrinks to responsive + a11y checks on what exists, and anything unfinished is reverted, not shipped half-done.

## 1. Inputs and what's missing

- **Screenshots:** 1 was attached (the Metropolis hackathon **dashboard**). Missing: **monad.xyz pages** (hero, section
  rhythm, footer) and the **Metropolis landing page** (skyline CTA, timeline, FAQ, logotype footer). For those I'm working
  from the written "observed language" in your brief. Send 2–3 more screenshots if you want them matched more closely.
- `docs/CONTEXT.md` doesn't exist in the repo. I'm using the design rules from our earlier session (saved in memory) and
  `docs/handoff/`.

## 2. My reading of the design language (correct me here)

From the dashboard screenshot:

- **Canvas** near-black, cards one tone lighter, 1px hairline borders (~10% white), radius ≈ 4px on cards and ≈ 2px on
  buttons/chips. No shadows. Depth = border + tone step.
- **Shell**: fixed left sidebar (≈ 190–200px wide in the screenshot, narrower than the 280–320 in the brief) with a
  wide display logotype, mono uppercase group labels (BUILD / CONNECT / SUPPORT), line icons + sans labels, hairline
  dividers between groups, and a pinned CTA card at the bottom ("Submit your project" + solid accent CONTINUE). Top bar:
  page title (sans) left; mono status/time ("OCT 14 · 09:29 GMT+5:30"), icon buttons and avatar right; hairline bottom.
- **Type**: sans for titles and body (Inter-like, semibold, slightly tight); **mono uppercase, wide-tracked, small and
  dim** for every label, counter, date and button ("NEXT STEPS", "3 / 5 complete", "EDIT PROFILE", "CHOOSE TRACKS →").
- **Hero card**: outlined mono chip ("SUBMIT"), ~32px headline, muted subtitle; isometric block art bleeding off the
  right edge and fading into the card on the left; dithered/pixel texture on some faces; floating cubes at depths.
- **Lists**: rows separated by hairlines; check-circle states (filled accent = done + strikethrough, ring = todo, faint
  ring = locked); right-aligned mono action links; the current row gets the solid accent button with a trailing arrow.
- **Timeline**: vertical hairline, dots; current dot in accent with a mono "NOW" tag; mono dates in dim text.
- **Info cards**: line icon + mono label + one-line body.

## 3. Typography (verified where stated)

I fetched monad.xyz's HTML/CSS (2026-10-11): display **Britti Sans** (commercial, can't license it), body **Inter**, mono
the **system stack** (`ui-monospace, SF Mono, …`). The Metropolis domain didn't resolve from here, so its fonts are
unverified; the dashboard screenshot looks like Inter + a plain grotesque mono.

| Role | Choice | Why |
|---|---|---|
| Display / headings | **Inter Tight** 600–700 | Free; same DNA as Monad's Inter body; tight tracking suits 48–96px headlines. Closest free stand-in for a Britti-style grotesk without pretending to match it. |
| Body | **Inter** 400–600 | What monad.xyz actually uses; already loaded. |
| Mono (labels, buttons, numbers in labels, hashes) | **Geist Mono** 400–500 | Free, clean, close to SF Mono's look on every OS (the system stack renders differently on Windows). Replaces JetBrains Mono so we load one mono, not two. |

All via Google Fonts with `display=swap` and real fallbacks. Manrope and JetBrains Mono are dropped. `tabular-nums` stays on
every numeric column.

## 4. Tokens (additions and changes, in `index.css`)

Kept as-is: every colour role (lime action, teal profit, red loss, blue info/CALL, purple PUT, amber warning/simulated).

| Token | Value | Note |
|---|---|---|
| `--color-line` | `rgba(255,255,255,0.10)` | hairline (was 0.08) |
| `--color-line-2` / `-3` | 0.16 / 0.22 | hover / emphasis hairlines |
| `--color-card` | `#071a1f` (= bg-deep) | default flat card fill |
| `--color-card-2` | `#0c2228` | raised card / table header (new step between bg-deep and surface-solid) |
| `--color-grid` | `rgba(255,255,255,0.04)` | background grid (see question Q1) |
| `--radius-card` / `--radius-control` | 4px / 2px | replaces rounded-xl / rounded-lg |
| `--font-display` / `--font-sans` / `--font-mono` | Inter Tight / Inter / Geist Mono | |
| `--text-display-*` | 48 / 64 / 96px, lh 1.05, ls −0.03em | landing only |
| `--label-*` | 11–12px mono, uppercase, +0.10em | the "eyebrow" style |
| iso shades | `color-mix(in oklab, <token> 75%, white)` top, `<token>` left, `color-mix(<token> 65%, black)` right | for art only |

`panel` changes from frosted glass to a flat hairline card; glass stays only for the sticky top bar, popovers and hero
accents. Everything stays tokenised; a final grep confirms no hex in components.

## 5. Primitives, then components

New `components/primitives/`: `Card`, `Button` (primary lime / outline / ghost, mono uppercase, trailing arrow),
`MonoLabel`, `Chip` (outlined mono), `Stat` (big numeral + mono label), `Divider`, `SectionHeader` (eyebrow, title,
one-liner), `EmptyState` (with iso art), `Checklist`, `Timeline`. Existing `ui.tsx` exports keep their names and props and
are re-implemented on top, so call sites don't change.

| Existing | Restyle |
|---|---|
| Navbar | Becomes `AppShell`: sidebar (TRADE: Markets, Trade, Hedge · POSITIONS: Portfolio, Activity · PROTOCOL: Vault, Futures, Admin · SUPPORT: Docs) + top bar (title, mono chain-time, `MONAD TESTNET` chip, wallet). Drawer under 1024px. Landing keeps a marketing top nav. Pinned sidebar card = live H100 oracle price + "Trade compute →". |
| WalletButton | outline button, mono address, popover unchanged |
| StatCard | `Stat` (big numeral, mono label) |
| MarketTable / OptionsChain / PositionTable | flat card, mono uppercase column labels, hairline rows, card-2 header |
| TradePanel | flat card; risk cells stay prominent; mono labels; lime solid CTA with arrow |
| PayoffChart / PriceChart | flat card, mono axis ticks; colours unchanged (they carry meaning) |
| TransactionStatus | stepper with mono labels + dot/line progress; settle time as a big numeral |
| RiskDisclosure | amber hairline box, mono "RISK DISCLOSURE" label |
| OptionSelector, MarketCard, PositionCard, SeriesHeader | same structure, new primitives |

## 6. Isometric art system (original, inline SVG)

`components/art/`: `IsoBlock` (x, y, z grid position; w/d/h; colour token; optional dither), `IsoCluster` (composes
blocks with painter's ordering), `PixelDither` (SVG pattern of 2px cells), `PayoffStroke` (hockey-stick polyline in
iso space). No rasters, no WebGL, `aria-hidden`, lazy, < 60 KB, optional slow float that `prefers-reduced-motion`
disables. Decorative colours (lime/teal/blue/purple/amber) only on landing, hero, empty states and brand pages; never in
data components.

- Hero: data-centre skyline of GPU racks (tall slabs with dithered "LED" faces), a few floating cubes, lime highlight
  blocks, and the payoff hockey-stick running through it.
- Skyline strip above the final CTA; small single-cluster art for empty/loading/error states.
- Nothing traced or copied from Monad/Metropolis assets.

## 7. Landing structure

Hero (art) → "why compute needs hedging" statement → stats (real onchain numbers + measured block time, labelled) →
numbered cards 01 Pick a market · 02 Buy protection · 03 Exercise · 04 Settle → roadmap timeline → FAQ → CTA with
skyline → big logotype footer.

## 8. Logo (Phase 2 deliverable: you pick one)

`docs/brand/preview.html`: directions A "Payoff cube", B "G-stack", C "Bracket-H" on dark and light at 16/32/64/256px,
single-colour versions too. After your pick: mark SVG, horizontal lockup, white / dark / lime-on-teal, `favicon.svg`,
PNG 32/180/512, 1024² submission PNG, 1200×630 OG image, into `frontend/public/brand` + `docs/brand`; update title,
meta, favicon, shell and footer. (The current chip-and-curve mark is retired: your brief rules out chip marks.)

## 9. Phases

| Phase | Scope | Target (IST) | Stop? |
|---|---|---|---|
| 0 | date, tag, branch, baseline, this plan | Sun 11:30 | **STOP for "go"** |
| 1 | tokens, fonts, global CSS, primitives, app shell + sidebar | Sun 17:00 | summary |
| 2 | landing, iso art, 3 logo directions | Sun 23:00 | **STOP for logo + look** |
| 3 | Markets, Trade, Portfolio, Hedge, TransactionStatus, charts | Mon 15:00 | summary |
| 4 | Futures, Vault, Activity, Admin, Docs, states, responsive 375/768/1440, a11y (≥ 4.5:1, focus, keyboard), perf, brand assets + meta, hex grep | Mon 23:00 | final report |

After every phase: `tsc`, `vitest`, `vite build`, P0 click-through on local Anvil **and** a read-only check against the
live Monad testnet deployment, zero console errors, then commit. Each phase is a commit on `redesign`, deployable alone.

## 10. Questions for you

- **Q1. Background grid.** On day 3 you asked me to remove the background squares; this brief asks for a ~4% grid.
  Proposal: no grid on app pages; on the landing only, a 4% grid masked to fade out behind the hero. OK?
- **Q2. Sidebar width.** The screenshot's sidebar is ≈ 200px; the brief says 280–320. I'd go 240px (fits the group
  labels and the pinned oracle card without crowding the options chain). OK?
- **Q3. Pinned sidebar card.** Proposal: live H100 oracle price + measured settle/block time + "TRADE COMPUTE →". Or
  would you rather mirror Metropolis with a checklist (connect wallet → get test USDC → first trade)?
