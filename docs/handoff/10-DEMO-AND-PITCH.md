# 10: Demo and pitch

Hackathon deliverables: public repo · **3-min demo video** of the live product · **2-min pitch video** · deployed live product on Monad testnet or mainnet with access instructions. [CHAT]

## Setup before recording (checklist)

1. Contracts deployed on Monad testnet; `frontend/src/contracts/deployments/10143.json` committed; site hosted. [PLANNED]
2. **Admin wallet** = the deployer `0x4AcEfCFe956Ab7b42Da1a00bf6A4F07b46C215D3` (holds every admin role) [CHAT]. Import it into MetaMask **only if** the lead decides to (its key lives in an encrypted Foundry keystore on the lead's machine), or run the admin steps from the lead's machine. [UNKNOWN: who operates admin during recording]
3. **Buyer wallet**: a *different* MetaMask account with ≥ 0.5 MON and ≥ $100 test USDC. Recommended so the trade isn't the admin buying from itself (premiums go to the writer). [CHAT recommendation]
4. Admin page: click **H100 → $2.00**. Confirm the Markets page shows H100 **$2.00**.
5. The **oracle keeper must not be running** (it would overwrite manual prices). [CODE: scripts/oracle-keeper.mjs header]
6. Open tabs in order: `/`, `/hedge`, `/trade?series=0&qty=10`, `/portfolio`, `/admin`, `/activity`.
7. Browser zoom ~110%, 1440 px window, dark OS theme; close other tabs and extensions' popups.

**Reset between takes:** Admin → **H100 → $2.00**. Each take buys a new position (old exercised positions stay in the Exercised tab; that's fine and adds traction).

## 3-minute demo video: click by click, with expected values

Values assume the seeded series #0 (H100 CALL $2.20, premium $0.035, cap $2.20, size 100). [CODE: Deploy.s.sol]

| Time | Screen / action | Expected on screen | Say |
|---|---|---|---|
| 0:00 | Landing `/` | Headline "HEDGE THE FUTURE OF COMPUTE"; live oracle widget H100 **$2.00**, A100 $1.30, B200 $3.80 | "AI companies' biggest input cost, GPU compute, has no hedging market. GpuHedger is that market, on Monad." |
| 0:15 | `/hedge`, "I buy compute", H100, **5,000** GPU-hours, stress price **4.00** | Recommended "CALL $2.00 · 14D · US-West", **50 contracts**, cost **$365.00**, locked max price **$2.07/h**, hedged cost in stress **$10,365** vs **$20,000** unhedged, saved **$9,635** [CHAT: local screenshot] | "A startup needing 5,000 H100 hours caps its cost near $2.07 an hour for $365." |
| 0:40 | `/trade?series=0&qty=10` | H100 CALL K $2.20, 10 contracts, total **$35.00**, break-even **$2.235/h**, max loss **$35.00**, potential profit **up to $2,165.00**, model price **≈ $0.032** | "Simple version: ten calls, strike $2.20. Max loss is the premium. Payout is fully collateralized." |
| 0:55 | Tick the risk box → **APPROVE $35.00 USDC** → wallet confirm | "SETTLED ✓ in X.XXs" | "Every step is a real Monad transaction." |
| 1:05 | **BUY CALL** → confirm | "SETTLED ✓ in X.XXs", tx hash, **View on Explorer ↗** (click it briefly) | "Settled in under a second." |
| 1:20 | `/portfolio` Open tab | Row: H100 CALL $2.20, 10 contracts, entry $35.00, current value* **≈ $32**, P&L **≈ −$3** (model estimate), status OPEN, button **OTM** | "It's insurance. Right now it's out of the money." |
| 1:35 | `/admin` → **H100 → $4.00 (spike)** | "SETTLED ✓", "Oracle updated onchain. Portfolios re-mark on the next block." | "Now the GPU market spikes: H100 doubles." |
| 1:50 | `/portfolio` (no manual refresh needed; ~3 s) | Exercise value **$1,800.00**, P&L **+$1,765.00**, button **EXERCISE** | "Our hedge is deep in the money." |
| 2:05 | **EXERCISE** → confirm | Banner "SETTLED ✓ … H100 CALL $2.20 exercised · payout **$1,800.00** settled in USDC directly to your wallet"; tab switches to Exercised; USDC balance +$1,800 | "Eighteen hundred dollars, in about a second. The bill rose $2,000; the hedge covered $1,765 net." |
| 2:25 | `/activity` | Trades/wallets/volume/payouts counters; rows Purchase / Exercise with tx links | "Every trade is onchain and linked to its transaction." |
| 2:40 | Quick tour: `/futures`, `/vault` | Futures forward/band cards; vault NAV and premiums earned | "Futures lock an exact price; LPs earn the premiums in a vault." |
| 2:50 | Back to landing | | "GpuHedger: hedge the future of compute." |

Why the "≈ −$3" and not "−$35" at 1:20: open positions are valued at max(model value, exercise value). The model value is 0.032235 × 1,000 = $32.24, so P&L ≈ −$2.76. [CODE: hooks/usePortfolio.ts; test vector in `08-…`] **The README's demo step 7 says "P&L −$35"; that's wrong.** Over 30 days the time value decays toward −$35 if H100 stays below $2.20.

Backup if the oracle or RPC is slow: re-record; never edit numbers in post. If testnet is down, record on local Anvil and say so on screen. [UNKNOWN: whether judges accept that]

## 2-minute pitch video outline

1. **Hook (0:00–0:15):** "Five thousand H100 hours cost $10,000 today and could cost $20,000 next month. AI startups can't hedge that."
2. **Problem (0:15–0:35):** compute is the commodity of AI, with opaque bilateral contracts and volatile pricing. Show the real Vast.ai spread observed on 2026-10-08: H100 offers from ~$1.48 to ~$9.03/GPU-h, median ~$3.02. [CHAT]
3. **First user (0:35–0:50):** AI startups renting GPUs month to month. **Name the design partner here: [UNKNOWN, a human must supply this].**
4. **Solution (0:50–1:15):** options + futures on GPU-hours, fully collateralized, cash-settled on Monad; the hedge calculator speaks the customer's language.
5. **Why now / why Monad (1:15–1:30):** sub-second settlement, low fees for 100-GPU-hour contracts.
6. **Traction (1:30–1:45):** live testnet numbers from `/activity`. **[UNKNOWN until testnet usage exists]**
7. **Roadmap + ask (1:45–2:00):** real price index, permissionless writers, order book, institutional desks.

A 14-slide deck draft exists as a private Claude artifact: `https://claude.ai/artifact/NAnDPimFQbAw7Em56kRC39`. It has placeholders `[Team name]`, `[Hackathon name]`, `[__]` traction figures, `[live app link]`, `[date]`. [CHAT] An older 2-minute *demo* script is in `docs/DEMO_SCRIPT.md`. It predates this file and is shorter than the required 3 minutes. [CODE]

## Deliverables checklist (status 2026-10-08)

| Deliverable | Status | Blocker / next step |
|---|---|---|
| Public GitHub repo | ✅ Public since 2026-10-08: `github.com/swagatgrover1013-star/gpuhedger` [CHAT] | Keep README accurate (see `12-…`) |
| Contracts on Monad testnet | ❌ | Fund `0x4AcE…15D3` with ≥ 4 MON; fix the fresh-clone `deployments/` dir bug; run `bash scripts/deploy-testnet.sh` |
| Live hosted frontend | ❌ | After deploy: Vercel (needs an account) or GitHub Pages (workflow ready; enable Pages) [CODE: .github/workflows/deploy-pages.yml] |
| Access instructions | 🟡 | README covers local and testnet setup; add the live URL, "how to get MON", and which wallet is admin |
| 3-min demo video | ❌ | Script above |
| 2-min pitch video | ❌ | Outline above; needs a named first user and traction numbers |
| Pitch deck | 🟡 Draft, private | Fill placeholders; share from the artifact's Share menu |
| Traction (testnet trades) | ❌ | Recruit ≥ 10 wallets to trade on testnet before Oct 13 |
| Named first user | ❌ [UNKNOWN] | Human decision |
