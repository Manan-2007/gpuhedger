import { useAccount, useReadContract } from "wagmi";
import type { Address } from "viem";
import { computeVaultAbi } from "../contracts/abis";
import { contracts, hasVault } from "../contracts/addresses";
import { fromUsdc } from "../utils/formatters";
import type { OptionSeries } from "../types/options";
import { useTransaction, type ContractCall } from "./useTransaction";

const opts = { query: { enabled: hasVault, refetchInterval: 4_000 } } as const;

/** LP vault state, read live from the ComputeVault (ERC-4626) contract. */
export function useVault() {
  const { address } = useAccount();
  const v = { address: contracts.vault, abi: computeVaultAbi } as const;
  const totalAssets = useReadContract({ ...v, functionName: "totalAssets", ...opts });
  const totalSupply = useReadContract({ ...v, functionName: "totalSupply", ...opts });
  const idle = useReadContract({ ...v, functionName: "idleAssets", ...opts });
  const premiums = useReadContract({ ...v, functionName: "premiumsEarned", ...opts });
  const active = useReadContract({ ...v, functionName: "activeSeries", ...opts });
  const all = useReadContract({ ...v, functionName: "allSeries", ...opts });
  const userOpts = { query: { enabled: hasVault && Boolean(address), refetchInterval: 4_000 } } as const;
  const shares = useReadContract({ ...v, functionName: "balanceOf", args: address ? [address] : undefined, ...userOpts });
  const maxWithdraw = useReadContract({ ...v, functionName: "maxWithdraw", args: address ? [address] : undefined, ...userOpts });
  const shareValue = useReadContract({ ...v, functionName: "convertToAssets", args: [shares.data ?? 0n], ...userOpts });

  const tvl = fromUsdc(totalAssets.data);
  const supply = fromUsdc(totalSupply.data);
  return {
    tvl,
    idle: fromUsdc(idle.data),
    deployed: Math.max(tvl - fromUsdc(idle.data), 0),
    sharePrice: supply > 0 ? tvl / supply : 1,
    premiumsEarned: fromUsdc(premiums.data),
    activeSeries: (active.data ?? []) as readonly Address[],
    allSeries: (all.data ?? []) as readonly Address[],
    userShares: fromUsdc(shares.data),
    userSharesRaw: shares.data ?? 0n,
    userValue: fromUsdc(shareValue.data),
    userMaxWithdraw: fromUsdc(maxWithdraw.data),
    userMaxWithdrawRaw: maxWithdraw.data ?? 0n,
    isLoading: totalAssets.isLoading && hasVault,
  };
}

export function useVaultActions() {
  const tx = useTransaction();
  const call = (functionName: string, args: readonly unknown[]): ContractCall => ({
    address: contracts.vault,
    abi: computeVaultAbi,
    functionName,
    args,
  });

  const deposit = (amount: bigint, receiver: Address) => tx.execute("Deposit USDC to LP vault", call("deposit", [amount, receiver]));
  const withdraw = (amount: bigint, owner: Address) => tx.execute("Withdraw USDC from LP vault", call("withdraw", [amount, owner, owner]));
  const harvest = (series: OptionSeries) => tx.execute(`Harvest series #${series.id}`, call("harvest", [series.address]));
  const writeSeries = (label: string, params: Record<string, unknown>) => tx.execute(label, call("writeSeries", [params]));

  return { ...tx, deposit, withdraw, harvest, writeSeries };
}
