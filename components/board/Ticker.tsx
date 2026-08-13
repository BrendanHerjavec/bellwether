"use client";

import { useMemo } from "react";
import { useTrading, type TradeRecord } from "@/components/trading/TradingProvider";
import type { Market } from "@/lib/markets";

/**
 * The ticker tape.
 *
 * Runs along the bottom of the board carrying recent trades. Its real job is
 * motion: a board where nothing is moving reads as a screenshot, and the
 * ticker guarantees there is always something in flight even between flips.
 *
 * The strip is rendered twice and translated by exactly half its width, which
 * makes the loop seamless without measuring anything.
 *
 * Split into a pure view and a connected wrapper. The view takes everything as
 * props so it can be rendered inside the 3D hall, where React context does not
 * survive the crossing into R3F's reconciler and drei's DOM portal.
 */

export interface TickerViewProps {
  trades: TradeRecord[];
  markets: Market[];
  variant?: "dark" | "light";
}

export function TickerView({ trades, markets, variant = "dark" }: TickerViewProps) {
  const byId = useMemo(
    () => new Map<string, Market>(markets.map((m) => [m.id, m])),
    [markets],
  );

  // Enough items that the strip always overflows its container, so the loop
  // never shows a gap on a wide screen with only a couple of trades so far.
  const items = useMemo(() => {
    const recent = trades.slice(0, 18);
    if (recent.length === 0) return [];
    const out: TradeRecord[] = [];
    while (out.length < 14) out.push(...recent);
    return out.slice(0, 14);
  }, [trades]);

  if (items.length === 0) {
    return (
      <div className="ticker" data-variant={variant}>
        <div className="ticker__label">Tape</div>
        <div className="ticker__viewport">
          <div className="ticker__idle">Waiting for the first trade of the session</div>
        </div>
      </div>
    );
  }

  const strip = (
    <div className="ticker__strip">
      {items.map((trade, index) => {
        const market = byId.get(trade.marketId);
        const move =
          Math.round(trade.priceAfter * 100) - Math.round(trade.priceBefore * 100);
        return (
          <span className="ticker__item" key={`${trade.id}-${index}`}>
            <span className="ticker__market">{market?.boardLabel ?? "—"}</span>
            <span className="ticker__side" data-side={trade.side}>
              {trade.side}
            </span>
            <span className="ticker__size">{Math.round(trade.contracts)}</span>
            <span className="ticker__price">
              {Math.round(trade.priceAfter * 100)}
              {move !== 0 && (
                <span className="ticker__delta" data-dir={move > 0 ? "up" : "down"}>
                  {move > 0 ? "▲" : "▼"}
                  {Math.abs(move)}
                </span>
              )}
            </span>
            {/* Only leadership is named. Everyone else moves the tape anonymously. */}
            {trade.isPublic && <span className="ticker__who">{trade.displayName}</span>}
            <span className="ticker__sep">◆</span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="ticker" data-variant={variant}>
      <div className="ticker__label">Tape</div>
      <div className="ticker__viewport">
        <div className="ticker__track">
          {strip}
          {/* Duplicate, so the translate can loop without a visible seam. */}
          <div aria-hidden="true" className="contents">
            {strip}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Context-connected form, for use outside the 3D hall. */
export function Ticker({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const { trades, markets } = useTrading();
  return <TickerView trades={trades} markets={markets} variant={variant} />;
}
