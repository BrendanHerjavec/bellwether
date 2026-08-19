/**
 * The beat sheet.
 *
 * A recorded demo has one hard problem: the interesting part of a prediction
 * market takes a week, and nobody will watch a recording of it for longer than
 * about ninety seconds. This compresses the arc — an open floor filling up with
 * money, the doors closing, the meeting settling it, the long-run markets
 * settling months later — into a fixed timeline that runs the same way every
 * take and fits inside that budget.
 *
 * Where the ninety seconds go is itself the decision. The floor gets nineteen
 * of them: enough to watch four calls land and the board move under them, and
 * not a second more, because the setup is the part a viewer is least invested
 * in and the first thing they judge the whole thing by. Everything saved there
 * goes to the settlements, which are what they came for.
 *
 * At this pace a citation is on screen for about five seconds, which is enough
 * to take in but not enough to study. That is the right default for a sizzle
 * reel and the wrong one for a room full of people asking questions, which is
 * what `space` is for — every beat holds indefinitely.
 *
 * Four things are deliberate.
 *
 * **The betting happens on camera.** The board starts cold, at opening prices,
 * with an empty tape. Everything the viewer sees on it afterwards is money
 * arriving while they watch: bots on a fast tick, and your own four calls
 * placed as scripted beats. A board that opens already warm shows the result of
 * a market; a board that fills up in front of you shows what a market is.
 *
 * **The doors closing is an event, not a state change.** It gets its own stamp,
 * carrying the closing book. The whole trust argument rests on the price being
 * fixed before anyone in the room knows the answer, and that has to be seen
 * happening rather than inferred from a row of lamps going dim.
 *
 * **The settlements land one at a time.** A board that resolves eight rows in
 * one frame is a state change; one that resolves a row every five or six
 * seconds, each with the line that decided it, is the product making its
 * argument. Every gap is longer than the stamp that fills it, so two never
 * overlap — an invariant the beat-sheet tests hold the timings to, rather than
 * trusting whoever next decides the demo could be tighter still.
 *
 * **The order is dramatic, not chronological.** The two safe markets go first
 * so the mechanism is understood before it matters, the long shot lands fifth
 * because it is the biggest payout of the session, and the void goes last of
 * the meeting markets because a refusal only means something once you have
 * watched five confident answers go up beside it.
 *
 * Nothing here mutates anything. The director walks this list and calls the
 * provider; the list itself is data, so the timing can be argued with in one
 * place and tested without a clock.
 */

import type { Side } from "./markets";

export type DemoPhase = "floor" | "doors" | "meeting" | "epilogue" | "standings";

export type DemoAction =
  | { type: "note" }
  | { type: "bet"; marketId: string; side: Side; credits: number }
  | { type: "lock" }
  | { type: "resolve"; marketId: string }
  | { type: "standings" }
  | { type: "perks" };

export interface DemoBeat {
  id: string;
  /** Milliseconds from the top of the session. */
  atMs: number;
  phase: DemoPhase;
  /** The one line on the host strip while this beat is current. */
  caption: string;
  /** What the presenter should be saying over it. Never rendered to the room. */
  note: string;
  action: DemoAction;
}

/**
 * How long each overlay stays up.
 *
 * Exported rather than kept next to the components that use them because the
 * beat sheet has to be able to promise they fit. Two settlements closer
 * together than `STAMP_DISMISS_MS` would stack their stamps on top of each
 * other, which the tests refuse — so if the demo is ever tightened again, these
 * are the numbers that have to move with it.
 */
export const STAMP_DISMISS_MS = 5_000;
export const TOAST_DISMISS_MS = 4_000;
export const DOORS_DISMISS_MS = 4_500;

/**
 * How fast the floor trades, per phase.
 *
 * A real session is four bots on nine to fifteen second cadences, which is
 * right for a room and hopeless for a recording — twenty seconds of it moves a
 * price by a point. During the open floor the director drives the same decision
 * function roughly three times a second instead, so the board covers a
 * session's worth of argument in the time a viewer will actually give it.
 *
 * `null` means nothing trades. Once the doors close that is not pacing, it is
 * the rule.
 */
export const BOT_TICK_MS: Record<DemoPhase, number | null> = {
  floor: 350,
  doors: null,
  meeting: null,
  epilogue: null,
  standings: null,
};

export const DEMO_BEATS: DemoBeat[] = [
  {
    /*
     * The floor opens and your first call goes in on the same beat, and that is
     * not laziness about pacing — it is the only way the long shot is still a
     * long shot when you buy it.
     *
     * The informed trader holds a view of 86% on this market against an opening
     * price of 18, which is the largest mispricing on the board by a distance,
     * so it is the first thing it reaches for and it arrives with full
     * conviction. Three seconds of floor is enough to take the price into the
     * thirties, and the same 120 credits then buys barely half the contracts.
     * Getting in first is the whole substance of the payout beat a minute
     * later, so the script gets in first.
     */
    id: "bet-enterprise",
    atMs: 0,
    phase: "floor",
    caption: "Floor opens · you back the long shot at 18",
    note:
      "Cold board, opening prices, nobody has bet yet — and you go first, on the one nobody believes. Eighteen percent: if they name an actual date, 120 credits comes back about five times over.",
    action: { type: "bet", marketId: "enterprise-date", side: "YES", credits: 120 },
  },
  {
    id: "bet-pricing",
    atMs: 5_000,
    phase: "floor",
    caption: "You back the pricing change",
    note:
      "Watch the board move when this lands. Your credits are not a vote — they are the price.",
    action: { type: "bet", marketId: "pricing-change", side: "YES", credits: 100 },
  },
  {
    /*
     * The loser, on purpose. A presenter who calls everything right has shown
     * an advertisement rather than a market, and the refund beat later means
     * nothing if nothing was ever genuinely at risk.
     */
    id: "bet-logo",
    atMs: 10_000,
    phase: "floor",
    caption: "You back a new logo being named",
    note: "This one you get wrong. It should cost you, and it will.",
    action: { type: "bet", marketId: "new-logo", side: "YES", credits: 80 },
  },
  {
    /*
     * The stake that gets refunded.
     *
     * Without it the void beat is a thing that happens to other people, and the
     * report ends up with nothing in its refunded column — so the strongest
     * argument the product has gets made in the third person. Sixty credits on
     * the unanswerable question is what turns "markets can be voided" into "you
     * got your sixty back".
     */
    id: "bet-roadmap",
    atMs: 14_500,
    phase: "floor",
    caption: "You back the vague one",
    note:
      "Badly written question, and nobody notices at the time — including you. Sixty on it. Remember that, because it comes back.",
    action: { type: "bet", marketId: "roadmap-confidence", side: "YES", credits: 60 },
  },
  {
    id: "doors",
    atMs: 19_000,
    phase: "doors",
    caption: "Doors close · every market locks",
    note:
      "Nobody edited those numbers — that is where fifty-odd bets pushed them. And now they are fixed, before anyone in the room knows a single answer, which is the reason nothing after this can be argued with.",
    action: { type: "lock" },
  },
  {
    id: "settle-arr",
    atMs: 24_000,
    phase: "meeting",
    caption: "ARR clears 40M · settled",
    note:
      "The meeting is running and the transcript is settling it. Note the citation — the exact line, timestamped.",
    action: { type: "resolve", marketId: "arr-40m" },
  },
  {
    id: "settle-pricing",
    atMs: 29_500,
    phase: "meeting",
    caption: "Pricing change named · settled",
    note: "Your first win. You paid 100 and it pays out at face value, one credit a contract.",
    action: { type: "resolve", marketId: "pricing-change" },
  },
  {
    id: "settle-logo",
    atMs: 35_000,
    phase: "meeting",
    caption: "New logo on stage · settled NO",
    note:
      "And there is the one you got wrong — the whole 80 gone. A NO still gets a citation, and this one is clean: sales says out loud that they are not naming anyone.",
    action: { type: "resolve", marketId: "new-logo" },
  },
  {
    id: "settle-qa",
    atMs: 40_500,
    phase: "meeting",
    caption: "Q&A runs long · settled",
    note: "The joke market. It opened at 72% because everyone already knew.",
    action: { type: "resolve", marketId: "qa-overrun" },
  },
  {
    id: "settle-enterprise",
    atMs: 46_500,
    phase: "meeting",
    caption: "Enterprise tier dated · settled",
    note:
      "The long shot comes in. That is the 120 you put down at eighteen percent coming back more than four times the size.",
    action: { type: "resolve", marketId: "enterprise-date" },
  },
  {
    id: "settle-void",
    atMs: 52_500,
    phase: "meeting",
    caption: "Roadmap confidence · voided, everyone refunded",
    note:
      "This is the one that matters, and it is your sixty credits. Too vague to settle, so the resolver refuses rather than guessing and every stake comes back in full. That refusal is what makes the other seven worth trusting.",
    action: { type: "resolve", marketId: "roadmap-confidence" },
  },
  {
    id: "epilogue",
    atMs: 59_000,
    phase: "epilogue",
    caption: "Three months on",
    note:
      "The two long-run markets do not settle in the meeting. They settle against a record that did not exist on the day.",
    action: { type: "note" },
  },
  {
    id: "settle-mobile",
    atMs: 63_000,
    phase: "epilogue",
    caption: "Mobile ships by Q4 · settled NO",
    note:
      "Guidance said Q4. The floor said 23%. The floor was right, in public, months ahead, at a price.",
    action: { type: "resolve", marketId: "mobile-q4" },
  },
  {
    id: "settle-logos",
    atMs: 68_500,
    phase: "epilogue",
    caption: "Ten plus logos · settled NO",
    note: "Sales guided to twelve, closed seven. The floor had it at 31%.",
    action: { type: "resolve", marketId: "nine-logos" },
  },
  {
    id: "standings",
    atMs: 74_000,
    phase: "standings",
    caption: "Your session, and who called it",
    note:
      "Every call, what it cost, what it returned. Everyone started on a thousand — and the well-informed trader is top, which is the entire point.",
    action: { type: "standings" },
  },
  {
    id: "perks",
    atMs: 82_000,
    phase: "standings",
    caption: "Credits are not money — here is what they are",
    note:
      "Where winnings go. Not cash, not convertible to cash. A say in lunch, the playlist, the name of the next sprint. Being right buys a small amount of power over something that does not matter, which is exactly the right prize.",
    action: { type: "perks" },
  },
];

/** The last beat plus enough tail to land on the report rather than cut off it. */
export const DEMO_DURATION_MS = DEMO_BEATS[DEMO_BEATS.length - 1].atMs + 6_000;

/** The last beat due at or before `elapsed`, or -1 before the first one. */
export function beatIndexAt(elapsedMs: number): number {
  let index = -1;
  for (let i = 0; i < DEMO_BEATS.length; i += 1) {
    if (DEMO_BEATS[i].atMs <= elapsedMs) index = i;
    else break;
  }
  return index;
}

export function phaseAt(elapsedMs: number): DemoPhase {
  const index = beatIndexAt(elapsedMs);
  return index < 0 ? "floor" : DEMO_BEATS[index].phase;
}

/** Every call the script places on your behalf, in the order it places them. */
export function scriptedBets(): { marketId: string; side: Side; credits: number }[] {
  return DEMO_BEATS.flatMap((beat) =>
    beat.action.type === "bet"
      ? [{ marketId: beat.action.marketId, side: beat.action.side, credits: beat.action.credits }]
      : [],
  );
}
