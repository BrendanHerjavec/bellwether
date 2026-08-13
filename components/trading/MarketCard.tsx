"use client";

import { useState } from "react";
import { SplitFlapPrice } from "@/components/splitflap/SplitFlapText";
import { useTrading } from "./TradingProvider";
import type { Market, Side } from "@/lib/markets";

const STAKES = [25, 50, 100, 250];

function credits(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function MarketCard({ market }: { market: Market }) {
  const { balance, positions, quoteFor, buy, priceOfMarket } = useTrading();
  const [side, setSide] = useState<Side | null>(null);
  const [stake, setStake] = useState(50);
  const [justTraded, setJustTraded] = useState(false);

  const yesPrice = priceOfMarket(market, "YES");
  const noPrice = 1 - yesPrice;
  const movePoints =
    Math.round(yesPrice * 100) - Math.round(market.openingPrice * 100);

  const position = positions[market.id];
  const affordable = Math.min(stake, balance);
  const quote = side ? quoteFor(market.id, side, affordable) : null;
  const canTrade = market.status === "open" && balance > 0;

  const handleBuy = () => {
    if (!side || !quote) return;
    if (buy(market.id, side, affordable)) {
      setJustTraded(true);
      setSide(null);
      window.setTimeout(() => setJustTraded(false), 2200);
    }
  };

  return (
    <article className="card card--interactive p-5">
      {/* ---------------------------------------------------------- header */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rule-label rounded px-1.5 py-0.5"
          style={{
            background: market.kind === "meeting" ? "var(--amber-soft)" : "var(--paper-sunk)",
            color: market.kind === "meeting" ? "var(--amber)" : "var(--ink-faint)",
          }}
        >
          {market.kind === "meeting" ? "In the meeting" : "Long run"}
        </span>
        <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {market.resolvesNote}
        </span>
      </div>

      <h3 className="text-[17px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
        {market.question}
      </h3>

      {/*
        Where guidance has been given, the price sits directly against it. The
        contrast still has to be unmistakable — it is the most interesting thing
        on the card — but it is framed as a matchup rather than as a caught-out.
        Nobody is being accused of anything; two views simply disagree, and one
        of them is about to be right.
      */}
      {market.leadershipClaim && (
        <div className="claim-gap mt-3">
          <div className="rule-label mb-1">Guidance vs the floor</div>
          <p className="text-[13px] leading-snug" style={{ color: "var(--ink-soft)" }}>
            {market.leadershipClaim}{" "}
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>
              The floor has it at {Math.round(yesPrice * 100)}%.
            </span>{" "}
            Someone is about to look clever.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------ odds */}
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flapboard odds-window">
          <SplitFlapPrice price={yesPrice} seedOffset={market.id.length * 13} />
          <span className="odds-window__pct">%</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="rule-label">Chance of yes</div>
          <div className="mt-0.5 text-[13px]" style={{ color: "var(--ink-soft)" }}>
            {movePoints === 0 ? (
              <span>Unchanged since it opened</span>
            ) : (
              <span>
                <span
                  style={{ color: movePoints > 0 ? "var(--yes)" : "var(--no)", fontWeight: 600 }}
                >
                  {movePoints > 0 ? "▲" : "▼"} {Math.abs(movePoints)}
                </span>{" "}
                since it opened at {Math.round(market.openingPrice * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------- sides */}
      <div className="mt-4 flex gap-2">
        {(["YES", "NO"] as Side[]).map((option) => {
          const price = option === "YES" ? yesPrice : noPrice;
          // What 100 credits returns if this side is right. Stated in the
          // button because "0.23" means nothing to most people and
          // "100 returns 435" means everything.
          const per100 = Math.round(100 / price);
          return (
            <button
              key={option}
              type="button"
              className="side-button"
              data-side={option}
              data-active={side === option}
              disabled={!canTrade}
              onClick={() => setSide(side === option ? null : option)}
            >
              <div className="text-[13px] font-semibold tracking-wide">{option}</div>
              <div className="stat-value text-[19px] leading-tight">
                {Math.round(price * 100)}%
              </div>
              <div className="mt-0.5 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
                100 → {credits(per100)}
              </div>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------- the slip */}
      {side && quote && (
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: "var(--paper-sunk)", border: "1px solid var(--rule)" }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rule-label mr-1">Stake</span>
            {STAKES.map((amount) => (
              <button
                key={amount}
                type="button"
                className="chip"
                data-active={stake === amount}
                disabled={amount > balance}
                onClick={() => setStake(amount)}
              >
                {amount}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              data-active={stake === Math.floor(balance)}
              disabled={balance <= 0}
              onClick={() => setStake(Math.floor(balance))}
            >
              All in
            </button>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <div className="rule-label">You risk</div>
              <div className="stat-value text-[22px]">{credits(affordable)}</div>
            </div>
            <div className="pb-1 text-[18px]" style={{ color: "var(--ink-faint)" }}>
              →
            </div>
            <div className="text-right">
              <div className="rule-label">
                Returns if {side.toLowerCase()}
              </div>
              <div
                className="stat-value text-[22px]"
                style={{ color: side === "YES" ? "var(--yes)" : "var(--no)" }}
              >
                {credits(quote.payout)}
              </div>
            </div>
          </div>

          <div
            className="mt-2 border-t pt-2 text-[11.5px] leading-relaxed"
            style={{ borderColor: "var(--rule)", color: "var(--ink-faint)" }}
          >
            Profit {credits(quote.profit)} if you are right, nothing if you are
            not. Your stake moves the odds to{" "}
            <strong style={{ color: "var(--ink-soft)" }}>
              {Math.round(
                (side === "YES" ? quote.priceAfter : 1 - quote.priceAfter) * 100,
              )}
              %
            </strong>
            .
          </div>

          <button
            type="button"
            onClick={handleBuy}
            className="mt-3 w-full rounded-lg py-2.5 text-[13px] font-semibold tracking-wide transition-opacity hover:opacity-90"
            style={{
              background: side === "YES" ? "var(--yes)" : "var(--no)",
              color: "#fff",
            }}
          >
            Back {side} for {credits(affordable)} credits
          </button>
        </div>
      )}

      {justTraded && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "var(--yes-soft)", color: "var(--yes)" }}
        >
          Position taken. The board just moved.
        </div>
      )}

      {/* -------------------------------------------------- your position */}
      {position && (position.yesShares > 0 || position.noShares > 0) && (
        <div
          className="mt-3 flex items-center justify-between border-t pt-3 text-[12px]"
          style={{ borderColor: "var(--rule)", color: "var(--ink-soft)" }}
        >
          <span>
            You hold{" "}
            {position.yesShares > 0 && (
              <strong style={{ color: "var(--yes)" }}>
                {credits(position.yesShares)} YES
              </strong>
            )}
            {position.yesShares > 0 && position.noShares > 0 && " and "}
            {position.noShares > 0 && (
              <strong style={{ color: "var(--no)" }}>
                {credits(position.noShares)} NO
              </strong>
            )}
          </span>
          <span style={{ color: "var(--ink-faint)" }}>
            {credits(position.creditsStaked)} staked
          </span>
        </div>
      )}

      <details className="mt-3">
        <summary
          className="cursor-pointer text-[11.5px] select-none"
          style={{ color: "var(--ink-faint)" }}
        >
          How this settles
        </summary>
        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {market.criteria}
        </p>
      </details>
    </article>
  );
}
