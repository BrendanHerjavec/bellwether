"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { AVATARS } from "@/lib/hall";

/**
 * The people in the room.
 *
 * Built from primitives on purpose. They are seen from behind at 10-30 metres
 * with the brightest object in the room directly in front of them, so what
 * reaches the camera is a silhouette with a rim of board-light down one side.
 * Detail would be invisible; proportion and stance are the only things that
 * read, and those are cheap to get right. Modelled faces at this distance is
 * how a scene starts looking like a video game.
 *
 * They are the actual traders, not extras — you plus the four bots. When the
 * cynic sells the roadmap market down, that is his silhouette in the crowd.
 */

export interface AvatarInfo {
  id: string;
  name: string;
  isYou: boolean;
  isLeadership: boolean;
  /**
   * Id of this trader's most recent trade, used only as a React key on the
   * name tag. Changing it remounts the tag, which replays a one-shot CSS
   * animation — the pulse expires by itself, with no clock read during render
   * and no timers to clean up.
   */
  pulseKey: number;
}

function Figure({
  info,
  position,
  scale,
  phase,
  showLabel,
}: {
  info: AvatarInfo;
  position: readonly [number, number, number];
  scale: number;
  phase: number;
  showLabel: boolean;
}) {
  const group = useRef<THREE.Group>(null);

  // Very dark: these are silhouettes, and the board behind supplies the edge.
  const body = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: info.isYou ? "#1b2030" : "#12151b",
        roughness: 0.85,
        metalness: 0.05,
      }),
    [info.isYou],
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime + phase;
    // Settling in a seat and breathing. Smaller than the standing sway was —
    // seated people move less — but without it five statues make the room feel
    // abandoned.
    group.current.position.y = Math.sin(t * 0.8) * 0.008;
    group.current.rotation.y = Math.sin(t * 0.27) * 0.05;
  });

  return (
    <group position={[position[0], position[1], position[2]]} scale={scale}>
      {/*
        Seated. Head lands at AVATAR.seatedHeadHeight, which must stay below the
        camera's eye height — that is what guarantees a head can never overlap
        the screen, since anything below the camera projects below the horizon.
      */}
      <group ref={group}>
        {/* Head */}
        <mesh position={[0, 1.19, 0]} material={body} castShadow>
          <sphereGeometry args={[0.115, 20, 16]} />
        </mesh>
        {/* Neck */}
        <mesh position={[0, 1.06, 0]} material={body}>
          <cylinderGeometry args={[0.05, 0.06, 0.09, 10]} />
        </mesh>
        {/* Torso, upright against the seat back */}
        <mesh position={[0, 0.75, -0.02]} rotation={[-0.1, 0, 0]} material={body} castShadow>
          <cylinderGeometry args={[0.155, 0.205, 0.56, 16]} />
        </mesh>
        {/* Shoulders */}
        <mesh position={[0, 0.98, -0.01]} material={body}>
          <sphereGeometry args={[0.195, 16, 12]} />
        </mesh>
        {/* Thighs, forward and level with the seat */}
        {[-0.085, 0.085].map((x) => (
          <mesh
            key={`t${x}`}
            position={[x, 0.47, 0.19]}
            rotation={[Math.PI / 2, 0, 0]}
            material={body}
          >
            <cylinderGeometry args={[0.075, 0.065, 0.46, 10]} />
          </mesh>
        ))}
        {/* Shins, dropping to the floor */}
        {[-0.085, 0.085].map((x) => (
          <mesh key={`s${x}`} position={[x, 0.22, 0.4]} material={body}>
            <cylinderGeometry args={[0.058, 0.05, 0.46, 10]} />
          </mesh>
        ))}
        {/* Upper arms down the sides, forearms resting on the thighs */}
        {[-0.215, 0.215].map((x) => (
          <mesh key={`a${x}`} position={[x, 0.76, 0]} material={body}>
            <cylinderGeometry args={[0.05, 0.045, 0.44, 10]} />
          </mesh>
        ))}
        {[-0.2, 0.2].map((x) => (
          <mesh
            key={`f${x}`}
            position={[x, 0.56, 0.16]}
            rotation={[Math.PI / 2, 0, 0]}
            material={body}
          >
            <cylinderGeometry args={[0.045, 0.042, 0.36, 10]} />
          </mesh>
        ))}
      </group>

      {showLabel && (
        <Html
          position={[0, 1.52, 0]}
          center
          distanceFactor={14}
          zIndexRange={[6, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            key={info.pulseKey}
            className={`avatar-tag${info.isYou ? " avatar-tag--you" : ""}`}
          >
            {info.isLeadership && <span className="avatar-tag__dot" />}
            {info.name}
          </div>
        </Html>
      )}
    </group>
  );
}

export function Avatars({
  people,
  showLabels = true,
}: {
  people: Record<string, AvatarInfo>;
  showLabels?: boolean;
}) {
  return (
    <group>
      {AVATARS.map((slot) => {
        const info = people[slot.id];
        if (!info) return null;
        return (
          <Figure
            key={slot.id}
            info={info}
            position={slot.position}
            scale={slot.scale}
            phase={slot.phase}
            showLabel={showLabels}
          />
        );
      })}
    </group>
  );
}
