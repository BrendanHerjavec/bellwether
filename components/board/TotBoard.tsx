"use client";

import { MarketRow } from "@/components/board/MarketRow";
import { TickerView } from "@/components/board/Ticker";
import { useTrading, type TradeRecord } from "@/components/trading/TradingProvider";
import { priceOf } from "@/lib/lmsr";
import { boardStatus, type Market } from "@/lib/markets";

/**
 * The board itself, with no opinion about what it is mounted in.
 *
 * This is the DOM board: the flat view at /board, and the tape on the trader's
 * page. The hall used to mount this same component through drei's `<Html
 * transform>` and no longer does — inside the hall the board is painted into a
 * texture instead (`board-raster.ts`), because a DOM layer composited over the
 * canvas could not be fogged, bloomed or occluded, and re-rasterised itself
 * every time the camera moved.
 *
 * The two share `lib/board-layout.ts` and nothing else. That split is
 * deliberate: this one is a web page and can reflow, and the rastered one is a
 * physical object with a fixed number of drums.
 *
 * Still split into a pure view and a connected wrapper. `TotBoardView` takes
 * every piece of state as a prop; `TotBoard` reads context for ordinary page
 * use. Worth keeping — a board that can be handed its data is a board that can
 * be tested and screenshotted without a provider around it.
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
            status={boardStatus(market)}
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
