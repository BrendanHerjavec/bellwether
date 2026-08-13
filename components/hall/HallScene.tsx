"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import {
  ANCHORS,
  BOARD_FRAME,
  CAMERA,
  CAMERA_DRIFT,
  COLUMNS,
  FLOOR,
  HALL,
  LIGHTS,
  PODIUM,
  SEATING,
  STATION,
  TICKER_HOUSING,
} from "@/lib/hall";
import { concreteTexture, repeatFor, subwayTileTexture } from "./textures";

/* ------------------------------------------------------------------ camera */

/**
 * A float, not a camera move.
 *
 * Two degrees of drift on periods that do not divide into each other, so the
 * path never visibly loops. This is the single cheapest thing that stops a 3D
 * scene reading as a still render — a perfectly locked frame looks like an
 * image, and a frame that breathes looks like a place.
 */
export function CameraDrift() {
  const target = useMemo(() => new THREE.Vector3(...CAMERA.target), []);
  const base = useMemo(() => new THREE.Vector3(...CAMERA.position), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const [ax, ay] = CAMERA_DRIFT.amplitude;
    const [px, py] = CAMERA_DRIFT.period;
    state.camera.position.set(
      base.x + Math.sin((t / px) * Math.PI * 2) * ax,
      base.y + Math.sin((t / py) * Math.PI * 2 + 1.1) * ay,
      base.z,
    );
    state.camera.lookAt(target);
  });

  return null;
}

/* ------------------------------------------------------------------- room */

/**
 * The platform.
 *
 * Tiled to head height with plain render above, exactly as most stations are
 * built. The tile is doing enormous work here — it is the difference between a
 * dark room with a screen in it and somewhere you recognise.
 */
export function Room() {
  const { width, height, depth, backWallZ } = HALL;
  const midZ = backWallZ + depth / 2;
  const tileH = STATION.tileHeight;
  const upperH = height - tileH;

  // Generated once. Cloned per surface so each can carry its own repeat.
  const tile = useMemo(() => subwayTileTexture(4), []);
  const concrete = useMemo(() => concreteTexture(8), []);

  const backTile = useMemo(() => repeatFor(tile.clone(), width, tileH), [tile, width, tileH]);
  const sideTile = useMemo(() => repeatFor(tile.clone(), depth, tileH), [tile, depth, tileH]);
  const ceilingMap = useMemo(
    () => repeatFor(concrete.clone(), width, depth),
    [concrete, width, depth],
  );

  const renderMaterial = (
    <meshStandardMaterial color="#3b4048" roughness={0.95} metalness={0.02} />
  );

  return (
    <group>
      {/* Floor. The reflection is what sells the whole hall, so it gets the
          only expensive material in the scene. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <MeshReflectorMaterial
          blur={[...FLOOR.blur]}
          resolution={FLOOR.resolution}
          mixBlur={FLOOR.mixBlur}
          mixStrength={FLOOR.mixStrength}
          roughness={FLOOR.roughness}
          depthScale={FLOOR.depthScale}
          minDepthThreshold={FLOOR.minDepthThreshold}
          maxDepthThreshold={FLOOR.maxDepthThreshold}
          color={FLOOR.color}
          metalness={FLOOR.metalness}
        />
      </mesh>

      {/* The painted safety line. One stripe, and the floor becomes a platform. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, STATION.safetyLine.z]}
      >
        <planeGeometry args={[width, STATION.safetyLine.width]} />
        <meshStandardMaterial
          color={STATION.safetyLine.color}
          roughness={0.75}
          emissive={STATION.safetyLine.color}
          emissiveIntensity={0.12}
        />
      </mesh>

      {/*
        Back wall, built as four panels around a real opening.
        A single flat plane with the board hovering in front of it is what made
        the screen look composited in from another scene.
      */}
      <BackWall tileMap={backTile} />
      {/* Tiled dado continues across the wall below the opening. */}
      <mesh position={[0, tileH / 2, backWallZ - 0.001]} receiveShadow>
        <planeGeometry args={[width, tileH]} />
        <meshStandardMaterial map={backTile} roughness={0.42} metalness={0.04} />
      </mesh>

      {/* Side walls, turned inward. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[(side * width) / 2, tileH / 2, midZ]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
            receiveShadow
          >
            <planeGeometry args={[depth, tileH]} />
            <meshStandardMaterial map={sideTile} roughness={0.42} metalness={0.04} />
          </mesh>
          <mesh
            position={[(side * width) / 2, tileH + upperH / 2, midZ]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
          >
            <planeGeometry args={[depth, upperH]} />
            {renderMaterial}
          </mesh>
        </group>
      ))}

      {/* Ceiling. */}
      <mesh position={[0, height, midZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={ceilingMap} color="#1b1e25" roughness={0.98} />
      </mesh>

      <Beams />
      <Columns />
      <Benches />
      <SeatingRows />
    </group>
  );
}

/**
 * Rows of seating facing the screen.
 *
 * Continuous benches rather than individual chairs — invisible at this
 * distance, and three meshes a row instead of fifty. Their real job is to
 * explain why everybody is sitting down, which is what keeps every head below
 * the camera's eye line and the screen clear of faces.
 */
function SeatingRows() {
  return (
    <group>
      {SEATING.rows.map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, SEATING.seatHeight, 0]} castShadow receiveShadow>
            <boxGeometry args={[SEATING.width, 0.11, SEATING.depth]} />
            <meshStandardMaterial color="#2b2f37" roughness={0.62} metalness={0.3} />
          </mesh>
          <mesh
            position={[0, SEATING.seatHeight + SEATING.backHeight / 2, -SEATING.depth / 2]}
            rotation={[0.16, 0, 0]}
            castShadow
          >
            <boxGeometry args={[SEATING.width, SEATING.backHeight, 0.09]} />
            <meshStandardMaterial color="#2b2f37" roughness={0.62} metalness={0.3} />
          </mesh>
          <mesh position={[0, SEATING.seatHeight / 2, 0]}>
            <boxGeometry args={[SEATING.width, SEATING.seatHeight, 0.12]} />
            <meshStandardMaterial color="#1b1f26" roughness={0.8} metalness={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * The back wall, with a hole in it.
 *
 * Four panels around the opening plus four reveals lining its inside faces.
 * The reveals are the point: they catch the key light along one edge and drop
 * the opposite edge into shadow, which is what tells the eye the screen is
 * recessed into the building rather than hanging on it.
 */
function BackWall({ tileMap }: { tileMap: THREE.Texture }) {
  const { width, height, backWallZ } = HALL;
  const openW = BOARD_FRAME.width;
  const openH = BOARD_FRAME.height;
  const [, ay] = ANCHORS.board.position;
  const openTop = ay + openH / 2;
  const openBottom = ay - openH / 2;
  const reveal = BOARD_FRAME.reveal;

  const wall = (
    <meshStandardMaterial color="#3b4048" roughness={0.95} metalness={0.02} />
  );
  const revealMat = (
    <meshStandardMaterial color="#2a2e35" roughness={0.7} metalness={0.15} />
  );

  const sideW = (width - openW) / 2;

  return (
    <group>
      {/* Above the opening. */}
      <mesh position={[0, openTop + (height - openTop) / 2, backWallZ]} receiveShadow>
        <planeGeometry args={[width, height - openTop]} />
        {wall}
      </mesh>
      {/* Below the opening. */}
      <mesh position={[0, openBottom / 2, backWallZ]} receiveShadow>
        <planeGeometry args={[width, openBottom]} />
        {wall}
      </mesh>
      {/* Either side of the opening. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(side * (openW + sideW)) / 2, ay, backWallZ]}
          receiveShadow
        >
          <planeGeometry args={[sideW, openH]} />
          {wall}
        </mesh>
      ))}

      {/* Reveals: the wall's own thickness, lining the opening. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`v${side}`}
          position={[(side * openW) / 2, ay, backWallZ + reveal / 2]}
          rotation={[0, (-side * Math.PI) / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={[reveal, openH]} />
          {revealMat}
        </mesh>
      ))}
      <mesh
        position={[0, openTop, backWallZ + reveal / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[openW, reveal]} />
        {revealMat}
      </mesh>
      <mesh
        position={[0, openBottom, backWallZ + reveal / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[openW, reveal]} />
        {revealMat}
      </mesh>

      {/* The recess's own back face, behind the screen. */}
      <mesh position={[0, ay, backWallZ]}>
        <planeGeometry args={[openW, openH]} />
        <meshStandardMaterial map={tileMap} color="#0a0c10" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Exposed structural beams across the ceiling, receding down the platform. */
function Beams() {
  const positions = useMemo(
    () =>
      Array.from(
        { length: STATION.beams.count },
        (_, i) => STATION.beams.startZ + i * STATION.beams.spacing,
      ),
    [],
  );

  return (
    <group>
      {positions.map((z, index) => (
        <mesh key={index} position={[0, HALL.height - STATION.beams.drop / 2, z]}>
          <boxGeometry args={[HALL.width, STATION.beams.drop, STATION.beams.depth]} />
          <meshStandardMaterial color="#232730" roughness={0.82} metalness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** Platform benches. Nobody sits on them; they say "you wait here". */
function Benches() {
  return (
    <group>
      {STATION.benches.map((bench, index) => (
        <group
          key={index}
          position={[bench.position[0], 0, bench.position[2]]}
          rotation={[0, bench.rotation, 0]}
        >
          <mesh position={[0, 0.46, 0]} castShadow>
            <boxGeometry args={[3.2, 0.12, 0.62]} />
            <meshStandardMaterial color="#2d3138" roughness={0.6} metalness={0.35} />
          </mesh>
          <mesh position={[0, 0.78, -0.26]} rotation={[0.22, 0, 0]}>
            <boxGeometry args={[3.2, 0.5, 0.09]} />
            <meshStandardMaterial color="#2d3138" roughness={0.6} metalness={0.35} />
          </mesh>
          {[-1.35, 1.35].map((x) => (
            <mesh key={x} position={[x, 0.23, 0]}>
              <boxGeometry args={[0.12, 0.46, 0.5]} />
              <meshStandardMaterial color="#1c2027" roughness={0.7} metalness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * Structural columns down both sides.
 *
 * Repetition receding into haze is what makes a space read as long. Without
 * them the side walls are two flat planes and the hall has no depth cue at all.
 */
function Columns() {
  const positions = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < COLUMNS.count; i += 1) {
      const z = COLUMNS.startZ + i * COLUMNS.spacing;
      out.push([-HALL.width / 2 + COLUMNS.inset, HALL.height / 2, z]);
      out.push([HALL.width / 2 - COLUMNS.inset, HALL.height / 2, z]);
    }
    return out;
  }, []);

  return (
    <group>
      {positions.map((position, index) => (
        <mesh key={index} position={position}>
          <boxGeometry args={[COLUMNS.size, HALL.height, COLUMNS.size]} />
          <meshStandardMaterial color="#181b23" roughness={0.9} metalness={0.12} />
        </mesh>
      ))}
    </group>
  );
}

/* ----------------------------------------------------------------- lights */

export function Lights() {
  const keyRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useFrame(() => {
    if (keyRef.current && targetRef.current) {
      keyRef.current.target = targetRef.current;
    }
  });

  const fixtures = useMemo(() => {
    const { count, startZ, spacing } = LIGHTS.fixtures;
    return Array.from({ length: count }, (_, i) => startZ + i * spacing);
  }, []);

  return (
    <group>
      <ambientLight intensity={LIGHTS.ambient.intensity} color={LIGHTS.ambient.color} />

      {/* Warm key from above and in front, aimed at the board. */}
      <object3D ref={targetRef} position={[...LIGHTS.key.target]} />
      <spotLight
        ref={keyRef}
        position={[...LIGHTS.key.position]}
        intensity={LIGHTS.key.intensity}
        color={LIGHTS.key.color}
        angle={LIGHTS.key.angle}
        penumbra={LIGHTS.key.penumbra}
        distance={LIGHTS.key.distance}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />

      {/* Cool rim behind the frame, so the housing separates from the wall. */}
      <pointLight
        position={[...LIGHTS.rim.position]}
        intensity={LIGHTS.rim.intensity}
        color={LIGHTS.rim.color}
        distance={LIGHTS.rim.distance}
      />

      {/* Practical fixtures receding toward the back wall. Each is an emissive
          plane the bloom pass can catch, plus a light that actually lights. */}
      {fixtures.map((z, index) => (
        <group key={index} position={[0, LIGHTS.fixtures.y, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[...LIGHTS.fixtures.size]} />
            <meshBasicMaterial color={LIGHTS.fixtures.color} toneMapped={false} />
          </mesh>
          <pointLight
            intensity={LIGHTS.fixtures.intensity}
            color={LIGHTS.fixtures.color}
            distance={LIGHTS.fixtures.distance}
            position={[0, -0.4, 0]}
          />
        </group>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- housing */

/**
 * The board housing: a brushed metal slab with a recess cut into its face.
 *
 * Built as a frame of four bars rather than a solid box with a boolean, so the
 * recess is real geometry that catches the key light along its inner edges.
 * That inner highlight is what makes the board look set *into* something.
 */
/**
 * The surround inside the opening.
 *
 * Slim, and sitting inside the wall's reveal rather than proud of it. The wall
 * itself now provides the depth, so this is only the dark border between the
 * masonry and the screen.
 */
export function BoardHousing({ children }: { children?: React.ReactNode }) {
  const { width, height, bezel } = BOARD_FRAME;
  const [ax, ay, az] = ANCHORS.board.position;

  const metal = (
    <meshStandardMaterial color="#22262e" roughness={0.5} metalness={0.8} />
  );

  return (
    <group position={[ax, ay, az]}>
      <mesh position={[0, height / 2 - bezel / 2, -0.02]}>
        <boxGeometry args={[width, bezel, 0.1]} />
        {metal}
      </mesh>
      <mesh position={[0, -height / 2 + bezel / 2, -0.02]}>
        <boxGeometry args={[width, bezel, 0.1]} />
        {metal}
      </mesh>
      <mesh position={[-width / 2 + bezel / 2, 0, -0.02]}>
        <boxGeometry args={[bezel, height, 0.1]} />
        {metal}
      </mesh>
      <mesh position={[width / 2 - bezel / 2, 0, -0.02]}>
        <boxGeometry args={[bezel, height, 0.1]} />
        {metal}
      </mesh>

      {children}
    </group>
  );
}

/** A slim sill along the bottom of the opening. */
export function TickerHousing() {
  const [tx, ty, tz] = ANCHORS.ticker.position;
  return (
    <mesh position={[tx, ty, tz]} castShadow>
      <boxGeometry args={[TICKER_HOUSING.width, TICKER_HOUSING.height, TICKER_HOUSING.depth]} />
      <meshStandardMaterial color="#262a33" roughness={0.5} metalness={0.8} />
    </mesh>
  );
}

/** Three steps, off to one side. The leaderboard lands here in step 8. */
export function Podium() {
  return (
    <group>
      {ANCHORS.podium.map((step) => (
        <mesh
          key={step.name}
          position={[step.position[0], step.height / 2, step.position[2]]}
        >
          <boxGeometry args={[PODIUM.stepWidth, step.height, PODIUM.stepDepth]} />
          <meshStandardMaterial color="#1d2029" roughness={0.6} metalness={0.35} />
        </mesh>
      ))}
    </group>
  );
}
