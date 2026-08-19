"use client";

/**
 * The trader's half of the demo screen.
 *
 * `/play` already does this properly, in daylight, with room to explain itself.
 * This is the compressed dark version that sits beside the board so one
 * recording can show a stake going down and the payout coming back without
 * cutting between two pages. Same provider, same write path — the ticket here
 * is not a mock of the one on `/play`, it is the same call.
 */

import { useMemo, useState } from "react";
import { useTrading } from "@/components/trading/TradingProvider";
import { liquidationValue } from "@/lib/lmsr";
import type { Market, Side } from "@/lib/markets";

const STAKES = [25, 50, 100, 250];

export function TraderRail() {
  return (
    <div className="space-y-4">
      <QuickTicket />
      <OpenBook />
      <Results />
    </div>
  );
}

/* -------------------------------------------------------------- the ticket */

function QuickTicket() {
  const { markets, balance, quoteFor, buy, priceOfMarket } = useTrading();
  const open = markets.filter((m) => m.status === "open");

  const [marketId, setMarketId] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("YES");
  const [stake, setStake] = useState(100);

  // Falls back to the first open market so the panel is never in a state where
  // there is something to trade but nothing selected.
  const selected = open.find((m) => m.id === marketId) ?? open[0] ?? null;

  if (!selected) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a7350]">
          Doors closed
        </h2>
        <p className="mt-1.5 text-[12px] leading-snug text-[#6a7183]">
          Trading stopped when the meeting started. Whatever the board says now
          is what the room believed, on the record.
        </p>
      </section>
    );
  }

  const yesPrice = priceOfMarket(selected, "YES");
  const affordable = Math.min(stake, Math.floor(balance));
  const quote = quoteFor(selected.id, side, affordable);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a7350]">
        Back a hunch
      </h2>

      <select
        value={selected.id}
        onChange={(e) => setMarketId(e.target.value)}
        className="mt-2.5 w-full rounded-lg border border-white/10 bg-[#0b0d14] px-2.5 py-2 text-[12.5px] text-[#d7d2c6] outline-none focus:border-[#e0a94a]/50"
      >
        {open.map((m) => (
          <option key={m.id} value={m.id}>
            {m.boardLabel} · {Math.round(priceOfMarket(m, "YES") * 100)}%
          </option>
        ))}
      </select>

      <div className="mt-2.5 flex gap-2">
        {(["YES", "NO"] as Side[]).map((option) => {
          const optionPrice = option === "YES" ? yesPrice : 1 - yesPrice;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setSide(option)}
              className="flex-1 rounded-lg border px-2 py-2 transition-colors"
              style={{
                borderColor:
                  side === option
                    ? option === "YES"
                      ? "rgba(127,224,160,0.55)"
                      : "rgba(255,138,106,0.55)"
                    : "rgba(255,255,255,0.10)",
                background:
                  side === option
                    ? option === "YES"
                      ? "rgba(127,224,160,0.10)"
                      : "rgba(255,138,106,0.10)"
                    : "transparent",
                color: option === "YES" ? "#7fe0a0" : "#ff8a6a",
              }}
            >
              <div className="text-[11.5px] font-semibold tracking-wide">{option}</div>
              <div className="font-mono text-[17px] tabular-nums">
                {Math.round(optionPrice * 100)}%
              </div>
              {/* The number that makes a price mean something to someone who
                  has never seen one: what 100 credits comes back as. */}
              <div className="mt-0.5 text-[10px] text-[#6a7183]">
                100 → {Math.round(100 / optionPrice)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {STAKES.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setStake(amount)}
            disabled={amount > balance}
            className="rounded border px-2 py-1 font-mono text-[10.5px] tabular-nums transition-colors disabled:opacity-30"
            style={{
              borderColor: stake === amount ? "rgba(224,169,74,0.5)" : "rgba(255,255,255,0.1)",
              color: stake === amount ? "#e0a94a" : "#98a0b2",
            }}
          >
            {amount}
          </button>
        ))}
      </div>

      {quote && (
        <>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6a7183]">
                You risk
              </div>
              <div className="font-mono text-[19px] tabular-nums text-[#e8e4da]">
                {Math.round(affordable)}
              </div>
            </div>
            <span className="pb-1 text-[#4d5464]">→</span>
            <div className="text-right">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6a7183]">
                Returns if {side.toLowerCase()}
              </div>
              <div
                className="font-mono text-[19px] tabular-nums"
                style={{ color: side === "YES" ? "#7fe0a0" : "#ff8a6a" }}
              >
                {Math.round(quote.payout).toLocaleString("en-US")}
              </div>
            </div>
          </div>

          <p className="mt-2 text-[11px] leading-snug text-[#6a7183]">
            Your stake moves the board to{" "}
            <strong className="text-[#98a0b2]">
              {Math.round((side === "YES" ? quote.priceAfter : 1 - quote.priceAfter) * 100)}%
            </strong>
            . That is the point — a credit backing a view is what makes the
            number worth reading.
          </p>

          <button
            type="button"
            onClick={() => buy(selected.id, side, affordable)}
            className="mt-2.5 w-full rounded-lg py-2 text-[12.5px] font-semibold tracking-wide text-[#05060a] transition-opacity hover:opacity-90"
            style={{ background: side === "YES" ? "#7fe0a0" : "#ff8a6a" }}
          >
            Back {side} for {Math.round(affordable)}
          </button>
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- the book */

function OpenBook() {
  const { positions, markets, balance, startingBalance } = useTrading();

  const held = useMemo(() => {
    const byId = new Map<string, Market>(markets.map((m) => [m.id, m]));
    return Object.values(positions)
      .filter((p) => p.yesShares > 0 || p.noShares > 0)
      .map((p) => {
        const market = byId.get(p.marketId)!;
        // Valued as an unwind, not shares times price, so a fresh position is
        // worth what was paid for it instead of showing an instant paper gain
        // from the trader's own price impact.
        const value = liquidationValue(market.state, p.yesShares, p.noShares);
        return { p, market, value, pnl: value - p.creditsStaked };
      });
  }, [positions, markets]);

  const atRisk = held.reduce((sum, h) => sum + h.p.creditsStaked, 0);
  const value = held.reduce((sum, h) => sum + h.value, 0);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a7350]">
        Your open calls
      </h2>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
        <Stat label="Cash" value={balance} />
        <Stat label="At risk" value={atRisk} />
        <Stat label="Net" value={balance + value - startingBalance} signed />
      </div>

      {held.length === 0 ? (
        <p className="mt-2.5 text-[11.5px] leading-snug text-[#6a7183]">
          Nothing open. Everything you backed has settled.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {held.map(({ p, market, pnl }) => (
            <li key={market.id} className="text-[11.5px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[#98a0b2]">{market.boardLabel}</span>
                <span
                  className="shrink-0 font-mono tabular-nums"
                  style={{ color: pnl >= 0 ? "#7fe0a0" : "#ff8a6a" }}
                >
                  {pnl >= 0 ? "+" : ""}
                  {Math.round(pnl)}
                </span>
              </div>
              <div className="text-[10.5px] text-[#4d5464]">
                {p.yesShares > 0 ? `${Math.round(p.yesShares)} YES` : ""}
                {p.yesShares > 0 && p.noShares > 0 ? " · " : ""}
                {p.noShares > 0 ? `${Math.round(p.noShares)} NO` : ""} ·{" "}
                {Math.round(p.creditsStaked)} staked
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  const rounded = Math.round(value);
  const color = !signed ? "#e8e4da" : rounded > 0 ? "#7fe0a0" : rounded < 0 ? "#ff8a6a" : "#98a0b2";
  return (
    <div className="rounded-lg bg-black/30 py-1.5">
      <div className="font-mono text-[15px] tabular-nums" style={{ color }}>
        {signed && rounded > 0 ? "+" : ""}
        {rounded.toLocaleString("en-US")}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6a7183]">
        {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the results */

function Results() {
  const { yourSettlements, markets } = useTrading();
  if (yourSettlements.length === 0) return null;

  const byId = new Map(markets.map((m) => [m.id, m]));
  const realised = yourSettlements.reduce((sum, s) => sum + s.profit, 0);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a7350]">
          Settled
        </h2>
        <span
          className="font-mono text-[13px] tabular-nums"
          style={{ color: realised >= 0 ? "#7fe0a0" : "#ff8a6a" }}
        >
          {realised > 0 ? "+" : ""}
          {Math.round(realised).toLocaleString("en-US")}
        </span>
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {yourSettlements.map((s) => (
          <li key={s.marketId} className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="truncate text-[#98a0b2]">
              {byId.get(s.marketId)?.boardLabel ?? s.marketId}
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[#4d5464]">
              {s.outcome}
            </span>
            <span
              className="shrink-0 font-mono tabular-nums"
              style={{
                color:
                  s.outcome === "VOID" ? "#9aa8bd" : s.profit > 0 ? "#7fe0a0" : "#ff8a6a",
              }}
            >
              {s.profit > 0 ? "+" : ""}
              {Math.round(s.profit)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
