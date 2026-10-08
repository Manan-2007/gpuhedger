# 02: Domain concepts, in plain language

You don't need a finance background. Everything below uses the actual numbers of the seeded demo market. Code references point to where each rule is enforced.

## 1. What is being traded

The **underlying** is the price of **one GPU-hour** (one GPU rented for one hour), in USD. There are three: `H100`, `A100`, `B200`. Seeded starting prices are H100 **$2.00**, A100 **$1.30**, B200 **$3.80** per GPU-hour. [CODE: contracts/script/Deploy.s.sol]

A **contract** covers **100 GPU-hours** in all seeded markets (`contractSize = 100`). 10 contracts therefore cover 1,000 GPU-hours. [CODE: Deploy.s.sol `_params`]

All prices (strike, premium, cap, spot) are quoted **per GPU-hour**. Totals are always:

```
total $ = (price per GPU-hour) × contractSize × contracts
```

## 2. Options

An **option** is insurance against a price move. You pay a **premium** now. Later, if the price has moved past the **strike**, the option pays you the difference.

- **Call**: protects against prices going **up**. Payout per GPU-hour = `max(spot − strike, 0)`, capped.
- **Put**: protects against prices going **down**. Payout per GPU-hour = `max(strike − spot, 0)`, capped.

[CODE: contracts/src/ComputeOption.sol `_intrinsicPerUnit`, `_payoutFor`]

### Example A: an AI startup buys a call, and the price spikes (profit)

Series #0 on the local chain: **H100 CALL, strike $2.20, 30 days, premium $0.035/GPU-h, cap $2.20/GPU-h**. [CODE: Deploy.s.sol line `_create(H100, "US-East", Call, 2_200_000, 30, 35_000, 2_200_000, 500)`]

1. The startup buys **10 contracts** (1,000 GPU-hours).
   Premium = 0.035 × 100 × 10 = **$35.00**. This is paid to the writer immediately.
2. Today H100 = $2.00. That's below $2.20, so the option is **out of the money**: exercising now would pay $0 (the contract reverts with `OutOfTheMoney`).
3. The oracle moves H100 to **$4.00**.
   Intrinsic = 4.00 − 2.20 = $1.80 per GPU-hour, which is under the $2.20 cap.
   Payout = 1.80 × 100 × 10 = **$1,800.00**.
4. Net profit = 1,800 − 35 = **+$1,765**.
   Why it matters: renting 1,000 H100 hours now costs $4,000 instead of $2,000. The hedge covered $1,765 of that $2,000 increase.

**Break-even** = strike + premium = 2.20 + 0.035 = **$2.235**. Above this, the call makes money overall.

This exact flow is verified onchain by `scripts/demo-flow.mjs` (output: "received $1,800.00 · net P&L $1,765.00"). [CHAT]

### Example B: the price falls (loss)

Same purchase, but H100 drops to **$1.50** and stays there until expiry.

- Intrinsic = max(1.50 − 2.20, 0) = $0. Nothing to exercise.
- At expiry the position becomes **Expired**. Loss = **−$35** (the premium). That is the **maximum loss**, whatever happens.
- The startup still benefits, because renting compute got cheaper. The $35 was the cost of insurance.

### Example C: the cap

Because each series is fully collateralized, payouts are **capped** at `maxPayoutPerUnit` per GPU-hour (here $2.20).

- H100 spikes to **$9.00**: intrinsic = 6.80, capped to **2.20**. Payout = 2.20 × 100 × 10 = **$2,200**.
- **Max profit** = 2,200 − 35 = **$2,165**. The UI shows "up to $2,165", never "unlimited". [CODE: frontend/src/utils/optionsPricing.ts `summarizeTrade`]
- For a call with cap = strike, protection runs from $2.20 to $4.40 (strike + cap). Above $4.40 the buyer is unhedged again. [CODE: HedgePage.tsx "protected until"]

### Example D: a GPU provider buys a put

Series #2: **H100 PUT, strike $1.80, 30 days, premium $0.025, cap $1.80**. [CODE: Deploy.s.sol]

- Buy 10 contracts: premium = 0.025 × 100 × 10 = **$25**.
- H100 falls to **$1.20**: intrinsic = 1.80 − 1.20 = $0.60. Payout = 0.60 × 1,000 = **$600**. Net = **+$575**.
- Break-even = strike − premium = **$1.775**.
- A put's cap can never exceed its strike, because spot can't go below 0. [CODE: OptionFactory.sol `_validate` → `InvalidPayoutCap`]

## 3. Exercise (American-style), expiry, settlement, claim

- **Before expiry**: the holder may **exercise** any time the option is ITM. Payout uses the *current* oracle price. [CODE: ComputeOption.sol `exercise`]
- **At expiry** (`block.timestamp >= expiration`): buying and exercising stop (`OptionExpired`).
- **Settlement**: anyone may call `expire()` after expiry. It looks up the oracle price **in effect at the expiration timestamp**, i.e. the last update at or before it (`ComputeOracle.getPriceAt`, a binary search over onchain price history). Price changes after expiry are ignored. It then:
  - reserves `payoutPerContract × openContracts` for ITM holders, and
  - sends all remaining collateral back to the writer.
  [CODE: ComputeOption.sol `_settle`; ComputeOracle.sol `getPriceAt`]
- **Claim**: an ITM holder calls `claim(positionId)` after expiry. If nobody has settled yet, `claim` settles first. [CODE: ComputeOption.sol `claim`]
- So an ITM position never expires worthless just because the holder was offline. (This was a deliberate change; an earlier version had no claim step. [CHAT])

Worked example (verified by `scripts/e2e-extensions.mjs` [CHAT]): H100 $2.20 call, 10 contracts. The price is $3.00 when expiry passes, then someone sets $1.00 *after* expiry. The claim pays (3.00 − 2.20) × 1,000 = **$800**; the post-expiry $1.00 is ignored.

## 4. Collateral and the writer

The **writer** sells options. When creating a series the writer deposits:

```
collateral = cap × contractSize × capacity(maxContracts)
```

Series #0: 2.20 × 100 × 500 = **$110,000** locked. Per contract: 2.20 × 100 = **$220**. [CODE: OptionFactory.sol `createOptionSeries`]

- Premiums go **straight to the writer's wallet** on each purchase (not into the series). [CODE: ComputeOption.sol `buyOption`: `safeTransferFrom(msg.sender, writer, cost)`]
- Collateral backing **sold, open** contracts is locked until exercise or settlement.
- The writer can only take back: collateral for **unsold** capacity (`reduceCapacity`), surplus left when an exercise paid less than the cap (`withdrawFreeCollateral`), or everything left after settlement.

## 5. Futures (forwards)

A **future** locks in a price. There's no premium; both sides post **margin**.

- Each market has a **forward price F** and a **band B**. Holder P&L per GPU-hour = `clamp(S − F, −B, +B)` for LONG, the negative of that for SHORT, where S = oracle price at expiry. [CODE: ComputeFutures.sol `positionPnl`]
- Margin = B × contractSize × contracts. Max gain = max loss = margin.
- The market's **writer** (market maker) takes the other side and posts the same amount per contract.

### Example E: LONG future (verified by `scripts/e2e-extensions.mjs` [CHAT])

Market #0: **H100, F = $2.05, B = $1.00, 30 days, 100 GPU-h/contract**. [CODE: Deploy.s.sol `createMarket(H100, "US-East", 2_050_000, 1_000_000, …)`]

- Open LONG 5 contracts (500 GPU-h). Margin = 1.00 × 100 × 5 = **$500**.
- H100 at expiry = **$3.00**: diff = +0.95, within the band. Payout = 500 + 0.95 × 500 = **$975**.
- At $6.00: diff +3.95, clamped to +1.00. Payout = $1,000 (the max).
- At $1.50: diff −0.55. Payout = 500 − 275 = **$225**.

For an AI startup, the effective compute cost stays ≈ F = $2.05 for any S between $1.05 and $3.05.

## 6. The LP vault (ERC-4626)

- LPs **deposit** USDC and receive **ghLP shares**. Share value = NAV / total shares. [CODE: ComputeVault.sol]
- The vault **manager** (`MANAGER_ROLE`) uses vault USDC to write option series, so the **vault is the writer**: premiums flow into the vault, raising share value.
- **NAV** = idle USDC + Σ over live series (collateral held − current ITM value of open contracts at the live oracle price). [CODE: ComputeVault.sol `totalAssets`, `seriesNetValue`]
- **Withdrawals are limited to idle USDC**; collateral behind open options can't leave. [CODE: `maxWithdraw`, `maxRedeem`]
- **Harvest** (anyone can call) settles expired series or pulls freed collateral back into the vault. [CODE: `harvest`]

Example (from the extension E2E [CHAT]): NAV $265,000. A trader buys 20 contracts of the vault's H100 $2.40 call at premium $0.019, so $38 flows in and NAV becomes **$265,038**. If H100 then sits at $3.00, the open contracts carry a liability of 0.60 × 100 × 20 = $1,200, and NAV marks to $263,838.

LP risk: LPs are option sellers. Large price moves reduce NAV. The UI must say this. [CODE: VaultPage.tsx warning text]

## 7. The oracle

- `ComputeOracle` stores, per GPU: price (6 decimals, USD/GPU-h), last-update timestamp, implied volatility (bps), and a full **price history**. [CODE: ComputeOracle.sol]
- Only `ORACLE_ROLE` may update prices. On deploy that is the deployer wallet. [CODE: constructor]
- Prices must be between $0.000001 and $10,000 per GPU-hour (`InvalidPrice`); volatility between 1 and 50,000 bps.
- **No staleness check**: options use the latest price however old it is. [CODE: ComputeOption.sol `exercise` calls `oracle.getPrice`]
- Two ways prices change: the **Admin page** (manual, used in the demo) and the **keeper script** (real Vast.ai rental prices, at most ±25% per update by default). [CODE: scripts/oracle-keeper.mjs]

## 8. The pricing model (indicative only)

The **onchain premium is fixed** when a series is created. The frontend separately computes a **model price** (an estimate of fair value) to:
- show "Model price (demo)" next to the real premium,
- estimate the current value of open positions in the portfolio,
- suggest a premium (model × 1.08) in the Admin create-series form.

The model is Black-Scholes (the textbook option-pricing formula), with inputs: spot (oracle), strike, time to expiry in years, volatility (oracle IV), and a 4% risk-free rate. Capped options are priced as spreads: capped call = C(K) − C(K + cap). [CODE: frontend/src/utils/optionsPricing.ts]

Why it's only indicative:
- Black-Scholes assumes the underlying can be traded continuously and follows a lognormal random walk. A GPU-hour can't be stored or traded like a stock.
- Volatility is a number the admin sets, not one implied by a market.
- So the UI must label it "Model price — for demonstration purposes". [CODE: TradePanel.tsx, MarketDetailPage.tsx]

Model check (from the real code; full test vectors in `08-DATA-AND-STATE.md`): H100 call, S = $2.00, K = $2.20, 30 days, 42% vol → **$0.032235**. The seeded premium $0.035 ≈ model + 8%. [CHAT]
