# GpuHedger handoff pack: index

> Written 2026-10-08 by the lead engineer for the teammate building the production frontend.
> Hackathon: **Monad Metropolis**, track *Onchain Finance & Trading*. Deadline **2026-10-14 09:29 IST**. [CHAT]

## The project in 5 lines

1. GpuHedger is an onchain market for **hedging GPU compute prices** (H100, A100, B200, priced in USD per GPU-hour). [CODE: contracts/src]
2. AI companies buy **options** (calls cap a future compute bill) or **futures** (lock an exact price), cash-settled in a test stablecoin. [CODE: contracts/src/ComputeOption.sol, ComputeFutures.sol]
3. Every option series is **fully collateralized**: the seller locks the maximum possible payout up front, so every payout is funded. [CODE: contracts/src/OptionFactory.sol]
4. Liquidity providers can pool USDC in an **ERC-4626 vault** that sells options and earns premiums; every position is a transferable **NFT**. [CODE: ComputeVault.sol, PositionNFT.sol]
5. It targets **Monad testnet** (chain 10143) for ~1-second settlement. It is fully working on a local chain but **not yet deployed to Monad testnet**. [CHAT] [CODE: contracts/deployments/ has only 31337.json, which is gitignored]

## Reading order

| # | File | Read it when |
|---|---|---|
| 0 | `FRONTEND_AGENT_BRIEF.md` | First. One page: mission, rules, definition of done |
| 1 | `00-INDEX.md` (this file) | Glossary lookups |
| 2 | `01-PRODUCT-OVERVIEW.md` | What we're building and why it should win |
| 3 | `02-DOMAIN-CONCEPTS.md` | You've never priced an option. Start here |
| 4 | `04-CONTRACT-INTERFACE.md` | **Most important.** Every call the UI makes |
| 5 | `07-USER-FLOWS.md` | Screen-by-screen behaviour and copy |
| 6 | `06-FEATURES-AND-MVP.md` | What to build first (5-day plan) |
| 7 | `05-FRONTEND-CURRENT-STATE.md` | What already exists and what to keep |
| 8 | `08-DATA-AND-STATE.md` | Types, units, polling, pricing maths and test vectors |
| 9 | `09-UX-DESIGN-GUIDANCE.md` | Look, tone, trust, Monad-speed moments |
| 10 | `03-ARCHITECTURE.md` | How the contracts fit together |
| 11 | `10-DEMO-AND-PITCH.md` | The demo you are building towards |
| 12 | `11-DEV-SETUP-AND-WORKFLOW.md` | Run it locally and on testnet; who owns what |
| 13 | `12-OPEN-ISSUES-AND-DECISIONS.md` | Known bugs, risks, questions for humans |

## Evidence tags used throughout

- `[CODE: path]`: verified in the code on 2026-10-08.
- `[CHAT]`: decided or observed in the build conversation; not visible in code.
- `[PLANNED]`: intended, not built.
- `[UNKNOWN]`: not verified; a human must confirm.

## Glossary

Terms are defined in plain language. Worked examples are in `02-DOMAIN-CONCEPTS.md`.

| Term | Meaning in GpuHedger |
|---|---|
| **GPU-hour** | One GPU rented for one hour. The unit everything is priced in. |
| **Underlying** | The thing an option's value depends on: here, the price of one GPU-hour of H100, A100 or B200. Stored onchain as `bytes32` text, e.g. `"H100"`. [CODE: interfaces/IGpuHedger.sol] |
| **Spot price** | The current price per GPU-hour, as reported by the oracle. |
| **Oracle** | The contract that publishes the spot price onchain (`ComputeOracle`). In this MVP it is **permissioned**: only wallets with `ORACLE_ROLE` can set prices. [CODE: ComputeOracle.sol] |
| **Option** | A contract that gives its holder the *right, not obligation*, to a payout if the price moves past a level. |
| **Call** | Pays out when the price goes **up** past the strike. Used by compute *buyers* (AI startups) to cap costs. |
| **Put** | Pays out when the price goes **down** past the strike. Used by compute *sellers* (GPU providers) to protect revenue. |
| **Strike** | The price level the option is measured against, in USD per GPU-hour (e.g. $2.20). |
| **Premium** | The price you pay to buy the option, quoted **per GPU-hour** (e.g. $0.035). Total cost = premium × contract size × contracts. |
| **Contract size** | GPU-hours covered by one contract. All seeded markets use **100**. [CODE: contracts/script/Deploy.s.sol] |
| **Contracts** (quantity) | How many contracts the user buys. 10 contracts × 100 GPU-h = 1,000 GPU-hours covered. |
| **Expiry / expiration** | Unix timestamp after which the option can't be bought or exercised; it settles instead. |
| **Intrinsic value** | What the option would pay right now: call = max(spot − strike, 0); put = max(strike − spot, 0), per GPU-hour. |
| **ITM / OTM / ATM** | In the money (intrinsic > 0), out of the money (intrinsic = 0), at the money (spot = strike, also pays 0). |
| **Payout cap** (`maxPayoutPerUnit`) | The maximum the option pays per GPU-hour. It exists so each series can be fully collateralized. Seeded series set cap = strike. [CODE: Deploy.s.sol] |
| **Collateral** | USDC locked in the option contract to guarantee payouts. Per contract = cap × contract size. |
| **Fully collateralized** | The maximum possible payout is locked before anyone buys, so there's no counterparty risk for buyers. |
| **Writer** | The party that *sells* options: posts collateral and receives premiums. In the demo, the admin wallet or the LP vault. |
| **Series** | One specific option: GPU + call/put + strike + expiry + region. Each is its own contract (a `ComputeOption` clone). Identified by `seriesId` (0, 1, 2…). |
| **Position** | One purchase by one buyer in one series. Identified by `positionId` within its series and by a global NFT `tokenId`. |
| **Position NFT** | An ERC-721 token minted on every purchase. Whoever holds it owns the position. [CODE: PositionNFT.sol] |
| **ERC-721** | The standard for unique tokens (NFTs). Wallets and explorers display them. |
| **Exercise** | Claiming the payout of an ITM option **before** expiry, at the current spot price. |
| **American-style** | Can be exercised any time before expiry (vs European: only at expiry). GpuHedger options are American-style. [CODE: ComputeOption.sol `exercise`] |
| **Settlement** | After expiry, the series records the oracle price *in effect at the expiry timestamp* and reserves what ITM holders are owed. [CODE: ComputeOption.sol `_settle`] |
| **Claim** | After settlement, an ITM holder calls `claim()` to receive their payout. |
| **Break-even** | Spot price at which payout equals premium paid: call = strike + premium; put = strike − premium. |
| **Max loss** | For an option buyer: the premium paid. Nothing more. |
| **Futures / forward** | An agreement to settle the difference between a fixed *forward price* and the future spot price. No premium. [CODE: ComputeFutures.sol] |
| **Long / Short** | Long gains when the price rises (an AI startup locking cost); Short gains when it falls (a provider locking revenue). |
| **Forward price (F)** | The fixed price a futures market locks in, per GPU-hour. |
| **Band (B)** | Max price move per GPU-hour a futures market settles; gains and losses are capped at ±B. |
| **Margin** | USDC a futures trader posts: B × contract size × contracts. Also the max they can lose. |
| **LP (liquidity provider)** | Someone who deposits USDC into the vault so it can write options. Earns premiums; loses if payouts are large. |
| **Vault / ERC-4626** | A standard "tokenized vault": deposit an asset (USDC) and receive shares (`ghLP`) whose value tracks the vault's assets. [CODE: ComputeVault.sol] |
| **NAV** | Net asset value: what the vault is worth. Idle USDC plus collateral in live series, minus what holders could currently claim. |
| **Harvest** | Pulling collateral back into the vault from settled or over-collateralized series. Anyone can call it. |
| **USDC / MockUSDC** | The settlement token. **Testnet-only** mock with **6 decimals** and a public faucet; has no value. [CODE: MockUSDC.sol] |
| **MON** | Monad's native gas token. Users need testnet MON to pay gas. |
| **Gas limit charging** | Monad charges for the gas *limit* a transaction declares, not the gas used. [CHAT] |
| **Implied volatility (IV)** | How much the market expects prices to swing, as an annual %. Stored per GPU in the oracle in basis points (4200 = 42%). Used only by the frontend pricing model. |
| **Black-Scholes** | A standard formula for an option's fair price. The frontend uses it for *indicative* model prices only; the onchain premium is fixed per series. |
| **Basis points (bps)** | 1/100th of a percent. 4,200 bps = 42%. |
| **Roles** | Permissions from OpenZeppelin `AccessControl`: `ORACLE_ROLE`, `WRITER_ROLE`, `PAUSER_ROLE`, `MANAGER_ROLE`, `MINTER_ROLE`, `DEFAULT_ADMIN_ROLE`. See `03-ARCHITECTURE.md`. |
| **Clone (EIP-1167)** | A tiny proxy contract that reuses one implementation's code. Each series is a clone, which halved deployment gas. [CODE: OptionFactory.sol] |
| **Anvil** | Foundry's local test blockchain (chain 31337). |
| **Keeper** | The script `scripts/oracle-keeper.mjs` that pushes real GPU rental prices (from Vast.ai) to the oracle. |
