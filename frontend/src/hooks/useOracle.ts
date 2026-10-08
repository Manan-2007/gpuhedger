import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { computeOracleAbi } from "../contracts/abis";
import { contracts, isConfigured } from "../contracts/addresses";
import { bytes32ToString, fromUsdc, stringToBytes32 } from "../utils/formatters";
import { GPU_SYMBOLS, isGpuSymbol, type GpuSymbol, type OraclePrice } from "../types/markets";

export const ORACLE_REFRESH_MS = 2_000;

/** Live onchain oracle prices for every GPU. */
export function useOracle() {
  const query = useReadContract({
    address: contracts.oracle,
    abi: computeOracleAbi,
    functionName: "getAllPrices",
    query: { enabled: isConfigured, refetchInterval: ORACLE_REFRESH_MS },
  });

  const prices = useMemo(() => {
    if (!query.data) return undefined;
    const [assets, rawPrices, updatedAt, vols] = query.data;
    const out: Partial<Record<GpuSymbol, OraclePrice>> = {};
    assets.forEach((asset, i) => {
      const gpu = bytes32ToString(asset);
      if (!isGpuSymbol(gpu)) return;
      out[gpu] = {
        gpu,
        price: fromUsdc(rawPrices[i]),
        priceRaw: rawPrices[i],
        updatedAt: Number(updatedAt[i]),
        volatility: Number(vols[i]) / 10_000,
        volatilityBps: Number(vols[i]),
      };
    });
    return out;
  }, [query.data]);

  return {
    prices,
    isLoading: query.isLoading,
    isError: query.isError || !isConfigured,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Oracle price for one GPU. `price` is undefined until the oracle answers: never substitute a
 * made-up number, because screens label this value "Oracle". Check `unavailable` to show an
 * "Oracle unavailable" state and disable trading.
 */
export function useGpuPrice(gpu: GpuSymbol) {
  const { prices, isLoading } = useOracle();
  const live = prices?.[gpu];
  return {
    price: live?.price,
    volatility: live?.volatility,
    updatedAt: live?.updatedAt,
    isLive: Boolean(live),
    isLoading,
    unavailable: !live && !isLoading,
  };
}

export function useAllGpuPrices() {
  const { prices, isLoading } = useOracle();
  return useMemo(
    () =>
      GPU_SYMBOLS.map((gpu) => ({
        gpu,
        price: prices?.[gpu]?.price,
        volatility: prices?.[gpu]?.volatility,
        updatedAt: prices?.[gpu]?.updatedAt,
        isLive: Boolean(prices?.[gpu]),
        isLoading,
        unavailable: !prices?.[gpu] && !isLoading,
      })),
    [prices, isLoading],
  );
}

/** Live oracle prices keyed by GPU, omitting any GPU the oracle didn't return. */
export function useLivePriceMap(): Partial<Record<GpuSymbol, number>> {
  const prices = useAllGpuPrices();
  return useMemo(() => Object.fromEntries(prices.filter((p) => p.price !== undefined).map((p) => [p.gpu, p.price])), [prices]);
}

/** Real onchain oracle update history (most recent 100 updates). */
export function useOracleHistory(gpu: GpuSymbol) {
  const query = useReadContract({
    address: contracts.oracle,
    abi: computeOracleAbi,
    functionName: "getPriceHistory",
    args: [stringToBytes32(gpu)],
    query: { enabled: isConfigured, refetchInterval: 5_000 },
  });
  const points = useMemo(
    () => (query.data ?? []).map((p) => ({ t: Number(p.timestamp) * 1000, price: fromUsdc(p.price) })),
    [query.data],
  );
  return { points, isLoading: query.isLoading };
}
