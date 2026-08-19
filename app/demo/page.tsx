"use client";

/**
 * The demo. One screen, one take, eighty-eight seconds.
 *
 * Everything that matters about this product happens across a boundary the
 * rest of the app deliberately keeps apart: the board is in the room and the
 * ticket is on your laptop. That separation is right for the product and
 * useless for a recording, because the interesting thing is the relationship
 * between them — you back a hunch, the number on the wall moves, and later the
 * wall pays you. So this page puts the two side by side and lets a director
 * run the clock.
 *
 * The shape of the session is the argument:
 *
 *   open floor  →  bets land, the board moves
 *   doors close →  prices fixed, nothing more trades
 *   the meeting →  markets settle one at a time, each with its citation
 *   afterwards  →  what you won, what you lost, and what it buys
 *
 * The room itself is not here on purpose. `/board` renders the 3D hall and can
 * be recorded separately and cut in; what this page owes the viewer is the
 * mechanism, at a size they can read.
 *
 * Nothing on this page is demo-only logic. The board is the board, the ticket
 * calls the same `buy`, and settlement runs the same resolver. The only thing
 * the director adds is timing.
 */

import Link from "next/link";
import "@/components/demo/demo.css";
import { TotBoard } from "@/components/board/TotBoard";
import { BetToast } from "@/components/demo/BetToast";
import { Confetti } from "@/components/demo/Confetti";
import { DoorsStamp } from "@/components/demo/DoorsStamp";
import { HostStrip } from "@/components/demo/HostStrip";
import { ReportCard } from "@/components/demo/ReportCard";
import { SettlementStamp } from "@/components/demo/SettlementStamp";
import { Standings } from "@/components/demo/Standings";
import { TraderRail } from "@/components/demo/TraderRail";
import { useDemoDirector } from "@/components/demo/useDemoDirector";
import { TradingProvider, useTrading } from "@/components/trading/TradingProvider";
import type { DemoPhase } from "@/lib/demo-script";

export default function DemoPage() {
  return (
    <TradingProvider>
      <DemoStage />
    </TradingProvider>
  );
}

const PHASE_LABEL: Record<DemoPhase, string> = {
  floor: "Floor open · trading",
  doors: "Doors closed",
  meeting: "All hands in progress",
  epilogue: "Three months on",
  standings: "Session closed",
};

function DemoStage() {
  const director = useDemoDirector();
  const { balance, standings, lastSettlement } = useTrading();

  /*
   * Net is measured against everything you are worth, not against cash.
   *
   * Cash alone falls by the size of every stake the moment it is placed, so a
   * trader who has just backed three markets reads as down 300 credits before
   * a single question has been answered — which is exactly backwards, and the
   * first thing anyone watching would query.
   */
  const net = Math.round(standings.find((row) => row.isYou)?.net ?? 0);

  return (
    <div className="demo-stage flex-1 pb-24">
      <header className="border-b border-white/[0.07] px-6 py-3">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-flap)] text-[18px] font-bold uppercase tracking-[0.2em] text-[#e8e4da]"
          >
            Bellwether
          </Link>
          <span className="hidden text-[11.5px] text-[#4d5464] sm:inline">
            Northwind · Q3 All Hands
          </span>

          <span
            className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
            style={
              director.locked
                ? { background: "rgba(154,168,189,0.12)", color: "#9aa8bd" }
                : { background: "rgba(224,169,74,0.12)", color: "#e0a94a" }
            }
          >
            {PHASE_LABEL[director.phase]}
          </span>

          <div className="ml-auto flex items-baseline gap-2.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6a7183]">
              Your credits
            </span>
            {/* Remounted on every change so the one-shot pop replays. A payout
                landing should be visible in the corner of the eye even when the
                viewer is reading the citation. */}
            <span
              key={Math.round(balance)}
              className="credit-pop font-[family-name:var(--font-flap)] text-[22px] tabular-nums text-[#e8e4da]"
            >
              {Math.round(balance).toLocaleString("en-US")}
            </span>
            {net !== 0 && (
              <span
                className="font-mono text-[12px] tabular-nums"
                style={{ color: net > 0 ? "#7fe0a0" : "#ff8a6a" }}
              >
                {net > 0 ? "+" : ""}
                {net.toLocaleString("en-US")}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_330px]">
        {/* The room display, flat. The hall version of this same board is at
            /board and can be recorded separately and cut over the top. */}
        <main className="min-w-0">
          {director.locked && (
            <div className="lock-banner">
              <span className="lock-banner__lamp" />
              Trading closed — prices fixed at the moment the meeting started
            </div>
          )}
          <div className="hall flapboard rounded-xl p-4">
            <TotBoard />
          </div>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          {director.showReport ? (
            <>
              <ReportCard highlightPerks={director.highlightPerks} />
              <Standings />
            </>
          ) : (
            <TraderRail />
          )}
        </aside>
      </div>

      {/* Both keyed, so each event mounts a fresh instance that starts visible
          and expires on its own — no stale timer from the previous one, and no
          state written out of an effect. */}
      <BetToast key={director.lastBet?.at ?? 0} bet={director.lastBet} />
      <DoorsStamp key={director.locked ? "shut" : "open"} locked={director.locked} />
      <SettlementStamp />
      <Confetti settlement={lastSettlement} />
      <HostStrip director={director} />
    </div>
  );
}
