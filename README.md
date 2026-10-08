# GpuHedger

**Hedge the future of compute.**

GpuHedger is an onchain options market that lets AI companies hedge against future GPU compute price volatility. It turns GPU compute from an unpredictable infrastructure expense into a hedgeable financial asset.

| | |
|---|---|
| **Underlying asset** | GPU compute (H100, A100, B200), priced in USD per GPU-hour |
| **Primary customer** | AI startups buying significant GPU capacity |
| **Purpose** | Cap or lock in future compute costs |
| **Settlement** | Onchain, cash-settled in USDC, fully collateralized |
| **Blockchain** | Monad (~400ms blocks, ~800ms finality) |

---

## Problem

GPU compute is now a core input for every AI company, but:

- **Pricing is opaque.** Compute is bought through bilateral, negotiated, illiquid contracts.
- **Future costs are uncertain.** H100 and B200 rental rates swing with model launches and supply shocks, so a startup's runway moves with them.
- **There is no hedge.** Airlines hedge fuel and manufacturers hedge metals. AI companies have no standard instrument to cap tomorrow's compute bill.

## Solution

GpuHedger lists standardized **call and put options on GPU-hours**:

- A **CALL** protects against rising compute prices. An AI startup that needs H100 capacity next month buys calls.
- A **PUT** protects a compute provider against falling prices, locking in a floor on rental revenue.

Each option series is a smart contract holding the writer's collateral. The buyer pays a premium, and if the price moves through the strike they exercise and receive USDC in about one second on Monad.

**Example.** H100 is at $2.00/GPU-hour. A startup needs 1,000 GPU-hours next month and buys 10 CALL contracts (100 GPU-h each), strike $2.20, 30 days, for a $35 premium.
- H100 → $4.00: the payout is (4.00 − 2.20) × 1,000 = **$1,800**, which offsets most of the $2,000 cost increase.
- H100 → $1.50: the option expires unused. The cost of insurance was $35.

## Why GPU compute needs financial markets

Compute is becoming a commodity, and commodities need risk-transfer markets. Traditional compute contracts are opaque and bilateral. Options make the hedge standard. The blockchain makes it programmable and self-settling, with no counterparty chasing, since payouts are pre-funded. Monad makes it fast enough to feel like a real trading venue. GpuHedger combines these into **a programmable market for compute risk**.

## How options work here

| Term | Meaning |
|---|---|
| Strike | USD per GPU-hour at which protection starts |
| Premium | USD per GPU-hour paid up front (premium per contract = premium × contract size) |
| Contract size | GPU-hours per contract (100 in seeded markets) |
| Payout cap | Max payout per GPU-hour, which keeps every series fully collateralized |
| Exercise | Any time before expiry while in the money (American-style) |

```
CALL in the money: spot > strike   exercise value = min(spot − strike, cap) × contractSize × contracts
PUT  in the money: spot < strike   exercise value = min(strike − spot, cap) × contractSize × contracts
```

Maximum loss for the buyer of a call or a put is the premium paid. Potential profit is capped at `cap × GPU-hours − premium`. The UI never claims unlimited profit.

## Why Monad

- **~400ms blocks / ~800ms finality.** Buy, oracle update, exercise, and settlement each confirm in about a second. The UI shows *Order submitted → Confirming → Settled ✓* with the measured settlement time and an explorer link.
- **Real-time risk.** Positions re-mark against the onchain oracle every block, and holders can exercise as soon as they're in the money.
- **Full EVM.** Standard Solidity, OpenZeppelin, wagmi/viem, and MetaMask.
- **Low fees.** 100-GPU-hour contracts are viable, not just million-dollar deals.

## Architecture

```
User                         Admin
 ↓                             ↓
Frontend (React + Vite)      ComputeOracle  ←  GPU price (USD / GPU-hour)
 ↓
wagmi / viem
 ↓
Monad
 ↓
OptionFactory  ── clones ──►  ComputeOption (one per series, holds collateral)
                                  ↓                ↓
                            ComputeOracle      MockUSDC (settlement)
```

### Smart contracts (`contracts/src`)

| Contract | Responsibility |
|---|---|
| `MockUSDC.sol` | 6-decimal **testnet-only** ERC20 with a public `faucet()` (configurable amount and cooldown) |
| `ComputeOracle.sol` | Permissioned GPU price feed (`setPrice`, `setPrices`, `getPrice`, `getPriceWithTimestamp`, `setVolatility`, onchain price history). Implements `IComputeOracle` so it can later be swapped for a decentralized oracle. |
| `ComputeOption.sol` | One option series: `buyOption`, `exercise`, `expire`, `getPosition`, `getOptionDetails`, `isInTheMoney`, `calculateExerciseValue`, plus writer collateral management |
| `OptionFactory.sol` | `createOptionSeries()` deploys an EIP-1167 clone per series, pulls collateral, assigns a unique series ID, indexes positions, records protocol activity and traction stats, and holds the pause switch |
| `interfaces/IGpuHedger.sol` | Shared types and interfaces |

**Collateral model (fully collateralized).** On creation, the writer deposits `cap × contractSize × capacity` USDC into the series. Buyers pay the premium directly to the writer. Collateral backing open positions stays locked until exercise or expiry. The writer can only withdraw collateral for unsold capacity (`reduceCapacity`), surplus left over when an exercise paid less than the cap (`withdrawFreeCollateral`), or everything left after expiry (`expire()`, callable by anyone).

### Frontend (`frontend/src`)

```
components/  Navbar, WalletButton, MarketTable, MarketCard, OptionSelector, TradePanel,
             PayoffChart, PriceChart, PositionTable, TransactionStatus, RiskDisclosure, ui (StatCard, …)
contracts/   abis/ (generated), deployments/<chainId>.json (written by deploy script), addresses.ts
hooks/       useOption, useOracle, usePortfolio, useUSDC, useTransaction, useProtocol
lib/         wagmi.ts, viem.ts, chain.ts, errors.ts (friendly revert messages)
utils/       optionsPricing.ts, formatters.ts
types/       options.ts, markets.ts
data/        marketData.ts (simulated market data behind a swappable provider interface)
pages/       Landing, Markets, MarketDetail, Trade, Portfolio, Admin, Docs
```

Routes are `/`, `/markets`, `/markets/:id`, `/trade`, `/portfolio`, `/admin`, and `/docs`.

### What is real vs. simulated

| Real (Monad smart contracts) | Simulated (clearly labelled in the UI) |
|---|---|
| Wallet connection, MON and USDC balances | 24h / 7d price change, rental-market volume |
| USDC faucet, approvals | Historical "market" price chart (the *Oracle updates* tab shows the real onchain history) |
| Option series creation, purchase, exercise, settlement | Indicative bid (the ask is the real onchain premium) |
| Oracle prices and implied volatility | |
| Positions, open interest, protocol stats and activity | |

No transaction hash, balance, or confirmation is ever faked. If contracts aren't configured, the app says so.

## Pricing model

`frontend/src/utils/optionsPricing.ts` implements a simplified Black-Scholes model, shown in the UI as **"Model price — for demonstration purposes."**

```
d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)        d2 = d1 − σ√T
C  = S·N(d1) − K·e^(−rT)·N(d2)              P  = K·e^(−rT)·N(−d2) − S·N(−d1)
Capped call = C(K) − C(K+cap)               Capped put = P(K) − P(K−cap)
```

Inputs are the oracle spot price, strike, time to expiry, oracle implied volatility, and a 4% risk-free rate. Exported functions: `calculateCallPrice`, `calculatePutPrice`, `calculateCappedOptionPrice`, `calculateCallPayoff`, `calculatePutPayoff`, `calculateBreakEven`, `calculateIntrinsicValue`, `calculateDelta`, `summarizeTrade`, `buildPayoffCurve`. Seeded premiums are the model price plus about 8%.

This is not institutional-grade pricing. GPU compute can't be continuously hedged, so the Black-Scholes assumptions only loosely apply.

## Security

- OpenZeppelin `AccessControl`: `ORACLE_ROLE` (prices), `WRITER_ROLE` (create series), `PAUSER_ROLE` (pause); `Ownable` on MockUSDC
- `ReentrancyGuard` on all state-changing option functions, `SafeERC20` for every transfer
- Checks-effects-interactions, with events emitted before external calls
- Input validation: zero addresses, non-zero strike, `expiration > now` (≤ 2 years), contract size bounds, `premium < cap`, put cap ≤ strike, allowlisted oracle and token, oracle-supported underlying
- Reverts on double exercise, exercise after expiry, out-of-the-money exercise, non-owner exercise, unauthorized oracle updates, withdrawal of locked collateral, re-initializing a clone, and spoofed activity records
- Global pause blocks purchases and exercises

**Tests:** `contracts/test/GpuHedger.t.sol` has 30 Foundry tests, including a 256-run fuzz test that payouts never exceed collateral. It covers all required scenarios: deploy, create H100/A100 call and put, buy call and put, premium payment, position creation, profitable call and put exercise, out-of-the-money rejection, expired rejection, double-exercise prevention, oracle update, unauthorized oracle update, collateral locking and release, settlement transfer, and multiple users.

---

## Running locally

**Prerequisites:** Node 20+, [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`), and a browser wallet such as MetaMask.

```bash
git clone <repo> && cd gpuhedger
git submodule update --init --recursive      # OpenZeppelin + forge-std
npm install && npm --prefix frontend install

# 1. Contracts: build and test
cd contracts && forge build && forge test && cd ..

# 2. Local chain + deploy (Anvil dev key — local only)
anvil --block-time 1                          # in a separate terminal
cd contracts && forge script script/Deploy.s.sol --rpc-url local \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast && cd ..

# 3. Headless end-to-end check of the full demo flow (buy → oracle spike → exercise)
npm run demo-flow

# 4. Frontend against Anvil
cd frontend
echo "VITE_CHAIN_ID=31337" > .env.local
echo "VITE_MONAD_RPC_URL=http://127.0.0.1:8545" >> .env.local
npm run dev                                   # http://localhost:5173
```

For local MetaMask use, add the network *Localhost 8545* (chain ID 31337) and import Anvil account #0, which is the admin. That key is public and must only be used locally.

## Deploying contracts to Monad Testnet

| Network | Value |
|---|---|
| Network name | Monad Testnet |
| Chain ID | `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Currency | MON |
| Explorer | https://testnet.monadexplorer.com |
| Faucet | https://faucet.monad.xyz |

```bash
# Store the deployer key encrypted (never commit keys or put them in .env files)
cast wallet import gpuhedger-deployer --interactive

cd contracts
forge script script/Deploy.s.sol --rpc-url monad_testnet --account gpuhedger-deployer --broadcast
```

The script deploys, in order, **MockUSDC → ComputeOracle → ComputeOption implementation → OptionFactory**. It grants the deployer admin, oracle, writer, and pauser roles, sets H100 $2.00 / A100 $1.30 / B200 $3.80, mints writer collateral, and creates 9 markets:

| GPU | Type | Strike | Expiry | Region |
|---|---|---|---|---|
| H100 | CALL | $2.20 | 30D | US-East |
| H100 | CALL | $2.50 | 30D | US-East |
| H100 | PUT | $1.80 | 30D | US-East |
| H100 | CALL | $2.00 | 14D | US-West |
| H100 | PUT | $2.00 | 60D | EU-West |
| A100 | CALL | $1.50 | 30D | US-East |
| A100 | PUT | $1.20 | 30D | EU-West |
| B200 | CALL | $4.20 | 60D | US-East |
| B200 | PUT | $3.50 | 30D | US-West |

It writes the addresses to `contracts/deployments/10143.json` and `frontend/src/contracts/deployments/10143.json`, and the frontend picks them up automatically. The full deployment uses about 17M gas, roughly **2.5 MON** at ~100 gwei, because Monad charges for the gas *limit*. Optionally verify with `--verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org`.

Then run the frontend on testnet (the default chain):

```bash
cd frontend && cp .env.example .env && npm run dev
```

Addresses can also be set explicitly with `VITE_USDC_ADDRESS`, `VITE_ORACLE_ADDRESS`, and `VITE_OPTION_FACTORY_ADDRESS`. If you change the contracts, run `npm run abis` after `forge build`.

## Using the app

- **Connecting a wallet.** Click **CONNECT** (MetaMask or any injected/EIP-6963 wallet). On the wrong network the app shows **WRONG NETWORK** and a **SWITCH TO MONAD TESTNET** button, which adds the chain if needed. The app never asks for private keys or seed phrases.
- **Getting test USDC.** Click **GET TEST USDC** (Portfolio or trade panel) to mint 10,000 test USDC. It's labelled *Testnet only*. Gas requires testnet MON from the Monad faucet.
- **Creating an option.** On `/admin` with the deployer wallet, pick a GPU, type, strike, expiry, size, premium (defaults to model price + 8%), cap, and capacity. Click **APPROVE COLLATERAL**, then **CREATE SERIES**. The series appears in `/markets` automatically.
- **Buying an option.** On `/trade`, choose GPU → CALL/PUT → strike → expiry and enter a quantity. Review premium, total cost, break-even, max loss, potential profit, and the payoff chart. Acknowledge the risk disclosure, then **APPROVE USDC** (if needed) → **BUY CALL**. The status runs Signature → Submitted → Confirming → **SETTLED ✓**, with the tx hash and explorer link.
- **Exercising an option.** In `/portfolio`, in-the-money open positions show **EXERCISE**. The contract reads the oracle, pays USDC to your wallet, and marks the position EXERCISED.

## Hackathon demo flow

1. **Connect wallet** (the deployer wallet, which is also the admin).
2. **Get test USDC** from the Portfolio page.
3. **Open the H100 market** via `/markets` → H100 and show **H100 at $2.00/hour** (live oracle).
4. **Select CALL · strike $2.20 · 30 days** on `/trade`.
5. **Show the payoff chart.** "If H100 rises above $2.20, this option protects our buyer from the increase." Drag the scenario slider.
6. **Buy 10 contracts** ($35 premium), approving USDC first. Show the real Monad transaction and the settlement time.
7. **Go to Portfolio** and show the open position (OTM, P&L −$35).
8. **Open Admin** and click **H100 → $4.00 (spike)**, a real oracle transaction.
9. **Return to Portfolio.** The option is now in the money: exercise value $1,800, P&L ≈ +$1,765.
10. Click **EXERCISE**.
11. Show the onchain settlement: the tx hash and USDC balance increase.
12. **SETTLED ✓**, and the position moves to *Exercised*.
13. (Optional) Show `/admin` → protocol activity and onchain stats (trades, premium volume, payouts) as traction.

Reset between runs with **H100 → $2.00** on `/admin`.

## Testing

```bash
cd contracts && forge test -vv      # 30 tests incl. fuzzing
npm run demo-flow                   # scripted onchain E2E against a deployment (local by default)
npm --prefix frontend run build     # typecheck + production build
```

To run `demo-flow` against testnet: `CHAIN_ID=10143 RPC_URL=https://testnet-rpc.monad.xyz ADMIN_KEY=… BUYER_KEY=… npm run demo-flow`. Set the keys only in your shell session.

## Future roadmap

| Phase | Milestone |
|---|---|
| 1 | **Testnet MVP**: collateralized GPU calls and puts, oracle, settlement *(this repo)* |
| 2 | Real compute price oracle: an index from cloud GPU rental rates, with decentralized reporters |
| 3 | Liquidity providers: permissionless writers and pooled collateral vaults |
| 4 | Secondary option trading: tokenized positions and an order book |
| 5 | GPU futures: lock in a fixed compute price |
| 6 | Compute-backed lending |
| 7 | SLA insurance for downtime and delivery failures |
| 8 | Institutional compute hedging desks for AI labs and clouds |

## Known limitations

- The oracle is a **permissioned demo feed** controlled by the admin, not a real GPU price index.
- Market statistics, price history charts, and bids are **simulated** and labelled as such.
- Payouts are capped at the series cap so every series stays fully collateralized. The cap defaults to the strike, i.e. a call pays out up to a 2× price move.
- One writer per series, a fixed premium set at creation, and no secondary market. Positions are not transferable.
- Unexercised in-the-money positions expire worthless at expiry. There is no automatic exercise.
- Portfolio values for open positions are Black-Scholes **estimates**, not market marks.
- Test USDC has no value. The code is unaudited hackathon software, so don't use it with real funds.
