# Frontend notes (teammate → lead)

Running notes from the frontend side. Newest first.

## 2026-10-09

### Running the app

- `./start.sh` (macOS/Linux/Git Bash) or `start.bat` (Windows) starts everything and opens the browser:
  Anvil with 1-second blocks, deploy + seed if the contracts aren't on the chain yet, frontend with the
  auto-connected test wallet. Chain state persists in `contracts/cache/anvil-state.json` (gitignored), so
  positions survive restarts. `FRESH=1` wipes it; `WALLET=metamask` uses MetaMask; `OPEN=0` skips the browser.
- `./start.sh testnet` runs the frontend against Monad testnet (needs `10143.json` and MetaMask).
- The scripts create `contracts/deployments` and `frontend/src/contracts/deployments` before deploying, which
  works around the fresh-clone bug in `12-OPEN-ISSUES` #1 for local runs. `scripts/deploy-testnet.sh` still needs
  the `mkdir`.
- `start.bat` is untested (written on macOS). Please try it on your Windows machine.

### Monad testnet, checked against the public RPC today

| Check | Result |
|---|---|
| `eth_chainId` | `0x279f` (10143) ✓ |
| Multicall3 at `0xcA11…CA11` | deployed ✓ (wagmi batches reads through it on 10143: ~6 RPC calls per 8 s on Markets) |
| Gas price | ~102 gwei |
| Block time | **300 ms** measured (200 blocks in 60 s). The UI now shows a measured block time instead of "~400ms". |
| `eth_getLogs` | **capped at a 100-block range** (`-32614 eth_getLogs is limited to a 100 range`). The Activity page queries single blocks, so it's fine. Any new log query must stay ≤ 100 blocks. |
| Explorer | `testnet.monadexplorer.com` (viem's default, also in the README) now 308-redirects to **`testnet.monadvision.com`**, path preserved. The frontend links to MonadVision directly. |

I also deployed `Deploy.s.sol` onto a local **fork** of Monad testnet (`anvil --fork-url … --chain-id 10143`) and
ran the frontend in 10143 mode against it: everything loaded with zero console errors. The generated 10143 files
were deleted, so nothing fake is committed. A fork runs Anvil's EVM, not Monad's, so this doesn't prove Monad
compatibility of the bytecode; the real deploy still has to.

### Contract-level issue to be aware of: stale premiums

Premiums are fixed per series. After an oracle move through the strike, an option can pay more if exercised
immediately than it costs (e.g. at H100 $4.00 the $2.20 CALL costs $0.035/GPU-h and pays $1.80/GPU-h). Anyone can
buy and exercise for a risk-free profit at the writer's expense, including the LP vault.

- Frontend: the order ticket shows an amber **Stale premium** warning and the options chain flags the price.
  Buying is still allowed.
- Impact on testnet traction: if the keeper moves prices while testers trade, writers get drained. Suggest keeping
  manual prices during traction and resetting H100 to $2.00 before each recording.
- No contract change requested (frozen); worth naming as a known limitation in the pitch.

### Wallet UX fix

With no wallet installed, CONNECT used to print wagmi's raw `Provider not found. Version: @wagmi/core@2.22.1`.
It now opens a "No wallet found" panel (desktop: install MetaMask; phone: use MetaMask's in-app browser), and
`lib/errors.ts` maps wagmi errors to plain language.

### Requests

1. Deploy to testnet and commit `frontend/src/contracts/deployments/10143.json` (blocks real-MetaMask testing).
2. README: the explorer URL should be `https://testnet.monadvision.com`; `./start.sh` could replace the
   "Running locally" steps. Happy to open a PR if you prefer.
