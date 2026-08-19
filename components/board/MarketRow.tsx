"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SplitFlapPrice, SplitFlapText } from "@/components/splitflap/SplitFlapText";
import type { BoardStatus } from "@/lib/markets";
import type { FlipTiming } from "@/lib/splitflap";

/**
 * useLayoutEffect on the client, useEffect on the server.
 *
 * The measurement has to happen before the first paint, otherwise the board
 * paints one frame at the wrong width. React warns if useLayoutEffect runs
 * during a server render, and these pages are prerendered.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Aliased rather than declared, so this renderer and the rastered board in the
 * hall cannot drift apart on what a status is. The union lives in lib/markets.
 */
export type MarketRowStatus = BoardStatus;

const STATUS_LABEL: Record<MarketRowStatus, string> = {
  open: "Open",
  locked: "Locked",
  "settled-yes": "Settled Yes",
  "settled-no": "Settled No",
  void: "Void · refunded",
};

/**
 * How many drums actually fit in `ref`, remeasured whenever it resizes.
 *
 * A split-flap board has a fixed number of physical drums, so the text must be
 * cut to the board rather than the board stretched to the text. Deriving the
 * count from the real measured width is what guarantees a question can never
 * run past its column and collide with the price beside it — at any window
 * size, any board scale, and in big screen mode where there is no sidebar.
 */
function useDrumCount(
  ref: React.RefObject<HTMLElement | null>,
  maxDrums: number,
): number {
  const [count, setCount] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const styles = getComputedStyle(element);
      const drumWidth = parseFloat(styles.getPropertyValue("--flap-text-w")) || 19;
      const gap = parseFloat(styles.getPropertyValue("--flap-gap")) || 2;
      const available = element.clientWidth;
      // n drums occupy n*w + (n-1)*gap, so solve for n and floor it.
      const fits = Math.floor((available + gap) / (drumWidth + gap));
      setCount(Math.max(0, Math.min(maxDrums, fits)));
    };

    // Measured synchronously before paint, so the first frame is already right
    // and does not depend on an observer callback being serviced.
    measure();

    // Guarded: ResizeObserver is absent in jsdom and in older browsers, and an
    // unguarded constructor throws hard enough to take the whole board down.
    // The synchronous measure above plus the resize listener below already
    // give a correct first paint and correct behaviour on window resize, so
    // losing the observer costs only container resizes that do not change the
    // window — a degradation, not a failure.
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);

    // Belt and braces. ResizeObserver callbacks are delivered as part of the
    // rendering steps; the resize event is not, so this still corrects the
    // board in environments that throttle or skip frames.
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, maxDrums]);

  return count;
}

export interface MarketRowProps {
  index: number;
  question: string;
  /** Current YES price, 0..1. */
  price: number;
  /** Price the market opened at, used for the session move column. */
  openingPrice: number;
  status: MarketRowStatus;
  /** Upper bound on question drums, whatever the column width allows. */
  maxQuestionDrums?: number;
  timing?: FlipTiming;
  textStagger?: number;
  priceStagger?: number;
  textMinFlips?: number;
  priceMinFlips?: number;
  soundDensity?: number;
  /** Delays this row's question cascade, for the board boot sequence. */
  baseDelayMs?: number;
}

export function MarketRow({
  index,
  question,
  price,
  openingPrice,
  status,
  maxQuestionDrums = 40,
  timing,
  textStagger = 26,
  priceStagger = 55,
  textMinFlips = 6,
  priceMinFlips = 9,
  soundDensity = 0.3,
  baseDelayMs = 0,
}: MarketRowProps) {
  const questionRef = useRef<HTMLDivElement>(null);
  const drums = useDrumCount(questionRef, maxQuestionDrums);

  const movePoints = Math.round(price * 100) - Math.round(openingPrice * 100);
  const direction = movePoints > 0 ? "up" : movePoints < 0 ? "down" : "flat";
  const moveLabel =
    movePoints === 0
      ? "—"
      : `${movePoints > 0 ? "▲" : "▼"} ${Math.abs(movePoints)}`;
  const resolved = status === "settled-yes" || status === "settled-no" || status === "void";

  return (
    <div className="market-row" data-resolved={resolved ? "true" : "false"}>
      <div className="market-row__index">{String(index).padStart(2, "0")}</div>

      <div className="market-row__question flap-scope--text" ref={questionRef}>
        {/* Nothing renders until the column has been measured, so the board
            never paints a wrongly sized row and then corrects itself. */}
        {drums > 0 && (
          <SplitFlapText
            value={question}
            width={drums}
            minFlips={textMinFlips}
            staggerMs={textStagger}
            soundDensity={soundDensity}
            timing={timing}
            baseDelayMs={baseDelayMs}
            seedOffset={index * 97}
          />
        )}
      </div>

      <div className="market-row__price">
        <SplitFlapPrice
          price={price}
          minFlips={priceMinFlips}
          staggerMs={priceStagger}
          timing={timing}
          seedOffset={index * 31}
        />
        <span className="market-row__pct">%</span>
      </div>

      <div className="market-row__move" data-dir={direction}>
        {moveLabel}
      </div>

      <div className="market-row__status" data-status={status}>
        <span className="status-lamp" data-lit={status === "open" ? "true" : "false"} />
        <span>{STATUS_LABEL[status]}</span>
      </div>
    </div>
  );
}
