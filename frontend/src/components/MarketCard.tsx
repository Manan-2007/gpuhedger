import { Link } from "react-router-dom";
import type { OptionSeries } from "../types/options";
import { formatNumber, formatPrice, formatTenor } from "../utils/formatters";
import { isActive } from "../hooks/useOption";
import { OptionTypeBadge } from "./ui";

export function MarketCard({ series: s, spot }: { series: OptionSeries; spot?: number }) {
  const itm = spot !== undefined && (s.kind === "CALL" ? spot > s.strike : spot < s.strike);
  const live = isActive(s);
  return (
    <div className={`panel p-4 ${live ? "" : "opacity-60"}`}>
      <Link to={`/markets/${s.id}`} className="block">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{s.gpu}</span>
            <OptionTypeBadge kind={s.kind} />
            {itm && <span className="chip border-pos/30 text-pos">ITM</span>}
          </div>
          <span className="text-xs text-muted">{s.region}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            ["Strike", formatPrice(s.strike)],
            ["Expiry", formatTenor(s.expiration)],
            ["Premium", formatPrice(s.premium)],
            ["OI", formatNumber(s.openContracts)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-bg/60 py-2">
              <div className="label text-[10px]">{k}</div>
              <div className="num mt-0.5 text-sm">{v}</div>
            </div>
          ))}
        </div>
      </Link>
      {live && (
        <Link to={`/trade?series=${s.id}`} className={"btn-primary mt-3 w-full py-2 text-xs"}>
          BUY {s.kind}
        </Link>
      )}
    </div>
  );
}
