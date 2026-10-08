import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { activeChain } from "../lib/chain";

const SAMPLE = 200n;

/**
 * Average block time measured from the chain itself: (latest.timestamp − block[latest − 200].timestamp) / 200.
 * Block timestamps are whole seconds, so averaging over 200 blocks gives ~10 ms resolution at Monad speeds.
 */
export function useBlockTime() {
  const client = usePublicClient({ chainId: activeChain.id });
  const query = useQuery({
    queryKey: ["block-time", activeChain.id],
    enabled: Boolean(client),
    refetchInterval: 30_000,
    queryFn: async () => {
      const latest = await client!.getBlock();
      if (latest.number < SAMPLE) return undefined;
      const past = await client!.getBlock({ blockNumber: latest.number - SAMPLE });
      const seconds = Number(latest.timestamp - past.timestamp) / Number(SAMPLE);
      return { ms: Math.round(seconds * 1000), blocks: Number(SAMPLE), latest: latest.number };
    },
  });
  return { blockTime: query.data, isLoading: query.isLoading };
}
