/**
 * Contracts decide expiry with `block.timestamp`, the UI with the browser clock. If the two disagree
 * (a laptop clock that's minutes off, or a local chain that has been time-travelled), the UI would offer
 * actions the contracts reject: buying an expired series, or hiding CLAIM after expiry.
 *
 * `chainNow()` is the browser clock corrected to the chain's. The offset is refreshed from the latest
 * block by <ChainClockSync/> and only applied when the clocks differ by more than SKEW_TOLERANCE_MS,
 * so on a healthy setup it is exactly Date.now().
 */
const SKEW_TOLERANCE_MS = 5_000;
let offsetMs = 0;

export function chainNow(): number {
  return Date.now() + offsetMs;
}

/** Record the latest block's timestamp (unix seconds) as observed at `observedAtMs`. */
export function syncChainClock(blockTimestamp: number, observedAtMs = Date.now()): number {
  const diff = blockTimestamp * 1000 - observedAtMs;
  offsetMs = Math.abs(diff) > SKEW_TOLERANCE_MS ? diff : 0;
  return offsetMs;
}
