# 11: Dev setup and workflow

## Prerequisites

- Node **20+** (developed on 20.20.2) and npm 10. [CHAT]
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`). Developed with forge 1.8.5. [CHAT]
- Git. A browser with MetaMask for testnet.
- Developed on Windows 11 + Git Bash; commands below are POSIX shell. [CHAT]

## From a fresh clone to a running frontend on local Anvil

```bash
git clone https://github.com/swagatgrover1013-star/gpuhedger.git && cd gpuhedger
git submodule update --init --recursive          # OpenZeppelin v5.4.0 + forge-std (contracts/lib)
npm install                                       # root: viem for scripts/
npm --prefix frontend install

# IMPORTANT, fresh-clone bug: these folders hold only gitignored files, so they don't exist
# after cloning, and Deploy.s.sol's vm.writeJson fails without them. [CODE: .gitignore; verified 2026-10-08]
mkdir -p contracts/deployments frontend/src/contracts/deployments

cd contracts && forge build && forge test && cd ..   # expect: 42 tests passed

# Terminal A: local chain (1-second blocks)
anvil --block-time 1

# Terminal B: deploy everything + seed markets (Anvil's PUBLIC dev key #0, local only)
cd contracts && forge script script/Deploy.s.sol --rpc-url local \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast && cd ..
# → writes contracts/deployments/31337.json and frontend/src/contracts/deployments/31337.json

npm run demo-flow     # optional sanity check: prints "DEMO FLOW PASSED"

# Frontend against Anvil
cd frontend
printf "VITE_CHAIN_ID=31337\nVITE_MONAD_RPC_URL=http://127.0.0.1:8545\n" > .env.local
# optional: auto-connect a test wallet with no MetaMask (local only)
echo "VITE_E2E_MOCK_WALLET=true" >> .env.local
npm run dev           # http://localhost:5173 (if that port is busy, Vite picks another or use --port)
```

With `VITE_E2E_MOCK_WALLET=true` the app auto-connects Anvil account #0, which holds every admin role and ~$3.7M of test USDC after deploy. It signs via Anvil's unlocked accounts (`eth_sendTransaction`), so no wallet popups appear. [CODE: lib/wagmi.ts, App.tsx `MockAutoConnect`]

With MetaMask on Anvil instead: add network "Localhost 8545", chain ID 31337, and import Anvil key #0 (public test key, **local only**).

Restarting Anvil wipes the chain. Redeploy afterwards (the addresses are deterministic for a fresh Anvil, so the JSON usually doesn't change).

## Against Monad testnet

Contracts are **not deployed yet** [CHAT]. Once the lead deploys, `frontend/src/contracts/deployments/10143.json` will be committed. Then:

```bash
cd frontend
cp .env.example .env      # defaults: VITE_CHAIN_ID=10143, Monad RPC and explorer
npm run dev
```

Connect MetaMask; the app offers **SWITCH TO MONAD TESTNET** (adds chain 10143). Get MON from the faucet, then GET TEST USDC in the app.

## Environment variables (names and purpose only)

| Variable | File | Purpose |
|---|---|---|
| `VITE_CHAIN_ID` | frontend `.env` | `10143` (default) or `31337` |
| `VITE_MONAD_RPC_URL` | frontend | RPC URL override |
| `VITE_EXPLORER_URL` | frontend | explorer base URL override |
| `VITE_USDC_ADDRESS`, `VITE_ORACLE_ADDRESS`, `VITE_OPTION_FACTORY_ADDRESS`, `VITE_POSITION_NFT_ADDRESS`, `VITE_VAULT_ADDRESS`, `VITE_FUTURES_ADDRESS` | frontend | override addresses from the deployments JSON |
| `VITE_E2E_MOCK_WALLET` | frontend | `true` = auto-connect mock wallet (**only honoured on chain 31337**) |
| `VITE_BASE` | build env | sub-path hosting (GitHub Pages sets `/gpuhedger/`) |
| `MONAD_RPC_URL` | contracts `.env` / shell | used by `scripts/deploy-testnet.sh` |
| `DEPLOYER_ACCOUNT`, `DEPLOYER_PASSWORD_FILE`, `MIN_MON` | shell | deploy script options (keystore name, password-file path, minimum balance) |
| `CHAIN_ID`, `RPC_URL`, `ADMIN_KEY`, `BUYER_KEY`, `ORACLE_KEY` | shell only | E2E and keeper scripts; **set in your shell session only, never in files** |
| `MAX_MOVE_PCT`, `MIN_CHANGE_PCT` | shell | keeper guards (defaults 25 / 1) |

Templates: `/.env.example`, `frontend/.env.example`, `contracts/.env.example`. [CODE]

## Commands

| Task | Command |
|---|---|
| Contract tests | `cd contracts && forge test -vv` (42 tests) |
| Gas report | `cd contracts && forge test --gas-report` |
| Typecheck | `npm --prefix frontend run typecheck` |
| Production build | `npm --prefix frontend run build` |
| Regenerate ABIs (after any contract change) | `cd contracts && forge build && cd .. && node scripts/export-abis.mjs` |
| Core demo E2E (onchain) | `npm run demo-flow` (local by default) |
| Extensions E2E (time travel) | throwaway `anvil --chain-id 31338 --port 8546`, deploy to it, then `CHAIN_ID=31338 RPC_URL=http://127.0.0.1:8546 node scripts/e2e-extensions.mjs` [CODE: header of the script]. Delete the generated `31338.json` files afterwards |
| Oracle keeper (dry run) | `node scripts/oracle-keeper.mjs` |
| Testnet deploy (lead only) | `bash scripts/deploy-testnet.sh` (refuses below 4 MON; uses the encrypted keystore `gpuhedger-deployer`) |

## Redeploying contracts

- Every deploy creates **new addresses** and fresh markets with expiries relative to deploy time. All positions and traction from the previous deployment are left behind (still onchain, but not shown). **Avoid redeploying testnet after traction collection starts.** [CHAT]
- After a redeploy: commit the new `frontend/src/contracts/deployments/10143.json` (and `contracts/deployments/10143.json`). The frontend needs no code change.
- If contract code changed: `forge build`, then `node scripts/export-abis.mjs`, then commit `frontend/src/contracts/abis/*`.

## Collaboration plan

| Area | Owner | Rule |
|---|---|---|
| `contracts/**` (src, test, script, foundry config) | Lead | **Frozen** for the hackathon |
| `contracts/deployments/*`, `frontend/src/contracts/deployments/*` | Lead | Written only by deploys |
| `frontend/src/contracts/abis/*` | Lead | Generated; never hand-edit |
| `scripts/**`, `.github/**`, root `package.json`, `.gitignore` | Lead | Ask first |
| `frontend/**` (everything else) | **Teammate** | Free to refactor and restyle |
| `docs/handoff/**` | Lead | Teammate may append notes in a new file `docs/handoff/NOTES-frontend.md` |
| `README.md` | Lead | Teammate proposes edits via PR |

**Requesting a contract change:** open a GitHub issue titled `contract-change: …` stating what the UI needs, why, and whether a frontend-only workaround exists. Assume the answer is "no" before the deadline, because any change means redeploy + new addresses + lost traction. Prefer reads that combine existing view functions client-side.

**Branches and PRs:** `main` is always demo-ready. Use branches `fe/<short-topic>` (e.g. `fe/portfolio-redesign`). Small PRs; squash merge; a PR must pass `npm --prefix frontend run build`. Don't force-push `main`. [PLANNED convention; confirm with the lead]

**Avoid merge conflicts:** don't reformat files you aren't changing; don't touch the generated ABI or deployment files; keep `hooks/*` signatures stable or update all callers in the same PR; announce renames of shared components (`ui.tsx`, `TransactionStatus`) before doing them.

**Secrets:** never commit `.env`, keys, keystores or seed phrases (`.gitignore` covers `.env*`, `*.key`, `keystore/`). The Anvil keys in docs are public test keys and fine to share. [CODE: .gitignore]
