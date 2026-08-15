"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  ANCHORS,
  BAR,
  BEZEL,
  BOARD_FRAME,
  BOOTHS,
  CAMERA,
  CAMERA_DRIFT,
  COLUMNS,
  FLOOR,
  HALL,
  LIGHTS,
  NEON,
  PENDANTS,
  PODIUM,
  ROOM,
  SCREEN_LIGHT,
  TABLE,
  TABLES,
  TICKER_HOUSING,
  WALL_SCREENS,
} from "@/lib/hall";
import { GLOW, SURFACE } from "@/lib/palette";
import {
  bottleShelfTexture,
  carpetTexture,
  neonSignTexture,
  pressedTinTexture,
  repeatFor,
  wallScreenTexture,
  woodPanelTexture,
} from "./textures";

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

/* --------------------------------------------------------------- materials */

/**
 * Every material in the room, built once for the life of the page.
 *
 * Mesh count is cheap; material count is not. Each distinct material is a
 * shader program that has to be compiled, bound and fed the scene's whole
 * light list. A dozen materials across a hundred and fifty meshes costs a
 * fraction of a hundred and fifty materials, and the difference is invisible.
 *
 * Deliberately a module singleton rather than a hook. Six components in this
 * file need these, and a `useMemo` in each would have built six independent
 * sets — six copies of every generated texture, six of every shader — which is
 * the exact opposite of the point. A context would also work, but materials
 * are genuinely process-wide resources here and there is nothing to
 * parameterise them by.
 *
 * Nothing disposes them, and that is correct: they outlive every component
 * that uses them and are released when the page goes. A hot reload leaks one
 * set, which is a development cost, not a running one.
 */
let cached: HallMaterials | null = null;

function hallMaterials(): HallMaterials {
  if (cached) return cached;

  const panelMap = woodPanelTexture();
  const carpetMap = carpetTexture();
  const tinMap = pressedTinTexture();

  const solid = (color: string, roughness: number, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  cached = {
    /** Cloned per surface, so each can carry its own repeat. */
    panelMap,
    carpetMap,
    tinMap,
    /** Paint above the picture rail. Deep, and matte enough to stay quiet. */
    paint: solid(SURFACE.oxbloodDeep, 0.94, 0.02),
    walnut: solid(SURFACE.walnut, 0.72, 0.04),
    walnutDeep: solid(SURFACE.walnutDeep, 0.78, 0.04),
    walnutDark: solid(SURFACE.walnutDark, 0.82, 0.04),
    /** Brass: rails, banding, table bases, screen bezels. */
    brass: new THREE.MeshStandardMaterial({
      color: SURFACE.brass,
      roughness: 0.32,
      metalness: 0.92,
    }),
    brassDeep: new THREE.MeshStandardMaterial({
      color: SURFACE.brassDeep,
      roughness: 0.44,
      metalness: 0.85,
    }),
    leather: solid(SURFACE.leather, 0.66, 0.06),
    felt: solid(SURFACE.felt, 0.9, 0.02),
    /** Lamp globes. Unlit, so the bloom pass can find them. */
    lamp: new THREE.MeshBasicMaterial({ color: GLOW.tungsten, toneMapped: false }),
  };
  return cached;
}

interface HallMaterials {
  panelMap: THREE.Texture;
  carpetMap: THREE.Texture;
  tinMap: THREE.Texture;
  paint: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
  walnutDeep: THREE.MeshStandardMaterial;
  walnutDark: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  brassDeep: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  felt: THREE.MeshStandardMaterial;
  lamp: THREE.MeshBasicMaterial;
}

/** Clone the shared map so this surface can carry its own repeat. */
function tiled(map: THREE.Texture, widthMetres: number, heightMetres: number) {
  return repeatFor(map.clone(), widthMetres, heightMetres);
}

/* ------------------------------------------------------------------- room */

/**
 * The shell.
 *
 * Carpet, walnut panelling to a brass picture rail, dark paint above, a
 * pressed tin ceiling. It used to be a station platform — glazed tile, poured
 * concrete, a painted safety line — and the change is not a reskin so much as
 * a different building. A tiled wall with a bar in front of it reads as a
 * station that happens to have a bar in it.
 */
export function Room() {
  const { width, height, depth, backWallZ } = HALL;
  const midZ = backWallZ + depth / 2;
  const panelH = ROOM.panelHeight;
  const upperH = height - panelH;
  const m = hallMaterials();

  // Each surface gets its own clone, because the repeat lives on the texture
  // and a shared one would mean the floor and the walls fighting over it.
  const maps = useMemo(
    () => ({
      carpet: tiled(m.carpetMap, width, depth),
      ceiling: tiled(m.tinMap, width, depth),
      backPanel: tiled(m.panelMap, width, panelH),
      sidePanel: tiled(m.panelMap, depth, panelH),
    }),
    [m, width, depth, panelH],
  );

  useEffect(() => () => Object.values(maps).forEach((map) => map.dispose()), [maps]);

  return (
    <group>
      {/* The floor. Carpet, and the reason the scene got faster and prettier
          in the same change — see FLOOR. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          map={maps.carpet}
          roughness={FLOOR.roughness}
          metalness={FLOOR.metalness}
        />
      </mesh>

      <BackWall materials={m} panelMap={maps.backPanel} />

      {/* Side walls, turned inward: panelling, rail, paint. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[(side * width) / 2, panelH / 2, midZ]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
            receiveShadow
          >
            <planeGeometry args={[depth, panelH]} />
            <meshStandardMaterial map={maps.sidePanel} roughness={0.72} metalness={0.05} />
          </mesh>
          {/* The picture rail. One bright line at eye level, running the length
              of the room — it does more for the sense of a finished interior
              than anything else here, and it is a single box. */}
          <mesh
            position={[side * (width / 2 - ROOM.rail.depth / 2), panelH, midZ]}
            material={m.brass}
          >
            <boxGeometry args={[ROOM.rail.depth, ROOM.rail.height, depth]} />
          </mesh>
          <mesh
            position={[(side * width) / 2, panelH + upperH / 2, midZ]}
            rotation={[0, (-side * Math.PI) / 2, 0]}
            material={m.paint}
          >
            <planeGeometry args={[depth, upperH]} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, height, midZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={maps.ceiling} roughness={0.7} metalness={0.35} />
      </mesh>

      <Beams materials={m} />
      <Columns materials={m} />
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
function BackWall({
  materials: m,
  panelMap,
}: {
  materials: HallMaterials;
  panelMap: THREE.Texture;
}) {
  const { width, height, backWallZ } = HALL;
  const openW = BOARD_FRAME.width;
  const openH = BOARD_FRAME.height;
  const [, ay] = ANCHORS.board.position;
  const openTop = ay + openH / 2;
  const openBottom = ay - openH / 2;
  const reveal = BOARD_FRAME.reveal;
  const sideW = (width - openW) / 2;

  return (
    <group>
      <mesh
        position={[0, openTop + (height - openTop) / 2, backWallZ]}
        material={m.paint}
        receiveShadow
      >
        <planeGeometry args={[width, height - openTop]} />
      </mesh>
      {/* Below the opening is the only part of this wall low enough to be
          panelled, and it is the strip the sill sits against. */}
      <mesh position={[0, openBottom / 2, backWallZ]} receiveShadow>
        <planeGeometry args={[width, openBottom]} />
        <meshStandardMaterial map={panelMap} roughness={0.72} metalness={0.05} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(side * (openW + sideW)) / 2, ay, backWallZ]}
          material={m.paint}
          receiveShadow
        >
          <planeGeometry args={[sideW, openH]} />
        </mesh>
      ))}

      {/* Reveals: the wall's own thickness, lining the opening. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`v${side}`}
          position={[(side * openW) / 2, ay, backWallZ + reveal / 2]}
          rotation={[0, (-side * Math.PI) / 2, 0]}
          material={m.walnutDeep}
          receiveShadow
        >
          <planeGeometry args={[reveal, openH]} />
        </mesh>
      ))}
      <mesh
        position={[0, openTop, backWallZ + reveal / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={m.walnutDeep}
        receiveShadow
      >
        <planeGeometry args={[openW, reveal]} />
      </mesh>
      <mesh
        position={[0, openBottom, backWallZ + reveal / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={m.walnutDeep}
        receiveShadow
      >
        <planeGeometry args={[openW, reveal]} />
      </mesh>

      {/* The recess's own back face, behind the screen. */}
      <mesh position={[0, ay, backWallZ]} material={m.walnutDark}>
        <planeGeometry args={[openW, openH]} />
      </mesh>
    </group>
  );
}

/** Exposed beams across the ceiling, in stained timber rather than steel. */
function Beams({ materials: m }: { materials: HallMaterials }) {
  const positions = useMemo(
    () =>
      Array.from(
        { length: ROOM.beams.count },
        (_, i) => ROOM.beams.startZ + i * ROOM.beams.spacing,
      ),
    [],
  );

  return (
    <group>
      {positions.map((z, index) => (
        <mesh
          key={index}
          position={[0, HALL.height - ROOM.beams.drop / 2, z]}
          material={m.walnutDark}
        >
          <boxGeometry args={[HALL.width, ROOM.beams.drop, ROOM.beams.depth]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Columns down both sides, now panelled with brass banding.
 *
 * The single biggest depth cue in the scene: repetition receding into haze is
 * what makes a space read as long. Without them the side walls are two flat
 * planes and the room has no length at all.
 */
function Columns({ materials: m }: { materials: HallMaterials }) {
  const positions = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < COLUMNS.count; i += 1) {
      const z = COLUMNS.startZ + i * COLUMNS.spacing;
      out.push([-HALL.width / 2 + COLUMNS.inset, 0, z]);
      out.push([HALL.width / 2 - COLUMNS.inset, 0, z]);
    }
    return out;
  }, []);

  return (
    <group>
      {positions.map((position, index) => (
        <group key={index} position={position}>
          <mesh position={[0, HALL.height / 2, 0]} material={m.walnutDeep}>
            <boxGeometry args={[COLUMNS.size, HALL.height, COLUMNS.size]} />
          </mesh>
          {/* Two bands of brass. They catch the coves and give each column a
              highlight, which is what stops a row of them reading as posts. */}
          {[ROOM.panelHeight, 0.34].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={m.brass}>
              <boxGeometry args={[COLUMNS.size + 0.05, 0.09, COLUMNS.size + 0.05]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------- fittings */

/**
 * Everything that makes it a bar rather than a hall.
 *
 * Almost all of it is emissive geometry and boxes. The room reads as "lit by
 * many small warm sources" from the *sight* of them; only a handful are real
 * lights, because every real light is paid for by every material in the scene,
 * per fragment, on every frame.
 */
export function Fittings() {
  const m = hallMaterials();
  return (
    <group>
      <Bar materials={m} />
      <Booths materials={m} />
      <HighTables materials={m} />
      <WallScreens materials={m} />
      <NeonSign />
    </group>
  );
}

/**
 * The bar: counter, foot rail, stools and a backlit shelf of bottles.
 *
 * The shelf is doing most of the work. It is the only lit thing in the room at
 * standing height and the only place with real colour saturation in it, which
 * makes it the thing the eye goes to after the board — exactly as it would in
 * the real room.
 */
function Bar({ materials: m }: { materials: HallMaterials }) {
  const length = BAR.to - BAR.from;
  const midZ = (BAR.from + BAR.to) / 2;

  const bottles = useMemo(() => bottleShelfTexture(), []);
  useEffect(() => () => bottles.dispose(), [bottles]);

  const stools = useMemo(() => {
    const out: number[] = [];
    for (let z = BAR.stools.from; z <= BAR.stools.to; z += BAR.stools.spacing) out.push(z);
    return out;
  }, []);

  return (
    <group>
      {/* Counter body and a darker top. */}
      <mesh
        position={[BAR.x, BAR.counterHeight / 2, midZ]}
        material={m.walnut}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[BAR.counterDepth, BAR.counterHeight, length]} />
      </mesh>
      <mesh position={[BAR.x, BAR.counterHeight + 0.03, midZ]} material={m.walnutDark}>
        <boxGeometry args={[BAR.counterDepth + 0.16, 0.06, length + 0.16]} />
      </mesh>

      {/* The brass foot rail. Nothing else says "bar" as fast from across a
          room, and it is one cylinder. */}
      <mesh
        position={[BAR.x + BAR.footRail.offset, BAR.footRail.y, midZ]}
        rotation={[Math.PI / 2, 0, 0]}
        material={m.brass}
      >
        <cylinderGeometry args={[BAR.footRail.radius, BAR.footRail.radius, length, 8]} />
      </mesh>

      {/* Back bar: a dark case against the wall, with the lit shelf inside it. */}
      <mesh
        position={[BAR.wallX + 0.18, (BAR.shelf.top + BAR.shelf.bottom) / 2, midZ]}
        material={m.walnutDark}
      >
        <boxGeometry args={[0.36, BAR.shelf.top - BAR.shelf.bottom + 0.5, length]} />
      </mesh>
      <mesh
        position={[BAR.wallX + 0.37, (BAR.shelf.top + BAR.shelf.bottom) / 2, midZ]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[length, BAR.shelf.top - BAR.shelf.bottom]} />
        <meshBasicMaterial map={bottles} toneMapped={false} />
      </mesh>
      {/* One real light for the whole bar, sitting in front of the bottles. */}
      <pointLight
        position={[BAR.wallX + 1.4, BAR.shelf.top - 0.4, midZ]}
        color={GLOW.bottles}
        intensity={45}
        distance={18}
      />

      {stools.map((z) => (
        <group key={z} position={[BAR.stools.x, 0, z]}>
          <mesh position={[0, BAR.stools.seatHeight, 0]} material={m.leather} castShadow>
            <cylinderGeometry args={[0.19, 0.19, 0.09, 12]} />
          </mesh>
          <mesh position={[0, BAR.stools.seatHeight / 2, 0]} material={m.brassDeep}>
            <cylinderGeometry args={[0.045, 0.045, BAR.stools.seatHeight, 8]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} material={m.brassDeep}>
            <cylinderGeometry args={[0.21, 0.21, 0.05, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Booths down the opposite wall, so the two runs converge on the board. */
function Booths({ materials: m }: { materials: HallMaterials }) {
  return (
    <group>
      {BOOTHS.z.map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-1, 1].map((side) => (
            <group key={side} position={[0, 0, (side * BOOTHS.width) / 2]}>
              <mesh
                position={[BOOTHS.x, BOOTHS.seatHeight, 0]}
                material={m.leather}
                castShadow
              >
                <boxGeometry args={[2.2, 0.14, 0.62]} />
              </mesh>
              <mesh
                position={[BOOTHS.x, BOOTHS.seatHeight / 2, 0]}
                material={m.walnutDeep}
              >
                <boxGeometry args={[2.2, BOOTHS.seatHeight, 0.6]} />
              </mesh>
              {/* The high back. Booths are mostly back, seen from across a room. */}
              <mesh
                position={[
                  BOOTHS.x,
                  BOOTHS.seatHeight + BOOTHS.backHeight / 2,
                  side * 0.32,
                ]}
                material={m.leather}
                castShadow
              >
                <boxGeometry args={[2.2, BOOTHS.backHeight, 0.16]} />
              </mesh>
            </group>
          ))}
          <mesh position={[BOOTHS.x, BOOTHS.tableHeight, 0]} material={m.walnutDark}>
            <boxGeometry args={[1.6, 0.07, 0.9]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * High tables, and the lamps over them.
 *
 * Kept out of the middle of the room. The tables could not block the board
 * anyway — they sit below the camera's eye line, so they always project below
 * it — but the pendants hang above eye level and can, which is why their
 * placement is asserted in `lib/hall.test.ts` rather than eyeballed.
 */
function HighTables({ materials: m }: { materials: HallMaterials }) {
  return (
    <group>
      {TABLES.map((table, index) => (
        <group key={index} position={[table.position[0], 0, table.position[2]]}>
          <mesh position={[0, TABLE.height, 0]} material={m.walnutDark} castShadow>
            <cylinderGeometry args={[TABLE.topRadius, TABLE.topRadius, TABLE.topThickness, 16]} />
          </mesh>
          <mesh position={[0, TABLE.height / 2, 0]} material={m.brassDeep}>
            <cylinderGeometry args={[TABLE.columnRadius, TABLE.columnRadius, TABLE.height, 8]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} material={m.brassDeep}>
            <cylinderGeometry args={[TABLE.baseRadius, TABLE.baseRadius, 0.06, 16]} />
          </mesh>

          {table.pendant && (
            <group position={[0, PENDANTS.y, 0]}>
              {/* Flex up to the ceiling, so the lamp is hung rather than floating. */}
              <mesh
                position={[0, (HALL.height - PENDANTS.y) / 2, 0]}
                material={m.brassDeep}
              >
                <cylinderGeometry args={[0.012, 0.012, HALL.height - PENDANTS.y, 5]} />
              </mesh>
              <mesh material={m.brass}>
                <coneGeometry
                  args={[PENDANTS.shadeRadius, PENDANTS.shadeHeight, 14, 1, true]}
                />
              </mesh>
              <mesh position={[0, -PENDANTS.shadeHeight / 2, 0]} material={m.lamp}>
                <sphereGeometry args={[PENDANTS.globeRadius, 8, 6]} />
              </mesh>
              {index % PENDANTS.lightEvery === 0 && (
                <pointLight
                  position={[0, -0.25, 0]}
                  color={LIGHTS.pendant.color}
                  intensity={LIGHTS.pendant.intensity}
                  distance={LIGHTS.pendant.distance}
                />
              )}
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * Screens on the side walls.
 *
 * The cool counterpoint the palette depends on. Every surface in this room is
 * amber, oxblood or brass; without something blue-white to be warm *against*,
 * the whole thing is monochrome again in a nicer hue. These are also the only
 * things in the room besides the board with information on them.
 */
function WallScreens({ materials: m }: { materials: HallMaterials }) {
  const screens = useMemo(() => {
    const out: { key: string; x: number; z: number; rotation: number; map: THREE.Texture }[] =
      [];
    let i = 0;
    for (const side of [-1, 1]) {
      for (const z of WALL_SCREENS.z) {
        out.push({
          key: `${side}:${z}`,
          x: side * (HALL.width / 2 - WALL_SCREENS.inset),
          z,
          rotation: (-side * Math.PI) / 2,
          map: wallScreenTexture(i + 1, WALL_SCREENS.labels[i % WALL_SCREENS.labels.length]),
        });
        i += 1;
      }
    }
    return out;
  }, []);

  useEffect(() => () => screens.forEach((s) => s.map.dispose()), [screens]);

  return (
    <group>
      {screens.map((screen) => (
        <group
          key={screen.key}
          position={[screen.x, WALL_SCREENS.y, screen.z]}
          rotation={[0, screen.rotation, 0]}
        >
          <mesh material={m.brassDeep}>
            <boxGeometry
              args={[
                WALL_SCREENS.width + WALL_SCREENS.bezel,
                WALL_SCREENS.height + WALL_SCREENS.bezel,
                0.07,
              ]}
            />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[WALL_SCREENS.width, WALL_SCREENS.height]} />
            <meshBasicMaterial map={screen.map} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** One neon sign above the bar. Punctuation — a wall of it is a theme pub. */
function NeonSign() {
  const map = useMemo(() => neonSignTexture(NEON.text, GLOW.neonPink), []);
  useEffect(() => () => map.dispose(), [map]);

  return (
    <mesh position={[...NEON.position]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[NEON.width, NEON.height]} />
      <meshBasicMaterial
        map={map}
        transparent
        toneMapped={false}
        depthWrite={false}
        // Additive, because neon adds light to whatever is behind it rather
        // than covering it. It is also what lets the bloom pass eat it.
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ----------------------------------------------------------------- lights */

/**
 * The screen, treated as a light.
 *
 * A large bright rectangle in a wall lights what is in front of it. In a room
 * this warm it is also the main source of cool light at floor level, which is
 * what keeps the near tables and the nearest faces from going entirely amber.
 */
export function ScreenLight() {
  const [ax, ay, az] = ANCHORS.board.position;
  return (
    <group>
      <pointLight
        position={[ax, ay, az + SCREEN_LIGHT.offsetZ]}
        color={SCREEN_LIGHT.color}
        intensity={SCREEN_LIGHT.intensity}
        distance={SCREEN_LIGHT.distance}
      />
      <pointLight
        position={[ax, ay, az + 0.35]}
        color={SCREEN_LIGHT.reveal.color}
        intensity={SCREEN_LIGHT.reveal.intensity}
        distance={SCREEN_LIGHT.reveal.distance}
      />
    </group>
  );
}

export function Lights() {
  const keyRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useFrame(() => {
    if (keyRef.current && targetRef.current) {
      keyRef.current.target = targetRef.current;
    }
  });

  const coves = useMemo(() => {
    const { count, startZ, spacing } = LIGHTS.coves;
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

      {/* Cool rim behind the frame, so the housing separates from the wall.
          The one cool light in the room, and deliberately so. */}
      <pointLight
        position={[...LIGHTS.rim.position]}
        intensity={LIGHTS.rim.intensity}
        color={LIGHTS.rim.color}
        distance={LIGHTS.rim.distance}
      />

      {/* Cove lighting down both walls. Every one glows; every third is real. */}
      {coves.map((z, index) =>
        [-1, 1].map((side) => (
          <group
            key={`${index}:${side}`}
            position={[side * LIGHTS.coves.offsetX, LIGHTS.coves.y, z]}
          >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[...LIGHTS.coves.size]} />
              <meshBasicMaterial color={LIGHTS.coves.color} toneMapped={false} />
            </mesh>
            {index % LIGHTS.coves.lightEvery === 0 && side === 1 && (
              <pointLight
                intensity={LIGHTS.coves.intensity}
                color={LIGHTS.coves.color}
                distance={LIGHTS.coves.distance}
                position={[-LIGHTS.coves.offsetX, -0.6, 0]}
              />
            )}
          </group>
        )),
      )}
    </group>
  );
}

/* ---------------------------------------------------------------- housing */

/**
 * The surround inside the opening.
 *
 * Four bars, deep enough to swallow the whole assembly: the drums at the back,
 * the pane near the front. If the bars ever stop reaching past the glass, the
 * glass reads as a sheet stuck on the front of the frame instead of a window
 * into it — see BEZEL.
 */
export function BoardHousing({ children }: { children?: React.ReactNode }) {
  const { width, height, bezel } = BOARD_FRAME;
  const [ax, ay, az] = ANCHORS.board.position;
  const { z, depth } = BEZEL;
  const m = hallMaterials();

  return (
    <group position={[ax, ay, az]}>
      <mesh position={[0, height / 2 - bezel / 2, z]} material={m.brassDeep}>
        <boxGeometry args={[width, bezel, depth]} />
      </mesh>
      <mesh position={[0, -height / 2 + bezel / 2, z]} material={m.brassDeep}>
        <boxGeometry args={[width, bezel, depth]} />
      </mesh>
      <mesh position={[-width / 2 + bezel / 2, 0, z]} material={m.brassDeep}>
        <boxGeometry args={[bezel, height, depth]} />
      </mesh>
      <mesh position={[width / 2 - bezel / 2, 0, z]} material={m.brassDeep}>
        <boxGeometry args={[bezel, height, depth]} />
      </mesh>

      {children}
    </group>
  );
}

/** A slim sill along the bottom of the opening. */
export function TickerHousing() {
  const [tx, ty, tz] = ANCHORS.ticker.position;
  const m = hallMaterials();
  return (
    <mesh position={[tx, ty, tz]} material={m.brassDeep} castShadow>
      <boxGeometry args={[TICKER_HOUSING.width, TICKER_HOUSING.height, TICKER_HOUSING.depth]} />
    </mesh>
  );
}

/**
 * Three steps, off to one side. The leaderboard lands here in step 8.
 *
 * Brass nosing along the top edge of each one, and that single strip is the
 * whole difference between a podium and three crates. Unedged, in a dark
 * material, at this distance, they read as packing cases someone left on the
 * floor — which is exactly what the first render of this room showed.
 */
export function Podium() {
  const m = hallMaterials();
  const nose = 0.06;
  return (
    <group>
      {ANCHORS.podium.map((step) => (
        <group key={step.name} position={[step.position[0], 0, step.position[2]]}>
          <mesh position={[0, step.height / 2, 0]} material={m.walnutDeep} castShadow>
            <boxGeometry args={[PODIUM.stepWidth, step.height, PODIUM.stepDepth]} />
          </mesh>
          <mesh position={[0, step.height + nose / 2, 0]} material={m.brass}>
            <boxGeometry args={[PODIUM.stepWidth + 0.07, nose, PODIUM.stepDepth + 0.07]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
