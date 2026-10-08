import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { hasFutures } from "../contracts/addresses";
import { useFuturesActions, useFuturesPositions } from "../hooks/useFutures";
import { formatDuration, formatNumber, formatPrice, formatSignedUsd, formatUsd, pnlClass } from "../utils/formatters";
import { TransactionStatus } from "./TransactionStatus";
import { useWrongNetwork } from "./WalletButton";
import { Spinner } from "./ui";

/** The connected wallet's GPU futures positions. */
export function FuturesPositions({ title = "Futures positions" }: { title?: string }) {
  const { isConnected } = useAccount();
  const { positions } = useFuturesPositions();
  const actions = useFuturesActions();
  const wrong = useWrongNetwork();

  if (!hasFutures || !isConnected) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link to="/futures" className="text-xs text-secondary hover:underline">Futures markets →</Link>
      </div>
      {positions.length === 0 ? (
        <div className="panel p-6 text-sm text-muted">
          No futures positions. <Link to="/futures" className="text-secondary hover:underline">Lock in a compute price →</Link>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["Market", "Side", "Forward", "Contracts", "Margin", "Mark", "P&L", "Status", ""].map((h) => (
                  <th key={h} className="label px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 font-semibold">
                    {p.market.gpu} <span className="text-xs font-normal text-dim">#{p.market.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip ${p.side === "LONG" ? "border-pos/30 bg-pos/10 text-pos" : "border-neg/30 bg-neg/10 text-neg"}`}>{p.side}</span>
                  </td>
                  <td className="num px-4 py-3">{formatPrice(p.market.forwardPrice)}</td>
                  <td className="num px-4 py-3">{formatNumber(p.contracts)}</td>
                  <td className="num px-4 py-3">{formatUsd(p.margin)}</td>
                  <td className="num px-4 py-3">
                    {formatPrice(p.markPrice)}
                    <div className="text-[10px] text-dim">{p.market.settled ? "settlement" : "live oracle"}</div>
                  </td>
                  <td className={`num px-4 py-3 font-semibold ${pnlClass(p.pnl)}`}>{formatSignedUsd(p.pnl)}</td>
                  <td className="px-4 py-3 text-xs">
                    {p.closed ? (
                      <span className="text-pos">Settled · {formatUsd(p.payout)}</span>
                    ) : p.expired ? (
                      <span className="text-primary">Ready to settle</span>
                    ) : (
                      <span className="text-muted">{formatDuration(p.market.expiration - Date.now() / 1000)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!p.closed && p.expired && (
                      <button className="btn-primary px-3 py-1.5 text-xs" disabled={actions.isBusy || wrong} onClick={() => actions.settle(p.id)}>
                        {actions.isBusy && <Spinner className="h-3 w-3" />} SETTLE
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {actions.state.phase !== "idle" && (
        <div className="mt-3">
          <TransactionStatus state={actions.state} onDismiss={actions.reset} successNote={<span className="text-muted">Future settled: margin ± P&L paid to your wallet.</span>} />
        </div>
      )}
      <p className="mt-2 text-xs text-dim">P&L marks against the live oracle until expiry, then the oracle price at the expiration timestamp.</p>
    </section>
  );
}
