/**
 * GpuHedger options pricing utilities.
 *
 * MODEL PRICE — FOR DEMONSTRATION PURPOSES. This is a simplified Black-Scholes model
 * (European exercise, lognormal underlying, constant volatility and rate, no dividends /
 * convenience yield). GPU compute is not a traded asset with continuous hedging, so these
 * values are indicative only and are not institutional-grade option marks.
 *
 * Conventions: prices are USD per GPU-hour; time is in years; volatility and rate are
 * decimals (0.42 = 42%).
 */

import type { OptionKind } from "../types/options";
import { chainNow } from "../lib/clock";

export const DEFAULT_RISK_FREE_RATE = 0.04;
export const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export interface PricingInputs {
  spot: number;
  strike: number;
  timeToExpiry: number; // years
  volatility: number; // annualized, decimal
  riskFreeRate?: number;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation, |error| < 1.5e-7). */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

function d1d2({ spot, strike, timeToExpiry, volatility, riskFreeRate = DEFAULT_RISK_FREE_RATE }: PricingInputs) {
  const sigmaSqrtT = volatility * Math.sqrt(timeToExpiry);
  const d1 = (Math.log(spot / strike) + (riskFreeRate + (volatility * volatility) / 2) * timeToExpiry) / sigmaSqrtT;
  return { d1, d2: d1 - sigmaSqrtT };
}

function isDegenerate({ spot, strike, timeToExpiry, volatility }: PricingInputs) {
  return !(spot > 0) || !(strike > 0) || !(timeToExpiry > 0) || !(volatility > 0);
}

/** Black-Scholes call price: C = S·N(d1) − K·e^(−rT)·N(d2) */
export function calculateCallPrice(inputs: PricingInputs): number {
  if (isDegenerate(inputs)) return calculateIntrinsicValue("CALL", inputs.spot, inputs.strike);
  const { spot, strike, timeToExpiry, riskFreeRate = DEFAULT_RISK_FREE_RATE } = inputs;
  const { d1, d2 } = d1d2(inputs);
  return Math.max(spot * normCdf(d1) - strike * Math.exp(-riskFreeRate * timeToExpiry) * normCdf(d2), 0);
}

/** Black-Scholes put price: P = K·e^(−rT)·N(−d2) − S·N(−d1) */
export function calculatePutPrice(inputs: PricingInputs): number {
  if (isDegenerate(inputs)) return calculateIntrinsicValue("PUT", inputs.spot, inputs.strike);
  const { spot, strike, timeToExpiry, riskFreeRate = DEFAULT_RISK_FREE_RATE } = inputs;
  const { d1, d2 } = d1d2(inputs);
  return Math.max(strike * Math.exp(-riskFreeRate * timeToExpiry) * normCdf(-d2) - spot * normCdf(-d1), 0);
}

export function calculateOptionPrice(kind: OptionKind, inputs: PricingInputs): number {
  return kind === "CALL" ? calculateCallPrice(inputs) : calculatePutPrice(inputs);
}

/**
 * Model price of a GpuHedger option, whose payout is capped at `payoutCap` per GPU-hour
 * (the series is fully collateralized). A capped call is a call spread K / K+cap; a capped
 * put is a put spread K / K−cap (or a plain put when cap ≥ strike).
 */
export function calculateCappedOptionPrice(kind: OptionKind, inputs: PricingInputs, payoutCap: number): number {
  if (kind === "CALL") {
    return Math.max(calculateCallPrice(inputs) - calculateCallPrice({ ...inputs, strike: inputs.strike + payoutCap }), 0);
  }
  const lower = inputs.strike - payoutCap;
  if (lower <= 0) return calculatePutPrice(inputs);
  return Math.max(calculatePutPrice(inputs) - calculatePutPrice({ ...inputs, strike: lower }), 0);
}

/** Delta of an uncapped option (∂V/∂S). */
export function calculateDelta(kind: OptionKind, inputs: PricingInputs): number {
  if (isDegenerate(inputs)) {
    const itm = kind === "CALL" ? inputs.spot > inputs.strike : inputs.spot < inputs.strike;
    return itm ? (kind === "CALL" ? 1 : -1) : 0;
  }
  const { d1 } = d1d2(inputs);
  return kind === "CALL" ? normCdf(d1) : normCdf(d1) - 1;
}

/** Intrinsic value per GPU-hour: max(S − K, 0) for calls, max(K − S, 0) for puts. Optionally capped. */
export function calculateIntrinsicValue(kind: OptionKind, spot: number, strike: number, payoutCap = Infinity): number {
  const raw = kind === "CALL" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  return Math.min(raw, payoutCap);
}

/** Call profit at expiry per GPU-hour: max(S − K, 0) − premium (capped payout when `payoutCap` is set). */
export function calculateCallPayoff(spot: number, strike: number, premium: number, payoutCap = Infinity): number {
  return calculateIntrinsicValue("CALL", spot, strike, payoutCap) - premium;
}

/** Put profit at expiry per GPU-hour: max(K − S, 0) − premium. */
export function calculatePutPayoff(spot: number, strike: number, premium: number, payoutCap = Infinity): number {
  return calculateIntrinsicValue("PUT", spot, strike, payoutCap) - premium;
}

export function calculatePayoff(kind: OptionKind, spot: number, strike: number, premium: number, payoutCap = Infinity) {
  return kind === "CALL"
    ? calculateCallPayoff(spot, strike, premium, payoutCap)
    : calculatePutPayoff(spot, strike, premium, payoutCap);
}

/**
 * Premiums are fixed when a series is written and don't follow the oracle. If the price has since
 * moved through the strike, the option can pay more right now than it costs: a buyer could buy and
 * exercise immediately at the writer's expense. The UI warns whenever that is true.
 */
export function isStalePremium(kind: OptionKind, spot: number, strike: number, premium: number, payoutCap = Infinity): boolean {
  return calculateIntrinsicValue(kind, spot, strike, payoutCap) > premium;
}

/** Underlying price at which the position breaks even at expiry. */
export function calculateBreakEven(kind: OptionKind, strike: number, premium: number): number {
  return kind === "CALL" ? strike + premium : Math.max(strike - premium, 0);
}

export interface TradeSummary {
  gpuHours: number;
  totalPremium: number; // $ = max loss
  maxLoss: number;
  maxPayout: number; // $ capped payout
  maxProfit: number; // $ = maxPayout − totalPremium
  breakEven: number; // $ per GPU-hour
  collateralBacking: number; // $ locked by the writer for these contracts
}

/** Everything a buyer needs to see before confirming a trade. */
export function summarizeTrade(params: {
  kind: OptionKind;
  strike: number;
  premium: number;
  payoutCap: number;
  contractSize: number;
  contracts: number;
}): TradeSummary {
  const gpuHours = params.contractSize * params.contracts;
  const totalPremium = params.premium * gpuHours;
  const maxPayout = params.payoutCap * gpuHours;
  return {
    gpuHours,
    totalPremium,
    maxLoss: totalPremium,
    maxPayout,
    maxProfit: maxPayout - totalPremium,
    breakEven: calculateBreakEven(params.kind, params.strike, params.premium),
    collateralBacking: maxPayout,
  };
}

export function yearsUntil(expirationSeconds: number, nowMs = chainNow()): number {
  return Math.max(expirationSeconds - nowMs / 1000, 0) / SECONDS_PER_YEAR;
}

export interface PayoffPoint {
  spot: number;
  expiry: number; // $ P&L at expiry
  today: number; // $ model P&L now
}

/** P&L curve across a range of underlying prices, for charting. */
export function buildPayoffCurve(params: {
  kind: OptionKind;
  strike: number;
  premium: number;
  payoutCap: number;
  gpuHours: number;
  volatility: number;
  timeToExpiry: number;
  spotMin: number;
  spotMax: number;
  steps?: number;
}): PayoffPoint[] {
  const { kind, strike, premium, payoutCap, gpuHours, volatility, timeToExpiry, spotMin, spotMax } = params;
  const steps = params.steps ?? 120;
  const spots: number[] = [];
  for (let i = 0; i <= steps; i++) spots.push(spotMin + ((spotMax - spotMin) * i) / steps);
  // Include the payoff kinks (strike and cap) so the expiry line is drawn exactly.
  const capKink = kind === "CALL" ? strike + payoutCap : strike - payoutCap;
  for (const kink of [strike, capKink]) if (kink > spotMin && kink < spotMax) spots.push(kink);
  spots.sort((a, b) => a - b);

  return spots.map((spot) => {
    const expiry = calculatePayoff(kind, spot, strike, premium, payoutCap) * gpuHours;
    const model = calculateCappedOptionPrice(kind, { spot, strike, timeToExpiry, volatility }, payoutCap);
    return { spot: round(spot, 4), expiry: round(expiry, 2), today: round((model - premium) * gpuHours, 2) };
  });
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
