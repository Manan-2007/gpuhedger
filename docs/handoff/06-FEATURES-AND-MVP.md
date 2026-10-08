# 06: Features and MVP

Priorities: **P0** = demo-critical (the demo or judging fails without it) · **P1** = strongly improves the score · **P2** = nice to have.
"Status" refers to the *current* frontend on local Anvil (see `05-…`). Nothing has run on Monad testnet yet. [CHAT]

## P0: demo-critical

| # | Feature | User story | Acceptance criteria | Contract calls | Status |
|---|---|---|---|---|---|
| P0-1 | Wallet connect + network guard | As a user I connect MetaMask and am told if I'm on the wrong chain | Connect via injected/EIP-6963; address, MON and USDC shown; on chain ≠ 10143 a **WRONG NETWORK** banner with a working **SWITCH TO MONAD TESTNET** button (adds the chain if missing) | `usdc.balanceOf`, native balance | Built; **not tested with real MetaMask** |
| P0-2 | Test USDC faucet | I get test money without touching contracts | **GET TEST USDC** button labeled *Testnet only*; balance updates after the receipt | `usdc.faucet()` | Works |
| P0-3 | Markets list | I see all GPU option markets at a glance | Table/cards from `getAllSeriesDetails`: GPU, region, type, strike, expiry, premium, open interest; filters; expired hidden by default; simulated bid labeled | `factory.getAllSeriesDetails`, `oracle.getAllPrices` | Works |
| P0-4 | Market detail + live price | I understand one option before buying | Oracle price with "updated Xs ago"; strike, expiry date, contract size, premium, IV, collateral; payoff chart with max loss / break-even / capped profit | + `oracle.getPriceHistory` | Works |
| P0-5 | Buy option | I buy protection with clear cost and risk | Quantity input; total cost = premium × 100 × qty computed in bigint; risk disclosure acknowledged; **APPROVE USDC** only when allowance < cost; **BUY CALL/PUT**; lifecycle Signature → Submitted → Confirming → SETTLED ✓ with hash, explorer link and settle time; position appears in portfolio within ~3 s | `usdc.allowance/approve`, `option.buyOption(n, cost)` | Works |
| P0-6 | Portfolio + exercise | I see P&L move with the price and cash out | Open positions show oracle price, intrinsic value, exercise value, model value (labeled estimate), P&L coloured; **EXERCISE** enabled only when ITM; after confirmation **SETTLED ✓** with the payout, and the position moves to Exercised | `factory.getUserPositions`, `option.exercise` | Works |
| P0-7 | Admin oracle control | The demo operator moves the H100 price | Role check (`ORACLE_ROLE`); presets H100 → $2.00 / $4.00 / $1.50; custom price input; read-only notice for non-admins | `oracle.setPrice`, `hasRole` | Works |
| P0-8 | Traction page | Judges see real activity | Onchain counters (trades, wallets, premium volume, payouts, series); recent activity table with **explorer links to real tx hashes** | `getStats`, `getRecentActivity`, `getLogs(ActivityRecorded)` | Works locally; Monad `getLogs` behaviour [UNKNOWN] |
| P0-9 | Landing page | In 10 seconds a judge knows what this is, for whom, and why Monad | Headline + subline; live oracle prices; primary CTA "TRADE COMPUTE"; problem → solution → first user → Monad speed | `getAllPrices`, `getStats` | Works; copy and design can be stronger |
| P0-10 | Honesty and error states | Nothing is fake; failures are understandable | Simulated values tagged; all reverts mapped to friendly messages; rejected signature handled; oracle-unavailable state (**fix the fallback bug**); contracts-not-configured state | n/a | Mostly works; fallback bug open |
| P0-11 | Hosted on the public internet, pointed at Monad testnet | Judges can use it | Public URL, `VITE_CHAIN_ID=10143`, addresses from the committed `10143.json` | n/a | **Not done** (blocked on testnet deploy) |

## P1: strong score boosters

| # | Feature | User story | Acceptance criteria | Calls | Status |
|---|---|---|---|---|---|
| P1-1 | Hedge calculator | As an AI startup I enter my GPU-hours and budget and get a recommended hedge | Inputs: role (buy/sell compute), GPU, GPU-hours, max price, stress price. Output: recommended series or future, contracts, cost, locked price, protected-until, stress savings, chart; "Buy this hedge" deep-links `/trade?series=&qty=` | reads only | Works (visual) |
| P1-2 | Claim after expiry | My ITM option still pays after expiry | Position shows **CLAIMABLE** + claim value; **CLAIM** pays at the settlement price | `option.claim`, `expiryPayoutPerContract` | Built, **untested in UI** |
| P1-3 | Futures | I lock a GPU-hour price | Market cards (forward, spot, basis, band); LONG/SHORT toggle; margin = max loss; approve → open; positions with live P&L; **SETTLE** after expiry | futures reads/writes | Open works; settle untested |
| P1-4 | LP vault | I deposit USDC and earn premiums | NAV, share price, idle vs deployed, premiums earned; deposit/withdraw with the max-withdrawable limit explained | vault | Deposit works; withdraw untested |
| P1-5 | Transfer position NFT | I move a hedge to my treasury wallet | Valid-address check; transfer; the position leaves my portfolio | NFT `safeTransferFrom` | Works |
| P1-6 | Admin create series | The operator lists a new market live in the demo | Form with model-price suggestion and collateral preview; approve → create; appears in markets | `createOptionSeries` / `vault.writeSeries` | Built, untested |
| P1-7 | Mobile polish | Judges on phones can trade | 390 px: no horizontal scroll, sticky buy CTA, tables become cards | n/a | Works (visual) |
| P1-8 | Pause banner | Users know when trading is halted | Banner when `factory.paused()` | `paused()` | Admin shows it; no global banner |

## P2: nice to have

Vault harvest button · Admin futures market creation · Admin volatility update · Docs page and payoff playground · Real oracle-history chart as the default · Showing that the keeper is live (last update source) · Route code-splitting · WalletConnect · NFT image preview from `tokenURI` · Futures/vault in portfolio totals · Activity pagination via `getActivityRange` · ESLint and unit tests for `optionsPricing` and the hedge maths.

## MVP definition (minimum to win the demo)

**P0-1 → P0-11, on Monad testnet, with a real MetaMask**, plus **P1-1 (hedge calculator)** because it carries the Founder/Market story. Everything else is upside.

## Recommended 5-day build order (Oct 9 → Oct 13; submission deadline Oct 14 09:29 IST)

| Day | Focus | Done when |
|---|---|---|
| **1, Oct 9** | Run locally (`11-…`). Read `04` and `07`. Set up the design system (tokens, typography, buttons, panels, `TransactionStatus`). Fix the fallback-price bug. Add route lazy-loading. | App runs on Anvil; design tokens set; oracle-unavailable state exists |
| **2, Oct 10** | P0-3 → P0-6 redesign: Markets, Market detail, Trade panel, Portfolio + exercise. **Lead deploys contracts to testnet and commits `10143.json`** [PLANNED] | Full buy → exercise loop on Anvil with the new UI |
| **3, Oct 11** | Switch to **Monad testnet + real MetaMask**. Fix whatever breaks (switch chain, gas, RPC, getLogs). P0-7, P0-8. Host it (P0-11). | Demo loop works on testnet from the public URL |
| **4, Oct 12** | P0-9 landing + P1-1 hedge calculator polish; mobile pass; error and empty states; P1-2 claim (test with a short-expiry series created via Admin). | Every P0 acceptance criterion met |
| **5, Oct 13** | Freeze. Recruit testers for real traction (P0-8). Rehearse and record the 3-min demo and 2-min pitch (`10-…`). P1 extras only if time remains. | Videos recorded; deliverables checklist complete |

Buffer: Oct 14 00:00–09:29 IST for the submission form only. Don't plan work there.
