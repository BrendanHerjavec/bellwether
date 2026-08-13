/**
 * Bot traders.
 *
 * The demo gets recorded by one person, and an empty board is a dead board.
 * These are what keep the ticker running and the flaps firing during a solo
 * take. Kept pure and injected with its own random source so each persona's
 * behaviour can be asserted rather than eyeballed.
 *
 * The personas are not decoration. Four traders who all reason the same way
 * would push every market in the same direction and the board would drift to
 * the extremes; four who disagree produce a price that argues with itself,
 * which is what a market is supposed to look like.
 */

import { priceOf, sharesForBudget } from "./lmsr";
import type { Market, Side } from "./markets";

export type BotPersona = "optimist" | "cynic" | "contrarian" | "informed";

export interface BotProfile {
  id: string;
  name: string;
  persona: BotPersona;
  /** Shown in the host controls so the roster reads as characters, not slots. */
  blurb: string;
  /** Mean gap between trades, in ms. Actual gaps are randomised around it. */
  cadenceMs: number;
  /** Typical stake in credits, before conviction scaling. */
  baseStake: number;
  /** Leadership trades are named publicly; everyone else stays anonymous. */
  isLeadership: boolean;
}

export const BOT_ROSTER: BotProfile[] = [
  {
    id: "bot-optimist",
    name: "Priya Raman",
    persona: "optimist",
    blurb: "Backs the company on everything. Reliably early, occasionally right.",
    cadenceMs: 9000,
    baseStake: 45,
    // The one bot flagged as leadership, so the public-trade rule is visible
    // on the ticker during a recording rather than merely described.
    isLeadership: true,
  },
  {
    id: "bot-cynic",
    name: "Marcus Webb",
    persona: "cynic",
    blurb: "Has sat through a lot of all hands. Fades every announcement.",
    cadenceMs: 11000,
    baseStake: 40,
    isLeadership: false,
  },
  {
    id: "bot-contrarian",
    name: "Jules Okafor",
    persona: "contrarian",
    blurb: "Only interested in long odds. Buys whatever nobody else wants.",
    cadenceMs: 13000,
    baseStake: 55,
    isLeadership: false,
  },
  {
    id: "bot-informed",
    name: "Sam Adeyemi",
    persona: "informed",
    blurb: "Talks to the people building it. Usually, annoyingly, right.",
    cadenceMs: 15000,
    baseStake: 60,
    isLeadership: false,
  },
];

export interface BotDecision {
  marketId: string;
  side: Side;
  credits: number;
  /** Why, for the host view. Never shown to traders. */
  reason: string;
}

/**
 * Views and edges are measured in log-odds, not in percentage points.
 *
 * Percentage points are not symmetric: a bot that wants to move a market 18
 * points up from 18% has room to do it, while one that wants to move it 18
 * points down hits the floor at 0 and gets clamped to 10. Since stake size
 * scales with perceived edge, the bullish bot then systematically stakes more
 * than the bearish one on every cheap market — and with most markets opening
 * below even money, the whole board drifts upward all session.
 *
 * In log-odds a shift of +0.9 and a shift of -0.9 are mirror images at any
 * price, so the personas stay balanced wherever a market happens to open.
 */
const MIN_EDGE_LOGIT = 0.18;

/** Full conviction at this much log-odds disagreement. */
const FULL_CONVICTION_LOGIT = 1.2;

const SAFE = 1e-6;

function logit(p: number): number {
  const clamped = Math.min(1 - SAFE, Math.max(SAFE, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Where a persona thinks the YES price should be.
 *
 * Returning null means no view, and no view means no trade — which is how the
 * deliberately ambiguous market stays near its opening price instead of being
 * dragged somewhere by a bot that cannot actually read it.
 */
function targetPrice(
  persona: BotPersona,
  market: Market,
  price: number,
  random: () => number,
): number | null {
  switch (persona) {
    /*
     * The optimist and the cynic anchor to where the market OPENED, not to
     * where it is now.
     *
     * Anchoring to the live price makes a bot chase its own momentum: every
     * purchase raises the price, which raises the target, which justifies
     * another purchase. Four bots reasoning that way walk every market to an
     * extreme and the board drifts one way all session. Anchored to the open,
     * each one holds a fixed view, trades until the price reaches it, and then
     * stops — so they argue with each other around the opening price, which is
     * what a market is meant to look like.
     *
     * Returning null once the price passes their view keeps each of them
     * one-directional. An optimist who thinks a market is now overpriced would
     * technically want to buy NO, but a bot that flips sides is unreadable on
     * the ticker, and legible personas are the whole point of having them.
     */
    case "optimist": {
      const target = sigmoid(logit(market.openingPrice) + 0.85 + random() * 0.3);
      return price < target ? target : null;
    }

    case "cynic": {
      const target = sigmoid(logit(market.openingPrice) - 0.85 - random() * 0.3);
      return price > target ? target : null;
    }

    case "contrarian": {
      // Buys whatever is at long odds. Only the cheap side interests it, and
      // only while it is still genuinely cheap.
      if (price < 0.35) return sigmoid(logit(price) + 0.45 + random() * 0.25);
      if (price > 0.65) return sigmoid(logit(price) - 0.45 - random() * 0.25);
      return null;
    }

    case "informed": {
      if (!market.demoOutcome) return null; // no edge on the ambiguous one
      // Confident but not omniscient, and never certain enough to push a price
      // to the asymptote, which would look fake and break the market.
      const noise = random() * 0.12;
      return market.demoOutcome === "YES" ? 0.86 - noise : 0.14 + noise;
    }
  }
}

/**
 * Pick a trade, or return null if nothing looks worth doing.
 *
 * `random` is injected so a seeded generator makes the whole session
 * reproducible — which matters when a take has to be re-recorded.
 */
export function decideBotTrade(
  persona: BotPersona,
  markets: Market[],
  balance: number,
  random: () => number,
  maxStake = 120,
): BotDecision | null {
  if (balance < 5) return null;

  const candidates: { market: Market; side: Side; edge: number; target: number }[] = [];

  for (const market of markets) {
    if (market.status !== "open") continue;

    const price = priceOf(market.state, "YES");
    const target = targetPrice(persona, market, price, random);
    if (target === null) continue;

    // Measured in log-odds so a bullish and a bearish view of the same size
    // produce the same conviction, and therefore the same stake, at any price.
    const edge = logit(target) - logit(price);
    if (Math.abs(edge) < MIN_EDGE_LOGIT) continue;

    candidates.push({
      market,
      side: edge > 0 ? "YES" : "NO",
      edge: Math.abs(edge),
      target,
    });
  }

  if (candidates.length === 0) return null;

  // Prefer the biggest mispricing, but choose randomly among the best few so
  // the same bot does not hammer one market every single tick.
  candidates.sort((a, b) => b.edge - a.edge);
  const pool = candidates.slice(0, Math.min(3, candidates.length));
  const chosen = pool[Math.floor(random() * pool.length)];

  // Size with conviction, then clamp to what it can actually afford.
  const conviction = Math.min(1, chosen.edge / FULL_CONVICTION_LOGIT);
  const raw = 12 + conviction * (maxStake - 12);
  const credits = Math.max(5, Math.min(Math.round(raw), Math.floor(balance)));

  return {
    marketId: chosen.market.id,
    side: chosen.side,
    credits,
    reason: `${persona} sees ${Math.round(chosen.target * 100)}% vs ${Math.round(
      priceOf(chosen.market.state, "YES") * 100,
    )}%`,
  };
}

/** Randomised gap before this bot's next trade. Never metronomic. */
export function nextDelay(profile: BotProfile, random: () => number): number {
  return Math.round(profile.cadenceMs * (0.45 + random() * 1.1));
}

/**
 * Small seeded generator, so a recorded session can be reproduced exactly.
 * mulberry32 — short, fast, and good enough for deciding trades.
 */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience for tests and for the host view: what a stake would buy. */
export function contractsFor(market: Market, side: Side, credits: number): number {
  return sharesForBudget(market.state, side, credits);
}
