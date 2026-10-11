import { useReadContract } from "wagmi";
import { activeChain } from "../lib/chain";
import { contracts, isConfigured } from "../contracts/addresses";
import { optionFactoryAbi } from "../contracts/abis";
import { SwitchNetworkButton, useWrongNetwork } from "./WalletButton";

/** Page-wide alerts: wrong network, protocol paused, contracts not deployed. Shared by both layouts. */
export function StatusBanners() {
  const wrong = useWrongNetwork();
  const paused = useReadContract({
    address: contracts.optionFactory,
    abi: optionFactoryAbi,
    functionName: "paused",
    query: { enabled: isConfigured, refetchInterval: 10_000 },
  }).data;

  return (
    <>
      {wrong && (
        <div className="border-b border-neg/30 bg-neg/10" role="alert">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="text-sm font-semibold text-neg">
              Wrong network. GpuHedger runs on {activeChain.name} (chain {activeChain.id}). Reads still work; trades are disabled.
            </span>
            <SwitchNetworkButton className="px-3 py-1.5 text-xs" />
          </div>
        </div>
      )}

      {paused && (
        <div className="border-b border-warn/30 bg-warn/10" role="alert">
          <div className="mx-auto max-w-7xl px-4 py-2.5 text-sm text-warn sm:px-6">
            <span className="font-semibold">Trading is paused by the protocol admin.</span> Buying and early exercise are disabled until it
            resumes. Claims on expired options still work.
          </div>
        </div>
      )}

      {!isConfigured && (
        <div className="border-b border-warn/30 bg-warn/10" role="alert">
          <div className="mx-auto max-w-7xl px-4 py-2.5 text-sm text-warn sm:px-6">
            Contracts aren't deployed on {activeChain.name} (chain {activeChain.id}) yet, so markets, prices and trading are unavailable.
            Run <code className="mono">./start.sh</code> for the local demo.
          </div>
        </div>
      )}
    </>
  );
}
