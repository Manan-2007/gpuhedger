# 03: Architecture

## System diagram

```
                         ┌─────────────────────────── Browser ───────────────────────────┐
                         │ React app (frontend/)  ──wagmi/viem──►  injected wallet (MetaMask)│
                         └──────────────┬──────────────────────────────────┬──────────────┘
                                        │ reads (eth_call, getLogs)        │ writes (signed tx)
                                        ▼                                  ▼
 ┌──────────────────────────────────────────── Monad (chain 10143) / Anvil (31337) ─────────────────────────────────────────┐
 │                                                                                                                           │
 │   MockUSDC (ERC-20, 6dp, faucet) ◄──── transfers ────┬───────────────┬────────────────────┬──────────────────┐          │
 │                                                      │               │                    │                  │          │
 │   ComputeOracle ◄── getPrice / getPriceAt ───────────┤               │                    │                  │          │
 │     ▲ setPrice (ORACLE_ROLE)                         │               │                    │                  │          │
 │     │                                                │               │                    │                  │          │
 │   OptionFactory ──Clones.clone──► ComputeOption #0, #1, … (one per series, holds writer collateral)          │          │
 │     │  ▲ recordActivity / mintPosition (only from     │                                                       │          │
 │     │  │ registered series)                          │                                                       │          │
 │     └──┴──── mint ──► PositionNFT (ERC-721, MINTER_ROLE = factory)                                            │          │
 │                                                                                                               │          │
 │   ComputeVault (ERC-4626, has WRITER_ROLE on factory) ── writeSeries ──► OptionFactory                         │          │
 │                                                                                                               │          │
 │   ComputeFutures (standalone: USDC + oracle only) ◄────────────────────────────────────────────────────────────┘          │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ setPrices                                         ▲ forge script (deploy)
 scripts/oracle-keeper.mjs ◄── Vast.ai public API     contracts/script/Deploy.s.sol → writes deployments/<chainId>.json
```

[CODE: contracts/src/*.sol, contracts/script/Deploy.s.sol, scripts/oracle-keeper.mjs]

## Contracts

All are in `contracts/src/`. Solidity 0.8.24, `evm_version = cancun`, `via_ir = true`, OpenZeppelin v5.4.0. [CODE: contracts/foundry.toml, contracts/foundry.lock]

### MockUSDC (`MockUSDC.sol`)
- Purpose: **testnet-only** settlement token. Name "GpuHedger Test USDC", symbol `USDC`, **6 decimals**.
- State: `faucetAmount` (deploy: 10,000 USDC), `faucetCooldown` (deploy: 0 = none), `lastFaucetAt[addr]`.
- Roles: `Ownable`. The owner (deployer) can `mint`, `setFaucetAmount`, `setFaucetCooldown`. Anyone can call `faucet()`.

### ComputeOracle (`ComputeOracle.sol`)
- Purpose: price per GPU-hour (6dp) + implied volatility (bps) + full price history per asset.
- State: `_prices[asset] = {price, updatedAt, volatilityBps, supported}`, `_history[asset] = PricePoint[]`, `_assets[]`.
- Roles: `DEFAULT_ADMIN_ROLE` (add assets); `ORACLE_ROLE` (set prices and vol). Both go to the deployer at construction.
- Key behaviour: `getPriceAt(asset, ts)` returns the last update at or before `ts` (binary search); used for expiry settlement.

### OptionFactory (`OptionFactory.sol`)
- Purpose: creates series (EIP-1167 clones of one `ComputeOption` implementation), pulls writer collateral, indexes series, mints position NFTs, and records protocol activity and stats.
- State: `_series[]`, `isSeries[addr]`, `approvedOracles`, `approvedTokens`, `_activity[]`, counters (`totalTrades`, `totalContractsTraded`, `totalPremiumVolume`, `totalExercises`, `totalPayouts`, `uniqueTraders`); immutables `optionImplementation`, `positionNFT`.
- Roles: `DEFAULT_ADMIN_ROLE` (approve oracles/tokens), `WRITER_ROLE` (create series), `PAUSER_ROLE` (pause). Deployer gets all three; the **vault also gets `WRITER_ROLE`**. [CODE: Deploy.s.sol]
- `pause()` stops `buyOption` and `exercise` in every series (via `whenNotPaused` in the option). It does **not** stop `claim`, `expire`, futures or the vault. [CODE: ComputeOption.sol, ComputeFutures.sol]

### ComputeOption (`ComputeOption.sol`), one per series
- Purpose: a single option series. It holds the writer's collateral, sells contracts, and handles exercise, settlement and claims.
- State (set once in `initialize`): `factory, writer, seriesId, underlying, region, optionType, strikePrice, expiration, contractSize, premium, maxPayoutPerUnit, settlementToken, oracle, createdAt`. Mutable: `maxContracts, soldContracts, openContracts, exercisedContracts, collateralBalance, totalPaidOut, settled, settlementPrice, settlementPayoutPerContract`, `_positions[]`, `positionTokenId[positionId]`.
- Roles: `writer` only for `reduceCapacity` / `withdrawFreeCollateral`. Position actions require the caller to **hold the position's NFT**.

### PositionNFT (`PositionNFT.sol`)
- Purpose: ERC-721 (enumerable) "GpuHedger Position" / `GPUHEDGE`. One token per position; `positionOf(tokenId) → (option, positionId)`. `tokenURI` is fully onchain JSON + SVG.
- Roles: `MINTER_ROLE` (factory only), `DEFAULT_ADMIN_ROLE` (deployer). Token ids start at 1.

### ComputeVault (`ComputeVault.sol`)
- Purpose: ERC-4626 vault over USDC; shares "GpuHedger LP Vault" / `ghLP` (6 decimals, same as the asset). The manager writes series with pooled USDC; the vault is their `writer`.
- State: `factory` (immutable), `_activeSeries[]` (≤ 50), `_allSeries[]`.
- Roles: `MANAGER_ROLE` (write series, reduce capacity), `DEFAULT_ADMIN_ROLE`. Anyone may `deposit`/`withdraw` (up to idle liquidity) and `harvest`.

### ComputeFutures (`ComputeFutures.sol`)
- Purpose: fully margined, banded forwards. Many markets live in one contract (not clones). The market's writer takes the other side of every position.
- State: `_markets[]` (`Market` struct), `_positions[]`, `_userPositions[user]`, `totalPositions`, `totalNotional`.
- Roles: `WRITER_ROLE` (create markets), `DEFAULT_ADMIN_ROLE` (pause). Pausable on its own (separate from the factory pause).
- Not integrated with the factory: no NFTs, and no entries in the factory activity or stats. [CODE]

## How contracts call each other

| Caller → callee | When |
|---|---|
| OptionFactory → `Clones.clone`, `ComputeOption.initialize` | `createOptionSeries` |
| OptionFactory → `MockUSDC.transferFrom(writer → series)` | `createOptionSeries` (collateral) |
| ComputeOption → `MockUSDC.transferFrom(buyer → writer)` | `buyOption` (premium) |
| ComputeOption → `OptionFactory.mintPosition` → `PositionNFT.mint` | `buyOption` |
| ComputeOption → `OptionFactory.recordActivity` | buy / exercise / expire / claim |
| ComputeOption → `OptionFactory.paused()` | buy / exercise |
| ComputeOption → `PositionNFT.ownerOf` (via `factory.positionNFT()`) | exercise / claim / `getPosition` |
| ComputeOption → `ComputeOracle.getPrice` / `getPriceAt` | exercise, views / settlement |
| ComputeVault → `OptionFactory.createOptionSeries` | `writeSeries` (vault = writer) |
| ComputeVault → `ComputeOption.expire` / `withdrawFreeCollateral` / `reduceCapacity` | `harvest`, `reduceCapacity` |
| ComputeFutures → `ComputeOracle.getPrice` / `getPriceAt`; `MockUSDC` | open / settle |

## Onchain vs offchain vs simulated

| Data | Where it lives | Evidence |
|---|---|---|
| Prices, vol, price history | **Onchain** (ComputeOracle) | [CODE: ComputeOracle.sol] |
| Series terms, positions, balances, collateral, payouts | **Onchain** | [CODE] |
| Trade counts, volume, payouts, unique wallets | **Onchain** counters in OptionFactory (options only) | [CODE: `getStats`] |
| Futures count / notional | **Onchain** (`totalPositions`, `totalNotional`) | [CODE] |
| Tx hashes for activity rows | **Offchain lookup**: `getLogs` of `ActivityRecorded` per recorded block | [CODE: frontend/src/pages/ActivityPage.tsx] |
| Model price, estimated position value, Greeks | **Computed in browser** (Black-Scholes) | [CODE: utils/optionsPricing.ts] |
| 24h/7d change, rental volume, "Market" price-history chart | **Simulated** (deterministic random walk ending at the oracle price) | [CODE: data/marketData.ts] |
| Indicative bid (premium − max(6%, $0.001)) | **Simulated** | [CODE: components/MarketTable.tsx `indicativeBid`] |
| GPU model names, descriptions | Static text | [CODE: data/marketData.ts `GPU_META`] |
| Real rental prices | **Offchain** Vast.ai API → keeper → oracle | [CODE: scripts/oracle-keeper.mjs] |

## Lifecycle: option series

```
createOptionSeries(params)  [writer approves factory for collateral first]
   │  clone + initialize; collateral = cap × size × maxContracts moved writer → series
   ▼
LIVE (now < expiration)
   ├─ buyOption(n, maxPremium)   [buyer approves series for premium] → premium to writer, NFT to buyer
   ├─ exercise(positionId)       [NFT holder, ITM, not paused] → payout at current spot; status Exercised
   ├─ reduceCapacity(n)          [writer] → returns unsold collateral
   └─ withdrawFreeCollateral()   [writer] → returns surplus freed by under-cap exercises
   ▼  block.timestamp >= expiration
EXPIRED, not settled   (open positions show Claimable or Expired via getPosition)
   ├─ expire()           [anyone] → _settle()
   └─ claim(positionId)  [NFT holder] → _settle() if needed, then pay
   ▼  _settle(): price = oracle.getPriceAt(underlying, expiration)
SETTLED: reserved = payoutPerContract × openContracts stays in the series; rest → writer
   └─ claim(positionId) → payout = settlementPayoutPerContract × contracts
```
[CODE: ComputeOption.sol]

Position status values (`GpuHedgerTypes.PositionStatus`): `0 Open`, `1 Exercised` (exercised *or* claimed), `2 Expired` (expired OTM), `3 Claimable` (expired ITM, not yet claimed). Statuses 2 and 3 are **derived in `getPosition`**, never stored. [CODE: ComputeOption.sol `getPosition`]

## Lifecycle: futures position

```
createMarket(F, B, expiry, size, capacity) [writer approves futures; posts B × size × capacity]
   ▼
openPosition(marketId, side, n)  [trader approves futures for margin = B × size × n]
   ▼  block.timestamp >= expiration
settleMarket(marketId)  [anyone; also called by settlePosition] → settlementPrice = getPriceAt(underlying, expiration)
   ▼
settlePosition(positionId) [anyone] → owner gets margin + PnL; writer gets margin + commit − payout
```
[CODE: ComputeFutures.sol]. Positions can't be closed early. [CODE]

## Lifecycle: vault deposit

```
approve(vault, amount) → deposit(amount, receiver) → ghLP shares
manager: writeSeries(params) → vault collateral moves into a new series; premiums flow back to vault
anyone:  harvest(series) → after expiry: expire() returns collateral; else withdraw free collateral
LP:      withdraw(assets, receiver, owner) / redeem(shares, …) ≤ idle USDC
```
[CODE: ComputeVault.sol]

## Deployment (Deploy.s.sol) order and seeded state

MockUSDC → ComputeOracle (H100 $2.00/42%, A100 $1.30/35%, B200 $3.80/55%) → PositionNFT → ComputeOption implementation → OptionFactory → grant MINTER to factory → ComputeVault (+ WRITER on factory) → ComputeFutures → mint 5,000,000 USDC to deployer → **9 deployer-written series** (ids 0–8) → vault deposit $250,000 → **2 vault-written series** (ids 9–10) → **3 futures markets** (ids 0–2) → write `contracts/deployments/<chainId>.json` and `frontend/src/contracts/deployments/<chainId>.json`. [CODE: contracts/script/Deploy.s.sol]

Seeded series (all contractSize 100, cap = strike):

| id | GPU | Type | Strike | Days | Premium/GPU-h | Capacity | Writer |
|---|---|---|---|---|---|---|---|
| 0 | H100 | CALL | 2.20 | 30 | 0.035 | 500 | deployer |
| 1 | H100 | CALL | 2.50 | 30 | 0.004 | 500 | deployer |
| 2 | H100 | PUT | 1.80 | 30 | 0.025 | 500 | deployer |
| 3 | H100 | CALL | 2.00 | 14 | 0.073 | 500 | deployer |
| 4 | H100 | PUT | 2.00 | 60 | 0.140 | 500 | deployer |
| 5 | A100 | CALL | 1.50 | 30 | 0.006 | 500 | deployer |
| 6 | A100 | PUT | 1.20 | 30 | 0.016 | 500 | deployer |
| 7 | B200 | CALL | 4.20 | 60 | 0.215 | 300 | deployer |
| 8 | B200 | PUT | 3.50 | 30 | 0.115 | 300 | deployer |
| 9 | H100 | CALL | 2.40 | 45 | 0.019 | 300 | vault |
| 10 | A100 | PUT | 1.25 | 45 | 0.040 | 300 | vault |

Futures markets: 0 = H100 F $2.05 B $1.00 30d; 1 = A100 F $1.32 B $0.60 30d; 2 = B200 F $3.95 B $1.50 60d; all size 100. Capacities: 500, 500, 300. [CODE: Deploy.s.sol]

Note: series ids depend on creation order, and **expiries are relative to deploy time**. The 14-day series #3 expires first.
