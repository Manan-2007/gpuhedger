#!/usr/bin/env bash
# One-command Monad Testnet deployment using the encrypted Foundry keystore "gpuhedger-deployer".
#   bash scripts/deploy-testnet.sh
# The deployer must hold ~4 MON (Monad charges for the gas limit). Fund it at https://faucet.monad.xyz
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACCOUNT="${DEPLOYER_ACCOUNT:-gpuhedger-deployer}"
PASSWORD_FILE="${DEPLOYER_PASSWORD_FILE:-$HOME/.foundry/gpuhedger-deployer.password}"
RPC="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"
MIN_MON="${MIN_MON:-4}"

PW_ARGS=()
[ -f "$PASSWORD_FILE" ] && PW_ARGS=(--password-file "$PASSWORD_FILE")

ADDRESS=$(cast wallet address --account "$ACCOUNT" "${PW_ARGS[@]}")
BALANCE=$(cast balance "$ADDRESS" --rpc-url "$RPC" --ether)
echo "Deployer $ADDRESS · balance $BALANCE MON · chain $(cast chain-id --rpc-url "$RPC")"
if ! awk "BEGIN { exit !($BALANCE >= $MIN_MON) }"; then
  echo "Need at least $MIN_MON MON. Fund $ADDRESS at https://faucet.monad.xyz and re-run." >&2
  exit 1
fi

cd "$ROOT/contracts"
forge build
forge script script/Deploy.s.sol --rpc-url "$RPC" --account "$ACCOUNT" "${PW_ARGS[@]}" --broadcast --slow
cd "$ROOT"
node scripts/export-abis.mjs
echo
echo "Deployed. Addresses: contracts/deployments/10143.json"
cat contracts/deployments/10143.json
echo
echo "Next: commit frontend/src/contracts/deployments/10143.json and run the frontend (VITE_CHAIN_ID=10143)."
