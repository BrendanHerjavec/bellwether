/**
 * What happens after the meeting.
 *
 * Kept pure and separate from the provider for the same reason `lmsr.ts` is:
 * this is the half of the product that pays people, and it should be provable
 * without mounting a component. The provider owns the mutation; everything
 * here just computes numbers.
 *
 * One rule underneath all of it: a winning contract is worth exactly one
 * credit and a losing one is worth exactly nothing. That is the whole payout
 * model, and it is what makes the price of a contract readable as a
 * probability in the first place — you pay 18 credits for something that pays
 * 100 if you are right, so the price *is* the market's odds.
 */

import { liquidationValue, type MarketState } from "./lmsr";
import type { Market, Side } from "./markets";

export interface HeldPosition {
  marketId: string;
  yesShares: number;
  noShares: number;
  creditsStaked: number;
}

/**
 * Credits returned to a holder when a market settles.
 *
 * Note that this is a *gross* return, not a profit: someone who staked 100 and
 * gets 100 back broke even. The provider credits this figure and records the
 * stake alongside it so both readings are available.
 */
export function payoutFor(position: HeldPosition, resolution: Side): number {
  const winning = resolution === "YES" ? position.yesShares : position.noShares;
  return Math.round(winning * 100) / 100;
}

/**
 * Credits returned when a market is voided: the stake, exactly, to everyone.
 *
 * Not the position's market value. A void means the question should never have
 * been asked, so the honest unwind is the one that leaves every trader where
 * they started rather than one that hands a windfall to whoever happened to be
 * on the side the price had drifted toward.
 */
export function refundFor(position: HeldPosition): number {
  return Math.round(position.creditsStaked * 100) / 100;
}

export interface SettlementRecord {
  marketId: string;
  traderId: string;
  /** VOID is not a side anyone can hold — it is how the market ended. */
  outcome: Side | "VOID";
  yesShares: number;
  noShares: number;
  staked: number;
  /** Credits returned. Gross, so profit is this minus the stake. */
  paid: number;
  profit: number;
  at: number;
}

/** One trader's line on the leaderboard. */
export interface Standing {
  traderId: string;
  name: string;
  isYou: boolean;
  isLeadership: boolean;
  /** Uncommitted credits. */
  cash: number;
  /** What still-open positions would fetch if unwound right now. */
  openValue: number;
  /** Realised profit from everything that has already settled. */
  realised: number;
  /** cash + openValue, i.e. everything they are worth. */
  worth: number;
  /** worth minus what they started with. The column people actually read. */
  net: number;
  /** How many settled markets they were on the right side of. */
  callsRight: number;
  callsMade: number;
  rank: number;
}

export interface StandingInput {
  id: string;
  name: string;
  isBot: boolean;
  isLeadership: boolean;
  balance: number;
}

/**
 * The leaderboard.
 *
 * Ranked on total worth rather than cash, so someone still holding an unsettled
 * position is not shown as though they had lost the money they spent on it.
 *
 * Ties break toward more calls right, and then toward fewer calls wrong. Two
 * traders can finish on the same number by very different routes, and the one
 * who got there without being wrong about anything is the better forecaster —
 * which is the thing the game is actually about.
 */
export function standings(
  traders: StandingInput[],
  positionsByTrader: Record<string, Record<string, HeldPosition>>,
  markets: Market[],
  settlements: SettlementRecord[],
  startingBalance: number,
  youId: string,
): Standing[] {
  const stateById = new Map<string, MarketState>(
    markets.filter((m) => m.status === "open" || m.status === "locked").map((m) => [m.id, m.state]),
  );

  const rows = traders.map((trader) => {
    const positions = positionsByTrader[trader.id] ?? {};

    let openValue = 0;
    for (const position of Object.values(positions)) {
      const state = stateById.get(position.marketId);
      // A settled market's position has already been paid out and cleared, so
      // anything still here belongs to a market that has not resolved yet.
      if (!state) continue;
      openValue += liquidationValue(state, position.yesShares, position.noShares);
    }

    const mine = settlements.filter((s) => s.traderId === trader.id);
    const realised = mine.reduce((sum, s) => sum + s.profit, 0);
    // A void is not a call anyone got right or wrong, so it counts as neither.
    const graded = mine.filter((s) => s.outcome !== "VOID");
    const callsRight = graded.filter((s) => s.profit > 0).length;

    const worth = trader.balance + openValue;
    return {
      traderId: trader.id,
      name: trader.name,
      isYou: trader.id === youId,
      isLeadership: trader.isLeadership,
      cash: round2(trader.balance),
      openValue: round2(openValue),
      realised: round2(realised),
      worth: round2(worth),
      net: round2(worth - startingBalance),
      callsRight,
      callsMade: graded.length,
      rank: 0,
    };
  });

  rows.sort(
    (a, b) =>
      b.worth - a.worth ||
      b.callsRight - a.callsRight ||
      (a.callsMade - a.callsRight) - (b.callsMade - b.callsRight),
  );
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
