"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  AVATARS,
  AVATAR_FALLBACK_LOOK,
  AVATAR_LOOKS,
  type AvatarPose,
} from "@/lib/hall";
import { nameTagTexture } from "./textures";

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
   * Id of this trader's most recent trade. When it changes, the name tag
   * flares and settles — a silhouette in the room and a line on the tape are
   * visibly the same event.
   */
  pulseKey: number;
}

/** How long a tag stays lit after its trader moves the board, in seconds. */
const PULSE_SECONDS = 3.2;

/** World height of a name tag, before the pulse swells it. */
const TAG_HEIGHT = 0.19;

/**
 * How a body is arranged, per pose.
 *
 * Three numbers do the whole job. `hip` is where the pelvis sits, which is the
 * only thing that separates standing from perching on a stool; `legBend` swings
 * the thighs forward from vertical; `tilt` leans the torso. Everything else in
 * the figure is measured from the hip, so changing one value moves the whole
 * body coherently rather than requiring a second set of meshes.
 */
const POSE: Record<AvatarPose, { hip: number; legBend: number; tilt: number; lift: number }> = {
  /** Upright, weight on both feet. */
  stand: { hip: 0.92, legBend: 0, tilt: 0.02, lift: 0 },
  /** Forearms on the bar, weight forward. */
  lean: { hip: 0.9, legBend: 0.05, tilt: 0.3, lift: 0.06 },
  /** Perched on a stool: hips high, thighs forward and level. */
  perch: { hip: 0.82, legBend: 1.35, tilt: 0.08, lift: 0.0 },
};

function Figure({
  info,
  position,
  pose,
  facing,
  scale,
  phase,
  showLabel,
}: {
  info: AvatarInfo;
  position: readonly [number, number, number];
  pose: AvatarPose;
  facing: number;
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
  const p = POSE[pose];

  // Everything above the hip is measured from it, so a pose is three numbers
  // rather than three sets of meshes.
  const torsoY = p.hip + 0.28;
  const shoulderY = p.hip + 0.52;
  const headY = p.hip + 0.76;

  return (
    <group
      position={[position[0], position[1] + p.lift, position[2]]}
      rotation={[0, facing + Math.PI, 0]}
      scale={scale}
    >
      {/*
        On their feet. They used to be seated, and that was a workaround rather
        than staging — see the note on AVATARS in lib/hall.ts.
      */}
      <group ref={group}>
        {/*
          Segment counts are deliberately low. These figures are 8 to 20 metres
          away and never larger than about 60 screen pixels tall; the difference
          between a 20-segment sphere and a 10-segment one is invisible at that
          size and halves the triangles.
        */}
        {/* Head */}
        <mesh position={[0, headY, p.tilt * 0.3]} material={materials.skin} castShadow>
          <sphereGeometry args={[0.113, 10, 8]} />
        </mesh>

        {/* Hair, as a cap over the back of the skull. Seen from behind, this is
            most of what identifies someone. */}
        <mesh
          position={[0, headY + 0.015, p.tilt * 0.3 - 0.012]}
          material={materials.hair}
          castShadow
        >
          <sphereGeometry args={[0.119, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        </mesh>
        {look.hairStyle === "bun" && (
          <mesh
            position={[0, headY + 0.045, p.tilt * 0.3 - 0.105]}
            material={materials.hair}
          >
            <sphereGeometry args={[0.062, 8, 6]} />
          </mesh>
        )}
        {look.hairStyle === "short" && (
          <mesh position={[0, headY - 0.05, p.tilt * 0.3 - 0.055]} material={materials.hair}>
            <sphereGeometry args={[0.108, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
        )}

        {/* Torso. The neck is gone: it was three hundred triangles of something
            nobody can see between a head and a collar at this distance. */}
        <mesh
          position={[0, torsoY, p.tilt * 0.12]}
          rotation={[p.tilt, 0, 0]}
          material={materials.coat}
          castShadow
        >
          <cylinderGeometry args={[0.165 * build, 0.205 * build, 0.6, 10]} />
        </mesh>
        {/* Shoulders */}
        <mesh position={[0, shoulderY, p.tilt * 0.2]} material={materials.coat} castShadow>
          <sphereGeometry args={[0.2 * build, 10, 7]} />
        </mesh>

        {/* Thighs. Vertical when standing, swung forward when perched — which
            is the only difference a stool actually makes at this distance. */}
        {[-0.085, 0.085].map((x) => (
          <mesh
            key={`t${x}`}
            position={[
              x,
              p.hip - 0.24 * Math.cos(p.legBend),
              0.24 * Math.sin(p.legBend),
            ]}
            rotation={[p.legBend, 0, 0]}
            material={materials.coat}
          >
            <cylinderGeometry args={[0.082, 0.07, 0.5, 6]} />
          </mesh>
        ))}
        {/* Shins. Always hang, whatever the thighs are doing. */}
        {[-0.085, 0.085].map((x) => (
          <mesh
            key={`s${x}`}
            position={[
              x,
              p.hip - 0.48 * Math.cos(p.legBend) - 0.24,
              0.48 * Math.sin(p.legBend),
            ]}
            material={materials.coat}
          >
            <cylinderGeometry args={[0.06, 0.052, 0.5, 6]} />
          </mesh>
        ))}

        {/* Arms, as a single tapered piece each. The forearm and hand were
            separate meshes; from behind, in a coat, they were one shape. */}
        {[-0.215 * build, 0.215 * build].map((x) => (
          <mesh
            key={`a${x}`}
            position={[x, shoulderY - 0.3, p.tilt * 0.42]}
            rotation={[p.tilt * 1.6, 0, 0]}
            material={materials.coat}
          >
            <cylinderGeometry args={[0.052, 0.045, 0.62, 6]} />
          </mesh>
        ))}
      </group>

      {showLabel && <NameTag info={info} y={headY + 0.32} />}
    </group>
  );
}

/**
 * A trader's name, floating over them.
 *
 * A sprite carrying a painted texture, not a DOM element. The DOM version
 * could not be occluded by anything in the scene, so tags sat in front of the
 * columns they were behind, and drei rewrote five elements' transforms on the
 * main thread every frame. As a sprite it is simply in the room: hazed by the
 * same fog, hidden by whatever is in the way, and free to move.
 */
function NameTag({ info, y }: { info: AvatarInfo; y: number }) {
  const sprite = useRef<THREE.Sprite>(null);

  const texture = useMemo(
    () =>
      nameTagTexture(info.name.toUpperCase(), {
        leadership: info.isLeadership,
        highlight: info.isYou,
      }),
    [info.name, info.isLeadership, info.isYou],
  );

  useEffect(() => () => texture.dispose(), [texture]);

  const aspect = (texture.userData.aspect as number) ?? 4;
  const width = TAG_HEIGHT * aspect;

  /*
   * The flare is armed here and stamped on the next frame, because the only
   * clock that matters is the renderer's — reading Date.now during a render
   * would put the animation on a different timebase to everything else in the
   * scene. The first pulseKey is the one the board loaded with, so it arms
   * nothing: the room should not light up simply because you opened it.
   */
  const previous = useRef(info.pulseKey);
  const pending = useRef(false);
  const pulseStart = useRef<number | null>(null);

  useEffect(() => {
    if (previous.current === info.pulseKey) return;
    previous.current = info.pulseKey;
    pending.current = true;
  }, [info.pulseKey]);

  useFrame((state) => {
    const material = sprite.current?.material as THREE.SpriteMaterial | undefined;
    if (!material || !sprite.current) return;
    if (pending.current) {
      pending.current = false;
      pulseStart.current = state.clock.elapsedTime;
    }

    const since = pulseStart.current === null ? Infinity : state.clock.elapsedTime - pulseStart.current;
    // Quadratic decay: a hard flare that settles, rather than a slow fade that
    // leaves half the room permanently half-lit.
    const heat = since >= PULSE_SECONDS ? 0 : Math.pow(1 - since / PULSE_SECONDS, 2);

    material.color.setRGB(1 + heat * 0.5, 1 + heat * 0.32, 1 + heat * 0.05);
    material.opacity = 0.82 + heat * 0.18;
    const swell = 1 + heat * 0.09;
    sprite.current.scale.set(width * swell, TAG_HEIGHT * swell, 1);
  });

  return (
    <sprite ref={sprite} position={[0, y, 0]} scale={[width, TAG_HEIGHT, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={0.82}
        depthWrite={false}
        // Tone mapped and fogged along with everything else. A tag that stays
        // pin-sharp while its owner hazes out is the DOM problem all over again.
        toneMapped
      />
    </sprite>
  );
}

export function Avatars({
  people,
  showLabels = true,
  hideIds,
}: {
  people: Record<string, AvatarInfo>;
  showLabels?: boolean;
  /**
   * Traders to leave out of the room.
   *
   * Exists for exactly one case: while you are walking the hall, you are not
   * also sitting in it. A figure labelled "You" that you can walk up to and
   * look at is a second you, and the illusion the walk mode is buying does not
   * survive meeting yourself.
   */
  hideIds?: readonly string[];
}) {
  return (
    <group>
      {AVATARS.map((slot) => {
        const info = people[slot.id];
        if (!info) return null;
        if (hideIds?.includes(slot.id)) return null;
        return (
          <Figure
            key={slot.id}
            info={info}
            position={slot.position}
            pose={slot.pose}
            facing={slot.facing}
            scale={slot.scale}
            phase={slot.phase}
            showLabel={showLabels}
          />
        );
      })}
    </group>
  );
}
