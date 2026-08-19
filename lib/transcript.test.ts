import { describe, expect, it } from "vitest";
import { TRANSCRIPT, allVerdicts, resolveFromTranscript } from "./transcript";
import { createSeedMarkets } from "./markets";
import {
  BOT_TICK_MS,
  DEMO_BEATS,
  DEMO_DURATION_MS,
  DOORS_DISMISS_MS,
  STAMP_DISMISS_MS,
  TOAST_DISMISS_MS,
  scriptedBets,
} from "./demo-script";

const markets = createSeedMarkets();

describe("the resolver", () => {
  it("has a verdict for every market on the board", () => {
    for (const market of markets) {
      expect(resolveFromTranscript(market.id), market.id).not.toBeNull();
    }
  });

  it("returns null for a market it has never heard of", () => {
    expect(resolveFromTranscript("not-a-market")).toBeNull();
  });

  /**
   * No citation, no settlement.
   *
   * The database enforces this with a CHECK constraint precisely so a buggy
   * resolver cannot talk its way past it. This is the same rule, asserted
   * against the resolver's own output: a settled verdict must quote a line
   * that genuinely exists in the transcript it claims to have read.
   */
  it("quotes a real transcript line for everything it settles from the transcript", () => {
    const lines = new Map(TRANSCRIPT.map((line) => [line.text, line]));

    for (const verdict of allVerdicts()) {
      if (verdict.kind !== "settled" || verdict.source !== "transcript") continue;

      const line = lines.get(verdict.citationText);
      expect(line, `${verdict.marketId} cites a line not in the transcript`).toBeDefined();
      expect(line!.at).toBe(verdict.citationTimestamp);
      expect(line!.speaker).toBe(verdict.speaker);
    }
  });

  it("never settles without a timestamp to point at", () => {
    for (const verdict of allVerdicts()) {
      if (verdict.kind !== "settled") continue;
      expect(verdict.citationText.trim().length, verdict.marketId).toBeGreaterThan(0);
      expect(verdict.citationTimestamp.trim().length, verdict.marketId).toBeGreaterThan(0);
    }
  });

  /**
   * The refusal is the product.
   *
   * `roadmap-confidence` is written to be unsettleable — its criteria turn on
   * how someone sounded — and the resolver has to say so rather than guess. If
   * this test ever goes green because the market got a confident answer, the
   * trust argument has quietly been deleted.
   */
  it("refuses the market that cannot be settled, and explains why", () => {
    const verdict = resolveFromTranscript("roadmap-confidence");
    expect(verdict?.kind).toBe("void");
    if (verdict?.kind === "void") {
      expect(verdict.voidReason.length).toBeGreaterThan(40);
    }
  });

  it("settles the long-run markets against a record, not the meeting", () => {
    for (const id of ["mobile-q4", "nine-logos"]) {
      const verdict = resolveFromTranscript(id);
      expect(verdict?.kind).toBe("settled");
      if (verdict?.kind === "settled") expect(verdict.source).toBe("record");
    }
  });

  /**
   * The bots trade toward `demoOutcome` all session. If the resolver disagreed
   * with it, the well-informed trader would spend the whole demo confidently
   * pushing prices the wrong way and then lose — which is not the story.
   */
  it("agrees with what the bots were told the answer would be", () => {
    for (const market of markets) {
      const verdict = resolveFromTranscript(market.id)!;
      if (market.demoOutcome === null) {
        expect(verdict.kind, market.id).toBe("void");
      } else if (verdict.kind === "settled") {
        expect(verdict.resolution, market.id).toBe(market.demoOutcome);
      }
    }
  });
});

describe("the beat sheet", () => {
  it("settles every market exactly once", () => {
    const resolved = DEMO_BEATS.flatMap((b) =>
      b.action.type === "resolve" ? [b.action.marketId] : [],
    );
    expect(new Set(resolved).size).toBe(resolved.length);
    expect(new Set(resolved)).toEqual(new Set(markets.map((m) => m.id)));
  });

  it("runs forward, and locks the doors before it settles anything", () => {
    const times = DEMO_BEATS.map((b) => b.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const lock = DEMO_BEATS.findIndex((b) => b.action.type === "lock");
    const firstResolve = DEMO_BEATS.findIndex((b) => b.action.type === "resolve");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(firstResolve);
  });

  /**
   * No overlay outlives its gap.
   *
   * The real constraint on how fast this can run. Two settlements closer
   * together than the stamp's dismiss time would stack one card on top of
   * another mid-animation, and the second would inherit the first's remaining
   * timer. Asserted against the exported constants rather than a number typed
   * in here, so tightening the demo again forces the dismiss times to move with
   * it instead of quietly producing a pile-up.
   */
  it("never lands a settlement while the previous stamp is still up", () => {
    const resolves = DEMO_BEATS.filter((b) => b.action.type === "resolve");
    for (let i = 1; i < resolves.length; i += 1) {
      const gap = resolves[i].atMs - resolves[i - 1].atMs;
      expect(gap, `${resolves[i - 1].id} → ${resolves[i].id}`).toBeGreaterThanOrEqual(
        STAMP_DISMISS_MS,
      );
    }
  });

  it("never lands a bet while the previous toast is still up", () => {
    const bets = DEMO_BEATS.filter((b) => b.action.type === "bet");
    for (let i = 1; i < bets.length; i += 1) {
      const gap = bets[i].atMs - bets[i - 1].atMs;
      expect(gap, `${bets[i - 1].id} → ${bets[i].id}`).toBeGreaterThanOrEqual(TOAST_DISMISS_MS);
    }
  });

  it("clears the doors stamp before the first settlement lands", () => {
    const lock = DEMO_BEATS.find((b) => b.action.type === "lock")!;
    const firstResolve = DEMO_BEATS.find((b) => b.action.type === "resolve")!;
    expect(firstResolve.atMs - lock.atMs).toBeGreaterThanOrEqual(DOORS_DISMISS_MS);
  });

  /** The brief: the whole thing has to fit in a minute and a half. */
  it("runs in under ninety seconds", () => {
    expect(DEMO_DURATION_MS).toBeLessThanOrEqual(90_000);
  });

  /**
   * The betting happens on camera, before the doors shut.
   *
   * A bet scheduled after the lock would silently do nothing — `executeTrade`
   * refuses a market that is not open — and the session would reach the report
   * with a position the viewer watched being placed and no payout to match it.
   */
  it("places every scripted bet while the floor is still open", () => {
    const lockAt = DEMO_BEATS.find((b) => b.action.type === "lock")!.atMs;
    const bets = DEMO_BEATS.filter((b) => b.action.type === "bet");

    expect(bets.length).toBeGreaterThan(0);
    for (const bet of bets) {
      expect(bet.atMs, bet.id).toBeLessThan(lockAt);
      expect(bet.phase, bet.id).toBe("floor");
    }
  });

  it("only bets on markets that exist", () => {
    const ids = new Set(markets.map((m) => m.id));
    for (const bet of scriptedBets()) {
      expect(ids.has(bet.marketId), bet.marketId).toBe(true);
    }
  });

  /**
   * The presenter has to lose one.
   *
   * A session where every call comes in is an advertisement, and the refund
   * beat means nothing if nothing was ever genuinely at risk. This asserts the
   * script stakes credits on at least one market the resolver settles against
   * it.
   */
  it("backs at least one market that loses, and one that wins", () => {
    const outcomes = scriptedBets().map((bet) => {
      const verdict = resolveFromTranscript(bet.marketId)!;
      if (verdict.kind === "void") return "void";
      return verdict.resolution === bet.side ? "win" : "loss";
    });

    expect(outcomes).toContain("win");
    expect(outcomes).toContain("loss");
  });

  /** Nothing trades once the doors are shut. That is the rule, not the pacing. */
  it("stops the floor trading the moment the doors close", () => {
    expect(BOT_TICK_MS.floor).not.toBeNull();
    for (const phase of ["doors", "meeting", "epilogue", "standings"] as const) {
      expect(BOT_TICK_MS[phase], phase).toBeNull();
    }
  });

  it("shows the standings only after everything has settled", () => {
    const lastResolve = Math.max(
      ...DEMO_BEATS.filter((b) => b.action.type === "resolve").map((b) => b.atMs),
    );
    const standings = DEMO_BEATS.find((b) => b.action.type === "standings")!;
    expect(standings.atMs).toBeGreaterThan(lastResolve);
  });
});
