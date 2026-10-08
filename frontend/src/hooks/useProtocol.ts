import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { keccak256, toBytes, zeroAddress } from "viem";
import { computeFuturesAbi, computeOracleAbi, computeVaultAbi, mockUSDCAbi, optionFactoryAbi } from "../contracts/abis";
import { contracts, hasFutures, hasVault, isConfigured } from "../contracts/addresses";
import { fromUsdc } from "../utils/formatters";

const ORACLE_ROLE = keccak256(toBytes("ORACLE_ROLE"));
const WRITER_ROLE = keccak256(toBytes("WRITER_ROLE"));
const PAUSER_ROLE = keccak256(toBytes("PAUSER_ROLE"));
const MANAGER_ROLE = keccak256(toBytes("MANAGER_ROLE"));

export const ACTIVITY_KINDS = ["Series created", "Purchase", "Exercise", "Expiry", "Claim"] as const;

/** Onchain protocol-wide traction metrics, recorded by the OptionFactory. */
export function useProtocolStats() {
  const query = useReadContract({
    address: contracts.optionFactory,
    abi: optionFactoryAbi,
    functionName: "getStats",
    query: { enabled: isConfigured, refetchInterval: 4_000 },
  });
  const stats = useMemo(() => {
    if (!query.data) return undefined;
    const [series, trades, contractsTraded, premiumVolume, exercises, payouts, traders] = query.data;
    return {
      series: Number(series),
      trades: Number(trades),
      contractsTraded: Number(contractsTraded),
      premiumVolume: fromUsdc(premiumVolume),
      exercises: Number(exercises),
      payouts: fromUsdc(payouts),
      traders: Number(traders),
    };
  }, [query.data]);
  return { stats, isLoading: query.isLoading };
}

export function useRecentActivity(limit = 25) {
  const query = useReadContract({
    address: contracts.optionFactory,
    abi: optionFactoryAbi,
    functionName: "getRecentActivity",
    args: [BigInt(limit)],
    query: { enabled: isConfigured, refetchInterval: 4_000 },
  });
  const activity = useMemo(
    () =>
      (query.data ?? []).map((a) => ({
        kind: ACTIVITY_KINDS[a.kind] ?? "Activity",
        kindIndex: a.kind,
        amountRaw: a.amount,
        seriesId: Number(a.seriesId),
        account: a.account,
        contracts: Number(a.contracts),
        amount: fromUsdc(a.amount),
        timestamp: Number(a.timestamp),
        blockNumber: a.blockNumber,
      })),
    [query.data],
  );
  return { activity, isLoading: query.isLoading };
}

/** Admin permissions of the connected wallet, read from AccessControl. */
export function useAdminRoles() {
  const { address } = useAccount();
  const account = address ?? zeroAddress;
  const enabled = isConfigured && Boolean(address);
  const opts = { query: { enabled, refetchInterval: 5_000 } } as const;

  const isOracle = useReadContract({ address: contracts.oracle, abi: computeOracleAbi, functionName: "hasRole", args: [ORACLE_ROLE, account], ...opts });
  const isWriter = useReadContract({ address: contracts.optionFactory, abi: optionFactoryAbi, functionName: "hasRole", args: [WRITER_ROLE, account], ...opts });
  const isPauser = useReadContract({ address: contracts.optionFactory, abi: optionFactoryAbi, functionName: "hasRole", args: [PAUSER_ROLE, account], ...opts });
  const isVaultManager = useReadContract({ address: contracts.vault, abi: computeVaultAbi, functionName: "hasRole", args: [MANAGER_ROLE, account], query: { enabled: enabled && hasVault, refetchInterval: 5_000 } });
  const isFuturesWriter = useReadContract({ address: contracts.futures, abi: computeFuturesAbi, functionName: "hasRole", args: [WRITER_ROLE, account], query: { enabled: enabled && hasFutures, refetchInterval: 5_000 } });
  const usdcOwner = useReadContract({ address: contracts.usdc, abi: mockUSDCAbi, functionName: "owner", query: { enabled: isConfigured } });
  const paused = useReadContract({ address: contracts.optionFactory, abi: optionFactoryAbi, functionName: "paused", query: { enabled: isConfigured, refetchInterval: 5_000 } });

  return {
    isOracle: Boolean(address && isOracle.data),
    isWriter: Boolean(address && isWriter.data),
    isPauser: Boolean(address && isPauser.data),
    isVaultManager: Boolean(address && isVaultManager.data),
    isFuturesWriter: Boolean(address && isFuturesWriter.data),
    isUsdcOwner: Boolean(address && usdcOwner.data && usdcOwner.data.toLowerCase() === address.toLowerCase()),
    paused: Boolean(paused.data),
    isLoading: isOracle.isLoading || isWriter.isLoading,
  };
}
