// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TotBoardView } from "./TotBoard";
import { TickerView } from "./Ticker";
import type { TradeRecord } from "@/components/trading/TradingProvider";
import { createSeedMarkets } from "@/lib/markets";

/**
 * The board must render from props alone, with no TradingProvider anywhere in
 * the tree.
 *
 * This is not a style preference. Inside the 3D hall the board is rendered
 * through R3F's reconciler and out again via drei's <Html> portal, and React
 * context does not survive that crossing: the context-reading version threw
 * "useTrading must be used inside a TradingProvider" and took the entire scene
 * down with it. It shipped twice, because the failure is invisible unless WebGL
 * actually initialises.
 *
 * Rendering these with no provider mounted is exactly the condition inside the
 * Canvas, so if this passes, the hall cannot crash that way again.
 */

afterEach(cleanup);

/**
 * jsdom has no ResizeObserver. The board guards against its absence, but stub
 * it anyway so the observer path is the one under test rather than the
 * fallback — a real browser always has it.
 */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= StubResizeObserver as unknown as typeof ResizeObserver;

const markets = createSeedMarkets();

const trades: TradeRecord[] = [
  {
    id: 1,
    marketId: "enterprise-date",
    traderId: "bot-optimist",
    displayName: "Priya Raman",
    isPublic: true,
    side: "YES",
    contracts: 120,
    cost: 22.4,
    priceBefore: 0.18,
    priceAfter: 0.21,
    at: 0,
  },
  {
    id: 2,
    marketId: "qa-overrun",
    traderId: "bot-cynic",
    displayName: "A trader",
    isPublic: false,
    side: "NO",
    contracts: 80,
    cost: 21.1,
    priceBefore: 0.72,
    priceAfter: 0.7,
    at: 0,
  },
];

describe("TotBoardView without a provider", () => {
  it("renders every market row", () => {
    const { container } = render(
      <TotBoardView markets={markets} trades={trades} widthPx={1500} />,
    );
    expect(container.querySelectorAll(".market-row")).toHaveLength(markets.length);
  });

  it("renders split-flap drums rather than plain text", () => {
    const { container } = render(<TotBoardView markets={markets} trades={trades} />);
    expect(container.querySelectorAll(".flap").length).toBeGreaterThan(0);
  });

  it("honours the fixed pixel width the hall mounts it at", () => {
    const { container } = render(
      <TotBoardView markets={markets} trades={trades} widthPx={1500} />,
    );
    const board = container.querySelector<HTMLElement>(".board");
    expect(board?.style.width).toBe("1500px");
  });

  it("reports the open market and trade counts", () => {
    const { container } = render(<TotBoardView markets={markets} trades={trades} />);
    expect(container.textContent).toContain(`${markets.length} markets open`);
    expect(container.textContent).toContain(`${trades.length} trades`);
  });

  it("carries the tape", () => {
    const { container } = render(<TotBoardView markets={markets} trades={trades} />);
    expect(container.querySelector(".ticker")).not.toBeNull();
  });
});

describe("TickerView without a provider", () => {
  it("names leadership and nobody else", () => {
    const { container } = render(<TickerView trades={trades} markets={markets} />);
    const named = Array.from(container.querySelectorAll(".ticker__who")).map(
      (el) => el.textContent,
    );
    expect(named).toContain("Priya Raman");
    expect(named).not.toContain("A trader");
  });

  it("shows an idle state before the first trade", () => {
    const { container } = render(<TickerView trades={[]} markets={markets} />);
    expect(container.querySelector(".ticker__idle")).not.toBeNull();
  });

  it("survives a trade referencing a market it does not know", () => {
    const orphan: TradeRecord[] = [{ ...trades[0], marketId: "does-not-exist" }];
    const { container } = render(<TickerView trades={orphan} markets={markets} />);
    expect(container.querySelector(".ticker__item")).not.toBeNull();
  });
});
