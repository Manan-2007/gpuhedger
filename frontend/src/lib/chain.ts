import { defineChain, type Chain } from "viem";
import { foundry, monadTestnet } from "viem/chains";

const envChainId = Number(import.meta.env.VITE_CHAIN_ID || monadTestnet.id);
const envRpc = import.meta.env.VITE_MONAD_RPC_URL as string | undefined;
const envExplorer = import.meta.env.VITE_EXPLORER_URL as string | undefined;
// testnet.monadexplorer.com (viem's default) now 308-redirects here; link to it directly. Checked 2026-10-09.
const MONAD_TESTNET_EXPLORER = "https://testnet.monadvision.com";

function buildChain(): Chain {
  if (envChainId === foundry.id) {
    return defineChain({
      ...foundry,
      name: "Local Anvil",
      rpcUrls: { default: { http: [envRpc || "http://127.0.0.1:8545"] } },
    });
  }
  return defineChain({
    ...monadTestnet,
    rpcUrls: { default: { http: [envRpc || monadTestnet.rpcUrls.default.http[0]] } },
    blockExplorers: {
      default: {
        name: "MonadVision",
        url: envExplorer || MONAD_TESTNET_EXPLORER,
      },
    },
  });
}

/** The single chain this deployment of the app targets. */
export const activeChain = buildChain();

export const isLocalChain = activeChain.id === foundry.id;

export const explorerUrl: string | undefined = isLocalChain
  ? undefined
  : activeChain.blockExplorers?.default.url.replace(/\/$/, "");

export function txUrl(hash: string): string | undefined {
  return explorerUrl ? `${explorerUrl}/tx/${hash}` : undefined;
}

export function addressUrl(address: string): string | undefined {
  return explorerUrl ? `${explorerUrl}/address/${address}` : undefined;
}

export const MONAD_FAUCET_URL = "https://faucet.monad.xyz";
