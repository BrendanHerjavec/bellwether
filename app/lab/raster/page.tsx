"use client";

/**
 * The rastered board, at one to one.
 *
 * The board the room shows is not the DOM board — inside the hall it is painted
 * into a canvas and mapped onto a mesh (`components/board/board-raster.ts`).
 * That canvas had no way of being looked at: on the board page it is a texture
 * at an angle, in a hazy room, behind glass, and if the drums were painting
 * wrong you would find out by squinting at a screenshot.
 *
 * So this shows the texture flat, unlit and full size, with a way to move the
 * prices. It is the same relationship `/lab` has to the DOM board: no 3D, no
 * market maker, just the mechanism and the knobs that affect it.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BoardRaster,
  paintTapeOverlay,
  paintTapeStrip,
  type BoardModel,
  type BoardTapeItem,
} from "@/components/board/board-raster";
import { flapAudio } from "@/components/splitflap/flap-audio";
import { createSeedMarkets } from "@/lib/markets";
import { priceOf } from "@/lib/lmsr";
import { BOARD_SCREEN } from "@/lib/hall";

const markets = createSeedMarkets();

function modelFrom(prices: number[]): BoardModel {
  return {
    rows: markets.map((market, index) => ({
      id: market.id,
      question: market.boardLabel,
      price: prices[index],
      openingPrice: priceOf(market.state, "YES"),
      status: market.status === "open" ? ("open" as const) : ("locked" as const),
      // Stand-in for the market maker's outstanding shares, which the hall
      // supplies for real. Without it every "at risk" rule sits at its floor
      // and the row looks broken rather than quiet.
      weight: 0.2 + ((index * 37) % 80) / 100,
    })),
    openCount: markets.filter((m) => m.status === "open").length,
    tradeCount: 0,
  };
}

export default function RasterLabPage() {
  const host = useRef<HTMLDivElement>(null);
  const raster = useRef<BoardRaster | null>(null);
  // Defaults to what the hall actually paints at, so the flat view is the
  // shipping board rather than a nicer one.
  const [scale, setScale] = useState<number>(BOARD_SCREEN.textureScale);
  const [sound, setSound] = useState(false);
  // Read by the flip callback, which belongs to a raster built once per scale
  // change and must not be torn down just because the toggle moved.
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Rebuilt when the supersampling factor changes, because that is the canvas
  // size and there is no meaningful way to change it in place.
  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const board = new BoardRaster(modelFrom(markets.map((m) => priceOf(m.state, "YES"))), {
      scale,
      onFlip: (isLast) => {
        if (soundRef.current) flapAudio.click(isLast ? 0.95 : 0.4);
      },
    });
    raster.current = board;

    // Displayed at design size whatever it is painted at, so the supersampling
    // toggle shows what it actually buys: the same board, more detail in it.
    board.canvas.style.width = `${board.panelWidth}px`;
    board.canvas.style.height = `${board.panelHeight}px`;
    board.canvas.style.maxWidth = "100%";
    element.replaceChildren(board.canvas);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      board.update(now - last);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      raster.current = null;
    };
  }, [scale]);

  /**
   * Advance the mechanism by hand.
   *
   * A flip is over in about 60 milliseconds, which is exactly long enough to
   * be impossible to judge in motion. Stepping is the only way to see whether
   * the leaf is actually falling through the seam or just changing height.
   */
  const step = (ms: number) => raster.current?.update(ms);

  const nudge = () => {
    const prices = markets.map(() => 0.05 + Math.random() * 0.9);
    raster.current?.setModel(modelFrom(prices));
  };

  const button =
    "rounded border border-white/12 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#98a0b2] transition-colors hover:border-white/30 hover:text-[#e8e4da]";

  return (
    <div className="min-h-full bg-[#06070a] p-8">
      <div className="mx-auto max-w-[1560px]">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Link href="/lab" className={button}>
            ← DOM board
          </Link>
          <Link href="/board" className={button}>
            In the hall
          </Link>
          <button type="button" className={button} onClick={nudge}>
            Move every price
          </button>
          <button type="button" className={button} onClick={() => step(20)}>
            Step 20ms
          </button>
          <button type="button" className={button} onClick={() => step(400)}>
            Step 400ms
          </button>
          <button type="button" className={button} onClick={() => setSound(!sound)}>
            {sound ? "Clatter on" : "Clatter off"}
          </button>
          {[1, 1.5, 2].map((value) => (
            <button
              key={value}
              type="button"
              className={`${button} ${scale === value ? "border-[#e0a94a]/50 text-[#e0a94a]" : ""}`}
              onClick={() => setScale(value)}
            >
              {value}× texture
            </button>
          ))}
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#4d5464]">
            Painted at {Math.round(1500 * scale)}px wide, shown at 1500
          </span>
        </div>

        <div ref={host} />

        {/*
          The tape is a separate mesh in the hall — a strip that tiles, scrolled
          by a UV offset, with its label block and end fades laid over the top.
          Shown here as the two flat canvases it is made of, because that is the
          only way to see whether the strip actually joins to itself.
        */}
        <div className="mt-6">
          <div className="rule-label mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#4d5464]">
            Tape · strip (tiles) and overlay
          </div>
          <TapePreview />
        </div>
      </div>
    </div>
  );
}

const TAPE_FIXTURE: BoardTapeItem[] = [
  { market: "PRICING CHANGE NAMED", side: "YES", contracts: 42, price: 0.46, move: 2 },
  { market: "ARR CLEARS 40M", side: "NO", contracts: 118, price: 0.58, move: -3 },
  {
    market: "ROADMAP CONFIDENCE",
    side: "YES",
    contracts: 260,
    price: 0.63,
    move: 8,
    who: "Dana Whitfield",
  },
  { market: "TEN PLUS LOGOS", side: "NO", contracts: 30, price: 0.29, move: 0 },
];

function TapePreview() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const width = 1472;
    const strip = paintTapeStrip(TAPE_FIXTURE, 1.2, width);
    const overlay = paintTapeOverlay(1.2, width);
    for (const canvas of [strip, overlay]) {
      canvas.style.display = "block";
      canvas.style.height = "34px";
      canvas.style.width = `${canvas.width / 1.2}px`;
      canvas.style.background = "#06070a";
      canvas.style.marginBottom = "6px";
    }
    element.replaceChildren(strip, overlay);
  }, []);

  return <div ref={host} className="overflow-x-auto" />;
}
