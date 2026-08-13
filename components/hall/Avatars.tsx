"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { AVATARS, AVATAR_FALLBACK_LOOK, AVATAR_LOOKS } from "@/lib/hall";

/**
 * The people in the room.
 *
 * Built from primitives, but no longer monochrome. A figure rendered in a
 * single near-black material reads as a blob, however good its proportions
 * are — at this distance detail is invisible but value and hue are not, so
 * a coat, a skin tone and a hair colour is the entire difference between five
 * silhouettes and five recognisable colleagues.
 *
 * Everything stays desaturated. The board still has to be the brightest thing
 * in the room, and a row of primary-coloured characters would take that away.
 *
 * They are the actual traders, not extras — you plus the four bots. When the
 * cynic sells the roadmap market down, that is his back in the third row.
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
  const look = AVATAR_LOOKS[info.id] ?? AVATAR_FALLBACK_LOOK;

  // Three materials per person, memoised so five figures cost three shader
  // programs between them rather than fifty-five.
  const materials = useMemo(() => {
    const coat = new THREE.MeshStandardMaterial({
      color: look.coat,
      roughness: 0.88,
      metalness: 0.02,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: look.skin,
      roughness: 0.72,
      metalness: 0.0,
    });
    const hair = new THREE.MeshStandardMaterial({
      color: look.hair,
      roughness: 0.82,
      metalness: 0.02,
    });
    return { coat, skin, hair };
  }, [look.coat, look.skin, look.hair]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime + phase;
    group.current.position.y = Math.sin(t * 0.8) * 0.008;
    group.current.rotation.y = Math.sin(t * 0.27) * 0.05;
  });

  const build = look.build;

  return (
    <group position={[position[0], position[1], position[2]]} scale={scale}>
      {/*
        Seated. The head lands below the camera's eye height, which is what
        guarantees it can never overlap the screen — see lib/hall.test.ts.
      */}
      <group ref={group}>
        {/* Head */}
        <mesh position={[0, 1.19, 0]} material={materials.skin} castShadow>
          <sphereGeometry args={[0.113, 20, 16]} />
        </mesh>

        {/* Hair, as a slightly larger cap sitting over the back of the skull.
            From behind this is most of what identifies someone. */}
        <mesh position={[0, 1.205, -0.012]} material={materials.hair} castShadow>
          <sphereGeometry args={[0.119, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        </mesh>
        {look.hairStyle === "bun" && (
          <mesh position={[0, 1.235, -0.105]} material={materials.hair}>
            <sphereGeometry args={[0.062, 14, 12]} />
          </mesh>
        )}
        {look.hairStyle === "short" && (
          <mesh position={[0, 1.14, -0.055]} material={materials.hair}>
            <sphereGeometry args={[0.108, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
        )}

        {/* Neck */}
        <mesh position={[0, 1.06, 0]} material={materials.skin}>
          <cylinderGeometry args={[0.048, 0.058, 0.09, 10]} />
        </mesh>

        {/* Torso */}
        <mesh
          position={[0, 0.75, -0.02]}
          rotation={[-0.1, 0, 0]}
          material={materials.coat}
          castShadow
        >
          <cylinderGeometry args={[0.155 * build, 0.205 * build, 0.56, 18]} />
        </mesh>
        <mesh position={[0, 0.98, -0.01]} material={materials.coat} castShadow>
          <sphereGeometry args={[0.195 * build, 18, 14]} />
        </mesh>

        {/* Thighs */}
        {[-0.085, 0.085].map((x) => (
          <mesh
            key={`t${x}`}
            position={[x, 0.47, 0.19]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.coat}
          >
            <cylinderGeometry args={[0.075, 0.065, 0.46, 10]} />
          </mesh>
        ))}
        {/* Shins */}
        {[-0.085, 0.085].map((x) => (
          <mesh key={`s${x}`} position={[x, 0.22, 0.4]} material={materials.coat}>
            <cylinderGeometry args={[0.058, 0.05, 0.46, 10]} />
          </mesh>
        ))}

        {/* Upper arms */}
        {[-0.215 * build, 0.215 * build].map((x) => (
          <mesh key={`a${x}`} position={[x, 0.76, 0]} material={materials.coat}>
            <cylinderGeometry args={[0.05, 0.045, 0.44, 10]} />
          </mesh>
        ))}
        {/* Forearms resting on the thighs */}
        {[-0.2 * build, 0.2 * build].map((x) => (
          <mesh
            key={`f${x}`}
            position={[x, 0.56, 0.16]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.coat}
          >
            <cylinderGeometry args={[0.045, 0.042, 0.36, 10]} />
          </mesh>
        ))}
        {/* Hands */}
        {[-0.2 * build, 0.2 * build].map((x) => (
          <mesh key={`h${x}`} position={[x, 0.55, 0.34]} material={materials.skin}>
            <sphereGeometry args={[0.05, 12, 10]} />
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
