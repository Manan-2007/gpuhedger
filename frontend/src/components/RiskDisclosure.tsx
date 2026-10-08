import type { OptionKind } from "../types/options";
import { formatUsd } from "../utils/formatters";

export const RISK_TEXT =
  "Options involve risk. Buyers can lose the premium paid. Option values depend on the underlying compute price, volatility, time to expiry, and liquidity. This hackathon implementation is experimental and uses simulated compute markets.";

export function RiskDisclosure({
  kind,
  maxLoss,
  accepted,
  onAcceptedChange,
}: {
  kind: OptionKind;
  maxLoss: number;
  accepted: boolean;
  onAcceptedChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-warn/25 bg-warn/[0.06] p-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M12 3l10 18H2L12 3z" />
          <path d="M12 10v5M12 18h.01" />
        </svg>
        Risk disclosure
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg/80">{RISK_TEXT}</p>
      <div className="mt-2.5 flex items-center justify-between border-t border-warn/15 pt-2.5 text-sm">
        <span className="text-muted">Maximum loss ({kind === "CALL" ? "call" : "put"}): premium paid</span>
        <span className="num font-semibold text-neg">{formatUsd(maxLoss)}</span>
      </div>
      <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs text-fg/90">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
        />
        I understand I can lose the entire premium and that this is an experimental testnet product.
      </label>
    </div>
  );
}
