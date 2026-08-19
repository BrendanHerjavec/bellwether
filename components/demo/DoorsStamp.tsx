"use client";

/**
 * The doors closing, given the same weight as a settlement.
 *
 * It is tempting to treat this as a status change and let the board's LOCKED
 * lamps carry it. They cannot. Everything the product claims rests on the
 * prices being fixed before anybody in the room knows a single answer, and a
 * viewer who did not see that happen has no reason to believe the settlements
 * that follow were not fitted to the outcome afterwards.
 *
 * So it gets a stamp, and the stamp shows the closing prices — the room's
 * expectation, on the record, timestamped by the act of closing.
 */

import { useEffect, useState } from "react";
import { useTrading } from "@/components/trading/TradingProvider";
import { DOORS_DISMISS_MS } from "@/lib/demo-script";
import { priceOf } from "@/lib/lmsr";

/**
 * Mounted under a key that changes when the doors shut, so it arrives already
 * visible and expires on its own rather than being switched on from an effect.
 */
export function DoorsStamp({ locked }: { locked: boolean }) {
  const { markets, trades } = useTrading();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!locked) return;
    const id = window.setTimeout(() => setDismissed(true), DOORS_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [locked]);

  if (!locked || dismissed) return null;

  return (
    <div className="stamp-layer">
      <div className="stamp" onClick={() => setDismissed(true)} title="Click to dismiss">
        <span className="stamp__verdict" data-outcome="LOCK">
          Doors closed
        </span>

        <div className="stamp__label">Trading is over</div>

        <p className="stamp__reasoning" style={{ marginTop: 12, fontSize: 13.5 }}>
          {markets.length} markets locked after {trades.length} trades. These are
          the prices the room agreed on before anybody heard a single answer —
          which is the only reason anything that happens next is worth trusting.
        </p>

        <div className="closing-prices">
          {markets.map((market) => (
            <div key={market.id} className="closing-prices__row">
              <span className="truncate">{market.boardLabel}</span>
              <span className="closing-prices__pct">
                {Math.round(priceOf(market.state, "YES") * 100)}
              </span>
            </div>
          ))}
        </div>

        <div className="stamp__foot">Nothing below this line can be traded</div>
      </div>
    </div>
  );
}
