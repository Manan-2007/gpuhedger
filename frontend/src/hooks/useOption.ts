import { useMemo } from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { computeOptionAbi, optionFactoryAbi, positionNFTAbi } from "../contracts/abis";
import { contracts, isConfigured } from "../contracts/addresses";
import { bytes32ToString, fromUsdc } from "../utils/formatters";
import { isGpuSymbol } from "../types/markets";
import type { OptionSeries } from "../types/options";
import { useTransaction } from "./useTransaction";
import { chainNow } from "../lib/clock";

type RawDetails = NonNullable<ReturnType<typeof useAllSeriesRaw>["data"]>[number];

function useAllSeriesRaw() {
  return useReadContract({
    address: contracts.optionFactory,
    abi: optionFactoryAbi,
    functionName: "getAllSeriesDetails",
    query: { enabled: isConfigured, refetchInterval: 4_000 },
  });
}

export function parseSeries(d: RawDetails): OptionSeries | undefined {
  const gpu = bytes32ToString(d.underlying);
  if (!isGpuSymbol(gpu)) return undefined;
  const maxContracts = Number(d.maxContracts);
  const soldContracts = Number(d.soldContracts);
  return {
    id: Number(d.seriesId),
    address: d.option,
    gpu,
    region: bytes32ToString(d.region) || "Global",
    kind: d.optionType === 0 ? "CALL" : "PUT",
    strike: fromUsdc(d.strikePrice),
    strikeRaw: d.strikePrice,
    expiration: Number(d.expiration),
    contractSize: Number(d.contractSize),
    premium: fromUsdc(d.premium),
    premiumRaw: d.premium,
    maxPayoutPerUnit: fromUsdc(d.maxPayoutPerUnit),
    maxContracts,
    soldContracts,
    openContracts: Number(d.openContracts),
    exercisedContracts: Number(d.exercisedContracts),
    availableContracts: Math.max(maxContracts - soldContracts, 0),
    collateralPerContract: fromUsdc(d.collateralPerContract),
    collateralBalance: fromUsdc(d.collateralBalance),
    lockedCollateral: fromUsdc(d.lockedCollateral),
    totalPaidOut: fromUsdc(d.totalPaidOut),
    writer: d.writer,
    settlementToken: d.settlementToken,
    oracle: d.oracle,
    createdAt: Number(d.createdAt),
    settled: d.settled,
  };
}

/** Every option series discovered from the OptionFactory. */
export function useMarkets() {
  const query = useAllSeriesRaw();
  const series = useMemo(
    () => (query.data ?? []).map(parseSeries).filter((s): s is OptionSeries => Boolean(s)),
    [query.data],
  );
  return { series, isLoading: query.isLoading && isConfigured, isError: query.isError, error: query.error, refetch: query.refetch };
}

export function useSeries(id: number | undefined) {
  const { series, isLoading, isError } = useMarkets();
  const found = id === undefined ? undefined : series.find((s) => s.id === id);
  return { series: found, isLoading, isError, notFound: !isLoading && !isError && id !== undefined && !found };
}

export function isActive(s: OptionSeries, nowMs = chainNow()) {
  return !s.settled && s.expiration * 1000 > nowMs;
}

/** Buy / exercise actions for a series. */
export function useOptionActions() {
  const tx = useTransaction();

  const buy = (series: OptionSeries, contracts: number, maxPremium: bigint) =>
    tx.execute(`Buy ${contracts} ${series.gpu} ${series.kind}`, {
      address: series.address,
      abi: computeOptionAbi,
      functionName: "buyOption",
      args: [BigInt(contracts), maxPremium],
    });

  const exercise = (series: OptionSeries, positionId: bigint) =>
    tx.execute(`Exercise ${series.gpu} ${series.kind}`, {
      address: series.address,
      abi: computeOptionAbi,
      functionName: "exercise",
      args: [positionId],
    });

  const claim = (series: OptionSeries, positionId: bigint) =>
    tx.execute(`Claim ${series.gpu} ${series.kind} payout`, {
      address: series.address,
      abi: computeOptionAbi,
      functionName: "claim",
      args: [positionId],
    });

  /** Positions are ERC-721 tokens: transferring the NFT transfers the hedge. */
  const transfer = (from: Address, to: Address, tokenId: bigint) =>
    tx.execute(`Transfer position NFT #${tokenId}`, {
      address: contracts.positionNFT,
      abi: positionNFTAbi,
      functionName: "safeTransferFrom",
      args: [from, to, tokenId],
    });

  const expire = (series: OptionSeries) =>
    tx.execute(`Settle expired series #${series.id}`, {
      address: series.address,
      abi: computeOptionAbi,
      functionName: "expire",
    });

  return { ...tx, buy, exercise, claim, transfer, expire };
}
