"use client";

/**
 * "You just backed this, and here is what it did to the board."
 *
 * The single hardest idea to convey about a prediction market is that a stake
 * is not a vote — it is a price change, made by you, visible to everyone. The
 * toast puts the before and after next to each other at the moment it happens,
 * which is the only time anyone is looking at the right part of the screen.
 */

import { useEffect, useState } from "react";
import { TOAST_DISMISS_MS } from "@/lib/demo-script";
import type { PlacedBet } from "./useDemoDirector";

/**
 * Mounted under a key of the bet's timestamp, so each call gets a fresh
 * instance that starts visible and expires on its own. Showing and hiding one
 * long-lived instance instead would mean writing state from an effect on every
 * bet, and a stale timer from the previous one could close the next.
 */
export function BetToast({ bet }: { bet: PlacedBet | null }) {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setExpired(true), TOAST_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (!bet || expired) return null;

  const before = Math.round(bet.priceBefore * 100);
  const after = Math.round(bet.priceAfter * 100);
  const tone = bet.side === "YES" ? "#7fe0a0" : "#ff8a6a";

  return (
    <div className="bet-toast" key={bet.at}>
      <div className="bet-toast__head">
        <span style={{ color: tone }}>You backed {bet.side}</span>
        <span className="bet-toast__label">{bet.boardLabel}</span>
      </div>

      <div className="bet-toast__body">
        <div>
          <div className="bet-toast__cap">Stake</div>
          <div className="bet-toast__figure">{Math.round(bet.credits)}</div>
        </div>
        <div>
          <div className="bet-toast__cap">To win</div>
          <div className="bet-toast__figure" style={{ color: tone }}>
            {Math.round(bet.contracts).toLocaleString("en-US")}
          </div>
        </div>
        <div>
          <div className="bet-toast__cap">Board</div>
          <div className="bet-toast__figure">
            <span className="text-[#4d5464]">{before}</span>
            <span className="mx-1 text-[#4d5464]">→</span>
            <span style={{ color: "#e0a94a" }}>{after}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
