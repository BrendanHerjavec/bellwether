"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { applyTrade, priceOf, quote as lmsrQuote, sharesForBudget } from "@/lib/lmsr";
import {
  BOT_ROSTER,
  decideBotTrade,
  makeRandom,
  nextDelay,
  type BotPersona,
} from "@/lib/bots";
import { createSeedMarkets, PERKS, type Market, type Side } from "@/lib/markets";
import {
  payoutFor,
  refundFor,
  standings as computeStandings,
  type SettlementRecord,
  type Standing,
} from "@/lib/settlement";
import { resolveFromTranscript, type Verdict } from "@/lib/transcript";

export const YOU_ID = "you";
export const STARTING_BALANCE = 1000;

export interface Trader {
  id: string;
  name: string;
  isBot: boolean;
  persona?: BotPersona;
  /** Leadership trades are named on the ticker; everyone else is anonymous. */
  isLeadership: boolean;
  balance: number;
}

export interface Position {
  marketId: string;
  yesShares: number;
  noShares: number;
  creditsStaked: number;
}

export interface TradeRecord {
  id: number;
  marketId: string;
  traderId: string;
  /** Already resolved for display: the real name, or an anonymous stand-in. */
  displayName: string;
  isPublic: boolean;
  side: Side;
  contracts: number;
  cost: number;
  priceBefore: number;
  priceAfter: number;
  at: number;
}

export interface Quote {
  contracts: number;
  cost: number;
  avgPrice: number;
  priceBefore: number;
  priceAfter: number;
  payout: number;
  profit: number;
}

/** The mutable book. Mirrored into React state purely for rendering. */
interface Ledger {
  markets: Market[];
  traders: Record<string, Trader>;
  positions: Record<string, Record<string, Position>>;
  settlements: SettlementRecord[];
  /** Perk ids you have spent credits on. What the whole game is actually for. */
  purchases: string[];
}

/**
 * What a settlement did, as one object, for the overlay to render.
 *
 * The verdict alone is not enough for the moment on screen — the room wants to
 * know what it paid *you*, and the two facts arrive together or the beat does
 * not land.
 */
export interface SettlementEvent {
  market: Market;
  verdict: Verdict;
  /** Your line, if you were holding. Everyone else's is on the leaderboard. */
  yours: SettlementRecord | null;
  /** Total credits paid out across every holder. */
  paidOut: number;
  holders: number;
  at: number;
}

export interface TradingContextValue {
  markets: Market[];
  traders: Record<string, Trader>;
  you: Trader;
  balance: number;
  startingBalance: number;
  positions: Record<string, Position>;
  trades: TradeRecord[];
  settlements: SettlementRecord[];
  /** Yours only, newest first. The results feed on the trader view. */
  yourSettlements: SettlementRecord[];
  /** The most recent settlement, for the overlay to show and then dismiss. */
  lastSettlement: SettlementEvent | null;
  standings: Standing[];
  botsRunning: boolean;
  activeBotIds: string[];
  purchases: string[];
  quoteFor: (marketId: string, side: Side, credits: number) => Quote | null;
  buy: (marketId: string, side: Side, credits: number) => TradeRecord | null;
  priceOfMarket: (market: Market, side: Side) => number;
  setBotsRunning: (running: boolean) => void;
  toggleBot: (profileId: string) => void;
  /** Close the doors. Everything open becomes locked; nothing more trades. */
  lockAll: () => void;
  /** Settle one market from the transcript. Returns what it did, or null. */
  resolveMarket: (marketId: string) => SettlementEvent | null;
  clearLastSettlement: () => void;
  /**
   * Let exactly one bot act, now.
   *
   * The ambient loop trades on nine to fifteen second cadences, which is right
   * for a room and far too slow to watch. This is the same decision function
   * with the pacing handed to the caller, so a demo can run a session's worth
   * of argument across a minute of screen time.
   */
  runBotTick: () => void;
  /** Spend credits on a perk. The only thing credits are for. */
  buyPerk: (perkId: string) => boolean;
  reset: () => void;
}

/**
 * Exported because the 3D hall has to re-provide it by hand.
 *
 * R3F's <Canvas> runs its own reconciler, and context does not reliably reach
 * the DOM subtree drei's <Html> portals out. Anything rendered inside the
 * Canvas that needs this must read the value outside and wrap itself in a fresh
 * Provider — see components/hall/Hall.tsx.
 */
export const TradingContext = createContext<TradingContextValue | null>(null);

/**
 * A complete book from the first tick, bots included.
 *
 * The roster used to be materialised by an effect, which was fine while the
 * only thing that traded was a timer — but a child component's effect runs
 * before its parent's, so anything that wanted to trade on mount found a
 * ledger containing nobody but you. Building the roster here removes the
 * ordering hazard entirely; the effect below still reconciles it when bots are
 * toggled on and off.
 */
function initialLedger(): Ledger {
  const traders: Record<string, Trader> = {
    [YOU_ID]: {
      id: YOU_ID,
      name: "You",
      isBot: false,
      isLeadership: false,
      balance: STARTING_BALANCE,
    },
  };
  for (const profile of BOT_ROSTER) {
    traders[profile.id] = {
      id: profile.id,
      name: profile.name,
      isBot: true,
      persona: profile.persona,
      isLeadership: profile.isLeadership,
      balance: STARTING_BALANCE,
    };
  }

  return {
    markets: createSeedMarkets(),
    traders,
    positions: {},
    settlements: [],
    purchases: [],
  };
}

export function TradingProvider({ children }: { children: ReactNode }) {
  /*
   * The ledger ref is the source of truth, not the React state.
   *
   * Several bots fire on independent timers, and two landing in the same tick
   * must price off each other rather than off the same snapshot — the exact
   * property execute_trade() guarantees in Postgres with a row lock. Reading
   * and writing a ref synchronously gives that sequencing here, and the React
   * state below is only a mirror for rendering.
   */
  // Built once, then handed to both the ref and the mirrored state, so the two
  // start out as the same objects without reading the ref during render.
  const [initial] = useState(initialLedger);
  const ledgerRef = useRef<Ledger>(initial);
  const [, forceVersion] = useState(0);

  const [markets, setMarkets] = useState<Market[]>(initial.markets);
  const [traders, setTraders] = useState(initial.traders);
  const [positions, setPositions] = useState(initial.positions);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [purchases, setPurchases] = useState<string[]>([]);
  const [lastSettlement, setLastSettlement] = useState<SettlementEvent | null>(null);
  const [botsRunning, setBotsRunning] = useState(true);
  const [activeBotIds, setActiveBotIds] = useState<string[]>(
    BOT_ROSTER.map((b) => b.id),
  );

  const tradeIdRef = useRef(0);
  const randomRef = useRef(makeRandom(20260811));

  const publish = useCallback(() => {
    setMarkets(ledgerRef.current.markets);
    setTraders(ledgerRef.current.traders);
    setPositions(ledgerRef.current.positions);
    setSettlements(ledgerRef.current.settlements);
    setPurchases(ledgerRef.current.purchases);
    forceVersion((v) => v + 1);
  }, []);

  /** Bots exist as traders only while they are on the roster. */
  useEffect(() => {
    const ledger = ledgerRef.current;
    const next: Record<string, Trader> = { [YOU_ID]: ledger.traders[YOU_ID] };
    for (const profile of BOT_ROSTER) {
      if (!activeBotIds.includes(profile.id)) continue;
      next[profile.id] = ledger.traders[profile.id] ?? {
        id: profile.id,
        name: profile.name,
        isBot: true,
        persona: profile.persona,
        isLeadership: profile.isLeadership,
        balance: STARTING_BALANCE,
      };
    }
    ledger.traders = next;
    publish();
  }, [activeBotIds, publish]);

  /**
   * The single write path. Everything — you, every bot — goes through here,
   * so there is exactly one place that has to be correct, and exactly one
   * place to swap for a POST to the server route.
   */
  const executeTrade = useCallback(
    (traderId: string, marketId: string, side: Side, credits: number): TradeRecord | null => {
      const ledger = ledgerRef.current;
      const trader = ledger.traders[traderId];
      const market = ledger.markets.find((m) => m.id === marketId);
      if (!trader || !market || market.status !== "open") return null;
      if (!Number.isFinite(credits) || credits <= 0) return null;

      const spend = Math.min(credits, trader.balance);
      if (spend <= 0) return null;

      const contracts = sharesForBudget(market.state, side, spend);
      if (contracts <= 0) return null;

      const q = lmsrQuote(market.state, side, contracts);
      const cost = Math.round(q.cost * 100) / 100;
      if (cost <= 0 || cost > trader.balance) return null;

      ledger.markets = ledger.markets.map((m) =>
        m.id === marketId ? { ...m, state: applyTrade(m.state, side, contracts) } : m,
      );
      ledger.traders = {
        ...ledger.traders,
        [traderId]: {
          ...trader,
          balance: Math.round((trader.balance - cost) * 100) / 100,
        },
      };

      const forTrader = ledger.positions[traderId] ?? {};
      const existing = forTrader[marketId] ?? {
        marketId,
        yesShares: 0,
        noShares: 0,
        creditsStaked: 0,
      };
      ledger.positions = {
        ...ledger.positions,
        [traderId]: {
          ...forTrader,
          [marketId]: {
            ...existing,
            yesShares: existing.yesShares + (side === "YES" ? contracts : 0),
            noShares: existing.noShares + (side === "NO" ? contracts : 0),
            creditsStaked: existing.creditsStaked + cost,
          },
        },
      };

      tradeIdRef.current += 1;
      const record: TradeRecord = {
        id: tradeIdRef.current,
        marketId,
        traderId,
        // Anonymity is resolved at the moment of record, so a name can never
        // leak later by accident.
        displayName: trader.isLeadership
          ? trader.name
          : traderId === YOU_ID
            ? "You"
            : "A trader",
        isPublic: trader.isLeadership,
        side,
        contracts,
        cost,
        priceBefore: q.priceBefore,
        priceAfter: q.priceAfter,
        at: Date.now(),
      };

      setTrades((prev) => [record, ...prev].slice(0, 60));
      publish();
      return record;
    },
    [publish],
  );

  /* ---------------------------------------------------------- settlement */

  /** Doors close. Nothing that is open stays open, and nothing more trades. */
  const lockAll = useCallback(() => {
    const ledger = ledgerRef.current;
    ledger.markets = ledger.markets.map((m) =>
      m.status === "open" ? { ...m, status: "locked" as const } : m,
    );
    publish();
  }, [publish]);

  /**
   * Settle one market, or void it, and pay everyone.
   *
   * The second write path, and the only other place a balance changes. Same
   * shape as `executeTrade`: read the ledger ref, mutate it synchronously,
   * publish once. Swapping this for a server route is the same one-function
   * change.
   *
   * A winning contract pays exactly one credit and a losing one pays nothing.
   * A void pays back the stake — not the position's market value, which would
   * hand a windfall to whoever the price had drifted toward on a question that
   * should never have been asked.
   */
  const resolveMarket = useCallback(
    (marketId: string): SettlementEvent | null => {
      const ledger = ledgerRef.current;
      const market = ledger.markets.find((m) => m.id === marketId);
      if (!market || market.status === "settled" || market.status === "void") return null;

      const verdict = resolveFromTranscript(marketId);
      if (!verdict) return null;

      /*
       * No citation, no settlement.
       *
       * In Postgres this is a CHECK constraint rather than a code path,
       * precisely so a buggy resolver cannot talk its way past it. The same
       * rule has to hold here or the demo would be showing a weaker guarantee
       * than the schema actually makes.
       */
      if (verdict.kind === "settled" && !verdict.citationText.trim()) return null;

      const at = Date.now();
      const records: SettlementRecord[] = [];
      const traders = { ...ledger.traders };
      const positions = { ...ledger.positions };
      let paidOut = 0;

      for (const [traderId, byMarket] of Object.entries(ledger.positions)) {
        const position = byMarket[marketId];
        if (!position || (position.yesShares <= 0 && position.noShares <= 0)) continue;
        const trader = traders[traderId];
        if (!trader) continue;

        const paid =
          verdict.kind === "void" ? refundFor(position) : payoutFor(position, verdict.resolution);

        traders[traderId] = {
          ...trader,
          balance: Math.round((trader.balance + paid) * 100) / 100,
        };

        // The position is consumed by settling. It lives on as a record, which
        // is what the results feed and the leaderboard read.
        const remaining = { ...byMarket };
        delete remaining[marketId];
        positions[traderId] = remaining;

        paidOut += paid;
        records.push({
          marketId,
          traderId,
          outcome: verdict.kind === "void" ? "VOID" : verdict.resolution,
          yesShares: position.yesShares,
          noShares: position.noShares,
          staked: position.creditsStaked,
          paid,
          profit: Math.round((paid - position.creditsStaked) * 100) / 100,
          at,
        });
      }

      const settled: Market =
        verdict.kind === "void"
          ? { ...market, status: "void", voidReason: verdict.voidReason, settledAt: at }
          : {
              ...market,
              status: "settled",
              resolution: verdict.resolution,
              citationText: verdict.citationText,
              citationTimestamp: verdict.citationTimestamp,
              citationSpeaker: verdict.speaker,
              citationReasoning: verdict.reasoning,
              citationSource: verdict.source,
              settledAt: at,
            };

      ledger.markets = ledger.markets.map((m) => (m.id === marketId ? settled : m));
      ledger.traders = traders;
      ledger.positions = positions;
      ledger.settlements = [...records, ...ledger.settlements];

      const event: SettlementEvent = {
        market: settled,
        verdict,
        yours: records.find((r) => r.traderId === YOU_ID) ?? null,
        paidOut: Math.round(paidOut * 100) / 100,
        holders: records.length,
        at,
      };

      setLastSettlement(event);
      publish();
      return event;
    },
    [publish],
  );

  const clearLastSettlement = useCallback(() => setLastSettlement(null), []);

  /**
   * One bot acts, right now.
   *
   * The ambient loop below trades on each persona's own randomised cadence,
   * which is what a real floor looks like and is far too slow to record. This
   * exposes a single step of exactly the same decision function so a caller can
   * own the pacing instead — the demo runs it every half second during the open
   * floor, which puts a session's worth of argument on the board inside a
   * minute without inventing a single price.
   *
   * It draws from the same seeded generator as everything else, so a replayed
   * session is the same session.
   */
  const runBotTick = useCallback(() => {
    const random = randomRef.current;
    const ledger = ledgerRef.current;

    // Try each bot once, in a random order, so a persona with no view on
    // anything right now yields its turn rather than wasting the tick.
    const order = [...BOT_ROSTER].sort(() => random() - 0.5);
    for (const profile of order) {
      const trader = ledger.traders[profile.id];
      if (!trader) continue;
      const decision = decideBotTrade(profile.persona, ledger.markets, trader.balance, random);
      if (!decision) continue;
      executeTrade(profile.id, decision.marketId, decision.side, decision.credits);
      return;
    }
  }, [executeTrade]);

  /**
   * Spend credits on a perk.
   *
   * The last step of the loop and the one that decides what the whole thing
   * means. Credits that cannot be spent on anything are a score; credits that
   * buy the team lunch are a currency with exactly one denomination of power in
   * it, and no exchange rate to money at all.
   */
  const buyPerk = useCallback(
    (perkId: string): boolean => {
      const ledger = ledgerRef.current;
      const perk = PERKS.find((p) => p.id === perkId);
      if (!perk) return false;
      if (ledger.purchases.includes(perkId)) return false;

      const you = ledger.traders[YOU_ID];
      if (!you || you.balance < perk.price) return false;

      ledger.traders = {
        ...ledger.traders,
        [YOU_ID]: { ...you, balance: Math.round((you.balance - perk.price) * 100) / 100 },
      };
      ledger.purchases = [...ledger.purchases, perkId];
      publish();
      return true;
    },
    [publish],
  );

  /* ------------------------------------------------------------ bot loop */

  const botKey = activeBotIds.join(",");
  useEffect(() => {
    if (!botsRunning) return;
    const timers: number[] = [];

    for (const profile of BOT_ROSTER) {
      if (!activeBotIds.includes(profile.id)) continue;

      const schedule = () => {
        const delay = nextDelay(profile, randomRef.current);
        const id = window.setTimeout(() => {
          const ledger = ledgerRef.current;
          const trader = ledger.traders[profile.id];
          if (trader) {
            const decision = decideBotTrade(
              profile.persona,
              ledger.markets,
              trader.balance,
              randomRef.current,
            );
            if (decision) {
              executeTrade(
                profile.id,
                decision.marketId,
                decision.side,
                decision.credits,
              );
            }
          }
          schedule();
        }, delay);
        timers.push(id);
      };

      // Stagger the openings so the board does not fire four trades at once
      // the instant the page loads.
      const opening = window.setTimeout(schedule, 400 + Math.random() * 2600);
      timers.push(opening);
    }

    return () => timers.forEach((id) => window.clearTimeout(id));
    // botKey stands in for activeBotIds; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botsRunning, botKey, executeTrade]);

  /* -------------------------------------------------------------- public */

  const priceOfMarket = useCallback(
    (market: Market, side: Side) => priceOf(market.state, side),
    [],
  );

  const quoteFor = useCallback(
    (marketId: string, side: Side, credits: number): Quote | null => {
      const market = markets.find((m) => m.id === marketId);
      if (!market || market.status !== "open") return null;
      if (!Number.isFinite(credits) || credits <= 0) return null;

      const contracts = sharesForBudget(market.state, side, credits);
      if (contracts <= 0) return null;

      const q = lmsrQuote(market.state, side, contracts);
      return {
        contracts,
        cost: q.cost,
        avgPrice: q.avgPrice,
        priceBefore: q.priceBefore,
        priceAfter: q.priceAfter,
        payout: contracts,
        profit: contracts - q.cost,
      };
    },
    [markets],
  );

  const buy = useCallback(
    (marketId: string, side: Side, credits: number) =>
      executeTrade(YOU_ID, marketId, side, credits),
    [executeTrade],
  );

  const toggleBot = useCallback((profileId: string) => {
    setActiveBotIds((prev) =>
      prev.includes(profileId)
        ? prev.filter((id) => id !== profileId)
        : [...prev, profileId],
    );
  }, []);

  const reset = useCallback(() => {
    ledgerRef.current = initialLedger();
    tradeIdRef.current = 0;
    randomRef.current = makeRandom(20260811);
    setTrades([]);
    setLastSettlement(null);
    setActiveBotIds(BOT_ROSTER.map((b) => b.id));
    publish();
  }, [publish]);

  const you = traders[YOU_ID];

  const yourSettlements = useMemo(
    () => settlements.filter((s) => s.traderId === YOU_ID),
    [settlements],
  );

  const leaderboard = useMemo(
    () =>
      computeStandings(
        Object.values(traders),
        positions,
        markets,
        settlements,
        STARTING_BALANCE,
        YOU_ID,
      ),
    [traders, positions, markets, settlements],
  );

  const value = useMemo(
    () => ({
      markets,
      traders,
      you,
      balance: you?.balance ?? 0,
      startingBalance: STARTING_BALANCE,
      positions: positions[YOU_ID] ?? {},
      trades,
      settlements,
      yourSettlements,
      purchases,
      lastSettlement,
      standings: leaderboard,
      botsRunning,
      activeBotIds,
      quoteFor,
      buy,
      priceOfMarket,
      setBotsRunning,
      toggleBot,
      lockAll,
      resolveMarket,
      clearLastSettlement,
      runBotTick,
      buyPerk,
      reset,
    }),
    [
      markets, traders, you, positions, trades, settlements, yourSettlements,
      lastSettlement, leaderboard, botsRunning, activeBotIds, purchases,
      quoteFor, buy, priceOfMarket, toggleBot, lockAll, resolveMarket,
      clearLastSettlement, runBotTick, buyPerk, reset,
    ],
  );

  return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>;
}

export function useTrading(): TradingContextValue {
  const context = useContext(TradingContext);
  if (!context) throw new Error("useTrading must be used inside a TradingProvider");
  return context;
}
