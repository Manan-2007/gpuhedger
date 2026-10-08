import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { computeOptionAbi, optionFactoryAbi } from "../contracts/abis";
import { contracts, isConfigured } from "../contracts/addresses";
import { fromUsdc } from "../utils/formatters";
import { calculateCappedOptionPrice, calculateIntrinsicValue, yearsUntil } from "../utils/optionsPricing";
import type { Position, PositionStatus, PositionView } from "../types/options";
import { useMarkets } from "./useOption";
import { useOracle } from "./useOracle";
import { useNow } from "./useNow";

const STATUS: PositionStatus[] = ["OPEN", "EXERCISED", "EXPIRED", "CLAIMABLE"];

export function usePortfolio() {
  const { address } = useAccount();
  const now = useNow(1_000);
  const { series, isLoading: marketsLoading } = useMarkets();
  const { prices } = useOracle();

  const query = useReadContract({
    address: contracts.optionFactory,
    abi: optionFactoryAbi,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { enabled: isConfigured && Boolean(address), refetchInterval: 3_000 },
  });

  const positions: Position[] = useMemo(
    () =>
      (query.data ?? []).map((up) => ({
        key: `${up.seriesId}-${up.position.id}`,
        seriesId: Number(up.seriesId),
        option: up.option,
        positionId: up.position.id,
        tokenId: up.tokenId,
        owner: up.position.owner,
        contracts: Number(up.position.contracts),
        premiumPaid: fromUsdc(up.position.premiumPaid),
        openedAt: Number(up.position.openedAt),
        status: STATUS[up.position.status] ?? "OPEN",
        payout: fromUsdc(up.position.payout),
        closedAt: Number(up.position.closedAt),
      })),
    [query.data],
  );

  // Expired series: read the onchain payout per contract at the expiry settlement price.
  const expiredOptions = useMemo(
    () => [...new Set(positions.filter((p) => p.status === "CLAIMABLE").map((p) => p.option))],
    [positions],
  );
  const expiryPayouts = useReadContracts({
    allowFailure: true,
    contracts: expiredOptions.map((address) => ({ address, abi: computeOptionAbi, functionName: "expiryPayoutPerContract" }) as const),
    query: { enabled: expiredOptions.length > 0, refetchInterval: 10_000 },
  });
  const payoutPerContract = useMemo(() => {
    const m = new Map<string, number>();
    expiredOptions.forEach((o, i) => {
      const r = expiryPayouts.data?.[i];
      if (r?.status === "success") m.set(o.toLowerCase(), fromUsdc(r.result as bigint));
    });
    return m;
  }, [expiredOptions, expiryPayouts.data]);

  const views: PositionView[] = useMemo(() => {
    const out: PositionView[] = [];
    for (const p of positions) {
      const s = series.find((x) => x.id === p.seriesId);
      if (!s) continue;
      const oracle = prices?.[s.gpu];
      const spot = oracle?.price ?? 0;
      const vol = oracle?.volatility ?? 0.4;
      const gpuHours = p.contracts * s.contractSize;
      const expired = s.expiration * 1000 <= now;
      // The contract derives CLAIMABLE/EXPIRED; guard against the clock passing expiry between polls.
      const status: PositionStatus = p.status === "OPEN" && expired ? "EXPIRED" : p.status;
      const claimValue = status === "CLAIMABLE" ? (payoutPerContract.get(p.option.toLowerCase()) ?? 0) * p.contracts : 0;
      const intrinsicPerUnit = calculateIntrinsicValue(s.kind, spot, s.strike, s.maxPayoutPerUnit);
      const exerciseValue = intrinsicPerUnit * gpuHours;
      let estimatedValue = 0;
      let pnl = 0;
      if (status === "OPEN") {
        const model = calculateCappedOptionPrice(
          s.kind,
          { spot, strike: s.strike, timeToExpiry: yearsUntil(s.expiration, now), volatility: vol },
          s.maxPayoutPerUnit,
        );
        // An American-style holder can always exercise, so value is at least intrinsic.
        estimatedValue = Math.max(model * gpuHours, exerciseValue);
        pnl = estimatedValue - p.premiumPaid;
      } else if (status === "CLAIMABLE") {
        estimatedValue = claimValue;
        pnl = claimValue - p.premiumPaid;
      } else if (status === "EXERCISED") {
        pnl = p.payout - p.premiumPaid;
      } else {
        pnl = -p.premiumPaid;
      }
      out.push({
        ...p,
        status,
        series: s,
        spot,
        intrinsicPerUnit,
        exerciseValue,
        estimatedValue,
        pnl,
        distanceToStrike: spot > 0 ? ((spot - s.strike) / s.strike) * 100 : 0,
        timeRemaining: Math.max(s.expiration - now / 1000, 0),
        canExercise: status === "OPEN" && exerciseValue > 0 && Boolean(oracle),
        canClaim: status === "CLAIMABLE",
        claimValue,
      });
    }
    return out.sort((a, b) => b.openedAt - a.openedAt || Number(b.positionId - a.positionId));
  }, [positions, series, prices, now, payoutPerContract]);

  const summary = useMemo(() => {
    const open = views.filter((v) => v.status === "OPEN" || v.status === "CLAIMABLE");
    const exercised = views.filter((v) => v.status === "EXERCISED");
    const expired = views.filter((v) => v.status === "EXPIRED");
    const portfolioValue = open.reduce((a, v) => a + v.estimatedValue, 0);
    const unrealized = open.reduce((a, v) => a + v.pnl, 0);
    const realized = [...exercised, ...expired].reduce((a, v) => a + v.pnl, 0);
    const premiumsPaid = views.reduce((a, v) => a + v.premiumPaid, 0);
    const payouts = exercised.reduce((a, v) => a + v.payout, 0);
    return { open, exercised, expired, portfolioValue, unrealized, realized, totalPnl: unrealized + realized, premiumsPaid, payouts };
  }, [views]);

  return {
    positions: views,
    summary,
    isLoading: (query.isLoading || marketsLoading) && Boolean(address),
    isError: query.isError,
    refetch: query.refetch,
  };
}
