/**
 * The meeting transcript, and the thing that reads it.
 *
 * Step 5 of the brief is a real transcript upload and an AI resolver. This is
 * that shape, with the model swapped for a lookup table: a verdict carries the
 * exact line that decided it and the timestamp it was said at, or it carries a
 * refusal. Nothing else about settlement knows the difference, so replacing
 * `resolveFromTranscript` with a POST to a resolver route is one function —
 * the same swap `executeTrade` is set up for.
 *
 * Two properties are load-bearing and `transcript.test.ts` guards both:
 *
 * **No citation, no settlement.** A settled verdict must quote a line that
 * actually appears in the transcript. In Postgres this is a CHECK constraint
 * rather than a code path, so a buggy resolver cannot bypass it; here it is a
 * test, for the same reason.
 *
 * **A refusal is a real answer.** `roadmap-confidence` cannot be settled from
 * any line, and the resolver says so instead of guessing. That path is the
 * whole trust argument, so it is modelled rather than described.
 */

import type { Side } from "./markets";

export interface TranscriptLine {
  /** hh:mm:ss from the top of the meeting. */
  at: string;
  speaker: string;
  role: string;
  text: string;
}

/**
 * Northwind's Q3 all hands. Fictional company, fictional people, fictional
 * numbers — but written the way a real one runs, because a transcript that
 * settled everything cleanly on the first read would not be worth having a
 * void path for.
 */
export const TRANSCRIPT: TranscriptLine[] = [
  {
    at: "00:00:34",
    speaker: "Dana Whitfield",
    role: "CEO",
    text: "Right — good quarter, and a couple of things in here I think will genuinely surprise some of you. Tom, numbers.",
  },
  {
    at: "00:03:41",
    speaker: "Tom Alvarez",
    role: "CFO",
    text: "ARR closed the quarter at $41.3 million, up from $36.8 at the end of Q2. That is the first time we have cleared forty.",
  },
  {
    at: "00:07:15",
    speaker: "Ines Duarte",
    role: "VP Product",
    text: "We are moving to three tiers from the first of next month, and the middle one carries a price rise — the first since launch.",
  },
  {
    at: "00:12:02",
    speaker: "Ines Duarte",
    role: "VP Product",
    text: "Enterprise goes generally available on the fourth of November. That is a date, not a target, and I am aware of the difference.",
  },
  {
    at: "00:18:30",
    speaker: "Karl Nystrom",
    role: "VP Sales",
    text: "I am not going to name the two we signed this quarter — both are still inside their own announcement windows. You will hear about them in October.",
  },
  {
    at: "00:24:10",
    speaker: "Ines Duarte",
    role: "VP Product",
    text: "Mobile is still tracking to Q4. I know the floor has a view on that one and I have seen the board.",
  },
  {
    at: "00:31:55",
    speaker: "Dana Whitfield",
    role: "CEO",
    text: "On the roadmap generally — look, there is a lot in flight, some of it is going to move, and I would rather say that than pretend otherwise.",
  },
  {
    at: "01:04:12",
    speaker: "Dana Whitfield",
    role: "CEO",
    text: "We are eleven minutes over and there are still hands up, so I am going to keep going and let people drop if they need to.",
  },
];

/**
 * Where a verdict got its evidence.
 *
 * The meeting markets are settled by the transcript. The two long-run markets
 * cannot be — they resolve months later against a record that did not exist on
 * the day. Marking the source keeps the board honest about which is which
 * rather than implying the meeting settled something it could not have.
 */
export type VerdictSource = "transcript" | "record";

export type Verdict =
  | {
      marketId: string;
      kind: "settled";
      resolution: Side;
      source: VerdictSource;
      /** The exact words that decided it. Must appear in TRANSCRIPT when source is "transcript". */
      citationText: string;
      citationTimestamp: string;
      speaker: string;
      /** How the resolver read the line. Shown under the citation. */
      reasoning: string;
    }
  | {
      marketId: string;
      kind: "void";
      voidReason: string;
    };

const VERDICTS: Verdict[] = [
  {
    marketId: "arr-40m",
    kind: "settled",
    resolution: "YES",
    source: "transcript",
    citationText:
      "ARR closed the quarter at $41.3 million, up from $36.8 at the end of Q2. That is the first time we have cleared forty.",
    citationTimestamp: "00:03:41",
    speaker: "Tom Alvarez",
    reasoning: "$41.3M is stated on the call and clears the $40.0M threshold.",
  },
  {
    marketId: "pricing-change",
    kind: "settled",
    resolution: "YES",
    source: "transcript",
    citationText:
      "We are moving to three tiers from the first of next month, and the middle one carries a price rise — the first since launch.",
    citationTimestamp: "00:07:15",
    speaker: "Ines Duarte",
    reasoning: "Both packaging and list pricing change. Either alone settles this YES.",
  },
  {
    marketId: "qa-overrun",
    kind: "settled",
    resolution: "YES",
    source: "transcript",
    citationText:
      "We are eleven minutes over and there are still hands up, so I am going to keep going and let people drop if they need to.",
    citationTimestamp: "01:04:12",
    speaker: "Dana Whitfield",
    reasoning: "The meeting is still live at 64 minutes, past the 61 minute line.",
  },
  {
    // A NO settled on an absence still needs a citation. This one is unusually
    // clean: the absence is stated out loud rather than inferred from silence.
    marketId: "new-logo",
    kind: "settled",
    resolution: "NO",
    source: "transcript",
    citationText:
      "I am not going to name the two we signed this quarter — both are still inside their own announcement windows. You will hear about them in October.",
    citationTimestamp: "00:18:30",
    speaker: "Karl Nystrom",
    reasoning:
      "New customers are referred to but explicitly not named. The criteria require a customer named by name.",
  },
  {
    marketId: "enterprise-date",
    kind: "settled",
    resolution: "YES",
    source: "transcript",
    citationText:
      "Enterprise goes generally available on the fourth of November. That is a date, not a target, and I am aware of the difference.",
    citationTimestamp: "00:12:02",
    speaker: "Ines Duarte",
    reasoning: "A specific calendar date is given, which is what this one required.",
  },
  {
    /*
     * The refusal.
     *
     * There is a line about the roadmap, and a resolver willing to guess could
     * read tone into it in either direction. It refuses instead, and everyone
     * gets their credits back — which is the only thing that makes the other
     * seven settlements worth trusting.
     */
    marketId: "roadmap-confidence",
    kind: "void",
    voidReason:
      "The criteria turn on how leadership sounded, which a transcript cannot establish. No line in the meeting settles this either way, so it is voided and every stake is refunded in full.",
  },
  {
    marketId: "mobile-q4",
    kind: "settled",
    resolution: "NO",
    source: "record",
    citationText:
      "Northwind for iOS — first public release, 14 January. Android to follow.",
    citationTimestamp: "App Store listing, checked 1 January",
    speaker: "Release record",
    reasoning:
      "Not generally available in either store by 31 December. Guidance was Q4; the floor had it at 23%.",
  },
  {
    marketId: "nine-logos",
    kind: "settled",
    resolution: "NO",
    source: "record",
    citationText: "Enterprise contracts signed, quarter to date: 7.",
    citationTimestamp: "Closed-won report, quarter close",
    speaker: "Revenue record",
    reasoning: "Seven signed against a bar of ten. Sales guided to twelve.",
  },
];

const BY_MARKET = new Map(VERDICTS.map((v) => [v.marketId, v]));

/**
 * Read the transcript and decide a market.
 *
 * Synchronous and total today. When this becomes a model call it becomes a
 * promise and nothing else has to change, because settlement already treats a
 * verdict as the only thing it is allowed to act on.
 */
export function resolveFromTranscript(marketId: string): Verdict | null {
  return BY_MARKET.get(marketId) ?? null;
}

export function allVerdicts(): Verdict[] {
  return VERDICTS;
}
