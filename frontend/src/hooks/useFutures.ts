import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { computeFuturesAbi } from "../contracts/abis";
import { contracts, hasFutures } from "../contracts/addresses";
import { bytes32ToString, fromUsdc, stringToBytes32, toUsdc } from "../utils/formatters";
import { isGpuSymbol, type GpuSymbol } from "../types/markets";
import { useOracle } from "./useOracle";
import { useTransaction } from "./useTransaction";

export type FuturesSide = "LONG" | "SHORT";

export interface FuturesMarket {
  id: number;
  gpu: GpuSymbol;
  region: string;
  forwardPrice: number; // $ / GPU-hour
  band: number; // max settled move per GPU-hour
  expiration: number;
  contractSize: number;
  maxContracts: number;
  usedContracts: number;
  availableContracts: number;
  longContracts: number;
  shortContracts: number;
  writerCollateral: number;
  writer: `0x${string}`;
  settled: boolean;
  settlementPrice: number;
  bandRaw: bigint;
}

export interface FuturesPositionView {
  id: number;
  market: FuturesMarket;
  side: FuturesSide;
  contracts: number;
  margin: number;
  openedAt: number;
  closed: boolean;
  payout: number;
  markPrice: number; // settlement price if settled, else live oracle
  pnl: number; // $ at markPrice (clamped to the band)
  expired: boolean;
}

/** Holder P&L per GPU-hour: clamp(S − F, −B, +B), negated for shorts. */
export function futuresPnlPerUnit(side: FuturesSide, price: number, forward: number, band: number) {
  const diff = Math.max(Math.min(price - forward, band), -band);
  return side === "LONG" ? diff : -diff;
}

export function useFuturesMarkets() {
  const query = useReadContract({
    address: contracts.futures,
    abi: computeFuturesAbi,
    functionName: "getMarkets",
    query: { enabled: hasFutures, refetchInterval: 4_000 },
  });
  const markets = useMemo<FuturesMarket[]>(
    () =>
      (query.data ?? [])
        .map((m) => {
          const gpu = bytes32ToString(m.underlying);
          if (!isGpuSymbol(gpu)) return undefined;
          const maxContracts = Number(m.maxContracts);
          const used = Number(m.usedContracts);
          return {
            id: Number(m.id),
            gpu,
            region: bytes32ToString(m.region) || "Global",
            forwardPrice: fromUsdc(m.forwardPrice),
            band: fromUsdc(m.band),
            bandRaw: m.band,
            expiration: Number(m.expiration),
            contractSize: Number(m.contractSize),
            maxContracts,
            usedContracts: used,
            availableContracts: Math.max(maxContracts - used, 0),
            longContracts: Number(m.longContracts),
            shortContracts: Number(m.shortContracts),
            writerCollateral: fromUsdc(m.writerCollateral),
            writer: m.writer,
            settled: m.settled,
            settlementPrice: fromUsdc(m.settlementPrice),
          };
        })
        .filter((m): m is FuturesMarket => Boolean(m)),
    [query.data],
  );
  return { markets, isLoading: query.isLoading && hasFutures, isError: query.isError };
}

export function useFuturesPositions() {
  const { address } = useAccount();
  const { markets } = useFuturesMarkets();
  const { prices } = useOracle();
  const query = useReadContract({
    address: contracts.futures,
    abi: computeFuturesAbi,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { enabled: hasFutures && Boolean(address), refetchInterval: 3_000 },
  });
  const positions = useMemo<FuturesPositionView[]>(() => {
    const now = Date.now() / 1000;
    const out: FuturesPositionView[] = [];
    for (const p of query.data ?? []) {
      const market = markets.find((m) => m.id === Number(p.marketId));
      if (!market) continue;
      const side: FuturesSide = p.side === 0 ? "LONG" : "SHORT";
      const markPrice = market.settled ? market.settlementPrice : (prices?.[market.gpu]?.price ?? market.forwardPrice);
      const contractsN = Number(p.contracts);
      out.push({
        id: Number(p.id),
        market,
        side,
        contracts: contractsN,
        margin: fromUsdc(p.margin),
        openedAt: Number(p.openedAt),
        closed: p.closed,
        payout: fromUsdc(p.payout),
        markPrice,
        pnl: p.closed
          ? fromUsdc(p.payout) - fromUsdc(p.margin)
          : futuresPnlPerUnit(side, markPrice, market.forwardPrice, market.band) * market.contractSize * contractsN,
        expired: market.expiration <= now,
      });
    }
    return out.sort((a, b) => b.id - a.id);
  }, [query.data, markets, prices]);
  return { positions, isLoading: query.isLoading && Boolean(address) };
}

export function useFuturesActions() {
  const tx = useTransaction();

  const open = (market: FuturesMarket, side: FuturesSide, contractsN: number) =>
    tx.execute(`Open ${side} ${contractsN} ${market.gpu} future`, {
      address: contracts.futures,
      abi: computeFuturesAbi,
      functionName: "openPosition",
      args: [BigInt(market.id), side === "LONG" ? 0 : 1, BigInt(contractsN)],
    });

  const settle = (positionId: number) =>
    tx.execute(`Settle future #${positionId}`, {
      address: contracts.futures,
      abi: computeFuturesAbi,
      functionName: "settlePosition",
      args: [BigInt(positionId)],
    });

  const createMarket = (p: {
    gpu: GpuSymbol;
    region: string;
    forward: number;
    band: number;
    days: number;
    contractSize: number;
    capacity: number;
  }) =>
    tx.execute(`Create ${p.gpu} future @ $${p.forward.toFixed(2)}`, {
      address: contracts.futures,
      abi: computeFuturesAbi,
      functionName: "createMarket",
      args: [
        stringToBytes32(p.gpu),
        stringToBytes32(p.region),
        toUsdc(p.forward),
        toUsdc(p.band),
        BigInt(Math.floor(Date.now() / 1000 + p.days * 86400)),
        BigInt(p.contractSize),
        BigInt(p.capacity),
      ],
    });

  return { ...tx, open, settle, createMarket };
}
