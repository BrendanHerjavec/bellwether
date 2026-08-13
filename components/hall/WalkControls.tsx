"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAMERA, HALL } from "@/lib/hall";

/**
 * Walk around the room.
 *
 * Deliberately not PointerLockControls. Locking the pointer hides the cursor
 * and swallows clicks, and the immediate complaint about this scene was that
 * the buttons could not be clicked — taking the mouse away as well would be
 * perverse. Here you drag to look and hold WASD to move, and the cursor stays
 * yours the whole time.
 *
 * Height is fixed at standing eye level. Being able to fly is not a feature: it
 * puts the camera above the seated heads, which is exactly the arrangement that
 * lets a head cross in front of a screen the renderer cannot occlude.
 */
export function WalkControls({ enabled }: { enabled: boolean }) {
  // Only the canvas element is taken from the hook. The camera is read from
  // useFrame's state instead, because mutating a value returned by a hook trips
  // the React Compiler's immutability rule — and driving a camera by mutation
  // is exactly how react-three-fiber works.
  const { gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const needsSeed = useRef(true);

  // Flag only. The seeding itself happens on the next frame, where the camera
  // is a plain function argument.
  useEffect(() => {
    needsSeed.current = true;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;

    const down = (e: PointerEvent) => {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current || !last.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * 0.0032;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - dy * 0.0028,
        -Math.PI / 5,
        Math.PI / 4,
      );
    };
    const up = (e: PointerEvent) => {
      dragging.current = false;
      last.current = null;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    // Only capture the movement keys. Anything else stays with the page, so
    // the controls in the corner keep working while walking.
    const MOVEMENT = new Set([
      "KeyW", "KeyA", "KeyS", "KeyD",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "ShiftLeft", "ShiftRight",
    ]);
    const keyDown = (e: KeyboardEvent) => {
      if (!MOVEMENT.has(e.code)) return;
      keys.current[e.code] = true;
      e.preventDefault();
    };
    const keyUp = (e: KeyboardEvent) => {
      if (!MOVEMENT.has(e.code)) return;
      keys.current[e.code] = false;
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      keys.current = {};
    };
  }, [enabled, gl]);

  useFrame((state, delta) => {
    if (!enabled) return;
    const camera = state.camera;

    // Seed the look direction from wherever the fixed camera was pointing, so
    // entering walk mode does not snap the view somewhere else.
    if (needsSeed.current) {
      needsSeed.current = false;
      camera.position.set(...CAMERA.position);
      const dir = new THREE.Vector3(...CAMERA.target)
        .sub(camera.position)
        .normalize();
      yaw.current = Math.atan2(-dir.x, -dir.z);
      pitch.current = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    }

    const k = keys.current;
    const sprint = k.ShiftLeft || k.ShiftRight ? 2.1 : 1;
    const speed = 3.4 * sprint * Math.min(delta, 0.05);

    const forward = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);

    if (forward || strafe) {
      // Movement is in the XZ plane only — the yaw drives it, the pitch does
      // not, so looking up does not launch you at the ceiling.
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      camera.position.x += (-sin * forward + cos * strafe) * speed;
      camera.position.z += (-cos * forward - sin * strafe) * speed;

      // Stay inside the building, and out of the wall the screen is set into.
      const halfW = HALL.width / 2 - 1.2;
      const frontZ = HALL.backWallZ + HALL.depth - 1.2;
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfW, halfW);
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        HALL.backWallZ + 3.5,
        frontZ,
      );
    }

    camera.position.y = CAMERA.position[1];
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    camera.rotation.z = 0;
  });

  return null;
}
