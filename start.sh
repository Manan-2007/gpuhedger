#!/usr/bin/env bash
# GpuHedger one-command launcher (macOS / Linux / Git Bash).
#
#   ./start.sh            Local demo. Starts a local chain (Anvil), deploys and seeds the contracts if they
#                         aren't there yet, runs the frontend with an auto-connected test wallet, and opens
#                         your browser. The chain is saved between runs, so positions survive a restart.
#   ./start.sh testnet    Frontend only, pointed at Monad testnet. Needs MetaMask and a Monad testnet deployment.
#
# Options (environment variables):
#   PORT=5173         Frontend port (Vite picks the next free one if it's taken).
#   WALLET=metamask   Local demo with MetaMask instead of the auto-connected test wallet.
#   FRESH=1           Local demo from a clean chain: wipes the saved state and redeploys.
#   OPEN=0            Don't open the browser.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"

MODE="${1:-local}"
PORT="${PORT:-5173}"
RPC="http://127.0.0.1:8545"
STATE_DIR="$ROOT/contracts/cache" # gitignored
ANVIL_STATE="$STATE_DIR/anvil-state.json"
DEPLOY_JSON="frontend/src/contracts/deployments/31337.json"
# Anvil dev account #0: a public, well-known test key. Local chain only; never use it anywhere else.
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

say() { printf '\033[1;32m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die() {
  printf '\033[1;31m✕\033[0m %s\n' "$*" >&2
  exit 1
}

case "$MODE" in
  local | testnet) ;;
  -h | --help | help)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *) die "Unknown mode '$MODE'. Use: ./start.sh [local|testnet]" ;;
esac

# ---- Prerequisites ---------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js 20+ is required: https://nodejs.org"
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || die "Node.js 20+ is required (found $(node -v))."

if [ ! -d node_modules ]; then
  say "Installing root dependencies…"
  npm install --no-audit --no-fund
fi
if [ ! -d frontend/node_modules ]; then
  say "Installing frontend dependencies…"
  npm --prefix frontend install --no-audit --no-fund
fi

OPEN_FLAG="--open"
[ "${OPEN:-1}" = "0" ] && OPEN_FLAG=""

# ---- Monad testnet ---------------------------------------------------------------------------
if [ "$MODE" = "testnet" ]; then
  if [ ! -f frontend/src/contracts/deployments/10143.json ] && [ -z "${VITE_OPTION_FACTORY_ADDRESS:-}" ]; then
    warn "No Monad testnet deployment found (frontend/src/contracts/deployments/10143.json)."
    warn "The app will open, but markets stay empty until the contracts are deployed and that file is pulled."
  fi
  say "Starting the frontend on Monad testnet (chain 10143). Connect MetaMask in the app. Ctrl+C to stop."
  VITE_CHAIN_ID=10143 \
    VITE_MONAD_RPC_URL="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}" \
    VITE_E2E_MOCK_WALLET=false \
    npm --prefix frontend run dev -- --port "$PORT" $OPEN_FLAG
  exit 0
fi

# ---- Local demo ------------------------------------------------------------------------------
export PATH="$PATH:$HOME/.foundry/bin"
for bin in anvil forge cast; do
  command -v "$bin" >/dev/null 2>&1 || die "Foundry is required for the local demo. Install it with:
    curl -L https://foundry.paradigm.xyz | bash && foundryup
  Or run ./start.sh testnet to use Monad testnet instead."
done

if [ ! -f contracts/lib/forge-std/src/Test.sol ]; then
  say "Fetching contract libraries (git submodules)…"
  git submodule update --init --recursive
fi
# Deploy.s.sol writes here; the folders hold only gitignored files, so a fresh clone lacks them.
mkdir -p contracts/deployments frontend/src/contracts/deployments "$STATE_DIR"

if [ "${FRESH:-0}" = "1" ]; then
  say "FRESH=1: wiping the saved local chain."
  rm -f "$ANVIL_STATE" "$DEPLOY_JSON" contracts/deployments/31337.json
fi

ANVIL_PID=""
cleanup() {
  if [ -n "$ANVIL_PID" ] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    say "Stopping the local chain (state saved to contracts/cache)…"
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  say "Using the local chain already running on $RPC."
else
  say "Starting the local chain (Anvil, 1-second blocks)…"
  anvil --block-time 1 --state "$ANVIL_STATE" --state-interval 10 >"$STATE_DIR/anvil.log" 2>&1 &
  ANVIL_PID=$!
  for _ in $(seq 1 60); do
    cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
    kill -0 "$ANVIL_PID" 2>/dev/null || die "Anvil exited. See contracts/cache/anvil.log"
    sleep 0.25
  done
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || die "Anvil didn't start in time. See contracts/cache/anvil.log"
fi

CHAIN_ID="$(cast chain-id --rpc-url "$RPC")"
[ "$CHAIN_ID" = "31337" ] || die "Something else is running on port 8545 (chain $CHAIN_ID). Stop it and try again."

NEED_DEPLOY=1
if [ -f "$DEPLOY_JSON" ]; then
  FACTORY="$(node -p "require('./$DEPLOY_JSON').optionFactory")"
  [ "$(cast codesize "$FACTORY" --rpc-url "$RPC" 2>/dev/null || echo 0)" != "0" ] && NEED_DEPLOY=0
fi

if [ "$NEED_DEPLOY" = "1" ]; then
  say "Deploying and seeding the contracts (the first run compiles them, which takes a minute)…"
  if ! (cd contracts && forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$ANVIL_KEY" --broadcast) >"$STATE_DIR/deploy.log" 2>&1; then
    tail -n 25 "$STATE_DIR/deploy.log" >&2
    die "Deploy failed. Full log: contracts/cache/deploy.log"
  fi
  say "Contracts deployed: 11 option series, 3 futures markets and the LP vault are live."
else
  say "Contracts already deployed on the local chain."
fi

MOCK=true
[ "${WALLET:-}" = "metamask" ] && MOCK=false
if [ "$MOCK" = "true" ]; then
  say "Test wallet: Anvil account #0 connects automatically (it holds every admin role)."
else
  say "MetaMask: add network 'Localhost 8545' (chain 31337) and import Anvil account #0 (local only)."
fi
say "Opening GpuHedger in your browser. Press Ctrl+C to stop."

VITE_CHAIN_ID=31337 \
  VITE_MONAD_RPC_URL="$RPC" \
  VITE_E2E_MOCK_WALLET="$MOCK" \
  npm --prefix frontend run dev -- --port "$PORT" $OPEN_FLAG
