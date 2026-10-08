# 08: Data and state

## Data models (TypeScript)

These exist today in `frontend/src/types/*.ts`, `hooks/useFutures.ts` and `hooks/useVault.ts` [CODE]. Raw onchain values are `bigint`; UI values are `number` (USD floats) **for display and maths only**.

```ts
type GpuSymbol = "H100" | "A100" | "B200";            // types/markets.ts
type OptionKind = "CALL" | "PUT";                       // optionType 0 | 1
type PositionStatus = "OPEN" | "EXERCISED" | "EXPIRED" | "CLAIMABLE"; // enum 0..3

interface OraclePrice {          // from oracle.getAllPrices()
  gpu: GpuSymbol;
  price: number;                 // $ per GPU-hour   (priceRaw / 1e6)
  priceRaw: bigint;              // 6dp
  updatedAt: number;             // unix seconds
  volatility: number;            // decimal, 0.42  (bps / 10_000)
  volatilityBps: number;
}

interface OptionSeries {         // from factory.getAllSeriesDetails() via parseSeries()
  id: number; address: `0x${string}`; gpu: GpuSymbol; region: string; kind: OptionKind;
  strike: number; strikeRaw: bigint;          // $ / GPU-h
  expiration: number;                          // unix s
  contractSize: number;                        // GPU-hours per contract
  premium: number; premiumRaw: bigint;         // $ / GPU-h (executable)
  maxPayoutPerUnit: number;                    // cap, $ / GPU-h
  maxContracts: number; soldContracts: number; openContracts: number; exercisedContracts: number;
  availableContracts: number;                  // max − sold
  collateralPerContract: number; collateralBalance: number; lockedCollateral: number; totalPaidOut: number; // $
  writer: `0x${string}`; settlementToken: `0x${string}`; oracle: `0x${string}`;
  createdAt: number; settled: boolean;
}

interface Position {             // from factory.getUserPositions(user)
  key: string;                   // `${seriesId}-${positionId}`
  seriesId: number; option: `0x${string}`;
  positionId: bigint; tokenId: bigint; owner: `0x${string}`;
  contracts: number; premiumPaid: number; openedAt: number;
  status: PositionStatus; payout: number; closedAt: number;
}

interface PositionView extends Position {   // usePortfolio(): live, client-computed
  series: OptionSeries; spot: number;
  intrinsicPerUnit: number;      // capped, $/GPU-h
  exerciseValue: number;         // $ = intrinsic × size × contracts (matches onchain formula)
  estimatedValue: number;        // $ model (labeled estimate); = claimValue when CLAIMABLE
  pnl: number;                   // $ unrealized (OPEN/CLAIMABLE) or realized
  distanceToStrike: number;      // % (spot − strike) / strike
  timeRemaining: number;         // s
  canExercise: boolean; canClaim: boolean; claimValue: number;
}

interface FuturesMarket { id; gpu; region; forwardPrice; band; bandRaw: bigint; expiration; contractSize;
  maxContracts; usedContracts; availableContracts; longContracts; shortContracts; writerCollateral;
  writer; settled; settlementPrice }       // hooks/useFutures.ts
interface FuturesPositionView { id; market; side: "LONG" | "SHORT"; contracts; margin; openedAt;
  closed; payout; markPrice; pnl; expired }

// Activity row (hooks/useProtocol.ts)
{ kind: "Series created" | "Purchase" | "Exercise" | "Expiry" | "Claim"; kindIndex: number;
  seriesId: number; account: `0x${string}`; contracts: number; amount: number; amountRaw: bigint;
  timestamp: number; blockNumber: bigint }

// Vault summary (hooks/useVault.ts)
{ tvl; idle; deployed; sharePrice; premiumsEarned; activeSeries; allSeries;
  userShares; userSharesRaw; userValue; userMaxWithdraw; userMaxWithdrawRaw }
```

## Units and formatting rules

| Quantity | Onchain | Convert | Display | Helper [CODE: utils/formatters.ts] |
|---|---|---|---|---|
| USDC amount | uint256, 6dp | `formatUnits(x, 6)` | `$1,234.56` (2 dp) | `fromUsdc`, `formatUsd` |
| Price per GPU-hour | uint256, 6dp | same | `$2.14`; under $0.10 → 3 dp (`$0.035`) | `formatPrice` |
| Signed P&L | | | `+$240.00` / `−$12.50` (true minus sign); green > 0, red < 0, grey ≈ 0 | `formatSignedUsd`, `pnlClass` |
| Contract size, contracts | integer | `Number()` | `1,000` | `formatNumber` |
| Volatility | bps | / 10,000 | `42%` | |
| Percentages | | | `+4.8%` | `formatPct` |
| Dates | unix s | × 1000 | "Nov 5, 2026"; tenor "30D"; remaining "29d 23h" | `formatDate`, `formatTenor`, `formatDuration` |
| Addresses / hashes | | | `0xf39F…2266`, `0x4f88bf33…d97b5` | `shortAddress`, `shortHash` |
| bytes32 text | bytes32 | `hexToString(…, {size:32})` minus NULs | `H100` | `bytes32ToString` / `stringToBytes32` |

- **Timezones:** dates use the browser's locale and timezone (`toLocaleDateString`). Expiries are absolute timestamps. Consider showing UTC on the detail page. [CODE]
- **Never** compute a transaction amount from floats. Use `premiumRaw * BigInt(contractSize) * BigInt(contracts)`. For user-typed dollar amounts use `toUsdc(n)` (`parseUnits(n.toFixed(6), 6)`). [CODE: formatters.ts, TradePanel.tsx]
- Monospace + tabular numbers (`num` utility) for every price, amount, address and hash. [CODE: index.css]

## Real vs simulated

| Shown value | Real or simulated | Label in the current UI |
|---|---|---|
| Oracle price, IV, last update | **Real** (oracle; admin- or keeper-set) | "Live oracle" / "Onchain" chip |
| Series terms, premium, OI, collateral | **Real** | "Onchain" chip on panels |
| Balances, positions, payouts, P&L at exercise value | **Real** | |
| Model price, estimated position value | Computed (Black-Scholes) | "Model price (demo)", "Current value*" footnote |
| 24h / 7d change, rental volume | **Simulated** | "Simulated" chip, `data/marketData.ts` `STATS` |
| "Market" price-history chart | **Simulated** random walk ending at the real oracle price | "SIMULATED MARKET DATA" chip |
| "Oracle updates" chart | **Real** (`getPriceHistory`) | "Onchain oracle" chip |
| Bid | **Simulated** (premium − 6%) | "Bid*" + footnote |
| Fallback prices when the oracle fails | **Simulated** | **Bug: sometimes labeled "Oracle"** (see `05-…`) |
| Hedge calculator outputs | Computed from real series/prices | "Illustrative" chip |
| Landing example ($35 → +$1,765) | Hardcoded illustration | Note under the example |

**Swapping simulated data:** `data/marketData.ts` exports `marketData: MarketDataProvider` with `getStats(gpu)` and `getHistory(gpu, range, currentPrice, vol)`. Implement the same interface with a real source (e.g. stored keeper samples) and change the one export. [CODE]

## Caching and refresh strategy

- **TanStack Query via wagmi hooks**, polling with `refetchInterval` (intervals in `04-…`). No websockets or event subscriptions. [CODE: hooks/*]
- wagmi `pollingInterval: 400` ms; the receipt wait polls every 250 ms. [CODE: lib/wagmi.ts, useTransaction.ts]
- After any confirmed tx: `queryClient.invalidateQueries()` (everything). Fine at this scale.
- QueryClient defaults: `retry: 2`, `refetchOnWindowFocus: true`, `staleTime: 1s`. [CODE: main.tsx]
- Activity tx hashes: `useQuery` keyed by the block list with `staleTime: Infinity`. [CODE: ActivityPage.tsx]
- Optional upgrade: a `watchContractEvent` subscription on `ActivityRecorded`. Not needed for the demo.

## Pricing maths the frontend must reproduce

Source of truth: `frontend/src/utils/optionsPricing.ts`. Onchain payout maths is in `ComputeOption._payoutFor` and must match **exactly** for exercise values.

```
intrinsic (per GPU-h): CALL max(S − K, 0) ; PUT max(K − S, 0)        → then min(·, cap)
exercise value ($)    = min(intrinsic, cap) × contractSize × contracts   (onchain: integer 6dp)
premium total ($)     = premium × contractSize × contracts
break-even            = CALL K + premium ; PUT max(K − premium, 0)
max loss              = premium total
max profit            = cap × contractSize × contracts − premium total
P&L at expiry         = exercise value − premium total
futures P&L ($)       = clamp(S − F, −B, +B) × size × contracts   (negate for SHORT)
Black-Scholes         d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T), d2 = d1 − σ√T,  r = 0.04, T in years (days/365)
                      C = S·N(d1) − K·e^(−rT)·N(d2);  P = K·e^(−rT)·N(−d2) − S·N(−d1)
capped call           = C(K) − C(K + cap) ; capped put = P(K) − P(K − cap) (plain put if K − cap ≤ 0)
N(x)                  = Abramowitz–Stegun 7.1.26 erf approximation (|err| < 1.5e-7)
estimated position value (OPEN) = max(model × size × contracts, exercise value)
```

### Test vectors (generated 2026-10-08 by running the real `optionsPricing.ts`)

| Function | Input | Expected |
|---|---|---|
| `calculateCallPrice` | S 2.00, K 2.20, T 30/365, σ 0.42 | **0.032235** |
| `calculatePutPrice` | S 2.00, K 1.80, T 30/365, σ 0.42 | **0.022785** |
| `calculateCallPrice` | S 2.00, K 2.00, T 14/365, σ 0.42 | **0.067107** |
| `calculateCallPrice` | S 4.00, K 2.20, T 30/365, σ 0.42 | **1.807221** |
| `calculateCappedOptionPrice` | CALL, S 2.00, K 2.20, cap 2.20, 30d, 0.42 | **0.032235** |
| `calculateCappedOptionPrice` | CALL, S 4.00, K 2.20, cap 2.20, 30d, 0.42 | **1.742751** |
| `calculateCappedOptionPrice` | PUT, S 2.00, K 1.80, cap 1.80, 30d, 0.42 | **0.022785** |
| `calculateIntrinsicValue` | CALL S 4, K 2.2, cap 2.2 | **1.8** (float: 1.7999999999999998; round for display) |
| `calculateIntrinsicValue` | CALL S 9, K 2.2, cap 2.2 | **2.2** |
| `calculateIntrinsicValue` | PUT S 1.2, K 1.8, cap 1.8 | **0.6** |
| `calculateBreakEven` | CALL K 2.2, premium 0.035 / PUT K 1.8, premium 0.025 | **2.235 / 1.775** |
| `summarizeTrade` | CALL K 2.2, prem 0.035, cap 2.2, size 100, 10 contracts | gpuHours **1000**, totalPremium **35**, maxLoss **35**, maxPayout **2200**, maxProfit **2165**, breakEven **2.235**, collateralBacking **2200** |
| `calculateDelta` | CALL S 2, K 2.2, 30d, 0.42 | **0.240705** |
| `normCdf` | 0 / 1.96 | **0.5000000005 / 0.975002** |

Onchain vectors (verified by Foundry tests and E2E scripts [CODE: contracts/test, scripts/*]):

| Scenario | Raw result |
|---|---|
| `quotePremium(10)` on series #0 (premium 35_000, size 100) | `35_000_000` ($35) |
| exercise 10 contracts, K 2_200_000, S 4_000_000 | payout `1_800_000_000` ($1,800) |
| exercise 1 contract, S 9_000_000 (capped) | `220_000_000` ($220) |
| claim 10 contracts, price at expiry 3_000_000 | `800_000_000` ($800) |
| LONG 5 futures, F 2_050_000, B 1_000_000, S 3_000_000 | payout `975_000_000` ($975) |
