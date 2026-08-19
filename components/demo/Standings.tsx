"use client";

/**
 * Who called it.
 *
 * The leaderboard names everyone, which is not a contradiction of the
 * anonymous tape. During the session anonymity is what makes people trade
 * their actual view instead of the view they want to be seen holding; once
 * everything has settled there is nothing left to distort, and the naming is
 * the entire reward. Bragging rights are the product.
 *
 * Ranked on total worth rather than cash, so anyone still holding an open
 * position is not shown as though they had lost what they spent on it.
 */

import { useTrading } from "@/components/trading/TradingProvider";

export function Standings() {
  const { standings } = useTrading();

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a7350]">
        Final standings
      </h2>
      <p className="mt-1 text-[11.5px] leading-snug text-[#6a7183]">
        Everyone started on 1,000. The tape was anonymous; the finish line is
        not.
      </p>

      <div className="mt-3 space-y-0.5">
        {standings.map((row) => (
          <div key={row.traderId} className="standings-row" data-you={row.isYou}>
            <span className="standings-row__rank">{row.rank}</span>
            <span className="min-w-0">
              <span className="truncate">{row.isYou ? "You" : row.name}</span>
              {row.isLeadership && (
                <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#e0a94a]">
                  Leadership
                </span>
              )}
              <span className="ml-2 text-[11px] text-[#6a7183]">
                {row.callsRight}/{row.callsMade} calls
              </span>
            </span>
            <span
              className="font-mono text-[11.5px] tabular-nums"
              style={{ color: row.net > 0 ? "#7fe0a0" : row.net < 0 ? "#ff8a6a" : "#6a7183" }}
            >
              {row.net > 0 ? "+" : ""}
              {Math.round(row.net).toLocaleString("en-US")}
            </span>
            <span className="standings-row__worth">
              {Math.round(row.worth).toLocaleString("en-US")}
            </span>
          </div>
        ))}
      </div>

    </section>
  );
}
