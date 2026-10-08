# 09: UX and design guidance

## Intent and tone

- **"Professional financial terminal × AI infrastructure × modern Web3."** Dark, precise, calm. No neon gradients, no meme-crypto styling. [CHAT: original product brief]
- It must look **trustworthy enough to hold money**: every number explained, every risk stated before the click, nothing faked.
- The voice is plain and confident: "Hedge the future of compute." "Onchain options for GPU compute." Avoid hype words ("revolutionary", "unlimited").
- One consistent message: **GpuHedger turns GPU compute from an unpredictable infrastructure expense into a hedgeable financial asset.** [CHAT]

## What a judge should feel in the first 10 seconds

1. *"This is for AI companies hedging GPU costs."* (headline + subline)
2. *"It's live and real."* (prices ticking from an onchain oracle, "updated 3s ago", a real trade count)
3. *"It's serious."* (terminal-grade typography, monospace numbers, clear risk language)
4. *"It's fast because it's on Monad."* (a visible measured settlement time)

## Existing design tokens [CODE: frontend/src/index.css `@theme`]

| Token | Hex | Use | Contrast on `bg` / `panel` |
|---|---|---|---|
| `bg` | `#08090b` | page background | |
| `panel` / `panel-2` | `#111318` / `#171a21` | cards / inputs / hovers | |
| `line` / `line-2` | `#23262f` / `#2e323d` | borders | |
| `fg` | `#eef0f3` | primary text | 17.5 / 16.3 |
| `muted` | `#9097a3` | secondary text | 6.8 / 6.3 |
| `dim` | `#5f6673` | tertiary text, footnotes | **3.45 / 3.22, fails WCAG AA for small text** |
| `primary` | `#e6ff4a` (lime) | primary CTA, accents, "expiry P&L" line | 17.8 |
| `primary-ink` | `#0b0c0e` | text on lime buttons | 17.5 on lime |
| `secondary` | `#5ee7ff` (cyan) | links, onchain chips, "model today" line | 13.6 |
| `pos` | `#32d583` | profit, CALL, settled | 10.4 |
| `neg` | `#ff5c7a` | loss, PUT, errors, max loss | 6.7 |
| `warn` | `#ffb547` | simulated tags, risk panel | 11.3 |

The primary, secondary, pos and neg colors were specified in the original brief. [CHAT]

- **Fonts:** Geist (UI) + JetBrains Mono (all numbers, addresses, hashes; tabular figures). [CODE: index.html]
- **Utilities:** `panel`, `label` (11 px uppercase tracking), `num`, `btn` / `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-pos` / `btn-neg`, `input`, `chip`, `seg`. Tailwind 4 needs `@utility` (not `@layer components`) for classes that are `@apply`-ed. [CODE: index.css] [CHAT]

## Trust and risk-disclosure requirements (Design & Craft is 20%)

1. **Before any purchase**, visible together: total cost, **maximum loss** (red), break-even, potential profit **with "up to" and the cap**, collateral backing, model price labeled "for demonstration purposes", and the risk disclosure with a required checkbox. Exact copy is in `07-USER-FLOWS.md`.
2. **Simulated data is always tagged** (amber "Simulated" chip). Onchain data gets the cyan "Onchain" / "Live oracle" chip.
3. **Never claim unlimited profit.** Payouts are capped.
4. Show **who holds the risk**: "Fully collateralized: the writer locked $220 per contract up front…" [CODE: MarketDetailPage.tsx]
5. Errors in human language (`lib/errors.ts`); never only a raw revert string.
6. A persistent **DEMO MODE** badge with a tooltip explaining what's real. [CODE: Navbar.tsx]
7. Show each transaction hash with an explorer link. Show contract addresses in the footer and docs.

## Moments that showcase Monad's speed

| Moment | Where | Status |
|---|---|---|
| "SETTLED ✓ **in 0.84s**" after every transaction | `TransactionStatus` | Built [CODE] |
| Phase stepper Signature → Submitted → Confirming → Settled moving visibly | `TransactionStatus` | Built |
| Oracle spike → portfolio P&L flips green **within ~2 s** without a refresh | Portfolio (2–3 s polling) | Built |
| "Updated 3s ago" on oracle prices; pulsing live dot | Market detail, Admin | Built |
| Block number in the tx receipt | `TransactionStatus` | Built |
| Idea: a "last 10 settlements" strip with median settle time | Activity | [PLANNED] |
| Idea: a side-by-side "Monad ~0.8 s vs typical L1 ~12 s" | Landing | [PLANNED]. Only quote numbers we can source |

## Charts

- Payoff chart: solid lime = P&L at expiry; dashed cyan = model value today; reference lines for strike, break-even and oracle price; profit area green, loss area red, split at $0; scenario slider. [CODE: PayoffChart.tsx]
- A palette check (from the dataviz validator) flagged lime/cyan as too bright for the "lightness band" on dark backgrounds, while passing colour-blind separation and contrast. We kept the brand colours and added secondary encoding (dashing + legend). [CHAT]
- One y-axis per chart; tooltips with crosshair; legend when ≥ 2 series.

## Accessibility

- Raise `dim` text to ≥ 4.5:1 (e.g. `#7c8492` or similar; verify) for footnotes and labels under 18 px. Today it's 3.45:1.
- CALL/PUT and profit/loss rely on green/red. Always pair colour with text (the UI already shows "CALL"/"PUT" and signed numbers).
- Focus ring: 2 px cyan `:focus-visible` exists. [CODE: index.css]
- `prefers-reduced-motion` disables the ticker and pulse animations. [CODE]
- Buttons have text labels; keep `aria-live="polite"` on the transaction status. [CODE: TransactionStatus.tsx]

## Mobile requirements

- 390 px wide: no horizontal page scroll (verified for all pages). [CHAT]
- Tables become cards (Markets, Portfolio). A sticky bottom **BUY CALL · $35.00** CTA on Trade and Market detail scrolls to the panel. [CODE]
- Wallet button always visible in the header; navigation in the hamburger below the `xl` breakpoint.
- **Gap:** no WalletConnect, so mobile users need a wallet's in-app browser. [CODE: lib/wagmi.ts]

## What the current UI does badly (fix if time permits)

1. **Navigation crowding:** 9 top-level links. Group into Trade (Markets, Trade, Hedge, Futures), Earn (Vault), Portfolio, and a "More" menu (Activity, Admin, Docs).
2. **Landing page is long** (10 sections) and reads like a doc. Tighten it to: hero → live prices → problem/solution → first user → Monad speed → CTA.
3. **Admin page is dense** (one 600-line page). Fine for the operator, but it appears in the demo video, so make the oracle presets prominent.
4. **Fallback prices labeled as oracle** when the oracle is unreachable (bug, see `05-…`).
5. **Low-contrast footnotes** (`dim`).
6. **Two wallet popups per buy** (approve + buy). Explain it ("Step 1 of 2: approve USDC") or decide on a larger approval (Q7 in `12-…`).
7. The "Market" price-history tab (simulated) is the default; the real "Oracle updates" tab is hidden behind a toggle.
8. Model value vs exercise value vs P&L can confuse non-experts. Add a one-line explainer tooltip per metric.
