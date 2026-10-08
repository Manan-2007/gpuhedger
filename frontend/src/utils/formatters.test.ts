import { describe, expect, it } from "vitest";
import { formatPct, formatPrice, formatSignedUsd, formatUsd, fromUsdc, toUsdc } from "./formatters";

describe("formatPrice", () => {
  it("shows cents for whole-cent prices", () => {
    expect(formatPrice(2.2)).toBe("$2.20");
    expect(formatPrice(4)).toBe("$4.00");
  });
  it("never rounds a break-even of $2.235 to $2.24", () => {
    expect(formatPrice(2.235)).toBe("$2.235");
  });
  it("uses three decimals for sub-$0.10 premiums", () => {
    expect(formatPrice(0.035)).toBe("$0.035");
  });
});

describe("signed and percentage formats", () => {
  it("uses a real minus sign and an explicit plus", () => {
    expect(formatSignedUsd(1765)).toBe("+$1,765.00");
    expect(formatSignedUsd(-35)).toBe("−$35.00");
    expect(formatSignedUsd(0.001)).toBe("$0.00");
  });
  it("groups thousands in percentages", () => {
    expect(formatPct(5042.857, 0)).toBe("+5,043%");
    expect(formatPct(-8.1, 0)).toBe("−8%");
  });
  it("formats USD", () => {
    expect(formatUsd(2200)).toBe("$2,200.00");
  });
});

describe("USDC units (6 decimals)", () => {
  it("round-trips raw amounts", () => {
    expect(toUsdc(2.2)).toBe(2_200_000n);
    expect(fromUsdc(35_000_000n)).toBe(35);
  });
});
