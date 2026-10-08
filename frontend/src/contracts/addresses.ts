import { isAddress, type Address } from "viem";
import { activeChain } from "../lib/chain";

interface Deployment {
  chainId: number;
  deployBlock?: number;
  deployer?: Address;
  usdc: Address;
  oracle: Address;
  optionFactory: Address;
  positionNFT?: Address;
  vault?: Address;
  futures?: Address;
}

// Written by contracts/script/Deploy.s.sol
const deployments = import.meta.glob<Deployment>("./deployments/*.json", {
  eager: true,
  import: "default",
});

function findDeployment(chainId: number): Deployment | undefined {
  return Object.values(deployments).find((d) => d.chainId === chainId);
}

function pick(envValue: string | undefined, fallback: Address | undefined): Address | undefined {
  if (envValue && isAddress(envValue)) return envValue;
  return fallback && isAddress(fallback) ? fallback : undefined;
}

const deployment = findDeployment(activeChain.id);

export const addresses = {
  usdc: pick(import.meta.env.VITE_USDC_ADDRESS, deployment?.usdc),
  oracle: pick(import.meta.env.VITE_ORACLE_ADDRESS, deployment?.oracle),
  optionFactory: pick(import.meta.env.VITE_OPTION_FACTORY_ADDRESS, deployment?.optionFactory),
  positionNFT: pick(import.meta.env.VITE_POSITION_NFT_ADDRESS, deployment?.positionNFT),
  vault: pick(import.meta.env.VITE_VAULT_ADDRESS, deployment?.vault),
  futures: pick(import.meta.env.VITE_FUTURES_ADDRESS, deployment?.futures),
};

export const deployer = deployment?.deployer;

export const isConfigured = Boolean(addresses.usdc && addresses.oracle && addresses.optionFactory);

/** Non-null contract addresses. Only use behind an `isConfigured` check. */
export const contracts = addresses as {
  usdc: Address;
  oracle: Address;
  optionFactory: Address;
  positionNFT: Address;
  vault: Address;
  futures: Address;
};

export const hasVault = isConfigured && Boolean(addresses.vault);
export const hasFutures = isConfigured && Boolean(addresses.futures);
export const hasPositionNFT = isConfigured && Boolean(addresses.positionNFT);
