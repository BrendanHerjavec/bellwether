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
import { createSeedMarkets, type Market, type Side } from "@/lib/markets";

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
}

export interface TradingContextValue {
  markets: Market[];
  traders: Record<string, Trader>;
  you: Trader;
  balance: number;
  startingBalance: number;
  positions: Record<string, Position>;
  trades: TradeRecord[];
  botsRunning: boolean;
  activeBotIds: string[];
  quoteFor: (marketId: string, side: Side, credits: number) => Quote | null;
  buy: (marketId: string, side: Side, credits: number) => boolean;
  priceOfMarket: (market: Market, side: Side) => number;
  setBotsRunning: (running: boolean) => void;
  toggleBot: (profileId: string) => void;
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

function initialLedger(): Ledger {
  return {
    markets: createSeedMarkets(),
    traders: {
      [YOU_ID]: {
        id: YOU_ID,
        name: "You",
        isBot: false,
        isLeadership: false,
        balance: STARTING_BALANCE,
      },
    },
    positions: {},
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
    (traderId: string, marketId: string, side: Side, credits: number): boolean => {
      const ledger = ledgerRef.current;
      const trader = ledger.traders[traderId];
      const market = ledger.markets.find((m) => m.id === marketId);
      if (!trader || !market || market.status !== "open") return false;
      if (!Number.isFinite(credits) || credits <= 0) return false;

      const spend = Math.min(credits, trader.balance);
      if (spend <= 0) return false;

      const contracts = sharesForBudget(market.state, side, spend);
      if (contracts <= 0) return false;

      const q = lmsrQuote(market.state, side, contracts);
      const cost = Math.round(q.cost * 100) / 100;
      if (cost <= 0 || cost > trader.balance) return false;

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
    setActiveBotIds(BOT_ROSTER.map((b) => b.id));
    publish();
  }, [publish]);

  const you = traders[YOU_ID];

  const value = useMemo(
    () => ({
      markets,
      traders,
      you,
      balance: you?.balance ?? 0,
      startingBalance: STARTING_BALANCE,
      positions: positions[YOU_ID] ?? {},
      trades,
      botsRunning,
      activeBotIds,
      quoteFor,
      buy,
      priceOfMarket,
      setBotsRunning,
      toggleBot,
      reset,
    }),
    [
      markets, traders, you, positions, trades, botsRunning, activeBotIds,
      quoteFor, buy, priceOfMarket, toggleBot, reset,
    ],
  );

  return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>;
}

export function useTrading(): TradingContextValue {
  const context = useContext(TradingContext);
  if (!context) throw new Error("useTrading must be used inside a TradingProvider");
  return context;
}
