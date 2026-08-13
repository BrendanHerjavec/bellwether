"use client";

import { MarketRow } from "@/components/board/MarketRow";
import { TickerView } from "@/components/board/Ticker";
import { useTrading, type TradeRecord } from "@/components/trading/TradingProvider";
import { priceOf } from "@/lib/lmsr";
import type { Market } from "@/lib/markets";

/**
 * The board itself, with no opinion about what it is mounted in.
 *
 * Used flat on a page and mounted inside the 3D hall through drei's <Html
 * transform>, which keeps it as real DOM text rather than a rendered texture.
 * That is the entire reason the digits stay crisp at projector resolution.
 *
 * Deliberately split in two. `TotBoardView` takes every piece of state as a
 * prop and touches no context at all; `TotBoard` is the convenience wrapper
 * that reads context for ordinary page use.
 *
 * The reason is not style. R3F's <Canvas> runs its own reconciler and drei's
 * <Html> portals its children into a detached DOM subtree, and React context
 * does not survive that crossing — the context-reading version threw
 * "useTrading must be used inside a TradingProvider" and took the whole scene
 * down with it. Re-providing the context inside the Canvas did not fix it
 * either. Passing plain props across the boundary is the only version that is
 * actually robust, so the hall renders `TotBoardView`.
 */

export interface TotBoardViewProps {
  markets: Market[];
  trades: TradeRecord[];
  widthPx?: number;
}

export function TotBoardView({ markets, trades, widthPx }: TotBoardViewProps) {
  const openCount = markets.filter((m) => m.status === "open").length;

  return (
    <div
      className="board flapboard"
      style={widthPx ? { width: `${widthPx}px` } : undefined}
    >
      <div className="board__header">
        <div>
          <div className="board__title">Bellwether</div>
          <div className="board__subtitle mt-1">
            Northwind · Q3 All Hands · Live odds
          </div>
        </div>
        <div className="board__subtitle text-right">
          Credits are not money
          <br />
          <span className="text-[#5b6272]">
            {openCount} markets open · {trades.length} trades
          </span>
        </div>
      </div>

      <div className="board__columns">
        <span className="w-[22px]" />
        <span className="flex-1">Market</span>
        <span className="w-[80px]">Yes</span>
        <span className="w-[62px] text-right">Move</span>
        <span className="w-[116px]">Status</span>
      </div>

      <div className="board__well">
        {markets.map((market, index) => (
          <MarketRow
            key={market.id}
            index={index + 1}
            question={market.boardLabel}
            price={priceOf(market.state, "YES")}
            openingPrice={market.openingPrice}
            status={market.status === "open" ? "open" : "locked"}
            baseDelayMs={index * 120}
          />
        ))}
      </div>

      <div className="mt-3">
        <TickerView trades={trades} markets={markets} variant="dark" />
      </div>
    </div>
  );
}

/** Context-connected form, for use outside the 3D hall. */
export function TotBoard({ widthPx }: { widthPx?: number }) {
  const { markets, trades } = useTrading();
  return <TotBoardView markets={markets} trades={trades} widthPx={widthPx} />;
}
