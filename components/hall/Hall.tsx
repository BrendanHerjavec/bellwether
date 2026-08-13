"use client";

import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { TotBoardView } from "@/components/board/TotBoard";
import type { TradeRecord } from "@/components/trading/TradingProvider";
import type { Market } from "@/lib/markets";
import {
  BoardHousing,
  CameraDrift,
  Lights,
  Podium,
  Room,
  TickerHousing,
} from "./HallScene";
import { Avatars, type AvatarInfo } from "./Avatars";
import { BOARD, CAMERA, FOG, POST, boardHtmlScale } from "@/lib/hall";

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
 * no WebGL geometry can occlude it. The board's glow is done in CSS instead, in
 * splitflap.css, tuned to sit alongside the bloom rather than come from it.
 *
 * If you ever want the board blurred by the DoF pass, the only way is to render
 * it to a texture, and that gives up the crispness the whole approach exists to
 * protect. Do not do it.
 */
export function Hall({
  effects = true,
  freeLook = false,
  people,
  showLabels = true,
  markets,
  trades,
}: {
  effects?: boolean;
  /**
   * Hands the camera over. The slow drift and free look are mutually exclusive
   * — both writing to the camera every frame means neither wins.
   */
  freeLook?: boolean;
  people: Record<string, AvatarInfo>;
  showLabels?: boolean;
  /*
   * Passed as plain props, not read from context.
   *
   * React context does not survive the crossing into R3F's reconciler and out
   * again through drei's <Html> portal. The context-reading board threw
   * "useTrading must be used inside a TradingProvider" and took the whole scene
   * down; re-providing the context inside the Canvas did not fix it either.
   * Props cross the boundary reliably, so the boundary is where they start.
   */
  markets: Market[];
  trades: TradeRecord[];
}) {
  return (
    <Canvas
      // "percentage" maps to PCFShadowMap. The default soft map is deprecated
      // in three 0.185 and silently falls back to this anyway, with a warning.
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{
        position: [...CAMERA.position],
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
      }}
    >
      <color attach="background" args={["#05060a"]} />
      {/* Exponential haze, so the walls dissolve instead of ending at a seam. */}
      <fogExp2 attach="fog" args={[FOG.color, FOG.density]} />

      {freeLook ? (
        <OrbitControls
          target={[...CAMERA.target]}
          enablePan
          enableZoom
          // Kept above the floor and out of the ceiling, so it is impossible to
          // end up underneath the platform wondering where the room went.
          maxPolarAngle={Math.PI * 0.495}
          minDistance={4}
          maxDistance={70}
          dampingFactor={0.08}
          enableDamping
        />
      ) : (
        <CameraDrift />
      )}

      <Lights />
      <Room />
      <TickerHousing />
      <Podium />
      <Avatars people={people} showLabels={showLabels} />

      <BoardHousing>
        <Html
          transform
          // Not metres-per-pixel: drei maps 400px onto 10 units at scale 1.
          scale={boardHtmlScale}
          position={[0, 0, 0.02]}
          // Without this the board is captured into the canvas's own stacking
          // context and disappears behind the effect composer's output.
          zIndexRange={[10, 0]}
          style={{ width: `${BOARD.pixelWidth}px`, pointerEvents: "none" }}
        >
          <TotBoardView
            markets={markets}
            trades={trades}
            widthPx={BOARD.pixelWidth}
          />
        </Html>
      </BoardHousing>

      {effects && (
        <EffectComposer>
          <DepthOfField
            focusDistance={POST.depthOfField.focusDistance}
            focalLength={POST.depthOfField.focalLength}
            bokehScale={POST.depthOfField.bokehScale}
          />
          <Bloom
            intensity={POST.bloom.intensity}
            luminanceThreshold={POST.bloom.luminanceThreshold}
            luminanceSmoothing={POST.bloom.luminanceSmoothing}
            mipmapBlur={POST.bloom.mipmapBlur}
          />
          <Vignette
            offset={POST.vignette.offset}
            darkness={POST.vignette.darkness}
          />
          <Noise opacity={POST.noise.opacity} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
