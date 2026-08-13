"use client";

/**
 * The room display.
 *
 * Renders the board inside the 3D exchange hall, with a flat fallback. The
 * fallback is not a nicety: the hall is the only part of this app that can be
 * too slow on a given laptop, and a projected board that stutters is worse than
 * one that is merely flat. It is also how the board gets debugged without the
 * scene in the way.
 *
 * Big screen mode with no chrome at all is step 8.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TotBoard } from "@/components/board/TotBoard";
import type { AvatarInfo } from "@/components/hall/Avatars";
import { TradingProvider, useTrading, YOU_ID } from "@/components/trading/TradingProvider";
import { BOT_ROSTER } from "@/lib/bots";

// three must never be evaluated on the server.
const Hall = dynamic(() => import("@/components/hall/Hall").then((m) => m.Hall), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#4d5464]">
        Lighting the hall
      </span>
    </div>
  ),
});

export default function BoardPage() {
  return (
    <TradingProvider>
      <BoardView />
    </TradingProvider>
  );
}

function BoardView() {
  const [mode, setMode] = useState<"hall" | "flat">("hall");
  const [effects, setEffects] = useState(true);
  const [freeLook, setFreeLook] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  // Read on this side of the Canvas and handed in as plain props. Context does
  // not cross R3F's reconciler boundary into the board's DOM portal.
  const { markets, trades, traders } = useTrading();

  /**
   * The crowd is the actual roster, not extras. A trader lights up for a few
   * seconds after their trade lands, so a silhouette in the room and a line on
   * the tape are visibly the same event.
   */
  const people = useMemo(() => {
    // The id of each trader's most recent trade. Remounting the name tag when
    // this changes replays a one-shot CSS animation, so the pulse expires on
    // its own — no wall-clock read during render, and no timers to leak.
    const lastTrade = new Map<string, number>();
    for (const trade of trades) {
      if (!lastTrade.has(trade.traderId)) lastTrade.set(trade.traderId, trade.id);
    }

    const out: Record<string, AvatarInfo> = {};
    for (const trader of Object.values(traders)) {
      out[trader.id] = {
        id: trader.id,
        name: trader.id === YOU_ID ? "You" : trader.name,
        isYou: trader.id === YOU_ID,
        isLeadership: trader.isLeadership,
        pulseKey: lastTrade.get(trader.id) ?? 0,
      };
    }
    return out;
  }, [traders, trades]);

  return (
    <div className="relative flex-1 bg-[#05060a]">
      {mode === "hall" ? (
        <div className="absolute inset-0">
          <Hall
            effects={effects}
            freeLook={freeLook}
            people={people}
            showLabels={showLabels}
            markets={markets}
            trades={trades}
          />
        </div>
      ) : (
        <div className="hall flapboard min-h-full">
          <div className="hall__content mx-auto max-w-[1700px] px-10 py-10">
            <TotBoard />
          </div>
        </div>
      )}

      <Controls
        mode={mode}
        setMode={setMode}
        effects={effects}
        setEffects={setEffects}
        freeLook={freeLook}
        setFreeLook={setFreeLook}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
      />
    </div>
  );
}

function Controls({
  mode,
  setMode,
  effects,
  setEffects,
  freeLook,
  setFreeLook,
  showLabels,
  setShowLabels,
}: {
  mode: "hall" | "flat";
  setMode: (m: "hall" | "flat") => void;
  effects: boolean;
  setEffects: (v: boolean) => void;
  freeLook: boolean;
  setFreeLook: (v: boolean) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
}) {
  const { botsRunning, setBotsRunning, activeBotIds, toggleBot, traders } = useTrading();

  const button =
    "rounded border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors";
  const off = "border-white/12 text-[#98a0b2] hover:border-white/30 hover:text-[#e8e4da]";
  const on = "border-[#e0a94a]/50 bg-[#e0a94a]/12 text-[#e0a94a]";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 p-5">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <Link href="/play" className={`${button} ${off}`}>
          ← Trader view
        </Link>

        <button
          type="button"
          className={`${button} ${mode === "hall" ? on : off}`}
          onClick={() => setMode(mode === "hall" ? "flat" : "hall")}
        >
          {mode === "hall" ? "3D hall" : "Flat board"}
        </button>

        {mode === "hall" && (
          <>
            <button
              type="button"
              className={`${button} ${freeLook ? on : off}`}
              onClick={() => setFreeLook(!freeLook)}
              title="Drag to orbit, scroll to zoom, right-drag to pan"
            >
              {freeLook ? "Free look" : "Locked camera"}
            </button>
            <button
              type="button"
              className={`${button} ${effects ? on : off}`}
              onClick={() => setEffects(!effects)}
            >
              {effects ? "Effects on" : "Effects off"}
            </button>
            <button
              type="button"
              className={`${button} ${showLabels ? on : off}`}
              onClick={() => setShowLabels(!showLabels)}
            >
              {showLabels ? "Name tags" : "No tags"}
            </button>
          </>
        )}

        <button
          type="button"
          className={`${button} ${botsRunning ? on : off}`}
          onClick={() => setBotsRunning(!botsRunning)}
        >
          {botsRunning ? "Floor is live" : "Floor paused"}
        </button>

        {BOT_ROSTER.map((profile) => {
          const active = activeBotIds.includes(profile.id);
          const trader = traders[profile.id];
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => toggleBot(profile.id)}
              title={profile.blurb}
              className={`${button} ${
                active ? "border-white/25 bg-white/[0.05] text-[#e8e4da]" : "border-white/8 text-[#4d5464]"
              }`}
            >
              {profile.persona}
              {active && trader && (
                <span className="ml-1.5 tabular-nums text-[#6a7183]">
                  {Math.round(trader.balance)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
