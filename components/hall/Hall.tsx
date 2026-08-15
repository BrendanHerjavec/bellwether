"use client";

import { useCallback, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import type { TradeRecord } from "@/components/trading/TradingProvider";
import type { Market } from "@/lib/markets";
import {
  BoardHousing,
  CameraDrift,
  Fittings,
  Lights,
  Podium,
  Room,
  ScreenLight,
  TickerHousing,
} from "./HallScene";
import { Avatars, type AvatarInfo } from "./Avatars";
import { BoardScreen } from "./BoardScreen";
import { WalkControls } from "./WalkControls";
import { CAMERA, EXPOSURE, FOG, POST, QUALITY, type QualityTier } from "@/lib/hall";
import { AIR } from "@/lib/palette";

/**
 * The exchange hall.
 *
 * The board is part of the WebGL render. That sentence used to say the
 * opposite, and reversing it is the single largest change this scene has had.
 *
 * It was a drei `<Html transform>`: real DOM, positioned by the camera matrix
 * but composited outside the canvas. That kept the glyphs as text, and it cost
 * the two things that actually mattered — the frame rate, because drei rewrote
 * a 3,700-node subtree's CSS matrix every frame on the main thread, and any
 * sense of the board belonging to the room, because a layer outside the canvas
 * receives no fog, no bloom, no depth of field, and cannot be occluded by
 * anything in front of it.
 *
 * Now it is a canvas texture on a mesh (`BoardScreen`), and everything below
 * applies to it like it applies to the walls. `board-raster.ts` explains how
 * the crispness survives that; the short version is supersampling and only
 * uploading the texture when a drum is actually mid-flip.
 *
 * The room is still lit BY the screen (`ScreenLight`), which was a compensation
 * for the old arrangement and turned out to be worth keeping on its own merits.
 * Its sibling `ScreenHalo` was not: an emissive plane slightly LARGER than the
 * board and a centimetre nearer the camera is harmless while the board is
 * composited on top of the canvas, and covers it completely the moment the
 * board joins the depth buffer. It blanked the screen, and it is gone. See the
 * depth-order assertions in `lib/hall.test.ts` before adding anything else to
 * the opening.
 */
export type CameraMode = "locked" | "drift" | "walk" | "orbit";

export function Hall({
  quality: tier = "balanced",
  cameraMode = "locked",
  people,
  showLabels = true,
  hideIds,
  markets,
  trades,
  onFps,
}: {
  quality?: QualityTier;
  /**
   * Defaults to "locked" for framing, no longer for frame rate.
   *
   * It used to be a performance decision: a moving camera rewrote the board's
   * CSS matrix and re-rasterised thousands of DOM nodes every frame, so a still
   * camera was several times cheaper than a moving one. The board is geometry
   * now and moving the camera costs what moving a camera costs.
   */
  cameraMode?: CameraMode;
  people: Record<string, AvatarInfo>;
  showLabels?: boolean;
  /** Traders to leave out of the crowd. See `Avatars`. */
  hideIds?: readonly string[];
  /*
   * Passed as plain props rather than read from context: R3F runs its own
   * reconciler, and context does not survive the crossing into it.
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
      {onFps && <FpsProbe onFps={onFps} />}
      <AdaptiveResolution range={quality.dpr} />
      <HallContents
        tier={tier}
        cameraMode={cameraMode}
        people={people}
        showLabels={showLabels}
        hideIds={hideIds}
        markets={markets}
        trades={trades}
      />
    </Canvas>
  );
}

/**
 * Everything inside the Canvas, as its own component.
 *
 * Split out so it can be mounted against a manually-driven R3F root as well as
 * the real one — see `/lab/still`. That is not a nicety: R3F sizes itself with
 * a ResizeObserver and drives itself with requestAnimationFrame, and in a
 * headless pane neither ever fires, so the scene cannot be looked at at all
 * from the environment it is written in. Mounting the same tree against an
 * explicitly-sized root with `frameloop: "never"` is the only way to get a
 * frame out of it, and it works precisely because this component knows nothing
 * about how it is being driven.
 */
export function HallContents({
  tier = "balanced",
  cameraMode = "locked",
  people,
  showLabels = true,
  hideIds,
  markets,
  trades,
}: {
  tier?: QualityTier;
  cameraMode?: CameraMode;
  people: Record<string, AvatarInfo>;
  showLabels?: boolean;
  hideIds?: readonly string[];
  markets: Market[];
  trades: TradeRecord[];
}) {
  const quality = QUALITY[tier];

  return (
    <>
      <color attach="background" args={[AIR.background]} />
      {/* Exponential haze, so the walls dissolve instead of ending at a seam.
          Warm, and that is the single highest-leverage colour in the room —
          fog tints everything by distance, so it decides what the depth of the
          place is made of before any material gets a say. */}
      <fogExp2 attach="fog" args={[FOG.color, FOG.density]} />

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
      <Room />
      <Fittings />
      <TickerHousing />
      <Podium />
      <Avatars people={people} showLabels={showLabels} hideIds={hideIds} />

      <BoardHousing>
        <BoardScreen markets={markets} trades={trades} />
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
    </>
  );
}

/**
 * Render resolution, found rather than assumed.
 *
 * The tiers below pick what to draw; this picks how many pixels to draw it
 * into, and it is the one knob that can respond to the machine it is actually
 * running on. Shading cost is quadratic in resolution, so sliding from 1.5 to 1
 * is a 2.2x cut — far more than any single effect here is worth — and it does
 * it in steps small enough that nobody watches it happen.
 *
 * Each tier's `dpr` pair is the range it is allowed to move within, so this can
 * never make a tier more expensive than the tier says it may be. Which is why
 * the manual tier buttons still mean something: they set the ceiling.
 */
function AdaptiveResolution({ range }: { range: readonly [number, number] }) {
  const setDpr = useThree((state) => state.setDpr);
  const [min, max] = range;

  const onChange = useCallback(
    ({ factor }: { factor: number }) => setDpr(min + (max - min) * factor),
    [setDpr, min, max],
  );

  // `flipflops` caps how many times it may change its mind before settling, so
  // a machine sitting right on the boundary does not oscillate for ever.
  return <PerformanceMonitor factor={1} flipflops={3} onChange={onChange} />;
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
