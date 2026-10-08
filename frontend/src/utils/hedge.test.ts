import { describe, expect, it } from "vitest";
import type { OptionSeries } from "../types/options";
import type { FuturesMarket } from "../hooks/useFutures";
import { DAY, futuresEffective, hedgeCurve, optionEffective, rankHedges, type HedgeInputs } from "./hedge";

const NOW = 1_800_000_000;

function series(p: Partial<OptionSeries> & Pick<OptionSeries, "id" | "kind" | "strike" | "premium">): OptionSeries {
  return {
    address: "0x0000000000000000000000000000000000000001",
    gpu: "H100",
    region: "US-East",
    strikeRaw: 0n,
    expiration: NOW + 30 * DAY,
    contractSize: 100,
    premiumRaw: 0n,
    maxPayoutPerUnit: p.strike,
    maxContracts: 500,
    soldContracts: 0,
    openContracts: 0,
    exercisedContracts: 0,
    availableContracts: 500,
    collateralPerContract: 0,
    collateralBalance: 0,
    lockedCollateral: 0,
    totalPaidOut: 0,
    writer: "0x0000000000000000000000000000000000000002",
    settlementToken: "0x0000000000000000000000000000000000000003",
    oracle: "0x0000000000000000000000000000000000000004",
    createdAt: NOW,
    settled: false,
    ...p,
  };
}

function future(p: Partial<FuturesMarket> & Pick<FuturesMarket, "id" | "forwardPrice" | "band">): FuturesMarket {
  return {
    gpu: "H100",
    region: "US-East",
    expiration: NOW + 30 * DAY,
    contractSize: 100,
    maxContracts: 500,
    usedContracts: 0,
    availableContracts: 500,
    longContracts: 0,
    shortContracts: 0,
    writerCollateral: 0,
    writer: "0x0000000000000000000000000000000000000002",
    settled: false,
    settlementPrice: 0,
    bandRaw: 0n,
    ...p,
  };
}

// The seeded H100 book from contracts/script/Deploy.s.sol.
const book = [
  series({ id: 0, kind: "CALL", strike: 2.2, premium: 0.035 }),
  series({ id: 1, kind: "CALL", strike: 2.5, premium: 0.004 }),
  series({ id: 2, kind: "PUT", strike: 1.8, premium: 0.025 }),
  series({ id: 3, kind: "CALL", strike: 2.0, premium: 0.073, region: "US-West", expiration: NOW + 14 * DAY }),
  series({ id: 4, kind: "PUT", strike: 2.0, premium: 0.14, region: "EU-West", expiration: NOW + 60 * DAY }),
  series({ id: 9, kind: "CALL", strike: 2.4, premium: 0.019, expiration: NOW + 45 * DAY, maxContracts: 300, availableContracts: 300 }),
];
const h100Future = future({ id: 0, forwardPrice: 2.05, band: 1.0 });

const buyer = (over: Partial<HedgeInputs> = {}): HedgeInputs => ({
  role: "BUYER",
  gpu: "H100",
  hours: 5000,
  target: 2.3, // spot 2.00 × 1.15
  stress: 4,
  needBy: NOW + 30 * DAY,
  now: NOW,
  ...over,
});

describe("effective price", () => {
  it("a capped call turns a $4.00 spike into strike + premium", () => {
    expect(optionEffective("BUYER", book[0], 4)).toBeCloseTo(2.235, 9);
    // Beyond strike + cap ($4.40) the buyer pays the excess again.
    expect(optionEffective("BUYER", book[0], 5)).toBeCloseTo(5 - 2.2 + 0.035, 9);
  });

  it("a put floors provider revenue at strike − premium", () => {
    expect(optionEffective("PROVIDER", book[2], 1.2)).toBeCloseTo(1.775, 9);
  });

  it("futures lock the forward inside the band (handoff vector: LONG 5 @ 2.05, B 1.00, S 3.00)", () => {
    expect(futuresEffective(h100Future, 3)).toBeCloseTo(2.05, 9);
    // Long P&L = clamp(S − F, ±B) × 500 GPU-h = $475; plus $500 margin back = $975 payout.
    expect((3 - futuresEffective(h100Future, 3)) * 500 + 1.0 * 500).toBeCloseTo(975, 9);
    expect(futuresEffective(h100Future, 9)).toBeCloseTo(8, 9); // move capped at the band
  });
});

describe("rankHedges", () => {
  it("recommends the 30-day $2.20 call for 5,000 GPU-hours needed within a month", () => {
    const [best] = rankHedges(book, [h100Future], buyer());
    expect(best.series?.id).toBe(0);
    expect(best.contracts).toBe(50);
    expect(best.upfront).toBeCloseTo(175, 9);
    expect(best.protectedPrice).toBeCloseTo(2.235, 9);
    expect(best.effectiveAtStress * 5000).toBeCloseTo(11_175, 6);
    expect(best.meetsTarget).toBe(true);
    expect(best.coversNeed).toBe(true);
  });

  it("ranks hedges that expire before the compute is needed last", () => {
    const ranked = rankHedges(book, [h100Future], buyer());
    const early = ranked.find((c) => c.series?.id === 3)!; // 14-day call
    expect(early.coversNeed).toBe(false);
    expect(ranked.indexOf(early)).toBeGreaterThan(ranked.findIndex((c) => c.coversNeed && c.kind === "option"));
    expect(ranked.at(-1)?.coversNeed).toBe(false);
  });

  it("counts a series listed earlier today as covering the same horizon", () => {
    const listedThisMorning = series({ id: 7, kind: "CALL", strike: 2.2, premium: 0.035, expiration: NOW + 30 * DAY - 3600 });
    const [best] = rankHedges([listedThisMorning], [], buyer());
    expect(best.coversNeed).toBe(true);
  });

  it("skips series without enough capacity, expired series and other GPUs", () => {
    const ranked = rankHedges(
      [
        series({ id: 20, kind: "CALL", strike: 2.2, premium: 0.03, availableContracts: 10 }),
        series({ id: 21, kind: "CALL", strike: 2.2, premium: 0.03, expiration: NOW - 1 }),
        series({ id: 22, kind: "CALL", strike: 2.2, premium: 0.03, gpu: "A100" }),
        series({ id: 23, kind: "CALL", strike: 2.2, premium: 0.03, settled: true }),
      ],
      [],
      buyer(),
    );
    expect(ranked).toHaveLength(0);
  });

  it("providers get puts and short futures, best floor first", () => {
    const ranked = rankHedges(book, [h100Future], buyer({ role: "PROVIDER", target: 1.76, stress: 1, needBy: NOW + 30 * DAY }));
    expect(ranked.every((c) => c.kind === "future" || c.series?.kind === "PUT")).toBe(true);
    // At $1.00, the short future (revenue 2.05) beats the $2.00 put (1.86) and the $1.80 put (1.775).
    expect(ranked[0].kind).toBe("future");
  });

  it("returns nothing for zero hours", () => {
    expect(rankHedges(book, [h100Future], buyer({ hours: 0 }))).toEqual([]);
  });
});

describe("hedgeCurve", () => {
  it("spans 0.4× to 2.4× spot and stays flat inside the protected range", () => {
    const curve = hedgeCurve("BUYER", 1000, 2, 4, book[0]);
    expect(curve).toHaveLength(81);
    expect(curve[0].price).toBeCloseTo(0.8, 3);
    expect(curve.at(-1)!.price).toBeCloseTo(4.8, 3);
    const at4 = curve.reduce((a, b) => (Math.abs(b.price - 4) < Math.abs(a.price - 4) ? b : a));
    expect(at4.option).toBe(2235);
  });
});
