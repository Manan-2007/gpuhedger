import { afterEach, describe, expect, it, vi } from "vitest";
import { chainNow, syncChainClock } from "./clock";

describe("chain clock", () => {
  afterEach(() => {
    syncChainClock(Date.now() / 1000);
    vi.useRealTimers();
  });

  it("ignores normal block lag", () => {
    const now = Date.now();
    expect(syncChainClock(now / 1000 - 1, now)).toBe(0);
  });

  it("follows the chain when the clocks disagree by more than 5 s", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    syncChainClock(1_000_000_000 + 86_400); // chain is a day ahead (time-travelled Anvil)
    expect(chainNow()).toBe(1_000_000_000_000 + 86_400_000);
  });
});
