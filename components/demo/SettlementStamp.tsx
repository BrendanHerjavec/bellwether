"use client";

/**
 * The moment a question stops being a question.
 *
 * This is the beat the whole demo is built around, so it carries three things
 * and nothing else: which way it went, the exact words that decided it, and
 * what it paid you. The citation is not a footnote here — it is the largest
 * block on the card, because "no arguing at the finish line" is a promise the
 * product has to be seen keeping, not one it can describe.
 *
 * A void renders in the same frame as a settlement on purpose. A refusal
 * dressed up as an error state would read as the system failing; given the
 * same stamp as every other answer, it reads as the system working.
 */

import { useEffect } from "react";
import { useTrading } from "@/components/trading/TradingProvider";
import { STAMP_DISMISS_MS } from "@/lib/demo-script";

export function SettlementStamp() {
  const { lastSettlement, clearLastSettlement } = useTrading();

  // Keyed on the timestamp so a second settlement restarts the clock rather
  // than inheriting the remainder of the first one's.
  const at = lastSettlement?.at;
  useEffect(() => {
    if (!at) return;
    const id = window.setTimeout(clearLastSettlement, STAMP_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [at, clearLastSettlement]);

  if (!lastSettlement) return null;

  const { market, verdict, yours, paidOut, holders } = lastSettlement;
  const outcome = verdict.kind === "void" ? "VOID" : verdict.resolution;
  const verdictLabel =
    verdict.kind === "void" ? "Voided · refunded" : `Settled ${verdict.resolution}`;

  return (
    <div className="stamp-layer">
      <div
        className="stamp"
        role="status"
        onClick={clearLastSettlement}
        title="Click to dismiss"
      >
        <span className="stamp__verdict" data-outcome={outcome}>
          {verdictLabel}
        </span>

        <div className="stamp__label">{market.boardLabel}</div>

        {verdict.kind === "void" ? (
          <p className="stamp__reasoning" style={{ marginTop: 14, fontSize: 13.5 }}>
            {verdict.voidReason}
          </p>
        ) : (
          <>
            <blockquote className="stamp__citation">
              <p className="stamp__quote">&ldquo;{verdict.citationText}&rdquo;</p>
              <div className="stamp__attrib">
                {verdict.speaker} · {verdict.citationTimestamp} ·{" "}
                {verdict.source === "transcript" ? "Meeting transcript" : "Company record"}
              </div>
            </blockquote>
            <p className="stamp__reasoning">{verdict.reasoning}</p>
          </>
        )}

        {yours ? (
          <div className="stamp__yours">
            <div>
              <div className="stamp__attrib" style={{ marginTop: 0 }}>
                {yours.outcome === "VOID"
                  ? "Your stake, returned"
                  : yours.profit >= 0
                    ? "You called it"
                    : "You were on the other side"}
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: "#98a0b2" }}>
                {held(yours.yesShares, yours.noShares)} · {Math.round(yours.staked)} staked
              </div>
            </div>
            <div
              className="stamp__amount"
              style={{
                color:
                  yours.outcome === "VOID"
                    ? "#9aa8bd"
                    : yours.profit > 0
                      ? "#7fe0a0"
                      : "#ff8a6a",
              }}
            >
              {yours.profit > 0 ? "+" : ""}
              {Math.round(yours.profit).toLocaleString("en-US")}
            </div>
          </div>
        ) : (
          <div className="stamp__yours">
            <div className="stamp__attrib" style={{ marginTop: 0 }}>
              You were not holding this one
            </div>
          </div>
        )}

        <div className="stamp__foot">
          {Math.round(paidOut).toLocaleString("en-US")} credits paid out across{" "}
          {holders} {holders === 1 ? "holder" : "holders"}
        </div>
      </div>
    </div>
  );
}

function held(yesShares: number, noShares: number): string {
  const parts: string[] = [];
  if (yesShares > 0) parts.push(`${Math.round(yesShares).toLocaleString("en-US")} YES`);
  if (noShares > 0) parts.push(`${Math.round(noShares).toLocaleString("en-US")} NO`);
  return parts.length ? `Held ${parts.join(" and ")}` : "No position";
}
