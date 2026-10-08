import { useCallback, useRef, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi, Address, Hash, TransactionReceipt } from "viem";
import { friendlyError } from "../lib/errors";
import { activeChain } from "../lib/chain";

export type TxPhase = "idle" | "signature" | "submitted" | "confirming" | "confirmed" | "failed";

export interface TxState {
  phase: TxPhase;
  label?: string;
  hash?: Hash;
  error?: string;
  /** Milliseconds from broadcast to receipt. */
  settleMs?: number;
  blockNumber?: bigint;
}

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

/**
 * Runs a real contract write through the full lifecycle:
 * simulate → wallet signature → broadcast → receipt. Every state shown in the UI is derived
 * from the wallet and the chain; nothing is faked.
 */
export function useTransaction() {
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const busy = useRef(false);

  const execute = useCallback(
    async (label: string, call: ContractCall): Promise<TransactionReceipt | undefined> => {
      if (busy.current || !publicClient || !address) return undefined;
      busy.current = true;
      setState({ phase: "signature", label });
      try {
        // Simulate first so reverts surface as clear errors before the wallet opens.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { request } = await publicClient.simulateContract({ ...(call as any), account: address });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hash = await writeContractAsync({ ...(request as any), chainId: activeChain.id });
        const sentAt = performance.now();
        setState({ phase: "submitted", label, hash });
        // Move to "confirming" on the next frame so the submitted state is visible.
        requestAnimationFrame(() => setState((s) => (s.hash === hash && s.phase === "submitted" ? { ...s, phase: "confirming" } : s)));

        const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: 120_000 });
        const settleMs = Math.round(performance.now() - sentAt);
        if (receipt.status !== "success") {
          setState({ phase: "failed", label, hash, error: "The transaction was mined but reverted onchain." });
          return undefined;
        }
        setState({ phase: "confirmed", label, hash, settleMs, blockNumber: receipt.blockNumber });
        await queryClient.invalidateQueries();
        return receipt;
      } catch (error) {
        console.warn(`[${label}]`, error);
        setState((s) => ({ phase: "failed", label, hash: s.hash, error: friendlyError(error) }));
        return undefined;
      } finally {
        busy.current = false;
      }
    },
    [address, publicClient, writeContractAsync, queryClient],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const isBusy = state.phase === "signature" || state.phase === "submitted" || state.phase === "confirming";

  return { state, execute, reset, isBusy };
}
