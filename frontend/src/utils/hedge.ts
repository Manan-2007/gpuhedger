import type { OptionSeries } from "../types/options";
import type { FuturesMarket } from "../hooks/useFutures";

/** Who is hedging: a compute buyer (calls / long futures) or a compute seller (puts / short futures). */
export type HedgeRole = "BUYER" | "PROVIDER";

export const DAY = 86_400;

/** Series expiries are set in whole days from listing, so "live by the need date" allows one day of slack:
 *  a 30-day series listed this morning still counts as covering "1 month" this afternoon. */
export const coversDate = (expiration: number, needBy: number) => expiration >= needBy - DAY;

/** Effective $/GPU-hour at underlying price `price` with an option hedge: cost for a buyer, revenue for a provider. */
export function optionEffective(role: HedgeRole, s: Pick<OptionSeries, "strike" | "premium" | "maxPayoutPerUnit">, price: number) {
  if (role === "BUYER") {
    const payout = Math.min(Math.max(price - s.strike, 0), s.maxPayoutPerUnit);
    return price - payout + s.premium;
  }
  const payout = Math.min(Math.max(s.strike - price, 0), s.maxPayoutPerUnit);
  return price + payout - s.premium;
}

/** Effective $/GPU-hour with a futures hedge. Long cost and short revenue are both S − clamp(S − F, −B, +B). */
export function futuresEffective(m: Pick<FuturesMarket, "forwardPrice" | "band">, price: number) {
  return price - Math.max(Math.min(price - m.forwardPrice, m.band), -m.band);
}

export interface HedgeCandidate {
  key: string;
  kind: "option" | "future";
  series?: OptionSeries;
  future?: FuturesMarket;
  expiration: number; // unix seconds
  contracts: number;
  gpuHours: number; // covered
  upfront: number; // premium paid ($), or margin posted for futures
  premium: number; // cost of protection ($); 0 for futures
  protectedPrice: number; // worst effective $/GPU-h inside the protected range
  protectedUntil: number; // underlying price beyond which protection stops (payout cap / band)
  effectiveAtStress: number; // $/GPU-h at the stress price
  meetsTarget: boolean;
  coversNeed: boolean; // still live on the date the compute is needed
}

export interface HedgeInputs {
  role: HedgeRole;
  gpu: string;
  hours: number;
  target: number; // $/GPU-h: most a buyer can pay, least a provider can accept
  stress: number; // $/GPU-h scenario
  needBy: number; // unix seconds: when the compute is bought (buyer) or sold (provider)
  now: number; // unix seconds
}

/**
 * Every live option series and futures market that can hedge `hours` of `gpu`, ranked best first:
 * 1. still live when the compute is needed (a hedge that expires first protects nothing),
 * 2. meets the price target,
 * 3. best effective price in the stress scenario,
 * 4. cheapest protection, then the nearest expiry (least time value).
 * Settlement-value maths: ignores time value and fees.
 */
export function rankHedges(series: OptionSeries[], futures: FuturesMarket[], i: HedgeInputs): HedgeCandidate[] {
  if (i.hours <= 0) return [];
  const out: HedgeCandidate[] = [];
  const kind = i.role === "BUYER" ? "CALL" : "PUT";

  for (const s of series) {
    if (s.gpu !== i.gpu || s.kind !== kind || s.settled || s.expiration <= i.now) continue;
    const contracts = Math.ceil(i.hours / s.contractSize);
    if (contracts > s.availableContracts) continue;
    const premium = s.premium * s.contractSize * contracts;
    const protectedPrice = i.role === "BUYER" ? s.strike + s.premium : s.strike - s.premium;
    out.push({
      key: `o${s.id}`,
      kind: "option",
      series: s,
      expiration: s.expiration,
      contracts,
      gpuHours: contracts * s.contractSize,
      upfront: premium,
      premium,
      protectedPrice,
      protectedUntil: i.role === "BUYER" ? s.strike + s.maxPayoutPerUnit : Math.max(s.strike - s.maxPayoutPerUnit, 0),
      effectiveAtStress: optionEffective(i.role, s, i.stress),
      meetsTarget: i.role === "BUYER" ? protectedPrice <= i.target : protectedPrice >= i.target,
      coversNeed: coversDate(s.expiration, i.needBy),
    });
  }

  for (const m of futures) {
    if (m.gpu !== i.gpu || m.settled || m.expiration <= i.now) continue;
    const contracts = Math.ceil(i.hours / m.contractSize);
    if (contracts > m.availableContracts) continue;
    out.push({
      key: `f${m.id}`,
      kind: "future",
      future: m,
      expiration: m.expiration,
      contracts,
      gpuHours: contracts * m.contractSize,
      upfront: m.band * m.contractSize * contracts,
      premium: 0,
      protectedPrice: m.forwardPrice,
      protectedUntil: i.role === "BUYER" ? m.forwardPrice + m.band : Math.max(m.forwardPrice - m.band, 0),
      effectiveAtStress: futuresEffective(m, i.stress),
      meetsTarget: i.role === "BUYER" ? m.forwardPrice <= i.target : m.forwardPrice >= i.target,
      coversNeed: coversDate(m.expiration, i.needBy),
    });
  }

  const sign = i.role === "BUYER" ? 1 : -1; // buyers want lower effective cost, providers higher revenue
  return out.sort((a, b) => {
    if (a.coversNeed !== b.coversNeed) return a.coversNeed ? -1 : 1;
    if (a.meetsTarget !== b.meetsTarget) return a.meetsTarget ? -1 : 1;
    const stress = sign * (a.effectiveAtStress - b.effectiveAtStress);
    if (Math.abs(stress) > 1e-9) return stress;
    if (Math.abs(a.premium - b.premium) > 1e-9) return a.premium - b.premium;
    return a.expiration - b.expiration;
  });
}

/** Total cost (buyer) or revenue (provider) across a range of underlying prices, for the comparison chart. */
export function hedgeCurve(
  role: HedgeRole,
  hours: number,
  spot: number,
  stress: number,
  option?: Pick<OptionSeries, "strike" | "premium" | "maxPayoutPerUnit">,
  future?: Pick<FuturesMarket, "forwardPrice" | "band">,
  points = 81,
) {
  if (spot <= 0 || hours <= 0) return [];
  const lo = spot * 0.4;
  const hi = Math.max(spot * 2.4, stress * 1.1);
  return Array.from({ length: points }, (_, k) => {
    const p = lo + ((hi - lo) * k) / (points - 1);
    return {
      price: Math.round(p * 1000) / 1000,
      unhedged: Math.round(p * hours),
      option: option ? Math.round(optionEffective(role, option, p) * hours) : undefined,
      future: future ? Math.round(futuresEffective(future, p) * hours) : undefined,
    };
  });
}
