# 01: Product overview

## Problem

- GPU compute (renting an NVIDIA H100/A100/B200 by the hour) is the core input cost for AI companies. [CHAT]
- Its price is set in opaque, bilateral rental contracts, and it moves with model launches and supply shocks. [CHAT]
- Fuel, metals and electricity all have hedging markets; GPU compute has none that an AI startup can use. [CHAT, a claim to defend in the pitch; we have not researched competitors. See Q3 in `12-OPEN-ISSUES-AND-DECISIONS.md`.]

Real data point we observed: on 2026-10-08 the Vast.ai public marketplace showed live on-demand H100 SXM offers with a median of about **$3.02/GPU-hour**, a 25th percentile of about $1.48, and a max of about $9.03. The spread is the point: prices are fragmented and volatile. [CHAT, from `scripts/oracle-keeper.mjs` runs and manual API calls]

## Target user

- **Primary (beachhead): AI startups renting significant GPU capacity month to month**, e.g. a team spending tens of thousands of dollars per month on H100 rentals that needs a predictable budget for next month's training run. [CHAT]
- Secondary: GPU providers (hedge revenue with puts and shorts), market makers / LPs (earn premiums), compute traders, DeFi protocols. [CHAT]
- **A specific *named* first user: [UNKNOWN].** No real company or person has been identified or interviewed. Founder/Market Readiness is 25% of the score, so a human must supply a named design partner (or an honest "we spoke to X teams"). Don't invent one.

## Solution

Standardized, fully collateralized **options** and **futures** on GPU-hours, cash-settled in a test stablecoin on Monad:

| Product | What it does for the user | Evidence |
|---|---|---|
| Options (calls/puts) | Cap a future compute bill (call) or floor revenue (put). Max loss = premium. | [CODE: contracts/src/ComputeOption.sol] |
| Expiry settlement + claim | Holders who forget to exercise still get paid at the price in effect at expiry. | [CODE: ComputeOption.sol `_settle`, `claim`] |
| Futures | Lock an exact price per GPU-hour, no premium, both sides fully margined. | [CODE: ComputeFutures.sol] |
| Hedge calculator | "I need 5,000 H100 hours; what protects me?" Recommends the cheapest hedge. | [CODE: frontend/src/pages/HedgePage.tsx] |
| LP vault (ERC-4626) | Pools USDC to sell options and earn premiums. | [CODE: ComputeVault.sol] |
| Position NFTs | Hedges are transferable (e.g. to a company treasury wallet). | [CODE: PositionNFT.sol] |
| Oracle keeper | Feeds the oracle real rental prices from Vast.ai. | [CODE: scripts/oracle-keeper.mjs] |
| Traction page | Every trade, read from the chain and linked to its transaction. | [CODE: frontend/src/pages/ActivityPage.tsx] |

## Why Monad

- ~400 ms blocks / ~800 ms finality (Monad's published figures; we quote them, we haven't measured them on testnet) [CHAT]. A hedge that settles in about a second feels like a trading venue.
- Low fees make small contracts (100 GPU-hours ≈ $200 of compute) worth trading. [CHAT]
- Full EVM: Solidity, OpenZeppelin and MetaMask work unchanged. [CODE: contracts compile with solc 0.8.24, evm_version cancun. Not yet verified that Monad testnet accepts this bytecode: UNKNOWN]
- Design consequence: Monad charges for the gas **limit**, so we made series cheap clones (deployment gas went from ~36M to ~17M before the later extensions). [CHAT]

## Why this can win, criterion by criterion

| Criterion (weight) | Our case | Gap to close |
|---|---|---|
| Technical Execution (20%) | 7 contracts, 42 passing tests incl. fuzzing, real settlement, scripted E2E tests. [CODE: contracts/test, scripts/*.mjs] | **Not deployed to testnet yet.** Live demo must run on Monad. |
| Design & Craft (20%) | Dark terminal UI, payoff charts, risk disclosure before every trade, labeled simulated data, tx lifecycle with settlement time. [CODE: frontend/src/components] | Polish, consistency, mobile, empty/error states. This is the teammate's main lever. |
| Originality (15%) | New underlying (GPU compute) + new customer (AI companies). Not "another DeFi options venue". | Pitch must say this crisply. |
| Founder & Market Readiness (25%) | Clear beachhead and wedge (hedge calculator speaks the customer's language). | **No named first user or evidence of demand yet** [UNKNOWN]. |
| Traction (20%) | Onchain counters (trades, wallets, volume, payouts) and a public Activity page. [CODE: OptionFactory.getStats, ActivityPage.tsx] | **Zero testnet activity so far.** Needs real wallets trading before judging. |

## Honest weaknesses a judge could attack

1. **Centralized oracle.** Whoever holds `ORACLE_ROLE` sets the price that settles every option. A malicious admin could spike the price and drain writers. [CODE: ComputeOracle.sol `setPrice` onlyRole(ORACLE_ROLE)]
2. **No real price index.** The keeper uses one marketplace (Vast.ai) median; the demo uses manual prices. [CODE: scripts/oracle-keeper.mjs]
3. **Capped payouts.** Calls pay at most `cap` per GPU-hour (default = strike, i.e. up to a 2× price move). That is really a call spread, not an unlimited call. [CODE: Deploy.s.sol, ComputeOption.sol `_payoutFor`]
4. **Fixed premiums and one writer per series**: no order book or price discovery; the bid shown in the UI is simulated. [CODE: MarketTable.tsx `indicativeBid`]
5. **Black-Scholes doesn't really apply** to a non-tradable commodity; model prices are indicative only. [CODE: utils/optionsPricing.ts header]
6. **Simulated market statistics** (24h change, rental volume, price history). They are labeled, but a judge may still discount them. [CODE: data/marketData.ts]
7. **No demand evidence / customer interviews** [UNKNOWN].
8. **Regulatory**: derivatives on real assets are regulated in most jurisdictions; we have no stance. [UNKNOWN]

## Pitch narrative (10 sentences)

1. GPU compute is the most important input in AI, and its price swings with every model launch.
2. An AI startup that needs 5,000 H100 hours next month pays $10,000 today, and could pay $20,000 if prices double.
3. Airlines hedge fuel and manufacturers hedge metals, but AI companies have no way to hedge compute.
4. GpuHedger is an onchain options and futures market for GPU-hours, built on Monad.
5. A startup enters its compute needs and the hedge calculator recommends protection: for example, capping 5,000 H100 hours near $2.07 per hour for a $365 premium.
6. Every option is fully collateralized up front, so every payout is funded before you buy.
7. When prices spike, the holder exercises and USDC lands in their wallet in about a second, which only feels right on Monad's sub-second blocks.
8. GPU providers take the other side with puts and short futures, and LPs earn the premiums through an ERC-4626 vault.
9. Positions are NFTs, so a hedge can move to a treasury or be sold, and every trade is visible onchain.
10. GpuHedger turns GPU compute from an unpredictable expense into a hedgeable asset: hedge the future of compute.

(The $365 / $2.07 figures come from the hedge calculator on the seeded local market: H100 $2.00-strike 14-day call, 50 contracts. [CHAT, screenshot 2026-10-08])

## Feature status

Status key: **Working** = exercised end to end by an automated script or browser run. **Untested** = built but never driven in a browser or script. **Partial** = some parts missing. **Planned** = not built. All testing was on **local Anvil only**. Nothing has run on Monad testnet. [CHAT]

| Feature | Status | Evidence |
|---|---|---|
| Option series creation (deploy script) | Working | Deploy script ran on Anvil many times [CHAT]; `test_CreateH100Call` etc. [CODE: contracts/test/GpuHedger.t.sol] |
| Option series creation (Admin UI form) | **Untested** | Form exists [CODE: AdminPage.tsx `CreateSeriesPanel`]; never clicked in a browser [CHAT] |
| Buy option (UI) | Working | Headless-Chrome E2E clicked APPROVE → BUY CALL → "Position opened" [CHAT] |
| Exercise (UI) | Working | Browser E2E reached "SETTLED ✓" + EXERCISED row [CHAT] |
| Oracle price update (Admin preset buttons) | Working | Browser E2E clicked "H100 → $4.00" [CHAT] |
| Oracle volatility update (Admin) | Untested | [CODE: AdminPage.tsx `setVol`] |
| Expiry settlement + claim (contracts) | Working | `test_ClaimAfterExpiryUsesPriceAtExpiry` [CODE: test/Extensions.t.sol]; `scripts/e2e-extensions.mjs` passed [CHAT] |
| Claim button (UI) | **Untested** | [CODE: PositionTable.tsx]; never clicked (requires waiting past expiry) [CHAT] |
| Position NFT transfer (UI) | Working | Browser E2E transferred an NFT [CHAT] |
| Futures open (UI) | Working | Browser E2E "OPEN LONG" → "Position opened" [CHAT] |
| Futures settle (UI) | **Untested** | Contract path tested by script [CHAT]; UI button never clicked |
| Futures market creation (Admin UI) | **Untested** | [CODE: AdminPage.tsx `FuturesAdminPanel`] |
| Vault deposit (UI) | Working | Browser E2E [CHAT] |
| Vault withdraw (UI) / harvest (UI) | **Untested** | Contract paths tested [CODE: Extensions.t.sol `test_VaultEarnsPremiumsForLps`] |
| Vault write series (Admin UI toggle) | **Untested** | [CODE: AdminPage.tsx `writer === "VAULT"`] |
| Pause / unpause (Admin UI) | **Untested** | Contract tested [CODE: GpuHedger.t.sol `test_PauseBlocksTradingAndExercise`] |
| Hedge calculator | Working (visual) | Screenshot reviewed; maths not unit-tested [CHAT] |
| Activity / traction page with tx links | Working (local) | Tx hash resolved correctly once [CHAT]; getLogs behaviour on Monad RPC [UNKNOWN] |
| Oracle keeper (real prices) | Working (local) | `--send` succeeded on Anvil [CHAT] |
| Wrong-network banner + switch | Built, **untested** with a real wallet | [CODE: Navbar.tsx, WalletButton.tsx] |
| MetaMask connection | Built, **untested** (all E2E used a mock connector) | [CODE: lib/wagmi.ts `injected()`] |
| Mobile layout | Working (visual) | No horizontal overflow at 390 px on all pages [CHAT] |
| Monad testnet deployment | **Planned, blocked** | Deployer wallet has 0 MON [CHAT]; fresh-clone deploy bug, see `12-…` |
| Live hosted frontend | **Planned** | Vercel config + GitHub Pages workflow exist, never run [CODE: frontend/vercel.json, .github/workflows/deploy-pages.yml] |
| Decentralized oracle, order book, permissionless writers | Planned | Roadmap only [CODE: LandingPage.tsx `ROADMAP`] |
| 3-min demo video, 2-min pitch video | **Not started** | [CHAT] |
| Pitch deck | Draft | 14 slides, private Claude artifact; traction figures are `[__]` placeholders [CHAT] |
