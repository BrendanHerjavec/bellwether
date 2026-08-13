"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { TotBoardView } from "@/components/board/TotBoard";
import type { TradeRecord } from "@/components/trading/TradingProvider";
import type { Market } from "@/lib/markets";
import {
  BoardHousing,
  CameraDrift,
  Lights,
  Podium,
  Room,
  ScreenHalo,
  ScreenLight,
  TickerHousing,
} from "./HallScene";
import { Avatars, type AvatarInfo } from "./Avatars";
import { WalkControls } from "./WalkControls";
import {
  BOARD,
  CAMERA,
  EXPOSURE,
  FOG,
  POST,
  QUALITY,
  boardFogBlend,
  boardHtmlScale,
  type QualityTier,
} from "@/lib/hall";

/**
 * The exchange hall.
 *
 * One thing to understand before changing anything here: the board is NOT part
 * of the WebGL render. drei's <Html transform> puts it in a DOM layer that is
 * positioned by the scene's camera matrix but composited outside the canvas.
 *
 * That is a deliberate trade, and it is the reason the brief specifies
 * CSS3DRenderer at all — the digits stay real text at projector resolution
 * instead of becoming a blurry texture. The cost is that the post-processing
 * below cannot touch the board: no bloom on the glyphs, no depth of field, and
 * no WebGL geometry can occlude it.
 *
 * Three things compensate, because "it looks like an overlay" is the direct
 * consequence of that trade:
 *
 *   1. ScreenLight puts real lights where the board is, so the room is lit BY
 *      the screen — reveals, seat backs and the nearest heads all catch it.
 *   2. ScreenHalo is an emissive plane just behind the board that the bloom
 *      pass blooms, bleeding glow past the DOM edges and hiding the seam.
 *   3. The board carries a CSS grade computed from the scene's own fog, so it
 *      sits in the same atmosphere as everything around it.
 *
 * If you ever want the board blurred by the DoF pass, the only way is to render
 * it to a texture, and that gives up the crispness the whole approach exists to
 * protect. Do not do it.
 */
export type CameraMode = "locked" | "drift" | "walk" | "orbit";

export function Hall({
  quality: tier = "balanced",
  cameraMode = "locked",
  people,
  showLabels = true,
  markets,
  trades,
  onFps,
}: {
  quality?: QualityTier;
  /**
   * Defaults to "locked", and that is a performance decision, not a taste one.
   *
   * A moving camera changes the CSS matrix drei writes onto the board's wrapper
   * every frame, which re-rasterises thousands of DOM nodes on the main thread.
   * A still camera writes the same string each frame and the browser skips the
   * work entirely. Drift is lovely and it is not free.
   */
  cameraMode?: CameraMode;
  people: Record<string, AvatarInfo>;
  showLabels?: boolean;
  /*
   * Passed as plain props, not read from context. React context does not
   * survive the crossing into R3F's reconciler and out again through drei's
   * <Html> portal.
   */
  markets: Market[];
  trades: TradeRecord[];
  onFps?: (fps: number) => void;
}) {
  const quality = QUALITY[tier];

  return (
    <Canvas
      shadows={quality.shadows ? "percentage" : false}
      dpr={quality.dpr}
      gl={{
        antialias: tier === "high",
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: EXPOSURE,
      }}
      camera={{
        position: [...CAMERA.position],
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
      }}
    >
      <color attach="background" args={["#0a0e15"]} />
      {/* Exponential haze, so the walls dissolve instead of ending at a seam. */}
      <fogExp2 attach="fog" args={[FOG.color, FOG.density]} />

      {onFps && <FpsProbe onFps={onFps} />}

      {cameraMode === "orbit" && (
        <OrbitControls
          target={[...CAMERA.target]}
          enablePan
          enableZoom
          // Kept above the floor and out of the ceiling, so it is impossible to
          // end up underneath the room wondering where it went.
          maxPolarAngle={Math.PI * 0.495}
          minDistance={4}
          maxDistance={70}
          dampingFactor={0.08}
          enableDamping
        />
      )}
      {cameraMode === "drift" && <CameraDrift />}
      <WalkControls enabled={cameraMode === "walk"} />

      <Lights />
      <ScreenLight />
      <Room quality={quality} />
      <ScreenHalo />
      <TickerHousing />
      <Podium />
      <Avatars people={people} showLabels={showLabels} />

      <BoardHousing>
        <Html
          transform
          /*
           * Scaled so the board occupies the same world size whatever pixel
           * width the quality tier renders it at. A smaller pixel width means
           * fewer drums and fewer DOM nodes in the subtree drei re-transforms
           * every frame, which is the dominant cost in this scene — and the
           * board only displays around 630 CSS pixels wide anyway.
           */
          scale={boardHtmlScale * (BOARD.pixelWidth / quality.boardPixelWidth)}
          position={[0, 0, 0.02]}
          // Without this the board is captured into the canvas's own stacking
          // context and disappears behind the effect composer's output.
          zIndexRange={[10, 0]}
          /*
           * As a PROP, not in `style`. drei sizes the Html root element to the
           * whole canvas and takes its pointer-events from this prop; `style`
           * only reaches the inner content div. Setting it there left an
           * invisible full-canvas div swallowing every pointer event, which
           * silently disabled drag-to-look and orbit.
           */
          pointerEvents="none"
          style={{ width: `${quality.boardPixelWidth}px` }}
        >
          <TotBoardView
            markets={markets}
            trades={trades}
            widthPx={quality.boardPixelWidth}
            // Puts the board in the same atmosphere as the room around it.
            fogBlend={boardFogBlend()}
            fogColor={FOG.color}
          />
        </Html>
      </BoardHousing>

      <EffectComposer enabled={quality.bloom || quality.depthOfField}>
        <>
          {quality.depthOfField && (
            <DepthOfField
              focusDistance={POST.depthOfField.focusDistance}
              focalLength={POST.depthOfField.focalLength}
              bokehScale={POST.depthOfField.bokehScale}
            />
          )}
          {quality.bloom && (
            <Bloom
              intensity={POST.bloom.intensity}
              luminanceThreshold={POST.bloom.luminanceThreshold}
              luminanceSmoothing={POST.bloom.luminanceSmoothing}
              mipmapBlur={POST.bloom.mipmapBlur}
            />
          )}
          <Vignette
            offset={POST.vignette.offset}
            darkness={POST.vignette.darkness}
          />
          {quality.noise && <Noise opacity={POST.noise.opacity} />}
        </>
      </EffectComposer>
    </Canvas>
  );
}

/**
 * Frame rate, sampled once a second and reported out to the page.
 *
 * Here because the scene cannot be profiled from the environment it is written
 * in — WebGL never initialises in a headless pane — so the only way to know
 * whether the quality tiers actually did anything is to put the number on
 * screen and let someone read it back.
 */
function FpsProbe({ onFps }: { onFps: (fps: number) => void }) {
  const frames = useRef(0);
  const since = useRef(0);
  const report = useRef(onFps);

  useEffect(() => {
    report.current = onFps;
  });

  useFrame((state) => {
    frames.current += 1;
    const elapsed = state.clock.elapsedTime;
    if (since.current === 0) since.current = elapsed;
    if (elapsed - since.current >= 1) {
      report.current(Math.round(frames.current / (elapsed - since.current)));
      frames.current = 0;
      since.current = elapsed;
    }
  });

  return null;
}
