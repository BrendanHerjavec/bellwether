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
import type { CameraMode } from "@/components/hall/Hall";
import { TradingProvider, useTrading, YOU_ID } from "@/components/trading/TradingProvider";
import { BOT_ROSTER } from "@/lib/bots";
import { QUALITY, type QualityTier } from "@/lib/hall";

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

const CAMERA_MODES: { id: CameraMode; label: string; hint: string }[] = [
  { id: "locked", label: "Locked", hint: "Still camera, framed on the board. The shot this room was designed for." },
  { id: "walk", label: "Walk", hint: "Drag to look, WASD to move, shift to hurry. The cursor stays yours, and your seat is empty." },
  { id: "orbit", label: "Orbit", hint: "Drag to orbit, scroll to zoom, right-drag to pan." },
  { id: "drift", label: "Drift", hint: "Slow idle float, so the frame is never perfectly still." },
];

/**
 * You cannot be walking the hall and sitting in it.
 *
 * In every other mode the camera is a viewpoint and the figure labelled "You"
 * is where you are sitting. In walk mode the camera IS you, so leaving the
 * figure in puts a second you in the room — one you can walk up to and read the
 * name tag of, which is a stranger sight than an empty seat.
 */
const WALKING_HIDES = [YOU_ID] as const;

export default function BoardPage() {
  return (
    <TradingProvider>
      <BoardView />
    </TradingProvider>
  );
}

function BoardView() {
  const [mode, setMode] = useState<"hall" | "flat">("hall");
  const [quality, setQuality] = useState<QualityTier>("balanced");
  const [cameraMode, setCameraMode] = useState<CameraMode>("locked");
  const [showLabels, setShowLabels] = useState(true);
  const [fps, setFps] = useState<number | null>(null);
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
            quality={quality}
            cameraMode={cameraMode}
            people={people}
            showLabels={showLabels}
            hideIds={cameraMode === "walk" ? WALKING_HIDES : undefined}
            markets={markets}
            trades={trades}
            onFps={setFps}
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
        quality={quality}
        setQuality={setQuality}
        cameraMode={cameraMode}
        setCameraMode={setCameraMode}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        fps={mode === "hall" ? fps : null}
      />
    </div>
  );
}

function Controls({
  mode,
  setMode,
  quality,
  setQuality,
  cameraMode,
  setCameraMode,
  showLabels,
  setShowLabels,
  fps,
}: {
  mode: "hall" | "flat";
  setMode: (m: "hall" | "flat") => void;
  quality: QualityTier;
  setQuality: (q: QualityTier) => void;
  cameraMode: CameraMode;
  setCameraMode: (m: CameraMode) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  fps: number | null;
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
            {/* Camera. "Locked" is the cheap one: a still camera means drei
                writes the same CSS matrix each frame and the browser skips
                re-rasterising the board's DOM entirely. */}
            {CAMERA_MODES.map(({ id, label, hint }) => (
              <button
                key={id}
                type="button"
                className={`${button} ${cameraMode === id ? on : off}`}
                onClick={() => setCameraMode(id)}
                title={hint}
              >
                {label}
              </button>
            ))}

            {/* Quality tier. The reflection and the pixel ratio are most of the
                cost; performance drops both. */}
            {(Object.keys(QUALITY) as QualityTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                className={`${button} ${quality === tier ? on : off}`}
                onClick={() => setQuality(tier)}
              >
                {QUALITY[tier].label}
              </button>
            ))}

            <button
              type="button"
              className={`${button} ${showLabels ? on : off}`}
              onClick={() => setShowLabels(!showLabels)}
            >
              {showLabels ? "Name tags" : "No tags"}
            </button>

            {fps !== null && (
              <span
                className="rounded border border-white/10 px-2.5 py-1.5 font-mono text-[10px] tabular-nums"
                style={{
                  color: fps >= 50 ? "#6fca90" : fps >= 30 ? "#e0a94a" : "#d2705f",
                }}
                title="Sampled once a second"
              >
                {fps} fps
              </span>
            )}
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
