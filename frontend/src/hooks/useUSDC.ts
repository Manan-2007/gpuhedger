import { useAccount, useBalance, useReadContract } from "wagmi";
import type { Address } from "viem";
import { mockUSDCAbi } from "../contracts/abis";
import { contracts, isConfigured } from "../contracts/addresses";
import { fromUsdc } from "../utils/formatters";
import { useTransaction } from "./useTransaction";

/** Connected wallet's USDC balance + allowance for `spender`. All values are read from chain. */
export function useUSDC(spender?: Address) {
  const { address } = useAccount();
  const enabled = isConfigured && Boolean(address);

  const balance = useReadContract({
    address: contracts.usdc,
    abi: mockUSDCAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 4_000 },
  });

  const allowance = useReadContract({
    address: contracts.usdc,
    abi: mockUSDCAbi,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    query: { enabled: enabled && Boolean(spender), refetchInterval: 4_000 },
  });

  const faucetAmount = useReadContract({
    address: contracts.usdc,
    abi: mockUSDCAbi,
    functionName: "faucetAmount",
    query: { enabled: isConfigured, staleTime: 60_000 },
  });

  return {
    balanceRaw: balance.data,
    balance: fromUsdc(balance.data),
    allowanceRaw: allowance.data ?? 0n,
    faucetAmount: fromUsdc(faucetAmount.data),
    isLoading: balance.isLoading,
    refetch: () => Promise.all([balance.refetch(), allowance.refetch()]),
  };
}

export function useMonBalance() {
  const { address } = useAccount();
  return useBalance({ address, query: { enabled: Boolean(address), refetchInterval: 6_000 } });
}

export function useUSDCActions() {
  const tx = useTransaction();

  const faucet = () =>
    tx.execute("Get test USDC", { address: contracts.usdc, abi: mockUSDCAbi, functionName: "faucet" });

  const approve = (spender: Address, amount: bigint) =>
    tx.execute("Approve USDC", {
      address: contracts.usdc,
      abi: mockUSDCAbi,
      functionName: "approve",
      args: [spender, amount],
    });

  const mint = (to: Address, amount: bigint) =>
    tx.execute("Mint USDC", { address: contracts.usdc, abi: mockUSDCAbi, functionName: "mint", args: [to, amount] });

  return { ...tx, faucet, approve, mint };
}
