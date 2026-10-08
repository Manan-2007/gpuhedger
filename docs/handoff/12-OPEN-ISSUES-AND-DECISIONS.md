# 12: Open issues and decisions

## Decision log

| # | Decision | Rejected alternative | Why |
|---|---|---|---|
| D1 | **Foundry** for contracts | Hardhat | Spec preferred Foundry; fast fuzz tests. [CHAT] |
| D2 | Each series is an **EIP-1167 clone** of one `ComputeOption` | `new ComputeOption(...)` per series | Monad charges for the gas *limit*; clones cut full deployment from ~36M to ~17M gas (before the later extensions; now ~29M). [CHAT] |
| D3 | **Fully collateralized with a payout cap** (default cap = strike) | Uncapped calls / margin accounts | Every payout must be funded up front; uncapped calls can't be. Calls are therefore call spreads. [CHAT] [CODE: OptionFactory `_validate`] |
| D4 | **American exercise + settlement at the expiry price + claim** | The original "unexercised positions expire worthless" | Users offline at expiry shouldn't lose ITM value; settlement uses `getPriceAt(expiration)` so later updates can't manipulate it. [CHAT] [CODE: ComputeOption `_settle`] |
| D5 | **Positions are ERC-721 (Enumerable) NFTs** | Per-user arrays inside each series (the first version); ERC-1155 | Transferable hedges; wallet and explorer visibility; ownership = token holder. [CHAT] |
| D6 | **Permissioned oracle** + keeper fed by Vast.ai | Chainlink/Pyth | No GPU-hour price feed exists on those networks [CHAT, unverified UNKNOWN]; the interface `IComputeOracle` is swappable. |
| D7 | **Fixed premium per series**, paid straight to the writer | AMM / order book / dynamic pricing | Hackathon scope; the frontend shows a model price for comparison. [CHAT] |
| D8 | **Stats and activity recorded onchain in the factory** | An event indexer / subgraph | Avoids RPC `getLogs` range limits; one view call powers the traction page. [CHAT] |
| D9 | **Futures as one standalone contract**, banded and fully margined, no early close, not NFTs | Futures via the factory / perpetuals | Scope; equal margin both sides keeps it fully funded. [CHAT] |
| D10 | **Vault NAV marks liabilities at intrinsic value**; withdrawals limited to idle USDC | Model-value NAV | Simple and conservative onchain; no oracle for volatility time value. [CHAT] |
| D11 | `via_ir = true` | Splitting functions | "Stack too deep" in `PositionNFT.tokenURI`. [CHAT] [CODE: foundry.toml] |
| D12 | `evm_version = cancun` | `prague` | Conservative for Monad compatibility (OZ 5.4 may emit `mcopy`). Unverified on Monad [UNKNOWN] |
| D13 | MockUSDC with a public faucet, cooldown 0, 10,000 per call | Real USDC | Testnet; frictionless demos. [CODE: Deploy.s.sol] |
| D14 | Frontend: Vite + React + wagmi `injected()` only; simulate before every write; poll, not websockets; **exact-amount approvals** | RainbowKit / WalletConnect; infinite approvals | Fewer dependencies (no WalletConnect project id); safety. [CHAT] |
| D15 | wagmi `mock` connector gated to chain 31337 + env flag | No automated UI tests | Allowed headless-browser E2E without MetaMask. [CODE: lib/wagmi.ts] |
| D16 | Deployer = a new Foundry keystore `gpuhedger-deployer` (`0x4AcEfCFe956Ab7b42Da1a00bf6A4F07b46C215D3`) on the lead's machine | Using a personal wallet | Keeps keys out of the repo. [CHAT] |
| D17 | Repo made **public** on 2026-10-08 | Private | Hackathon requirement; enables free GitHub Pages. [CHAT] |
| D18 | `region` is display-only metadata | Region-specific prices | The oracle has one price per GPU; region doesn't affect settlement. [CODE: ComputeOption.sol] |

## Known bugs (ordered by impact)

1. **Fresh-clone deploy fails.** `contracts/deployments/` and `frontend/src/contracts/deployments/` contain only gitignored files, so they don't exist after `git clone`. `Deploy.s.sol` then reverts at `vm.writeJson` ("The system cannot find the path specified"). Verified 2026-10-08. Because Forge simulates before broadcasting, **no funds are lost**, but deploy is impossible until someone runs `mkdir -p contracts/deployments frontend/src/contracts/deployments`. Fix: add `.gitkeep` files or a `mkdir` in `scripts/deploy-testnet.sh`. The lead's local checkout is unaffected. [CODE: .gitignore, Deploy.s.sol `_writeDeployment`]
2. **Fallback prices labeled as oracle prices** when the oracle read fails (H100 shows $2.14 as "Oracle $2.14" in the payoff chart). [CODE: hooks/useOracle.ts, PayoffChart.tsx]
3. **README demo step 7 is wrong:** it says the open position shows "P&L −$35"; the portfolio actually shows ≈ −$3 (model value). [CODE: README.md "Hackathon demo flow"; hooks/usePortfolio.ts]
4. **README "Running locally" omits the `mkdir` step** from bug 1, so following it on a fresh clone fails. [CODE: README.md]
5. Portfolio totals exclude futures and vault shares. [CODE: usePortfolio.ts]
6. The activity feed omits futures trades. [CODE: ComputeFutures.sol has no factory hook]
7. Two wallet confirmations per buy (exact approvals). [CODE: TradePanel.tsx]
8. `lib/viem.ts` is unused. [CODE]

## Untested paths (high risk for the live demo)

Real MetaMask connection · wrong-network switch / add-chain · everything on Monad testnet (RPC, gas, `getLogs`, explorer links, settlement time) · Claim UI · futures Settle UI · vault Withdraw/Harvest UI · Admin create series (both writers) · Admin create futures market · Admin pause · Admin vol update · `scripts/deploy-testnet.sh` · GitHub Pages workflow · Vercel config. [CHAT]

## Security and correctness risks

1. **Oracle centralization:** `ORACLE_ROLE` can set any price within $0–$10,000 and instantly make chosen options ITM, draining writers (incl. the LP vault). There's no staleness check, no deviation limit onchain, no timelock. Acceptable for a demo; **must be disclosed**. [CODE: ComputeOracle.sol, ComputeOption.sol `exercise`]
2. **Admin = writer = oracle in the demo:** self-dealing is trivially possible. [CODE: Deploy.s.sol]
3. **Vault NAV ignores time value:** a depositor entering when options are OTM-but-valuable gets shares at an inflated NAV relative to the true liability; withdrawals are capped at idle USDC, so LPs can be stuck while collateral is locked. [CODE: ComputeVault.sol]
4. **ERC-4626 first-depositor inflation:** mitigated only by the 250,000 USDC seed deposit in `Deploy.s.sol`; no virtual-offset override. [CODE]
5. `claim`, `expire`, futures and the vault ignore the factory pause; futures have their own pause. [CODE]
6. Unbounded loops in views (`getAllSeriesDetails`, `getUserPositions`): fine at ~10 series, may hit RPC `eth_call` gas limits at hundreds [UNKNOWN for Monad].
7. Activity storage grows forever (one array push per action). [CODE]
8. **Keeper vs demo prices:** real Vast.ai medians (2026-10-08: H100 ≈ $2.94, A100 ≈ $0.87, B200 ≈ $7.81) differ widely from seeded prices. Running the keeper moves every market (±25% per run) and can push seeded series deep ITM/OTM. [CHAT]
9. Not audited. Tests: 42 unit/fuzz tests + 2 E2E scripts. [CODE]
10. Measured settle time includes up to ~250 ms of polling granularity (an upper bound, not an exact latency). [CODE: useTransaction.ts]

## Unfinished work

Testnet deployment · hosting · demo and pitch videos · a named first user · testnet traction · decentralized price feed · permissionless writers · order book / secondary market UI · futures early close · WalletConnect · frontend unit tests and lint · code-splitting. [PLANNED]

## README / code mismatches and misleading claims

| Where | Claim | Reality |
|---|---|---|
| README "Hackathon demo flow" step 7 | "open position (OTM, P&L −$35)" | ≈ −$3 shown (model value) |
| README "Running locally" | the commands work on a fresh clone | Fails without `mkdir` (bug 1) |
| README "Deploying" | "One command" | Same bug on fresh clones; never run against testnet |
| Landing "~400ms block time / ~800ms finality" and the deck | presented as product facts | Monad's published figures, not measured by us on testnet |
| Landing / deck "settles in about a second" | | Only measured locally (0.27–1.1 s) |
| Landing roadmap "Phase 1: Live" | | "Live" means working locally; nothing is live on testnet yet |
| `docs/DEMO_SCRIPT.md` | "2-minute demo script" | Hackathon asks for a 3-minute demo video; superseded by `10-DEMO-AND-PITCH.md` |
| Problem statement "no way to hedge compute" | | Competitive landscape not researched [UNKNOWN] |

## Questions only a human can answer

1. **Who is our named first user / design partner?** Anyone we have actually spoken to? (Founder/Market = 25%.)
2. Team name, member names and roles, and submission-form fields for the deck and videos.
3. Has anyone checked for existing GPU-compute price indices or derivatives products? What's our honest "why doesn't this exist yet" answer?
4. Who funds the deployer `0x4AcE…15D3` with ≥ 4 testnet MON, and by when (target Oct 10)?
5. Hosting: Vercel (whose account?) or GitHub Pages (now possible since the repo is public)?
6. Do judges require mainnet, or is testnet enough?
7. Approval UX: keep exact approvals (2 popups per buy), or approve a larger amount once?
8. Who operates the admin wallet during the demo recording, and on which machine (the deployer keystore only exists on the lead's machine)?
9. On testnet, should the keeper feed real prices continuously, or keep manual prices for a predictable demo?
10. Traction plan: who recruits testers, how many wallets, and do we fund their MON?
11. Should futures and the vault be featured in the 3-minute demo, or shown briefly as "beta"?
12. If Monad testnet is degraded on recording day, is a local-Anvil recording acceptable?
13. Who presents the 2-minute pitch on camera?
14. Do we want a one-line regulatory/compliance disclaimer beyond "testnet, no real value"?
