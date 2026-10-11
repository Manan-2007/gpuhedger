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
  return <span className="num font-heading text-2xl font-semibold tracking-tight text-secondary">{((now - sentAt) / 1000).toFixed(2)}s</span>;
}

/** Dot-and-line stepper: Signature → Submitted → Confirming → Settled. */
function Stepper({ current, done }: { current: number; done: boolean }) {
  return (
    <ol className="mt-4 grid grid-cols-4" aria-label="Transaction progress">
      {STEPS.map((step, i) => {
        const reached = current >= i;
        const active = current === i && !done;
        const tone = done ? "pos" : "secondary";
        return (
          <li key={step.phase} className="relative min-w-0" aria-current={active ? "step" : undefined}>
            {/* connector to the next step */}
            {i < STEPS.length - 1 && (
              <span className={`absolute left-3 right-0 top-[5px] h-px ${current > i ? (done ? "bg-pos" : "bg-secondary") : "bg-line-2"}`} aria-hidden />
            )}
            <span
              className={`relative block h-[11px] w-[11px] rounded-full border-2 ${
                reached ? (tone === "pos" ? "border-pos bg-pos" : "border-secondary bg-secondary") : "border-line-3 bg-card"
              } ${active ? "pulse-dot" : ""}`}
              aria-hidden
            />
            <div className={`mt-2 truncate pr-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${reached ? "text-fg" : "text-dim"}`}>{step.label}</div>
          </li>
        );
      })}
    </ol>
  );
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
      className={`rounded-[4px] border p-4 ${failed ? "border-neg/45 bg-neg/[0.06]" : done ? "border-pos/45 bg-pos/[0.06]" : "border-secondary/35 bg-secondary/[0.04]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {state.label && <div className="label mb-1.5 truncate">{state.label}</div>}
          <div className={`flex items-center gap-2 text-sm font-semibold ${failed ? "text-neg" : done ? "text-pos" : "text-fg"}`}>
            {pending && <Spinner className="h-3.5 w-3.5 text-secondary" />}
            {failed && <span aria-hidden>✕</span>}
            {HEADLINE[state.phase]}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          {pending && state.sentAt !== undefined && (
            <div className="text-right leading-none">
              <LiveTimer sentAt={state.sentAt} />
              <div className="label mt-1 text-[10px]">elapsed</div>
            </div>
          )}
          {done && state.settleMs !== undefined && (
            <div className="text-right leading-none">
              <div className="num font-heading text-3xl font-semibold tracking-tight text-pos">{(state.settleMs / 1000).toFixed(2)}s</div>
              <div className="label mt-1 text-[10px]">to settle</div>
            </div>
          )}
          {(done || failed) && onDismiss && (
            <button onClick={onDismiss} className="font-mono text-xs text-muted hover:text-fg" aria-label="Dismiss">
              ✕
            </button>
          )}
        </div>
      </div>

      {!failed && !compact && <Stepper current={current} done={done} />}

      {failed && state.error && <p className="mt-2 text-sm text-fg">{state.error}</p>}

      {state.hash && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[11px] uppercase tracking-[0.06em]">
          <span className="text-muted">
            Tx <span className="mono normal-case text-fg">{shortHash(state.hash)}</span>
            {state.blockNumber !== undefined && (
              <>
                {" "}· block <span className="num text-fg">{state.blockNumber.toString()}</span>
              </>
            )}
          </span>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-secondary hover:underline">
              View on explorer ↗
            </a>
          ) : (
            <span className="text-dim">Local chain · no explorer</span>
          )}
        </div>
      )}
      {done && successNote && <div className="mt-3 text-sm">{successNote}</div>}
    </div>
  );
}
