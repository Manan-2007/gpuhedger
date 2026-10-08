import type { Address } from "viem";
import type { GpuSymbol } from "./markets";

export type OptionKind = "CALL" | "PUT";

/** CLAIMABLE = expired in the money; payout is claimed at the settlement price recorded at expiry. */
export type PositionStatus = "OPEN" | "EXERCISED" | "EXPIRED" | "CLAIMABLE";

/** An option series as read from the ComputeOption contract, normalized for the UI.
 *  USD values are floats for display/maths; the `*Raw` bigints are used for transactions. */
export interface OptionSeries {
  id: number;
  address: Address;
  gpu: GpuSymbol;
  region: string;
  kind: OptionKind;
  strike: number; // $ per GPU-hour
  strikeRaw: bigint;
  expiration: number; // unix seconds
  contractSize: number; // GPU-hours per contract
  premium: number; // $ per GPU-hour (executable onchain)
  premiumRaw: bigint;
  maxPayoutPerUnit: number; // $ per GPU-hour cap
  maxContracts: number;
  soldContracts: number;
  openContracts: number;
  exercisedContracts: number;
  availableContracts: number;
  collateralPerContract: number; // $
  collateralBalance: number; // $
  lockedCollateral: number; // $
  totalPaidOut: number; // $
  writer: Address;
  settlementToken: Address;
  oracle: Address;
  createdAt: number;
  settled: boolean;
}

export interface Position {
  key: string; // `${seriesId}-${positionId}`
  seriesId: number;
  option: Address;
  positionId: bigint;
  tokenId: bigint; // PositionNFT id — positions are transferable
  owner: Address;
  contracts: number;
  premiumPaid: number; // $ total
  openedAt: number;
  status: PositionStatus;
  payout: number; // $ (exercised only)
  closedAt: number;
}

/** Position enriched with live model values. All model values are estimates. */
export interface PositionView extends Position {
  series: OptionSeries;
  spot: number;
  intrinsicPerUnit: number; // capped
  exerciseValue: number; // $ if exercised now (onchain formula)
  estimatedValue: number; // $ model value
  pnl: number; // $ unrealized (open) or realized
  distanceToStrike: number; // % spot vs strike
  timeRemaining: number; // seconds
  canExercise: boolean;
  canClaim: boolean;
  claimValue: number; // $ claimable at the expiry settlement price
}
