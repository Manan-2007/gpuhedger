import { createPublicClient, http } from "viem";
import { activeChain } from "./chain";

/** Standalone read client (used outside React, e.g. for one-off reads). */
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(),
  pollingInterval: 400,
});
