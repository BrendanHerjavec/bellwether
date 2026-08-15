"use client";

/**
 * One frame of the hall, rendered on demand.
 *
 * This exists because of a hard limitation, and it is worth stating plainly:
 * react-three-fiber sizes itself with a ResizeObserver and drives itself with
 * requestAnimationFrame, and both of those are delivered as part of the
 * browser's rendering steps. In a pane that is not compositing — a headless
 * preview, a background tab, CI — neither ever fires, so the `<Canvas>` never
 * even configures itself and the scene is not merely invisible, it does not
 * exist. Every camera and lighting decision in this room was being made blind.
 *
 * R3F has the escape hatch already: `createRoot(canvas).configure({ size,
 * frameloop: "never" })` takes both dependencies out of play — an explicit size
 * instead of measuring, and manual `advance()` instead of a frame loop. Mount
 * the same `<HallContents>` the real page mounts, advance it a few times to let
 * anything time-based settle, and read the pixels back.
 *
 * It renders the real scene, not a copy of it. That is the entire point — a
 * previz that drifts from the thing it previsualises is worse than none.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createRoot, extend, type ReconcilerRoot, type RootStore } from "@react-three/fiber";
import { HallContents, type CameraMode } from "@/components/hall/Hall";
import type { AvatarInfo } from "@/components/hall/Avatars";
import { createSeedMarkets } from "@/lib/markets";
import { BOT_ROSTER } from "@/lib/bots";
import { CAMERA, EXPOSURE, QUALITY, type QualityTier } from "@/lib/hall";
import { AIR, SURFACE } from "@/lib/palette";

/*
 * Deliberately modest. Whatever is driving this has no GPU worth the name —
 * a headless pane falls back to a software rasteriser — and every pixel of
 * every step is shaded on the CPU, twice over once bloom is in the chain. This
 * is a still for judging light and colour, not a beauty render.
 */
const WIDTH = 960;
const HEIGHT = 540;

/**
 * Frames per advance.
 *
 * Few, and large. The point is to let anything time-based settle — the board's
 * boot cascade, the avatars' idle sway — not to simulate honestly, so a handful
 * of coarse steps covering the requested span beats sixty fine ones that take
 * two minutes to render.
 */
const STEPS = 6;

/*
 * `<Canvas>` does this for you and `createRoot` does not, which is the one
 * genuinely surprising part of driving a root by hand: without it every
 * intrinsic element in the scene — `<color>`, `<mesh>`, `<pointLight>` — throws
 * "is not part of the THREE namespace", the root mounts nothing, and you get a
 * blank canvas with no other complaint.
 */
extend(THREE as unknown as Parameters<typeof extend>[0]);

const markets = createSeedMarkets();

/** A plausible room: you plus the bots, one of them mid-trade. */
const people: Record<string, AvatarInfo> = Object.fromEntries(
  [
    { id: "you", name: "You", isYou: true, isLeadership: false },
    ...BOT_ROSTER.map((bot, i) => ({
      id: bot.id,
      name: bot.persona,
      isYou: false,
      isLeadership: i === 0,
    })),
  ].map((p) => [p.id, { ...p, pulseKey: 0 }]),
);

export default function StillPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null);
  const storeRef = useRef<RootStore | null>(null);

  const [tier, setTier] = useState<QualityTier>("balanced");
  const [cameraMode, setCameraMode] = useState<CameraMode>("locked");
  const [status, setStatus] = useState("Mounting…");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let live = true;

    /*
     * A brand new canvas element every time, rather than one held in a ref.
     *
     * `root.unmount()` disposes the renderer, and disposing a WebGLRenderer
     * calls `forceContextLoss()` — after which that canvas can never obtain a
     * context again. React's StrictMode double-invokes effects in development,
     * so a reused canvas is dead on the second run: `getContext` hands back the
     * lost context, three reads a null parameter off it, and the whole thing
     * fails with "cannot read properties of null (reading 'precision')" a long
     * way from the cause. Switching tiers would break it the same way.
     */
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    canvas.style.borderRadius = "6px";
    host.replaceChildren(canvas);

    const root = createRoot(canvas);
    rootRef.current = root;

    root
      .configure({
        // Explicit, so nothing waits on a ResizeObserver that will not fire.
        size: { width: WIDTH, height: HEIGHT, top: 0, left: 0 },
        // Manual, so nothing waits on a frame loop that will not run.
        frameloop: "never",
        dpr: 1,
        shadows: QUALITY[tier].shadows ? "percentage" : false,
        gl: {
          antialias: true,
          // Without this the drawing buffer is thrown away before it can be
          // read back, and every capture comes out blank.
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: EXPOSURE,
        },
        camera: {
          position: [...CAMERA.position],
          fov: CAMERA.fov,
          near: CAMERA.near,
          far: CAMERA.far,
        },
        onCreated: (state) => {
          state.camera.lookAt(new THREE.Vector3(...CAMERA.target));
        },
      })
      .then((configured) => {
        if (!live) return;
        storeRef.current = configured.render(
          <HallContents
            tier={tier}
            cameraMode={cameraMode}
            people={people}
            markets={markets}
            trades={[]}
          />,
        );
        setStatus("Mounted. Advance to render.");
      });

    return () => {
      live = false;
      root.unmount();
      canvas.remove();
      rootRef.current = null;
      storeRef.current = null;
    };
  }, [tier, cameraMode]);

  /**
   * Advance the scene by hand.
   *
   * More than one step, because a single frame catches the room mid-boot: the
   * board is still cascading, the avatars have not settled, and anything driven
   * by elapsed time is at zero. Half a dozen steps of a sixtieth each is enough
   * for everything except the board, which takes a few seconds to finish
   * flipping — hence the longer option.
   */
  const advance = useCallback((seconds: number) => {
    const store = storeRef.current;
    if (!store) return setStatus("Not mounted yet");
    const state = store.getState();
    // Milliseconds, like `performance.now()` — R3F derives its delta from the
    // difference between successive timestamps. Passing seconds advances the
    // scene by microseconds and looks, convincingly, like nothing happening.
    const stepMs = (seconds * 1000) / STEPS;
    for (let i = 1; i <= STEPS; i += 1) state.advance(i * stepMs);
    setStatus(`${seconds}s of scene time in ${STEPS} steps`);
  }, []);

  const button =
    "rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors";
  const off = `${button} border-[#c08a3e]/25 text-[#c08a3e] hover:border-[#c08a3e]/60`;
  const on = `${button} border-[#c08a3e] bg-[#c08a3e]/15 text-[#e8d9b5]`;

  return (
    <div className="min-h-full p-6" style={{ background: AIR.background }}>
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/board" className={off}>
            ← The hall
          </Link>
          <Link href="/lab/textures" className={off}>
            Surfaces
          </Link>
          <span className="mx-2 h-4 w-px" style={{ background: SURFACE.brassDeep }} />
          {[0.2, 2, 6].map((s) => (
            <button key={s} type="button" className={off} onClick={() => advance(s)}>
              Advance {s}s
            </button>
          ))}
          <span className="mx-2 h-4 w-px" style={{ background: SURFACE.brassDeep }} />
          {(["locked", "drift"] as CameraMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cameraMode === mode ? on : off}
              onClick={() => setCameraMode(mode)}
            >
              {mode}
            </button>
          ))}
          {(Object.keys(QUALITY) as QualityTier[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tier === t ? on : off}
              onClick={() => setTier(t)}
            >
              {QUALITY[t].label}
            </button>
          ))}
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6a5236]">
            {status}
          </span>
        </div>

        <div ref={hostRef} />
      </div>
    </div>
  );
}
