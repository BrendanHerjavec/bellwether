import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIQUIDITY,
  applyTrade,
  cost,
  liquidationValue,
  logSumExp,
  maxSubsidy,
  priceOf,
  priceYes,
  prices,
  quote,
  seedState,
  sharesForBudget,
  toBoardDigits,
  tradeCost,
  type MarketState,
} from "./lmsr";

const b = DEFAULT_LIQUIDITY;

/** A spread of states including extreme and lopsided books. */
const STATES: MarketState[] = [
  { qYes: 0, qNo: 0, b },
  { qYes: 100, qNo: 0, b },
  { qYes: 0, qNo: 100, b },
  { qYes: 1234.5, qNo: 987.25, b },
  { qYes: -450, qNo: 320, b },
  { qYes: 5000, qNo: 0, b },
  { qYes: 0, qNo: 5000, b },
  { qYes: 12, qNo: 12, b: 25 },
  { qYes: 900, qNo: 100, b: 1000 },
];

/**
 * Deterministic pseudo-random state so a failure is reproducible.
 *
 * Quantities are kept inside the range the app can actually reach: balances are
 * 1000 credits and a contract costs at most 1, so a room of traders cannot push
 * |q_yes - q_no| far past a few thousand against b >= 150. See the "float64
 * saturation" test for what happens outside that envelope.
 */
function randomState(seed: number): MarketState {
  const rnd = (n: number) => {
    const x = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    qYes: (rnd(1) - 0.5) * 6000,
    qNo: (rnd(2) - 0.5) * 6000,
    b: 150 + rnd(3) * 850,
  };
}

describe("logSumExp", () => {
  it("matches the naive formula in the safe range", () => {
    expect(logSumExp(1, 2)).toBeCloseTo(Math.log(Math.exp(1) + Math.exp(2)), 12);
    expect(logSumExp(-3, 0.5)).toBeCloseTo(
      Math.log(Math.exp(-3) + Math.exp(0.5)),
      12,
    );
  });

  it("does not overflow where the naive formula does", () => {
    // exp(1000) is Infinity in float64; the factored form must survive.
    expect(Math.exp(1000)).toBe(Infinity);
    expect(logSumExp(1000, 999)).toBeCloseTo(1000 + Math.log1p(Math.exp(-1)), 10);
    expect(Number.isFinite(logSumExp(1e5, -1e5))).toBe(true);
  });

  it("is symmetric", () => {
    expect(logSumExp(4.2, -7.9)).toBeCloseTo(logSumExp(-7.9, 4.2), 12);
  });
});

describe("prices", () => {
  it("sum to 1 for every fixture state", () => {
    for (const state of STATES) {
      const p = prices(state);
      expect(p.yes + p.no).toBeCloseTo(1, 12);
    }
  });

  it("sum to 1 across 500 randomised states", () => {
    for (let i = 0; i < 500; i += 1) {
      const p = prices(randomState(i));
      expect(p.yes + p.no).toBeCloseTo(1, 12);
    }
  });

  it("stay strictly inside (0,1)", () => {
    for (let i = 0; i < 500; i += 1) {
      const p = priceYes(randomState(i));
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("are 50/50 when the book is balanced, regardless of level", () => {
    expect(priceYes({ qYes: 0, qNo: 0, b })).toBeCloseTo(0.5, 12);
    expect(priceYes({ qYes: 900, qNo: 900, b })).toBeCloseTo(0.5, 12);
    expect(priceYes({ qYes: -900, qNo: -900, b })).toBeCloseTo(0.5, 12);
  });

  it("match the exponential definition exactly", () => {
    for (const state of STATES) {
      const eYes = Math.exp(state.qYes / state.b);
      const eNo = Math.exp(state.qNo / state.b);
      expect(priceYes(state)).toBeCloseTo(eYes / (eYes + eNo), 12);
    }
  });

  it("rise monotonically as YES is bought", () => {
    let state: MarketState = { qYes: 0, qNo: 0, b };
    let previous = priceYes(state);
    for (let i = 0; i < 40; i += 1) {
      state = applyTrade(state, "YES", 25);
      const next = priceYes(state);
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
  });

  it("treat buying NO as the mirror of buying YES", () => {
    const base: MarketState = { qYes: 0, qNo: 0, b };
    const boughtYes = priceOf(applyTrade(base, "YES", 300), "YES");
    const boughtNo = priceOf(applyTrade(base, "NO", 300), "NO");
    expect(boughtYes).toBeCloseTo(boughtNo, 12);
  });
});

describe("cost function", () => {
  it("starts at b*ln(2) for an empty binary market", () => {
    expect(cost({ qYes: 0, qNo: 0, b })).toBeCloseTo(b * Math.LN2, 10);
  });

  it("matches C(q) = b * ln(exp(q_yes/b) + exp(q_no/b))", () => {
    for (const state of STATES) {
      const naive =
        state.b *
        Math.log(
          Math.exp(state.qYes / state.b) + Math.exp(state.qNo / state.b),
        );
      expect(cost(state)).toBeCloseTo(naive, 8);
    }
  });

  it("prices a trade as C(after) - C(before)", () => {
    const state: MarketState = { qYes: 120, qNo: 40, b };
    const shares = 275;
    const after = applyTrade(state, "YES", shares);
    expect(tradeCost(state, "YES", shares)).toBeCloseTo(
      cost(after) - cost(state),
      12,
    );
  });

  it("charges the marginal price for an infinitesimal trade", () => {
    for (const state of STATES) {
      const epsilon = 1e-4;
      const marginal = tradeCost(state, "YES", epsilon) / epsilon;
      // Tolerance is loose enough to absorb the curvature term, which is
      // O(epsilon / b) and therefore largest for the smallest b in STATES.
      expect(marginal).toBeCloseTo(priceYes(state), 5);
    }
  });

  it("never charges more than 1 credit or less than 0 per contract bought", () => {
    for (let i = 0; i < 200; i += 1) {
      const state = randomState(i);
      const shares = 1 + (i % 500);
      const c = tradeCost(state, "YES", shares);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(shares);
    }
  });

  it("is convex: each additional block costs strictly more than the last", () => {
    let state: MarketState = { qYes: 0, qNo: 0, b };
    let previousBlock = 0;
    for (let i = 0; i < 20; i += 1) {
      const blockCost = tradeCost(state, "YES", 50);
      if (i > 0) expect(blockCost).toBeGreaterThan(previousBlock);
      previousBlock = blockCost;
      state = applyTrade(state, "YES", 50);
    }
  });

  it("is path independent: two trades cost the same as one combined trade", () => {
    const state: MarketState = { qYes: 310, qNo: 90, b };
    const first = tradeCost(state, "YES", 100);
    const mid = applyTrade(state, "YES", 100);
    const second = tradeCost(mid, "YES", 150);
    expect(first + second).toBeCloseTo(tradeCost(state, "YES", 250), 10);
  });

  it("refunds exactly the purchase price when a trade is unwound", () => {
    const state: MarketState = { qYes: 500, qNo: 275, b };
    const paid = tradeCost(state, "YES", 180);
    const after = applyTrade(state, "YES", 180);
    const refund = tradeCost(after, "YES", -180);
    expect(paid + refund).toBeCloseTo(0, 10);
  });

  it("prices a complete set of YES and NO at exactly 1 credit each", () => {
    // Buying one YES and one NO must cost 1 credit: the pair always redeems
    // for exactly 1, so any other price would be an arbitrage against the AMM.
    for (const state of STATES) {
      const shares = 250;
      const afterYes = applyTrade(state, "YES", shares);
      const total =
        tradeCost(state, "YES", shares) + tradeCost(afterYes, "NO", shares);
      expect(total).toBeCloseTo(shares, 8);
    }
  });

  it("bounds the market maker's subsidy by b*ln(2)", () => {
    // Worst case: the market resolves YES after every YES contract was bought.
    // Payout minus revenue can never exceed b*ln(2).
    for (const bValue of [25, 150, 400, 1000]) {
      const start: MarketState = { qYes: 0, qNo: 0, b: bValue };
      for (const shares of [10, 100, 1000, 10000]) {
        const revenue = tradeCost(start, "YES", shares);
        const payout = shares;
        expect(payout - revenue).toBeLessThanOrEqual(maxSubsidy(bValue) + 1e-9);
      }
    }
  });
});

describe("price impact tuning", () => {
  /** Points the YES price moves when `budget` credits are staked on `side`. */
  const moveFor = (openingPrice: number, side: "YES" | "NO", budget: number) => {
    const state = seedState(openingPrice, DEFAULT_LIQUIDITY);
    const shares = sharesForBudget(state, side, budget);
    const after = applyTrade(state, side, shares);
    return Math.abs(priceYes(after) - priceYes(state)) * 100;
  };

  // Tuning is asserted in credits, not contracts. A trader picks a credit
  // stake; the contract count falls out of the price. On a long shot a fixed
  // credit stake buys many more contracts, so a contract-denominated test
  // would pass while the actual product moved the price thirty points.
  it("moves a balanced market a few points on the default stake", () => {
    const move = moveFor(0.5, "YES", 50);
    expect(move).toBeGreaterThan(1);
    expect(move).toBeLessThan(6);
  });

  it("moves a long shot a few points on the default stake", () => {
    const move = moveFor(0.18, "YES", 50);
    expect(move).toBeGreaterThan(1);
    expect(move).toBeLessThan(8);
  });

  it("keeps even a large single stake short of owning the market", () => {
    // 250 credits is a quarter of a balance. It should be a real move and
    // still not take an 18% market past a coin flip.
    const state = seedState(0.18, DEFAULT_LIQUIDITY);
    const shares = sharesForBudget(state, "YES", 250);
    const after = priceYes(applyTrade(state, "YES", shares));
    expect(after).toBeGreaterThan(0.22);
    expect(after).toBeLessThan(0.5);
  });

  it("lets a whole balance move a thin market decisively", () => {
    // Staking everything you have should be dramatic. That is what makes the
    // balance worth protecting, and it is the moment the board exists for.
    expect(moveFor(0.18, "YES", 1000)).toBeGreaterThan(15);
  });

  it("is symmetric between backing YES and backing NO", () => {
    expect(moveFor(0.5, "YES", 50)).toBeCloseTo(moveFor(0.5, "NO", 50), 6);
  });
});

describe("liquidationValue", () => {
  it("values a freshly opened position at exactly what was paid", () => {
    // The property that matters: opening a position must not show an instant
    // profit just because the purchase moved the price.
    for (const opening of [0.18, 0.35, 0.5, 0.72]) {
      const state = seedState(opening);
      const shares = sharesForBudget(state, "YES", 250);
      const paid = tradeCost(state, "YES", shares);
      const after = applyTrade(state, "YES", shares);
      expect(liquidationValue(after, shares, 0)).toBeCloseTo(paid, 8);
    }
  });

  it("is strictly less than shares times price, which is the naive figure", () => {
    const state = seedState(0.18);
    const shares = sharesForBudget(state, "YES", 250);
    const after = applyTrade(state, "YES", shares);
    const naive = shares * priceYes(after);
    expect(liquidationValue(after, shares, 0)).toBeLessThan(naive);
  });

  it("gains when someone else moves the price your way", () => {
    const state = seedState(0.3);
    const shares = sharesForBudget(state, "YES", 100);
    const paid = tradeCost(state, "YES", shares);
    let after = applyTrade(state, "YES", shares);
    // A different trader piles into the same side.
    after = applyTrade(after, "YES", 1500);
    expect(liquidationValue(after, shares, 0)).toBeGreaterThan(paid);
  });

  it("loses when the market moves against you", () => {
    const state = seedState(0.3);
    const shares = sharesForBudget(state, "YES", 100);
    const paid = tradeCost(state, "YES", shares);
    let after = applyTrade(state, "YES", shares);
    after = applyTrade(after, "NO", 1500);
    expect(liquidationValue(after, shares, 0)).toBeLessThan(paid);
  });

  it("values a matched YES and NO pair at close to its face value", () => {
    // Holding both sides is a guaranteed 1 credit per pair at settlement, so
    // unwinding it should return nearly that, less the round trip spread.
    const state = seedState(0.5);
    const value = liquidationValue(applyTrade(applyTrade(state, "YES", 200), "NO", 200), 200, 200);
    expect(value).toBeGreaterThan(190);
    expect(value).toBeLessThanOrEqual(200.0001);
  });

  it("is zero for an empty position", () => {
    expect(liquidationValue(seedState(0.4), 0, 0)).toBe(0);
  });
});

describe("quote", () => {
  it("reports the average price between the before and after prices", () => {
    const state = seedState(0.4);
    const q = quote(state, "YES", 200);
    expect(q.avgPrice).toBeGreaterThan(q.priceBefore);
    expect(q.avgPrice).toBeLessThan(q.priceAfter);
  });

  it("reports the price of the side being traded, not always YES", () => {
    const state = seedState(0.3);
    const q = quote(state, "NO", 100);
    expect(q.priceBefore).toBeCloseTo(0.7, 6);
    expect(q.priceAfter).toBeGreaterThan(q.priceBefore);
  });

  it("returns the post trade state ready to persist", () => {
    const state = seedState(0.5);
    const q = quote(state, "YES", 75);
    expect(q.state.qYes).toBeCloseTo(state.qYes + 75, 12);
    expect(q.state.qNo).toBeCloseTo(state.qNo, 12);
  });

  it("is a no-op for zero shares", () => {
    const state = seedState(0.62);
    const q = quote(state, "YES", 0);
    expect(q.cost).toBeCloseTo(0, 12);
    expect(q.avgPrice).toBeCloseTo(q.priceBefore, 12);
  });
});

describe("sharesForBudget", () => {
  it("inverts tradeCost", () => {
    for (const budget of [1, 10, 50, 250, 900]) {
      for (const state of STATES.slice(0, 5)) {
        const shares = sharesForBudget(state, "YES", budget);
        expect(tradeCost(state, "YES", shares)).toBeCloseTo(budget, 6);
      }
    }
  });

  it("buys fewer contracts as the price rises", () => {
    const cheap = sharesForBudget(seedState(0.2), "YES", 100);
    const dear = sharesForBudget(seedState(0.8), "YES", 100);
    expect(cheap).toBeGreaterThan(dear);
  });

  it("returns zero for a non positive budget", () => {
    expect(sharesForBudget(seedState(0.5), "YES", 0)).toBe(0);
    expect(sharesForBudget(seedState(0.5), "YES", -5)).toBe(0);
  });
});

describe("seedState", () => {
  it("produces the requested opening price", () => {
    for (const p of [0.02, 0.18, 0.23, 0.5, 0.67, 0.91, 0.98]) {
      expect(priceYes(seedState(p))).toBeCloseTo(p, 10);
    }
  });

  it("keeps the short side at zero so quantities stay readable", () => {
    expect(seedState(0.18).qYes).toBe(0);
    expect(seedState(0.82).qNo).toBe(0);
  });

  it("rejects prices at or outside the asymptotes", () => {
    expect(() => seedState(0)).toThrow();
    expect(() => seedState(1)).toThrow();
    expect(() => seedState(1.5)).toThrow();
  });
});

describe("guards", () => {
  it("rejects non positive liquidity", () => {
    expect(() => cost({ qYes: 0, qNo: 0, b: 0 })).toThrow();
    expect(() => priceYes({ qYes: 0, qNo: 0, b: -10 })).toThrow();
  });

  it("rejects non finite quantities", () => {
    expect(() => cost({ qYes: NaN, qNo: 0, b })).toThrow();
    expect(() => cost({ qYes: 0, qNo: Infinity, b })).toThrow();
  });

  it("documents where float64 saturates the price at exactly 1", () => {
    // Mathematically the price is always strictly inside (0,1), but once
    // (q_yes - q_no)/b exceeds ~37, exp(-x) underflows below the float64 gap
    // next to 1.0 and the price rounds to exactly 1. At that point a contract
    // costs its full face value and the market is dead.
    //
    // Reaching this needs |q_yes - q_no| > 37*b, i.e. ~14,800 contracts at the
    // default b. A room of traders holding 1000 credits each cannot get there,
    // so the app never sees it — but the board clamps for display regardless.
    const saturated: MarketState = { qYes: 40 * b, qNo: 0, b };
    expect(priceYes(saturated)).toBe(1);
    expect(tradeCost(saturated, "YES", 60)).toBeCloseTo(60, 6);
    expect(toBoardDigits(priceYes(saturated))).toBe("99");

    // One order of magnitude inside that boundary everything still holds.
    const extreme: MarketState = { qYes: 20 * b, qNo: 0, b };
    expect(priceYes(extreme)).toBeLessThan(1);
    expect(tradeCost(extreme, "YES", 60)).toBeLessThan(60);
  });
});

describe("toBoardDigits", () => {
  it("renders two digits for the board", () => {
    expect(toBoardDigits(0.07)).toBe("07");
    expect(toBoardDigits(0.235)).toBe("24");
    expect(toBoardDigits(0.5)).toBe("50");
  });

  it("never shows 00 or 100", () => {
    expect(toBoardDigits(0)).toBe("01");
    expect(toBoardDigits(1)).toBe("99");
  });
});
