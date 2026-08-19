import { describe, expect, it } from "vitest";
import {
  payoutFor,
  refundFor,
  standings,
  type HeldPosition,
  type SettlementRecord,
} from "./settlement";
import { applyTrade, cost, maxSubsidy, sharesForBudget, tradeCost } from "./lmsr";
import { createSeedMarkets, type Market } from "./markets";

function position(over: Partial<HeldPosition> = {}): HeldPosition {
  return { marketId: "m", yesShares: 0, noShares: 0, creditsStaked: 0, ...over };
}

describe("payouts", () => {
  it("pays one credit per winning contract and nothing for the losing side", () => {
    const held = position({ yesShares: 240, noShares: 90, creditsStaked: 100 });
    expect(payoutFor(held, "YES")).toBe(240);
    expect(payoutFor(held, "NO")).toBe(90);
  });

  it("pays nothing to a holder who was entirely wrong", () => {
    expect(payoutFor(position({ noShares: 400, creditsStaked: 120 }), "YES")).toBe(0);
  });

  it("refunds the stake on a void, not the position's market value", () => {
    // A position whose price has drifted a long way is still refunded at cost.
    // Refunding market value would hand a windfall to whoever the drift
    // favoured, on a question that should never have been asked.
    const held = position({ yesShares: 900, creditsStaked: 180 });
    expect(refundFor(held)).toBe(180);
  });
});

describe("the market maker's exposure", () => {
  /**
   * The one number that decides whether a company can afford to run this.
   *
   * Every winning contract is a credit the house pays out, and it only ever
   * collected what traders spent. The gap is the subsidy — and it is bounded,
   * which is what makes "everyone gets 1,000 credits" a budget rather than an
   * open cheque.
   *
   * `maxSubsidy` states the classic bound, b·ln2, and that is the figure for a
   * market opened at even money — where the book starts empty. A market opened
   * anywhere else starts with stock already on one side, and the ceiling is
   * then the cost of that opening book, C(q0). Both are fixed the moment the
   * market opens and neither depends on anything a trader subsequently does,
   * which is the property that actually matters.
   */
  function worstCaseLoss(market: Market): { loss: number; opening: number; b: number } {
    let state = market.state;
    const opening = cost(state);
    let collected = 0;

    // Hammer one side with everything. This is the worst case for the house:
    // every contract sold is a credit it will owe if that side comes in.
    for (let i = 0; i < 60; i += 1) {
      const shares = sharesForBudget(state, "YES", 500);
      collected += tradeCost(state, "YES", shares);
      state = applyTrade(state, "YES", shares);
    }

    // Payout if YES settles, less what was taken at the door.
    return { loss: state.qYes - collected, opening, b: state.b };
  }

  it("is capped at b·ln2 for a market opened at even money", () => {
    const evens = createSeedMarkets().find((m) => m.openingPrice === 0.5)!;
    const { loss, b } = worstCaseLoss(evens);
    expect(loss).toBeLessThanOrEqual(maxSubsidy(b) + 1e-6);
    // And it really does approach the bound, so this is not a vacuous ceiling.
    expect(loss).toBeGreaterThan(maxSubsidy(b) * 0.98);
  });

  it("is capped at the cost of the opening book for every market on the board", () => {
    for (const market of createSeedMarkets()) {
      const { loss, opening } = worstCaseLoss(market);
      expect(loss, market.id).toBeLessThanOrEqual(opening + 1e-6);
    }
  });
});

describe("standings", () => {
  const traders = [
    { id: "you", name: "You", isBot: false, isLeadership: false, balance: 1400 },
    { id: "bot-a", name: "Priya Raman", isBot: true, isLeadership: true, balance: 900 },
    { id: "bot-b", name: "Marcus Webb", isBot: true, isLeadership: false, balance: 1400 },
  ];

  const settled: SettlementRecord[] = [
    {
      marketId: "arr-40m", traderId: "you", outcome: "YES",
      yesShares: 500, noShares: 0, staked: 100, paid: 500, profit: 400, at: 1,
    },
    {
      marketId: "new-logo", traderId: "you", outcome: "NO",
      yesShares: 200, noShares: 0, staked: 80, paid: 0, profit: -80, at: 2,
    },
    {
      marketId: "roadmap-confidence", traderId: "you", outcome: "VOID",
      yesShares: 120, noShares: 0, staked: 60, paid: 60, profit: 0, at: 3,
    },
    {
      marketId: "arr-40m", traderId: "bot-b", outcome: "YES",
      yesShares: 300, noShares: 0, staked: 90, paid: 300, profit: 210, at: 1,
    },
  ];

  const openMarkets: Market[] = createSeedMarkets();

  it("ranks on total worth, so an open position is not counted as a loss", () => {
    const withPosition = {
      you: {},
      "bot-a": {
        "mobile-q4": position({ marketId: "mobile-q4", noShares: 900, creditsStaked: 300 }),
      },
      "bot-b": {},
    };

    const rows = standings(traders, withPosition, openMarkets, settled, 1000, "you");
    const priya = rows.find((r) => r.traderId === "bot-a")!;

    // Cash is 900 — behind on cash alone — but the open position is worth
    // roughly what was paid for it, so worth is back around 1,200.
    expect(priya.openValue).toBeGreaterThan(250);
    expect(priya.worth).toBeGreaterThan(priya.cash);
  });

  it("breaks ties on calls called right", () => {
    const rows = standings(traders, {}, openMarkets, settled, 1000, "you");
    const you = rows.find((r) => r.isYou)!;
    const marcus = rows.find((r) => r.traderId === "bot-b")!;

    expect(you.worth).toBe(marcus.worth);
    expect(you.callsRight).toBe(marcus.callsRight);
    // Same total, same number right — but you were also wrong about one, and
    // Marcus was not. Fewer wrong calls takes it.
    expect(marcus.rank).toBeLessThan(you.rank);
  });

  it("counts a void as neither right nor wrong", () => {
    const rows = standings(traders, {}, openMarkets, settled, 1000, "you");
    const you = rows.find((r) => r.isYou)!;
    expect(you.callsMade).toBe(2);
    expect(you.callsRight).toBe(1);
  });

  it("reports net against the starting balance", () => {
    const rows = standings(traders, {}, openMarkets, settled, 1000, "you");
    expect(rows.find((r) => r.isYou)!.net).toBe(400);
  });

  it("ranks from one, densely, in worth order", () => {
    const rows = standings(traders, {}, openMarkets, settled, 1000, "you");
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0].worth).toBeGreaterThanOrEqual(rows[1].worth);
    expect(rows[1].worth).toBeGreaterThanOrEqual(rows[2].worth);
  });
});
