"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  BoardRaster,
  paintTapeOverlay,
  paintTapeStrip,
  type BoardModel,
  type BoardTapeItem,
} from "@/components/board/board-raster";
import { flapAudio } from "@/components/splitflap/flap-audio";
import type { TradeRecord } from "@/components/trading/TradingProvider";
import { TAPE_SPEED } from "@/lib/board-layout";
import { BOARD_FRAME, BOARD_SCREEN, boardGeometry } from "@/lib/hall";
import { priceOf } from "@/lib/lmsr";
import type { Market } from "@/lib/markets";
import { glassTexture } from "./textures";

/**
 * The board, as an object in the room.
 *
 * Everything here follows from one change: the board is a texture on a mesh
 * rather than a DOM layer floating over the canvas. See `board-raster.ts` for
 * why. What that buys, and what this file is arranged to spend it on:
 *
 *   - The drums sit deep in the opening, the glass hangs near the front of the
 *     bezel, and there is a real gap between them. Walk past and the reflection
 *     slides across the board. Parallax between two planes a few centimetres
 *     apart is the most convincing "behind glass" cue there is, and it costs
 *     two triangles.
 *   - The tape crawls by sliding a UV offset over a tiling strip. No repaint,
 *     no texture upload, no DOM animation — the one permanently moving thing
 *     on the board is also the cheapest.
 *   - The panel texture is only uploaded when a drum is mid-flip, capped at
 *     30Hz. A board with nothing happening on it costs nothing per frame.
 */

export function BoardScreen({
  markets,
  trades,
}: {
  markets: Market[];
  trades: TradeRecord[];
}) {
  const model = useMemo<BoardModel>(() => {
    /*
     * "Credits at risk" is real, not decorative: outstanding shares straight
     * off the market maker's own state, scaled against the busiest market on
     * the board. A bar that means something is worth the two lines; a bar that
     * is a flourish is worse than no bar.
     */
    const outstanding = markets.map((m) => m.state.qYes + m.state.qNo);
    const busiest = Math.max(1, ...outstanding);

    return {
      rows: markets.map((market, i) => ({
        id: market.id,
        question: market.boardLabel,
        price: priceOf(market.state, "YES"),
        openingPrice: market.openingPrice,
        status: market.status === "open" ? ("open" as const) : ("locked" as const),
        weight: outstanding[i] / busiest,
      })),
      openCount: markets.filter((m) => m.status === "open").length,
      tradeCount: trades.length,
    };
  }, [markets, trades.length]);

  // Built once, from the first model, and then fed. Lazy initial state rather
  // than a memo: this owns a canvas and a running mechanism, and must survive
  // every re-render rather than being rebuilt by one.
  const [raster] = useState(
    () =>
      new BoardRaster(model, {
        scale: BOARD_SCREEN.textureScale,
        onFlip: (isLast, loud) => {
          // The arriving flip always sounds; the ones passed through are
          // thinned, or a full cascade is just white noise.
          if (isLast) flapAudio.click(0.95);
          else if (loud || Math.random() < 0.3) flapAudio.click(0.45);
        },
      }),
  );

  // Held by a ref as well as by state: `update` and `setModel` both mutate it,
  // and mutating a value a hook returned is exactly what the compiler's
  // immutability rule is there to stop.
  const rasterRef = useRef(raster);

  useEffect(() => {
    rasterRef.current.setModel(model);
  }, [model]);

  // The board is painted before the webfonts land, so it paints once in the
  // fallback stack and again in Barlow Condensed. Without this the drums keep
  // whatever the browser had at module-eval time, forever.
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) rasterRef.current.refreshFonts();
    });
    return () => {
      live = false;
    };
  }, []);

  const panel = useMemo(() => {
    const texture = new THREE.CanvasTexture(raster.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, [raster]);

  useEffect(() => () => panel.dispose(), [panel]);

  /* ---------------------------------------------------------------- sizing */

  const rows = model.rows.length;
  const geometry = useMemo(() => boardGeometry(rows), [rows]);

  /* ------------------------------------------------------------------ tape */

  const items = useMemo<BoardTapeItem[]>(() => {
    const byId = new Map(markets.map((m) => [m.id, m]));
    return trades.slice(0, 18).map((trade) => ({
      market: byId.get(trade.marketId)?.boardLabel ?? "—",
      side: trade.side,
      contracts: trade.contracts,
      price: trade.priceAfter,
      move: Math.round(trade.priceAfter * 100) - Math.round(trade.priceBefore * 100),
      who: trade.isPublic ? trade.displayName : undefined,
    }));
  }, [trades, markets]);

  /*
   * One texture for the life of the board, repainted in place.
   *
   * Building a fresh texture per trade would reset `offset.x`, and the tape
   * would visibly snap back to its start every time anyone bought anything —
   * on a busy floor, several times a second. The strip's content changes; where
   * the tape has got to does not.
   */
  const [tapeTexture] = useState(() => {
    const texture = new THREE.CanvasTexture(
      paintTapeStrip(items, BOARD_SCREEN.textureScale, geometry.tape.designWidth),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    // No mipmaps: the strip is repainted often and is only ever seen close to
    // head-on, so a mipmap chain would be regenerated for nothing.
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  });

  const tapeRef = useRef(tapeTexture);
  /** Texture-space distance the tape covers per second. Follows the strip. */
  const tapeStep = useRef(0);

  useEffect(() => {
    const canvas = paintTapeStrip(
      items,
      BOARD_SCREEN.textureScale,
      geometry.tape.designWidth,
    );
    const texture = tapeRef.current;
    texture.image = canvas;
    texture.needsUpdate = true;
    // The strip ends after its last whole item, so how much of it the window
    // shows — and how far a second of crawl is — both follow its width.
    const stripWidth = canvas.width / BOARD_SCREEN.textureScale;
    texture.repeat.x = geometry.tape.designWidth / stripWidth;
    tapeStep.current = TAPE_SPEED / stripWidth;
  }, [items, geometry.tape.designWidth]);

  useEffect(() => {
    const texture = tapeRef.current;
    return () => texture.dispose();
  }, []);

  const tapeFrame = useMemo(() => {
    const texture = new THREE.CanvasTexture(
      paintTapeOverlay(BOARD_SCREEN.textureScale, geometry.tape.designWidth),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [geometry.tape.designWidth]);

  useEffect(() => () => tapeFrame.dispose(), [tapeFrame]);

  const glass = useMemo(() => glassTexture(), []);
  useEffect(() => () => glass.dispose(), [glass]);

  /* ----------------------------------------------------------------- drive */

  /*
   * Everything mutated per frame is reached through a ref — this material, and
   * the tape texture above. Driving a renderer is mutation by nature, and the
   * React Compiler's immutability rule quite reasonably objects to writing to
   * a value a hook handed back; a ref is the sanctioned way out, the same trick
   * WalkControls uses for the camera.
   */
  const panelMaterial = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    // The tape: a UV slide over a tiling strip. Wrapped at 1 so the offset
    // never drifts out to where a float stops having useful precision.
    const crawling = tapeRef.current;
    crawling.offset.x = (crawling.offset.x + tapeStep.current * delta) % 1;

    /*
     * Uploaded on any frame the mechanism actually changed something, and no
     * other frame. That is not a throttle and should not become one: a flip
     * lasts about 56 milliseconds, so halving the rate halves it to two frames
     * and the card stops falling and starts blinking.
     *
     * What keeps this affordable is upstream — the repaint is banded by row,
     * so a price move touches one row and a still board reports no change at
     * all and costs a loop over a few hundred integers.
     */
    if (rasterRef.current.update(delta * 1000)) {
      const map = panelMaterial.current?.map;
      if (map) map.needsUpdate = true;
    }
  });

  const [panelW, panelH] = geometry.panel;

  return (
    <group>
      {/* The drums, set back in the opening. */}
      <mesh position={[0, 0, BOARD_SCREEN.depth]}>
        <planeGeometry args={[panelW, panelH]} />
        <meshBasicMaterial ref={panelMaterial} map={panel} />
      </mesh>

      {/* The tape, crawling in its recess. */}
      <mesh
        position={[geometry.tape.x, geometry.tape.y, BOARD_SCREEN.depth + 0.004]}
        renderOrder={1}
      >
        <planeGeometry args={[geometry.tape.width, geometry.tape.height]} />
        <meshBasicMaterial map={tapeTexture} transparent depthWrite={false} />
      </mesh>
      {/* Its label block and end fades, which are the parts that must not move. */}
      <mesh
        position={[geometry.tape.x, geometry.tape.y, BOARD_SCREEN.depth + 0.008]}
        renderOrder={2}
      >
        <planeGeometry args={[geometry.tape.width, geometry.tape.height]} />
        <meshBasicMaterial map={tapeFrame} transparent depthWrite={false} />
      </mesh>

      {/* The pane. Near the front of the bezel, well clear of the drums. */}
      <mesh position={[0, 0, BOARD_SCREEN.glassZ]} renderOrder={3}>
        <planeGeometry
          args={[
            BOARD_FRAME.width - BOARD_FRAME.bezel * 2,
            BOARD_FRAME.height - BOARD_FRAME.bezel * 2,
          ]}
        />
        <meshBasicMaterial map={glass} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
