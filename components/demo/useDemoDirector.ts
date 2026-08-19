"use client";

/**
 * The clock that walks the beat sheet.
 *
 * Everything it does, a person could do by hand — place a bet, lock the doors,
 * settle a market, show the report. That is the point: the director is a
 * presenter with good timing, not a special mode. Every action goes through the
 * same provider functions the UI would call, so nothing in the demo path is a
 * pretend version of anything.
 *
 * It also owns the floor's pace. The ambient bot loop is switched off for the
 * duration and the director drives `runBotTick()` itself, roughly twice a
 * second while the doors are open and never once they are shut. That is not a
 * cosmetic speed-up: the whole argument of the thing is that the price moves
 * because people are putting credits behind a view, and at the real cadence a
 * viewer would watch a static board for forty seconds and conclude the numbers
 * were decoration.
 *
 * Transport is deliberate. A demo on rails is fine until someone asks a
 * question over the top of the payout beat, so space pauses, the right arrow
 * jumps to the next beat, and the whole thing restarts from a cold board. The
 * bot RNG is seeded, so a restarted session plays out identically — which is
 * what makes a take re-recordable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTrading } from "@/components/trading/TradingProvider";
import {
  BOT_TICK_MS,
  DEMO_BEATS,
  DEMO_DURATION_MS,
  type DemoBeat,
  type DemoPhase,
} from "@/lib/demo-script";
import type { Side } from "@/lib/markets";

const TICK_MS = 100;

/** A call the script just placed for you, for the toast beside the board. */
export interface PlacedBet {
  marketId: string;
  boardLabel: string;
  side: Side;
  credits: number;
  contracts: number;
  priceBefore: number;
  priceAfter: number;
  at: number;
}

export interface DirectorState {
  running: boolean;
  elapsedMs: number;
  /** Index into DEMO_BEATS of the beat currently on screen, or -1. */
  beatIndex: number;
  beat: DemoBeat | null;
  phase: DemoPhase;
  /** True from the moment the doors shut until the session is reset. */
  locked: boolean;
  showReport: boolean;
  highlightPerks: boolean;
  lastBet: PlacedBet | null;
  finished: boolean;
}

export interface Director extends DirectorState {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  restart: () => void;
  beats: DemoBeat[];
}

export function useDemoDirector(): Director {
  const {
    markets,
    lockAll,
    resolveMarket,
    runBotTick,
    buy,
    reset,
    clearLastSettlement,
    setBotsRunning,
  } = useTrading();

  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [beatIndex, setBeatIndex] = useState(-1);
  const [locked, setLocked] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [highlightPerks, setHighlightPerks] = useState(false);
  const [lastBet, setLastBet] = useState<PlacedBet | null>(null);

  // Wall clock, kept out of state so pausing does not lose or duplicate time.
  const accumulatedRef = useRef(0);
  const startedAtRef = useRef(0);
  const appliedRef = useRef(-1);

  /*
   * The ambient loop is off for the whole demo.
   *
   * Leaving it on would put two independent pacers on the same book — the
   * director's half-second tick and four bots on their own timers — and the
   * floor would trade at a rate nothing in the script chose.
   */
  useEffect(() => {
    setBotsRunning(false);
  }, [setBotsRunning]);

  /*
   * Read inside timers without making them a dependency.
   *
   * The board changes twice a second while the floor is open. Threading
   * `markets` through placeBet → applyBeat → advanceTo would put it in the
   * interval's dependencies and tear the clock down and rebuild it on every
   * price move, which is both wasteful and a good way to lose time.
   */
  const marketsRef = useRef(markets);
  useEffect(() => {
    marketsRef.current = markets;
  }, [markets]);

  const placeBet = useCallback(
    (marketId: string, side: Side, credits: number) => {
      // The trade record already carries everything the toast needs — what it
      // cost, what it bought, and where it left the price — so there is no
      // separate quote to keep in step with it.
      const record = buy(marketId, side, credits);
      if (!record) return;
      const market = marketsRef.current.find((m) => m.id === marketId);
      setLastBet({
        marketId,
        boardLabel: market?.boardLabel ?? marketId,
        side,
        credits: record.cost,
        contracts: record.contracts,
        priceBefore: record.priceBefore,
        priceAfter: record.priceAfter,
        at: record.at,
      });
    },
    [buy],
  );

  const applyBeat = useCallback(
    (beat: DemoBeat) => {
      switch (beat.action.type) {
        case "bet":
          placeBet(beat.action.marketId, beat.action.side, beat.action.credits);
          break;
        case "lock":
          lockAll();
          setLocked(true);
          break;
        case "resolve":
          resolveMarket(beat.action.marketId);
          break;
        case "standings":
          setShowReport(true);
          break;
        case "perks":
          setHighlightPerks(true);
          break;
        case "note":
          break;
      }
    },
    [lockAll, resolveMarket, placeBet],
  );

  /** Fire every beat due at or before `to` that has not fired yet. */
  const advanceTo = useCallback(
    (to: number) => {
      let index = appliedRef.current;
      while (index + 1 < DEMO_BEATS.length && DEMO_BEATS[index + 1].atMs <= to) {
        index += 1;
        applyBeat(DEMO_BEATS[index]);
      }
      if (index !== appliedRef.current) {
        appliedRef.current = index;
        setBeatIndex(index);
      }
    },
    [applyBeat],
  );

  useEffect(() => {
    if (!running) return;
    startedAtRef.current = Date.now();
    const id = window.setInterval(() => {
      const elapsed = accumulatedRef.current + (Date.now() - startedAtRef.current);
      setElapsedMs(elapsed);
      advanceTo(elapsed);
      if (elapsed >= DEMO_DURATION_MS) {
        accumulatedRef.current = DEMO_DURATION_MS;
        setRunning(false);
      }
    }, TICK_MS);
    return () => {
      accumulatedRef.current += Date.now() - startedAtRef.current;
      window.clearInterval(id);
    };
  }, [running, advanceTo]);

  const beat = beatIndex >= 0 ? DEMO_BEATS[beatIndex] : null;
  const phase = beat?.phase ?? "floor";

  /** The floor, trading. Stops dead the moment the doors shut. */
  const tickMs = BOT_TICK_MS[phase];
  useEffect(() => {
    if (!running || tickMs === null) return;
    const id = window.setInterval(runBotTick, tickMs);
    return () => window.clearInterval(id);
  }, [running, tickMs, runBotTick]);

  const play = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const toggle = useCallback(() => setRunning((r) => !r), []);

  /**
   * Skip to the next beat and fire it now.
   *
   * Moves the clock as well as the beat, so stepping forward and then pressing
   * play does not immediately replay everything that was skipped past. Stepping
   * through the open floor also runs the bot trades that would have happened in
   * the time being skipped, otherwise a stepped session reaches the doors with
   * a board nobody ever bet on.
   */
  const next = useCallback(() => {
    const target = appliedRef.current + 1;
    if (target >= DEMO_BEATS.length) return;
    const at = DEMO_BEATS[target].atMs;
    const skipped = at - accumulatedRef.current;
    const pace = BOT_TICK_MS[DEMO_BEATS[Math.max(0, appliedRef.current)]?.phase ?? "floor"];
    if (pace !== null && skipped > 0) {
      const ticks = Math.min(60, Math.floor(skipped / pace));
      for (let i = 0; i < ticks; i += 1) runBotTick();
    }

    accumulatedRef.current = at;
    startedAtRef.current = Date.now();
    setElapsedMs(at);
    advanceTo(at);
  }, [advanceTo, runBotTick]);

  const restart = useCallback(() => {
    setRunning(false);
    accumulatedRef.current = 0;
    startedAtRef.current = Date.now();
    appliedRef.current = -1;
    setElapsedMs(0);
    setBeatIndex(-1);
    setLocked(false);
    setShowReport(false);
    setHighlightPerks(false);
    setLastBet(null);
    clearLastSettlement();
    // The seeded RNG is reset alongside the ledger, so the replayed session is
    // the same session — same trades, same prices, same payouts.
    reset();
    setBotsRunning(false);
  }, [reset, clearLastSettlement, setBotsRunning]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Never steal keys from the stake box or any other real input.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "r" || event.key === "R") {
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, next, restart]);

  return {
    running,
    elapsedMs,
    beatIndex,
    beat,
    phase,
    locked,
    showReport,
    highlightPerks,
    lastBet,
    finished: beatIndex >= DEMO_BEATS.length - 1,
    play,
    pause,
    toggle,
    next,
    restart,
    beats: DEMO_BEATS,
  };
}
