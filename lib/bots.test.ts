import { describe, expect, it } from "vitest";
import {
  BOT_ROSTER,
  decideBotTrade,
  makeRandom,
  nextDelay,
  type BotPersona,
} from "./bots";
import { applyTrade, priceOf, sharesForBudget } from "./lmsr";
import { createSeedMarkets, type Market } from "./markets";

const rng = () => makeRandom(1234);

function marketsWith(overrides: Partial<Market> & { id: string }): Market[] {
  return createSeedMarkets().map((m) =>
    m.id === overrides.id ? { ...m, ...overrides } : m,
  );
}

/** Run a persona many times and collect which side it took. */
function sidesTaken(persona: BotPersona, markets: Market[], runs = 200) {
  const random = makeRandom(7);
  const sides: string[] = [];
  for (let i = 0; i < runs; i += 1) {
    const decision = decideBotTrade(persona, markets, 1000, random);
    if (decision) sides.push(decision.side);
  }
  return sides;
}

describe("personas behave differently", () => {
  const markets = createSeedMarkets();

  it("the optimist only ever backs YES", () => {
    const sides = sidesTaken("optimist", markets);
    expect(sides.length).toBeGreaterThan(50);
    expect(sides.every((s) => s === "YES")).toBe(true);
  });

  it("the cynic only ever backs NO", () => {
    const sides = sidesTaken("cynic", markets);
    expect(sides.length).toBeGreaterThan(50);
    expect(sides.every((s) => s === "NO")).toBe(true);
  });

  it("the contrarian always buys the cheap side", () => {
    const random = makeRandom(99);
    for (let i = 0; i < 200; i += 1) {
      const decision = decideBotTrade("contrarian", markets, 1000, random);
      if (!decision) continue;
      const market = markets.find((m) => m.id === decision.marketId)!;
      const pricePaid = priceOf(market.state, decision.side);
      // It only ever takes a side trading below even money.
      expect(pricePaid).toBeLessThan(0.5);
    }
  });

  it("the contrarian ignores markets near even money", () => {
    // Only the ambiguous market sits at 50, and nothing else is in 0.35..0.65
    // at the opening prices, so a coin-flip-only board leaves it with nothing.
    const flat = createSeedMarkets().map((m) => ({
      ...m,
      state: { ...m.state, qYes: 0, qNo: 0 },
    }));
    const random = makeRandom(3);
    for (let i = 0; i < 50; i += 1) {
      expect(decideBotTrade("contrarian", flat, 1000, random)).toBeNull();
    }
  });

  it("the informed bot takes the side it is scripted to be right about", () => {
    const random = makeRandom(11);
    for (let i = 0; i < 300; i += 1) {
      const decision = decideBotTrade("informed", markets, 1000, random);
      if (!decision) continue;
      const market = markets.find((m) => m.id === decision.marketId)!;
      expect(decision.side).toBe(market.demoOutcome);
    }
  });

  it("the informed bot has no view on the deliberately ambiguous market", () => {
    // It is the one market with no scripted outcome. A bot dragging it
    // somewhere confident would undermine the void that settles it.
    const random = makeRandom(5);
    for (let i = 0; i < 300; i += 1) {
      const decision = decideBotTrade("informed", markets, 1000, random);
      expect(decision?.marketId).not.toBe("roadmap-confidence");
    }
  });
});

describe("the board does not drift one way all session", () => {
  /** Run every persona against a shared book for `ticks` rounds. */
  function runSession(ticks: number, seed: number) {
    let markets = createSeedMarkets();
    const random = makeRandom(seed);
    const personas: BotPersona[] = ["optimist", "cynic", "contrarian", "informed"];
    for (let i = 0; i < ticks; i += 1) {
      const persona = personas[i % personas.length];
      const decision = decideBotTrade(persona, markets, 100000, random);
      if (!decision) continue;
      markets = markets.map((m) => {
        if (m.id !== decision.marketId) return m;
        const shares = sharesForBudget(m.state, decision.side, decision.credits);
        return { ...m, state: applyTrade(m.state, decision.side, shares) };
      });
    }
    return markets;
  }

  it("stakes symmetrically whether bullish or bearish", () => {
    // The bug this guards: with views measured in percentage points, a bearish
    // view on a cheap market gets clamped by the floor at 0 while a bullish one
    // is not. Conviction scales with edge, so the optimist quietly outspent the
    // cynic roughly two to one and the whole board drifted up.
    const markets = createSeedMarkets();
    const spendFor = (persona: BotPersona) => {
      const random = makeRandom(2468);
      let total = 0;
      for (let i = 0; i < 300; i += 1) {
        const decision = decideBotTrade(persona, markets, 1e9, random);
        if (decision) total += decision.credits;
      }
      return total;
    };

    const optimist = spendFor("optimist");
    const cynic = spendFor("cynic");
    expect(optimist).toBeGreaterThan(0);
    expect(cynic).toBeGreaterThan(0);
    // Within 25% of each other across the whole seeded board.
    expect(Math.abs(optimist - cynic) / Math.max(optimist, cynic)).toBeLessThan(0.25);
  });

  it("does not walk every market upward", () => {
    // The failure this guards against: bots that anchor to the live price
    // chase their own momentum, and every market on the board drifts up
    // together. At least one market must end below where it opened.
    const markets = runSession(400, 2024);
    const moved = markets.map(
      (m) => priceOf(m.state, "YES") - m.openingPrice,
    );
    expect(moved.some((d) => d < 0)).toBe(true);
    expect(moved.some((d) => d > 0)).toBe(true);
  });

  it("leaves the deliberately ambiguous market near where it opened", () => {
    // Nothing has a real view on this one, so it must stay genuinely
    // uncertain — otherwise the void that settles it looks arbitrary.
    const markets = runSession(400, 99);
    const ambiguous = markets.find((m) => m.id === "roadmap-confidence")!;
    const price = priceOf(ambiguous.state, "YES");
    expect(price).toBeGreaterThan(0.3);
    expect(price).toBeLessThan(0.7);
  });

  it("never pins a market at an extreme", () => {
    const markets = runSession(800, 7);
    for (const market of markets) {
      const price = priceOf(market.state, "YES");
      expect(price).toBeGreaterThan(0.03);
      expect(price).toBeLessThan(0.97);
    }
  });

  it("stops the optimist once the price passes its view", () => {
    // Push a market far above anything the optimist could believe, and it
    // should simply lose interest rather than keep buying.
    const rich = createSeedMarkets().map((m) => ({
      ...m,
      state: applyTrade(m.state, "YES", 4000),
    }));
    const random = makeRandom(55);
    for (let i = 0; i < 60; i += 1) {
      expect(decideBotTrade("optimist", rich, 100000, random)).toBeNull();
    }
  });

  it("stops the cynic once the price falls below its view", () => {
    const cheap = createSeedMarkets().map((m) => ({
      ...m,
      state: applyTrade(m.state, "NO", 4000),
    }));
    const random = makeRandom(56);
    for (let i = 0; i < 60; i += 1) {
      expect(decideBotTrade("cynic", cheap, 100000, random)).toBeNull();
    }
  });
});

describe("the informed bot moves prices toward the truth", () => {
  it("drags a long shot up over a session when it is scripted YES", () => {
    let markets = createSeedMarkets();
    const random = makeRandom(42);
    const before = priceOf(
      markets.find((m) => m.id === "enterprise-date")!.state,
      "YES",
    );

    for (let i = 0; i < 60; i += 1) {
      const decision = decideBotTrade("informed", markets, 100000, random);
      if (!decision) continue;
      markets = markets.map((m) => {
        if (m.id !== decision.marketId) return m;
        const shares = sharesForBudget(m.state, decision.side, decision.credits);
        return { ...m, state: applyTrade(m.state, decision.side, shares) };
      });
    }

    const after = priceOf(
      markets.find((m) => m.id === "enterprise-date")!.state,
      "YES",
    );
    expect(after).toBeGreaterThan(before);
  });

  it("never pushes a price to the asymptote, which would look fake", () => {
    let markets = createSeedMarkets();
    const random = makeRandom(8);
    for (let i = 0; i < 400; i += 1) {
      const decision = decideBotTrade("informed", markets, 1e9, random);
      if (!decision) continue;
      markets = markets.map((m) => {
        if (m.id !== decision.marketId) return m;
        const shares = sharesForBudget(m.state, decision.side, decision.credits);
        return { ...m, state: applyTrade(m.state, decision.side, shares) };
      });
    }
    for (const market of markets) {
      const price = priceOf(market.state, "YES");
      expect(price).toBeGreaterThan(0.02);
      expect(price).toBeLessThan(0.98);
    }
  });
});

describe("guards", () => {
  const markets = createSeedMarkets();

  it("never stakes more than the balance", () => {
    const random = makeRandom(17);
    for (const balance of [5, 12, 40, 97, 300]) {
      for (let i = 0; i < 40; i += 1) {
        const decision = decideBotTrade("optimist", markets, balance, random);
        if (!decision) continue;
        expect(decision.credits).toBeLessThanOrEqual(Math.floor(balance));
        expect(decision.credits).toBeGreaterThan(0);
      }
    }
  });

  it("stops trading when broke", () => {
    const random = makeRandom(21);
    expect(decideBotTrade("optimist", markets, 0, random)).toBeNull();
    expect(decideBotTrade("cynic", markets, 4, random)).toBeNull();
  });

  it("never trades a market that is not open", () => {
    const closed = createSeedMarkets().map((m) => ({
      ...m,
      status: "locked" as const,
    }));
    const random = makeRandom(31);
    for (let i = 0; i < 50; i += 1) {
      expect(decideBotTrade("optimist", closed, 1000, random)).toBeNull();
    }
  });

  it("skips a settled market while still trading the open ones", () => {
    const partly = marketsWith({ id: "arr-40m", status: "settled" });
    const random = makeRandom(13);
    for (let i = 0; i < 200; i += 1) {
      const decision = decideBotTrade("optimist", partly, 1000, random);
      expect(decision?.marketId).not.toBe("arr-40m");
    }
  });

  it("is reproducible for a given seed, so a take can be re-recorded", () => {
    const a = decideBotTrade("optimist", markets, 1000, rng());
    const b = decideBotTrade("optimist", markets, 1000, rng());
    expect(a).toEqual(b);
  });

  it("does not hammer one market every tick", () => {
    const random = makeRandom(77);
    const hit = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const decision = decideBotTrade("optimist", markets, 1000, random);
      if (decision) hit.add(decision.marketId);
    }
    expect(hit.size).toBeGreaterThan(1);
  });
});

describe("scheduling", () => {
  it("randomises the gap between trades rather than being metronomic", () => {
    const random = makeRandom(4);
    const delays = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      delays.add(nextDelay(BOT_ROSTER[0], random));
    }
    expect(delays.size).toBeGreaterThan(10);
  });

  it("keeps delays inside a sane range around the cadence", () => {
    const random = makeRandom(6);
    const profile = BOT_ROSTER[0];
    for (let i = 0; i < 200; i += 1) {
      const delay = nextDelay(profile, random);
      expect(delay).toBeGreaterThanOrEqual(profile.cadenceMs * 0.45);
      expect(delay).toBeLessThanOrEqual(profile.cadenceMs * 1.55);
    }
  });
});

describe("roster", () => {
  it("covers all four personas from the brief", () => {
    const personas = BOT_ROSTER.map((b) => b.persona).sort();
    expect(personas).toEqual(["contrarian", "cynic", "informed", "optimist"]);
  });

  it("has exactly one leadership bot, so the public trade rule is visible", () => {
    expect(BOT_ROSTER.filter((b) => b.isLeadership)).toHaveLength(1);
  });
});
