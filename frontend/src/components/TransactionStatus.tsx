import { useEffect, useState } from "react";
import type { TxPhase, TxState } from "../hooks/useTransaction";
import { activeChain, txUrl } from "../lib/chain";
import { shortHash } from "../utils/formatters";
import { Spinner } from "./ui";

const STEPS: { phase: TxPhase; label: string }[] = [
  { phase: "signature", label: "Signature" },
  { phase: "submitted", label: "Submitted" },
  { phase: "confirming", label: "Confirming" },
  { phase: "confirmed", label: "Settled" },
];

const ORDER: Record<TxPhase, number> = { idle: -1, signature: 0, submitted: 1, confirming: 2, confirmed: 3, failed: -1 };

const HEADLINE: Record<TxPhase, string> = {
  idle: "",
  signature: "Signature required — confirm in your wallet",
  submitted: `Order submitted to ${activeChain.name}`,
  confirming: "Confirming onchain…",
  confirmed: "SETTLED ✓",
  failed: "Transaction failed",
};

/** Seconds since the wallet returned the hash, measured in this browser. Ticks while pending. */
function LiveTimer({ sentAt }: { sentAt: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow(performance.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  return <span className="num text-secondary">{((now - sentAt) / 1000).toFixed(2)}s</span>;
}

/**
 * Lifecycle of a real onchain transaction: Signature → Submitted → Confirming → Settled.
 * The settle time is measured from broadcast to receipt in the browser (an upper bound: receipts
 * are polled every 250 ms). Nothing here is simulated.
 */
export function TransactionStatus({
  state,
  onDismiss,
  successNote,
  compact = false,
}: {
  state: TxState;
  onDismiss?: () => void;
  successNote?: React.ReactNode;
  compact?: boolean;
}) {
  if (state.phase === "idle") return null;
  const failed = state.phase === "failed";
  const done = state.phase === "confirmed";
  const pending = !failed && !done;
  const current = ORDER[state.phase];
  const url = state.hash ? txUrl(state.hash) : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border p-3.5 ${
        failed ? "border-neg/40 bg-neg/[0.06]" : done ? "border-pos/40 bg-pos/[0.07]" : "border-secondary/30 bg-secondary/[0.05]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {state.label && <div className="label mb-1 truncate">{state.label}</div>}
          <div className={`flex items-center gap-2 text-sm font-semibold ${failed ? "text-neg" : done ? "text-pos" : "text-fg"}`}>
            {pending && <Spinner className="h-3.5 w-3.5 text-secondary" />}
            {failed && <span aria-hidden>✕</span>}
            {HEADLINE[state.phase]}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          {pending && state.sentAt !== undefined && <LiveTimer sentAt={state.sentAt} />}
          {done && state.settleMs !== undefined && (
            <div className="text-right leading-tight">
              <div className="num text-lg font-semibold text-pos">{(state.settleMs / 1000).toFixed(2)}s</div>
              <div className="text-[10px] uppercase tracking-wider text-dim">to settle</div>
            </div>
          )}
          {(done || failed) && onDismiss && (
            <button onClick={onDismiss} className="text-xs text-muted hover:text-fg" aria-label="Dismiss">
              ✕
            </button>
          )}
        </div>
      </div>

      {!failed && !compact && (
        <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Transaction progress">
          {STEPS.map((step, i) => {
            const reached = current >= i;
            const active = current === i && !done;
            return (
              <li key={step.phase} className="min-w-0" aria-current={active ? "step" : undefined}>
                <div
                  className={`h-1 rounded-full transition-colors ${reached ? (done ? "bg-pos" : "bg-secondary") : "bg-line-2"} ${active ? "pulse-dot" : ""}`}
                />
                <div className={`mt-1.5 truncate text-[10px] font-semibold uppercase tracking-wide ${reached ? "text-fg" : "text-dim"}`}>
                  {step.label}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {failed && state.error && <p className="mt-2 text-sm text-fg">{state.error}</p>}

      {state.hash && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-xs">
          <span className="text-muted">
            Tx <span className="mono text-fg">{shortHash(state.hash)}</span>
            {state.blockNumber !== undefined && (
              <>
                {" "}· block <span className="num text-fg">{state.blockNumber.toString()}</span>
              </>
            )}
          </span>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-secondary hover:underline">
              View on Explorer ↗
            </a>
          ) : (
            <span className="text-dim">Local chain (no explorer)</span>
          )}
        </div>
      )}
      {done && successNote && <div className="mt-3 text-sm">{successNote}</div>}
    </div>
  );
}
