import { Link, useNavigate } from "react-router-dom";
import type { OptionSeries } from "../types/options";
import { formatNumber, formatPrice, formatTenor } from "../utils/formatters";
import { isActive } from "../hooks/useOption";
import { OptionTypeBadge } from "./ui";
import { MarketCard } from "./MarketCard";

/** Indicative bid (simulated market-maker spread). The ask is the executable onchain premium. */
export function indicativeBid(premium: number) {
  return Math.max(premium - Math.max(premium * 0.06, 0.001), 0);
}

export function MarketTable({ series, prices }: { series: OptionSeries[]; prices: Partial<Record<string, number>> }) {
  const navigate = useNavigate();
  return (
    <>
      {/* Desktop table */}
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {["GPU", "Region", "Type", "Strike", "Expiry", "Premium", "Bid", "Ask", "Open Int.", ""].map((h, i) => (
                <th key={i} className={`label px-4 py-3 font-medium ${i >= 3 && i <= 8 ? "text-right" : ""}`}>
                  {h === "Bid" ? (
                    <span title="Indicative bid (simulated). No secondary market yet.">Bid*</span>
                  ) : h === "Ask" ? (
                    <span title="Executable onchain premium">Ask</span>
                  ) : (
                    h
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => {
              const spot = prices[s.gpu];
              const itm = spot !== undefined && (s.kind === "CALL" ? spot > s.strike : spot < s.strike);
              const live = isActive(s);
              return (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/markets/${s.id}`)}
                  className={`cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-panel-2 ${live ? "" : "opacity-50"}`}
                >
                  <td className="px-4 py-3.5">
                    <div className="font-semibold">{s.gpu}</div>
                    <div className="num text-[11px] text-dim">#{s.id}</div>
                  </td>
                  <td className="px-4 py-3.5 text-muted">{s.region}</td>
                  <td className="px-4 py-3.5">
                    <OptionTypeBadge kind={s.kind} />
                  </td>
                  <td className="num px-4 py-3.5 text-right">
                    {formatPrice(s.strike)}
                    {itm && <span className="ml-1.5 text-[10px] font-semibold text-pos">ITM</span>}
                  </td>
                  <td className="num px-4 py-3.5 text-right text-muted">{formatTenor(s.expiration)}</td>
                  <td className="num px-4 py-3.5 text-right font-semibold">{formatPrice(s.premium)}</td>
                  <td className="num px-4 py-3.5 text-right text-muted">{formatPrice(indicativeBid(s.premium))}</td>
                  <td className="num px-4 py-3.5 text-right">{formatPrice(s.premium)}</td>
                  <td className="num px-4 py-3.5 text-right">{formatNumber(s.openContracts)}</td>
                  <td className="px-4 py-3.5 text-right">
                    {live ? (
                      <Link
                        to={`/trade?series=${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`${s.kind === "CALL" ? "btn-pos" : "btn-neg"} whitespace-nowrap px-3 py-1.5 text-xs`}
                      >
                        BUY {s.kind}
                      </Link>
                    ) : (
                      <span className="text-xs text-dim">{s.settled ? "Settled" : "Expired"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {series.map((s) => (
          <MarketCard key={s.id} series={s} spot={prices[s.gpu]} />
        ))}
      </div>
      <p className="mt-3 text-xs text-dim">
        Premium/Ask = executable onchain price per GPU-hour. *Bid is indicative (simulated) — secondary trading is on the roadmap.
        Open interest = open contracts onchain.
      </p>
    </>
  );
}
