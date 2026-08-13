/**
 * Seed markets for the Northwind Q3 all hands.
 *
 * Northwind is a fictional team project management product. Every question here
 * is about a company outcome or something said in the meeting. None is about a
 * named person's job, promotion, or departure — that rule is enforced by the
 * screening step, but the seed data has to model it too.
 */

import { DEFAULT_LIQUIDITY, seedState, type MarketState } from "./lmsr";

export type MarketKind = "meeting" | "outcome";
export type MarketStatus = "open" | "locked" | "settled" | "void";
export type Side = "YES" | "NO";

export interface Market {
  id: string;
  question: string;
  /** Short label for the split-flap board, which has far fewer drums. */
  boardLabel: string;
  /** The precise wording that settles it. Shown so nobody argues later. */
  criteria: string;
  kind: MarketKind;
  status: MarketStatus;
  openingPrice: number;
  state: MarketState;
  /**
   * The guidance given on this, where any has been given. The distance between
   * it and the price is the most interesting thing on the card — stated as a
   * matchup between two views, never as an accusation.
   */
  leadershipClaim?: string;
  /** When an outcome market resolves. Meeting markets resolve at the meeting. */
  resolvesNote: string;
  resolution?: Side;
  citationText?: string;
  citationTimestamp?: string;
  voidReason?: string;

  /**
   * How this is scripted to turn out in the demo.
   *
   * Demo scaffolding, not product data: it is never shown in any UI and never
   * settles anything. The transcript and the AI resolver decide outcomes in
   * step 5. Its only job is to give the well-informed bot something to be
   * usually right about, so prices drift toward the truth over a session the
   * way they would with a real trader who knows something.
   *
   * `null` marks the deliberately ambiguous market, which nothing should have
   * a confident view on.
   */
  demoOutcome?: Side | null;
}

interface MarketSeed {
  id: string;
  question: string;
  boardLabel: string;
  criteria: string;
  kind: MarketKind;
  openingPrice: number;
  leadershipClaim?: string;
  resolvesNote: string;
  demoOutcome?: Side | null;
}

const SEEDS: MarketSeed[] = [
  {
    id: "pricing-change",
    demoOutcome: "YES",
    question: "Will a pricing change be announced?",
    boardLabel: "PRICING CHANGE NAMED",
    criteria:
      "Settles YES if any change to list pricing, packaging, or discounting is stated on the call.",
    kind: "meeting",
    openingPrice: 0.44,
    resolvesNote: "Resolves from the transcript, minutes after the meeting",
  },
  {
    id: "arr-40m",
    demoOutcome: "YES",
    question: "Will the reported ARR figure clear $40M?",
    boardLabel: "ARR CLEARS 40M",
    criteria:
      "Settles YES if the ARR number stated on the call is $40.0M or higher.",
    kind: "meeting",
    openingPrice: 0.61,
    resolvesNote: "Resolves from the transcript, minutes after the meeting",
  },
  {
    // The long shot. Trades cheap, comes in, pays the biggest cascade of the session.
    id: "enterprise-date",
    demoOutcome: "YES",
    question: "Will the enterprise tier get a launch date?",
    boardLabel: "ENTERPRISE TIER DATED",
    criteria:
      "Settles YES only if a specific calendar date is given. 'Later this year' does not count.",
    kind: "meeting",
    openingPrice: 0.18,
    resolvesNote: "Resolves from the transcript, minutes after the meeting",
  },
  {
    // The beat that carries the business case: guidance says Q4, the people
    // who build it are pricing it at 23. Kept light on the page, but the
    // contrast itself is left completely unmistakable.
    id: "mobile-q4",
    demoOutcome: "NO",
    question: "Will the mobile app ship before Q4 close?",
    boardLabel: "MOBILE SHIPS BY Q4",
    criteria:
      "Settles YES if the mobile app is generally available in both app stores by 31 December.",
    kind: "outcome",
    openingPrice: 0.23,
    leadershipClaim: "Leadership is guiding to Q4.",
    resolvesNote: "Resolves 31 December",
  },
  {
    id: "qa-overrun",
    demoOutcome: "YES",
    question: "Will Q&A run past the hour?",
    boardLabel: "Q AND A RUNS LONG",
    criteria:
      "Settles YES if the meeting is still live 61 minutes after the scheduled start.",
    kind: "meeting",
    openingPrice: 0.72,
    resolvesNote: "Resolves from the transcript, minutes after the meeting",
  },
  {
    id: "new-logo",
    demoOutcome: "NO",
    question: "Will a new enterprise customer be named on stage?",
    boardLabel: "NEW LOGO ON STAGE",
    criteria:
      "Settles YES if a customer not previously announced is named by name on the call.",
    kind: "meeting",
    openingPrice: 0.35,
    resolvesNote: "Resolves from the transcript, minutes after the meeting",
  },
  {
    id: "nine-logos",
    demoOutcome: "NO",
    question: "Will more than nine enterprise logos close this quarter?",
    boardLabel: "TEN PLUS LOGOS",
    criteria:
      "Settles YES if ten or more enterprise contracts are signed by quarter end, per the closed-won report.",
    kind: "outcome",
    openingPrice: 0.31,
    leadershipClaim: "Sales is guiding to twelve.",
    resolvesNote: "Resolves at quarter close",
  },
  {
    // Deliberately ambiguous. The resolver should refuse this and refund
    // everyone, so the trust mechanism is visible rather than described.
    id: "roadmap-confidence",
    // Nothing can have a confident view on this one. That is the point of it.
    demoOutcome: null,
    question: "Will leadership sound confident about the roadmap?",
    boardLabel: "ROADMAP CONFIDENCE",
    criteria: "Settles YES if leadership sounds confident about the roadmap.",
    kind: "meeting",
    openingPrice: 0.5,
    resolvesNote: "Resolves from the transcript, minutes after the meeting",
  },
];

export function createSeedMarkets(): Market[] {
  return SEEDS.map((seed) => ({
    ...seed,
    status: "open" as MarketStatus,
    state: seedState(seed.openingPrice, DEFAULT_LIQUIDITY),
  }));
}

/** What credits are actually for. Never money, never convertible to money. */
export interface Perk {
  id: string;
  name: string;
  description: string;
  price: number;
  icon: string;
}

export const PERKS: Perk[] = [
  {
    id: "lunch",
    name: "Choose the team lunch",
    description: "You pick the caterer for the next all hands. No vetoes.",
    price: 900,
    icon: "🍜",
  },
  {
    id: "playlist",
    name: "Own the all hands playlist",
    description: "Twenty minutes of walk-in music, entirely your call.",
    price: 650,
    icon: "🎧",
  },
  {
    id: "demo-day",
    name: "First slot at demo day",
    description: "Top of the running order, while everyone is still fresh.",
    price: 1200,
    icon: "🎤",
  },
  {
    id: "sprint-name",
    name: "Name the next sprint",
    description: "Within reason. It goes in Jira and it does not come out.",
    price: 400,
    icon: "🏷️",
  },
  {
    id: "quiet-afternoon",
    name: "A meeting free afternoon",
    description: "One Friday, cleared. Your calendar, blocked by decree.",
    price: 1500,
    icon: "🌤️",
  },
];
