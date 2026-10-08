# Brief for the frontend agent

You are building the production frontend for **GpuHedger**, an onchain options and futures market that lets AI companies hedge GPU compute prices on **Monad testnet** (chain ID `10143`). It's a hackathon entry (Monad Metropolis, *Onchain Finance & Trading*). The deadline is **2026-10-14 09:29 IST**.

## Mission

Ship a trustworthy, legible trading UI that runs the demo below on Monad testnet, end to end, with real transactions:

> Connect wallet → get test USDC → open the H100 market at $2.00/GPU-hour → buy 10 CALLs at strike $2.20 (pay $35) → admin moves the H100 oracle price to $4.00 → portfolio shows the position in the money → EXERCISE → **SETTLED ✓**, $1,800 paid in about a second.

Judging weights: Technical 20%, **Design & Craft 20%** (legible pricing and risk disclosure), Originality 15%, **Founder/Market 25%**, **Traction 20%**.

## Read first, in this order

1. `docs/handoff/04-CONTRACT-INTERFACE.md`: every function, unit, revert and approval.
2. `docs/handoff/07-USER-FLOWS.md`: screens, button states and exact copy.
3. `docs/handoff/06-FEATURES-AND-MVP.md`: P0/P1/P2 and the 5-day build order.
4. `docs/handoff/05-FRONTEND-CURRENT-STATE.md`: what exists and what to keep.
5. `docs/handoff/08-DATA-AND-STATE.md`: types, decimals, polling, pricing test vectors.
6. `docs/handoff/02-DOMAIN-CONCEPTS.md`: read this if "strike" or "premium" is unclear.

## Rules (non-negotiable)

1. **Do not modify `contracts/`, `scripts/`, `.github/` or `contracts/deployments/`.** Contracts are frozen. Request changes via the process in `11-DEV-SETUP-AND-WORKFLOW.md`.
2. **Never fake** a transaction hash, balance, confirmation, position, payout or trade count. Every one must come from the chain.
3. **Label every simulated number** (24h change, rental volume, price-history chart, indicative bid) with a visible "Simulated" tag, as the current UI does.
4. **USDC has 6 decimals.** Do transaction maths in `bigint` raw units (e.g. `premiumRaw * BigInt(contractSize) * BigInt(contracts)`); use floats only for display.
5. Before every write: **simulate** it, then show *Signature required → Submitted → Confirming → Settled ✓* with the tx hash, an explorer link and the measured settlement time. Map reverts to the friendly messages in `04-CONTRACT-INTERFACE.md`; never show raw Solidity errors alone.
6. Show **max loss, break-even, potential profit (capped) and the risk disclosure** before any purchase.
7. Never ask for or handle private keys or seed phrases. Browser wallets only.
8. Read addresses from `frontend/src/contracts/deployments/<chainId>.json` or `VITE_*_ADDRESS` env vars. Never hardcode them.

## Starting point

`frontend/` already works end to end on a local Anvil chain: React 18, Vite 6, wagmi 2, viem 2, Tailwind 4, Recharts 2. Typecheck is clean and the build succeeds. **Recommended: evolve it, don't rewrite it.** The hooks and the transaction lifecycle are solid; spend your time on Design & Craft and the P0 flows. See `05-FRONTEND-CURRENT-STATE.md` for the keep/rewrite list.

Run locally against Anvil with the auto-connected test wallet (no MetaMask needed), using the steps in `11-DEV-SETUP-AND-WORKFLOW.md`.

## Definition of done

- [ ] Every P0 item in `06-FEATURES-AND-MVP.md` meets its acceptance criteria **on Monad testnet** with a real browser wallet (MetaMask).
- [ ] Wrong network, rejected signature, insufficient USDC/MON and out-of-the-money states all show clear messages.
- [ ] Every simulated value is labeled; every onchain value is real.
- [ ] Mobile (390 px wide): no horizontal scroll; buy, exercise and claim are usable.
- [ ] `npm run build` passes with zero TypeScript errors; zero console errors on every page.
- [ ] The 3-minute demo in `10-DEMO-AND-PITCH.md` can be recorded without editing or retakes.
