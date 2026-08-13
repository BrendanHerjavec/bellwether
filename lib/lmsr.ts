/**
 * Logarithmic Market Scoring Rule (LMSR) automated market maker.
 *
 * Binary markets only. Quantities are "contracts": a winning contract redeems
 * for exactly 1 credit, a losing contract for 0. Prices therefore live in (0,1)
 * and read directly as probabilities.
 *
 * Cost function:   C(q) = b * ln( exp(q_yes/b) + exp(q_no/b) )
 * Price of YES:    exp(q_yes/b) / ( exp(q_yes/b) + exp(q_no/b) )
 * Cost of a trade: C(q_after) - C(q_before)
 *
 * This module is pure and dependency free so the Postgres function, the bot
 * runner and the client can all agree on the same arithmetic.
 */

export type Outcome = "YES" | "NO";

export interface MarketState {
  /** Outstanding YES contracts held by traders. */
  qYes: number;
  /** Outstanding NO contracts held by traders. */
  qNo: number;
  /** Liquidity parameter. Larger b = deeper book = smaller price impact. */
  b: number;
}

export interface Quote {
  /** Contracts requested (may be fractional; negative means a sale). */
  shares: number;
  /** Credits debited from the trader. Negative for a sale. */
  cost: number;
  /** YES price before the trade. */
  priceBefore: number;
  /** YES price after the trade. */
  priceAfter: number;
  /** Average price paid per contract. */
  avgPrice: number;
  state: MarketState;
}

/**
 * Default liquidity.
 *
 * Tuned against a stake in *credits*, not in contracts, because that is what a
 * trader actually chooses. The distinction matters: on a long shot, cheap
 * contracts mean a fixed credit stake buys a far larger quantity, so tuning
 * against a contract count badly under-estimates the price impact of a stake
 * on exactly the markets where impact is most visible.
 *
 * At this value the default 50 credit stake moves a balanced market about two
 * points and a long shot about three — legible on the board without one trader
 * owning the price. Staking a whole 1000 credit balance still moves a thin
 * market decisively, which is the point of having a balance worth protecting.
 */
export const DEFAULT_LIQUIDITY = 1200;

/** Prices are clamped away from the asymptotes so the board never shows 0 or 100. */
export const MIN_PRICE = 0.01;
export const MAX_PRICE = 0.99;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`lmsr: ${name} must be a finite number, received ${value}`);
  }
}

function assertState(state: MarketState): void {
  assertFinite("qYes", state.qYes);
  assertFinite("qNo", state.qNo);
  assertFinite("b", state.b);
  if (state.b <= 0) {
    throw new Error(`lmsr: liquidity b must be positive, received ${state.b}`);
  }
}

/**
 * ln(exp(a) + exp(b)) computed by factoring out the larger term, so the
 * intermediate exponentials stay near 1 and never overflow.
 */
export function logSumExp(a: number, b: number): number {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  // exp(min - max) is in (0, 1]; log1p keeps precision when the gap is large.
  return max + Math.log1p(Math.exp(min - max));
}

/** C(q) — total credits the market maker has collected at this state. */
export function cost(state: MarketState): number {
  assertState(state);
  return state.b * logSumExp(state.qYes / state.b, state.qNo / state.b);
}

/** Instantaneous price of YES, in (0,1). */
export function priceYes(state: MarketState): number {
  assertState(state);
  // Logistic form: numerically stable and avoids computing two exponentials.
  return 1 / (1 + Math.exp((state.qNo - state.qYes) / state.b));
}

/** Both prices. They sum to exactly 1 up to floating point. */
export function prices(state: MarketState): { yes: number; no: number } {
  const yes = priceYes(state);
  return { yes, no: 1 - yes };
}

/** Price of a single outcome. */
export function priceOf(state: MarketState, outcome: Outcome): number {
  const yes = priceYes(state);
  return outcome === "YES" ? yes : 1 - yes;
}

/** The state after buying `shares` contracts of `outcome`. Does not mutate. */
export function applyTrade(
  state: MarketState,
  outcome: Outcome,
  shares: number,
): MarketState {
  assertState(state);
  assertFinite("shares", shares);
  return outcome === "YES"
    ? { ...state, qYes: state.qYes + shares }
    : { ...state, qNo: state.qNo + shares };
}

/**
 * Credits required to buy `shares` contracts of `outcome`.
 * Negative `shares` sells back, returning a negative cost (a credit).
 */
export function tradeCost(
  state: MarketState,
  outcome: Outcome,
  shares: number,
): number {
  return cost(applyTrade(state, outcome, shares)) - cost(state);
}

/** Full quote for a trade: cost, price impact, and the resulting state. */
export function quote(
  state: MarketState,
  outcome: Outcome,
  shares: number,
): Quote {
  const next = applyTrade(state, outcome, shares);
  const c = cost(next) - cost(state);
  return {
    shares,
    cost: c,
    priceBefore: priceOf(state, outcome),
    priceAfter: priceOf(next, outcome),
    avgPrice: shares === 0 ? priceOf(state, outcome) : c / shares,
    state: next,
  };
}

/**
 * How many contracts of `outcome` a given budget buys.
 *
 * Inverting C() analytically for one side of a binary market is possible, but
 * bisection is short, obviously correct, and this runs at most a few dozen
 * times a second. Cost is strictly increasing in shares, so bisection is safe.
 */
export function sharesForBudget(
  state: MarketState,
  outcome: Outcome,
  budget: number,
  tolerance = 1e-9,
): number {
  assertState(state);
  assertFinite("budget", budget);
  if (budget <= 0) return 0;

  // Each contract costs strictly less than 1 credit, so budget contracts is
  // always an over-estimate and makes a valid upper bracket.
  let lo = 0;
  let hi = Math.max(1, budget / Math.max(priceOf(state, outcome), MIN_PRICE));
  while (tradeCost(state, outcome, hi) < budget) {
    hi *= 2;
    if (hi > 1e12) throw new Error("lmsr: sharesForBudget failed to bracket");
  }

  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const c = tradeCost(state, outcome, mid);
    if (Math.abs(c - budget) < tolerance) return mid;
    if (c < budget) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Opening quantities that produce a given YES price.
 *
 * Only the difference q_yes - q_no sets the price, so we park the short side at
 * zero and offset the long side by b * logit(p). Keeping one side at zero also
 * keeps C(q) small, which keeps the numbers on screen readable.
 */
export function seedState(openingPrice: number, b = DEFAULT_LIQUIDITY): MarketState {
  assertFinite("openingPrice", openingPrice);
  if (openingPrice <= 0 || openingPrice >= 1) {
    throw new Error(
      `lmsr: openingPrice must be strictly between 0 and 1, received ${openingPrice}`,
    );
  }
  const logit = Math.log(openingPrice / (1 - openingPrice));
  const offset = b * logit;
  return offset >= 0
    ? { qYes: offset, qNo: 0, b }
    : { qYes: 0, qNo: -offset, b };
}

/**
 * What a position is actually worth: the credits the market maker would pay to
 * buy it back right now.
 *
 * Not `shares * price`. That naive figure counts the price impact of the
 * trader's own purchase as profit, so a position shows a gain the instant it is
 * opened — which is both wrong and actively misleading, since unwinding it
 * pushes the price back down again. Valuing it as an unwind makes a fresh
 * position worth exactly what was paid for it, which is the honest answer.
 */
export function liquidationValue(
  state: MarketState,
  yesShares: number,
  noShares: number,
): number {
  let current = state;
  let proceeds = 0;

  if (yesShares > 0) {
    proceeds += -tradeCost(current, "YES", -yesShares);
    current = applyTrade(current, "YES", -yesShares);
  }
  if (noShares > 0) {
    proceeds += -tradeCost(current, "NO", -noShares);
    current = applyTrade(current, "NO", -noShares);
  }
  return proceeds;
}

/**
 * Worst case the market maker can lose across the whole life of a market,
 * relative to what it collected. Bounded by b * ln(2) for a binary market —
 * this is what "the house always has a counterparty" costs, and it is what the
 * host's subsidy budget should be sized against.
 */
export function maxSubsidy(b: number): number {
  return b * Math.LN2;
}

/** Format a probability the way the split-flap board wants it: "07", "23", "99". */
export function toBoardDigits(price: number): string {
  const clamped = Math.min(MAX_PRICE, Math.max(MIN_PRICE, price));
  return String(Math.round(clamped * 100)).padStart(2, "0");
}
