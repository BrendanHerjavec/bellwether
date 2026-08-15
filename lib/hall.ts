/**
 * The exchange hall, as numbers.
 *
 * Every dimension, light and camera value lives here rather than being spread
 * through the scene components. Two reasons: the whole look is a matter of
 * tuning these against each other, and the Blender blockout that checks the
 * proportions has to agree with the scene exactly — one file to compare, and
 * one file to change when the preview says the board is too small or the
 * ceiling too low.
 *
 * Units are metres. The hall is deliberately big: a departure hall, not a
 * meeting room, so the perspective has somewhere to run.
 */

import {
  BOARD_LAYOUT,
  BOARD_PANEL,
  BOARD_ROWS,
  boardPanelHeight,
  tapeRect,
} from "./board-layout";
import { AIR, GLOW } from "./palette";

export const HALL = {
  /**
   * Interior volume. Width runs x, height y, depth z toward the camera.
   *
   * The depth is set by where the camera has to stand, not by the room: at 34
   * the camera was outside the building looking in. A Blender blockout showed
   * the hall only reads as long once the camera is ~38m back from the board
   * with columns running past it on both sides.
   */
  /*
   * Platform proportions, not hall proportions.
   *
   * This was 44 x 16 x 56 and rendered as a cathedral: a 16m ceiling made the
   * figures look like ants, left a void of blank wall above the board, and
   * removed any sense of being in a station. Real platforms are low and wide,
   * and that low ceiling is most of why they feel like a platform.
   */
  width: 28,
  height: 10,
  depth: 44,

  /** The board is mounted on the back wall, which sits at negative z. */
  backWallZ: -17,
} as const;

/**
 * Structural columns down both sides.
 *
 * The single biggest depth cue in the scene. Without them the side walls are
 * two flat planes and the hall has no length — the first blockout render was
 * unmistakably a small screening room until these were added.
 */
export const COLUMNS = {
  count: 8,
  startZ: -13,
  spacing: 5.5,
  /** Distance in from each side wall. */
  inset: 1.4,
  size: 0.9,
} as const;

/**
 * Anchors. These are the contract with Blender: if a `.glb` is ever swapped in
 * at step 9, it carries empties with these names at these positions and nothing
 * in the React scene has to change.
 */
export const ANCHORS = {
  /**
   * Sat almost flush with the wall, not hung 0.42m proud of it.
   *
   * The board is now set into a real opening cut through the back wall, with
   * visible reveals down its sides. A panel floating in front of a flat wall
   * reads as a different scene composited on top — which is exactly what it
   * looked like.
   */
  board: {
    name: "board_anchor",
    position: [0, 5.4, HALL.backWallZ + 0.06] as const,
    rotation: [0, 0, 0] as const,
  },
  /**
   * A plinth below the frame, not the tape itself. The tape is DOM inside the
   * board so it stays crisp; this is the housing it appears to sit on.
   */
  /** A slim sill along the bottom of the opening, not a plinth on the floor. */
  ticker: {
    name: "ticker_anchor",
    position: [0, 2.06, HALL.backWallZ + 0.3] as const,
    rotation: [0, 0, 0] as const,
  },
  /**
   * Off to one side, but inside the camera frustum — a podium the camera never
   * sees is just polygons.
   *
   * Set deep into the room rather than near the camera: the frustum widens with
   * distance, so pushing the podium back is what buys the lateral room to place
   * it well off-centre and still have it in shot. Checked by the framing test.
   */
  podium: [
    { name: "podium_1", position: [7.6, 0, -12.0] as const, height: 1.2 },
    { name: "podium_2", position: [5.9, 0, -11.0] as const, height: 0.85 },
    { name: "podium_3", position: [9.3, 0, -11.0] as const, height: 0.55 },
  ],
} as const;

export const PODIUM = {
  stepWidth: 1.5,
  stepDepth: 1.5,
} as const;

/**
 * The board housing: a brushed metal frame with a recess the DOM board sits in.
 * Sized in metres to match the rendered pixel width of the board via BOARD.scale.
 */
/**
 * The opening cut through the back wall, and the reveals around it.
 *
 * `width`/`height` are the hole in the wall. The board sits inside it, set back
 * by `reveal`, so the wall's own thickness casts a shadow down one side of the
 * screen. That shadow is what makes it read as built into the building.
 */
export const BOARD_FRAME = {
  width: 13.0,
  height: 7.0,
  /** Wall thickness, and therefore how deep the board sits in the opening. */
  reveal: 0.55,
  /** Slim surround inside the opening, between the reveal and the screen. */
  bezel: 0.6,
} as const;

/**
 * The board as an object in the opening.
 *
 * It used to be a DOM layer composited over the canvas, and every number here
 * used to be about reconciling two coordinate systems that never really met.
 * Now it is a texture on a mesh, so there is only one: metres.
 *
 * The two z offsets are the whole "behind glass" effect. The drums sit at the
 * back of the opening and the pane sits near the front of the bezel, a good
 * seven centimetres apart — enough that walking past visibly slides the
 * reflection across the board. Collapse that gap and the glass becomes a decal.
 */
export const BOARD_SCREEN = {
  /** Clearance between the bezel and the edge of the panel. */
  inset: 0.06,
  /**
   * Where the drums sit, relative to the board anchor. Positive is toward the
   * room, and it needs to stay positive: the recess's own back face is only
   * 6cm behind the anchor, and a panel level with it z-fights.
   */
  depth: 0.02,
  /** Where the pane hangs. */
  glassZ: 0.1,
  /**
   * Texture pixels per design pixel.
   *
   * The crispness knob, and it is also the upload cost of every flip — the
   * whole texture goes to the GPU whenever a drum moves — which is why it is
   * not simply 2.
   *
   * It was 1.2 and is now 1. That is not a downgrade: the board's drums got
   * half again as wide when the question column dropped from forty positions to
   * twenty-eight, so each glyph is drawn across *more* texels than before at
   * the lower factor (31 rather than 28 for a question drum). Fewer, larger
   * drums buy resolution and cost less to upload at the same time. See
   * `BOARD_LAYOUT`.
   */
  textureScale: 1.0,
} as const;

/**
 * The surround inside the opening, as a box.
 *
 * Sized to contain the whole assembly rather than to look right on its own:
 * its back face must sit behind the drums and its front face in front of the
 * pane, so the glass reads as a window into the frame rather than a sheet
 * stuck on the front of it.
 */
export const BEZEL = {
  /** Centre, relative to the board anchor. */
  z: 0.06,
  depth: 0.2,
} as const;

/**
 * The board's footprint in world units.
 *
 * Derived, not chosen: the panel's proportions come from `board-layout.ts` and
 * it is fitted into the clear opening inside the bezel. The bug this shape of
 * thing catches is a board 12.03m tall inside a 9.9m opening, which is exactly
 * what a guessed scale produced the first time.
 */
export const BOARD = {
  pixelWidth: BOARD_PANEL.width,
  pixelHeight: BOARD_PANEL.height,
  metresPerPixel: boardGeometry(BOARD_ROWS).metresPerPixel,
} as const;

/**
 * Where the board's parts sit inside the opening, for a given market count.
 *
 * Fitted rather than scaled by a constant: a ninth market makes the panel
 * taller and it shrinks to suit, instead of growing out through its own
 * housing. `BoardScreen` sizes its meshes from this and nothing else, so what
 * the tests check here is what the room renders.
 */
export function boardGeometry(rows: number) {
  const panelWidth = BOARD_LAYOUT.designWidth;
  const panelHeight = boardPanelHeight(rows);
  const clearWidth = BOARD_FRAME.width - BOARD_FRAME.bezel * 2 - BOARD_SCREEN.inset * 2;
  const clearHeight = BOARD_FRAME.height - BOARD_FRAME.bezel * 2 - BOARD_SCREEN.inset * 2;
  const metresPerPixel = Math.min(clearWidth / panelWidth, clearHeight / panelHeight);

  const rect = tapeRect(rows);
  return {
    metresPerPixel,
    panel: [panelWidth * metresPerPixel, panelHeight * metresPerPixel] as const,
    tape: {
      width: rect.width * metresPerPixel,
      height: rect.height * metresPerPixel,
      x: (rect.x + rect.width / 2 - panelWidth / 2) * metresPerPixel,
      y: (panelHeight / 2 - (rect.y + rect.height / 2)) * metresPerPixel,
      designWidth: rect.width,
    },
  };
}

export const TICKER_HOUSING = {
  width: 13.0,
  height: 0.28,
  depth: 0.45,
} as const;

/**
 * Camera.
 *
 * A moderately wide lens: enough perspective that the hall has depth, not so
 * wide that the board bows at the edges. Positioned low and back, looking
 * slightly up — the angle you would actually see the board from standing in a
 * crowd, which is what makes the room read as occupied without modelling anyone.
 */
export const CAMERA = {
  /**
   * Chosen from a Blender blockout, not from arithmetic.
   *
   * Three distances were rendered. At 30m the board ate the frame and there was
   * no room around it — it read as a whiteboard on a wall. At 47m the columns
   * crowded in and the board lost its authority. This is the middle one: the
   * board fills about a third of the frame, which sounds small and is exactly
   * right, because the columns and the receding fixtures are doing the work of
   * making it feel like somewhere.
   *
   * Low and looking slightly up, the way you would see it standing in a crowd.
   */
  /*
   * Standing eye height, on the platform, among the crowd.
   *
   * 1.75m is the single most important number here. At 5.8m the camera floated
   * like a drone and the figures read as scenery below it; at eye height they
   * are the same size as you, some of them nearer than the board, and the shot
   * becomes a point of view rather than an establishing shot.
   */
  position: [0, 1.75, 8] as const,
  target: [0, 5.1, HALL.backWallZ + 0.06] as const,
  fov: 46,
  near: 0.1,
  far: 180,
} as const;

/**
 * Slow drift. Not a camera move — a float, a couple of degrees, so the frame is
 * never perfectly still. Stillness is what makes a 3D scene read as a render
 * rather than a place.
 */
export const CAMERA_DRIFT = {
  amplitude: [0.55, 0.28] as const,
  /** Seconds per cycle on each axis; deliberately not multiples of each other,
   *  so the path never visibly repeats. */
  period: [23, 17] as const,
} as const;

/**
 * Tungsten, and not much of it.
 *
 * The ambient was `#8b97ad` at 0.42 — a cool grey fill laid over every surface
 * in the room, and between it and a cool fog it was quietly cancelling the one
 * warm light in the scene. Now the fill is warm bounce off carpet and wood,
 * which is what it would actually be.
 *
 * The room is lit by many small warm sources, and almost none of them are real
 * lights. Every material loops over every light per fragment; a pendant lamp
 * that is an emissive globe costs nothing, and four of the eight being real is
 * indistinguishable from all eight.
 */
export const LIGHTS = {
  ambient: { intensity: 0.78, color: AIR.ambient },
  key: {
    position: [0, 8.8, 1.5] as const,
    target: [0, 5.4, HALL.backWallZ] as const,
    intensity: 170,
    color: GLOW.tungsten,
    angle: 0.78,
    penumbra: 0.9,
    distance: 58,
  },
  /**
   * Cool rim from behind the board, separating the frame from the wall.
   *
   * The one cool light in the room, and it stays cool deliberately: everything
   * warm reads warmer for having something to be warm *against*.
   */
  rim: {
    position: [0, 6.8, HALL.backWallZ - 1.5] as const,
    intensity: 26,
    color: "#6f96d6",
    distance: 24,
  },
  /**
   * Cove lighting down both side walls, receding toward the board.
   *
   * This was a row of station strip lights down the centre of the ceiling. Two
   * runs tucked against the walls do the same job for depth — repetition
   * vanishing into haze is what makes a room read as long — and they do it
   * without hanging anything across the sightline to the board.
   */
  coves: {
    count: 9,
    startZ: -15,
    spacing: 4.6,
    y: HALL.height - 1.5,
    offsetX: 9.4,
    intensity: 88,
    color: GLOW.lampWarm,
    distance: 26,
    size: [0.5, 3.4] as const,
    /** Only every third cove is a real light. See the note above. */
    lightEvery: 3,
  },
  /** Per pendant lamp. Only some of them are real; see PENDANTS.lightEvery. */
  pendant: {
    intensity: 30,
    color: GLOW.tungsten,
    distance: 10,
  },
  /*
   * There was a warm floor bounce here, to keep the underside of the frame off
   * pure black. It is gone deliberately.
   *
   * A point light near a floor always lays down a hard elliptical pool, and in
   * the blockout renders it read as a lamp lying on the ground. Moving it and
   * dimming it only relocated the artifact.
   */
} as const;

/**
 * Haze. Exponential, so the walls dissolve rather than ending at a seam.
 *
 * Density is tied to how far back the camera stands. At the original 22m it
 * could be thick; once the camera moved to 38m the same density dropped the
 * board's transmittance to 0.52 and the haze was eating the one thing the
 * scene exists to show. Move the camera and this has to move with it.
 */
/**
 * Haze.
 *
 * There is a real tension here. Fog is most of what makes a room feel gloomy,
 * but it is also all of what makes it feel deep — thinning it to fix "too dark"
 * flattened the hall into a lit box with no distance in it.
 *
 * So the two jobs are split: EXPOSURE carries the brightness, and the fog is
 * left dense enough to still dissolve the far corners. At this density the
 * board sits at 94% transmittance — effectively unhazed — while the far end of
 * the room is down at 81%.
 */
/**
 * And the colour of the haze is the most important colour in the file.
 *
 * Exponential fog tints *everything* by distance, so it decides what the depth
 * of the room is made of before any material gets a say. It was `#141a24`, a
 * cool blue, sitting in front of every warm surface in the building — the
 * single biggest reason the room read grey no matter how the lights were
 * tuned. Warm haze, and the far end of the room goes amber instead of ash.
 */
export const FOG = {
  color: AIR.fog,
  density: 0.01,
} as const;

/**
 * Global exposure.
 *
 * The single honest brightness control. Raising ambient light to fix "too dark"
 * flattens everything, because it lifts the shadows as much as the highlights;
 * exposure lifts the whole image and keeps the contrast that makes the room
 * look lit rather than painted.
 */
export const EXPOSURE = 1.62;

/**
 * The screen as a light source.
 *
 * The strongest single cue that the board belongs to the room. In a real
 * auditorium the audience is lit BY the screen — faces, seat backs and the
 * reveals around the opening all catch it. Until this existed, nothing in the
 * 3D scene acknowledged that a large bright rectangle was in the wall, which is
 * most of why the board read as an overlay pasted on top.
 */
export const SCREEN_LIGHT = {
  /** Sits just in front of the screen, throwing light back into the room. */
  offsetZ: 1.2,
  color: "#cfe0ff",
  intensity: 26,
  distance: 26,
  /** A second, warmer bounce close in, to catch the reveals and the sill. */
  reveal: {
    color: "#ffe8c4",
    intensity: 9,
    distance: 7,
  },
} as const;

/*
 * There was a SCREEN_HALO here: an emissive plane slightly larger than the
 * board, a few centimetres behind it, so the bloom pass bled a glow out past
 * the board's edges and hid the seam where the DOM layer met the render.
 *
 * It is gone, and the way it went is worth recording. Once the board became
 * geometry, that plane was an opaque, oversized rectangle sitting one
 * centimetre NEARER the camera than the board — so it covered it completely
 * and the screen went blank. It had never mattered before because the DOM
 * board was composited on top of the canvas whatever the depth buffer said.
 *
 * It is not worth reinstating behind the panel either: its overscan would fall
 * entirely inside the 6cm gap between the board's edge and the bezel, which
 * the bezel then covers. The board is bright enough for the bloom pass on its
 * own, and `SCREEN_LIGHT` is what actually puts the screen's glow in the room.
 *
 * `lib/hall.test.ts` now asserts the depth order of the whole assembly, which
 * is the check that would have caught this before it was ever rendered.
 */

/**
 * Exponential transmittance through the haze, 0..1.
 *
 * There used to be a partner to this that computed the same figure and handed
 * it to the board as a CSS overlay, because a DOM layer composited outside the
 * canvas receives no fog and had to have it painted on. The board is geometry
 * now and gets the real thing, so only the honest version is left — used by the
 * tests to check the haze dissolves the far corners without eating the board.
 */
export function transmittanceAt(distance: number): number {
  return Math.exp(-Math.pow(FOG.density * distance, 2));
}

/**
 * Station fittings. These are what turn a big room into a platform.
 *
 * None of it is decoration: the tiled walls, the safety line, the benches and
 * the beam ceiling are the four cues that make the space read as somewhere you
 * wait, which is the point — an all hands is a room full of people waiting for
 * something to be announced.
 */
/**
 * The shell: panelling, rail, beams.
 *
 * This used to be `STATION` — a tiled dado, a painted safety line and platform
 * benches. Those four cues were doing an enormous amount of work to make the
 * room read as somewhere you wait for a train, which was the old brief. They
 * are replaced rather than dressed up, because a tiled wall with a bar in
 * front of it reads as a station with a bar in it.
 */
export const ROOM = {
  /** Walnut panelling to picture-rail height, dark paint above. */
  panelHeight: 2.9,
  /** The brass picture rail capping it. The one bright line at eye level. */
  rail: { height: 0.09, depth: 0.07 },
  /** Exposed beams across the width, in stained timber rather than steel. */
  beams: {
    count: 16,
    startZ: -15,
    spacing: 3.2,
    depth: 0.42,
    drop: 0.45,
  },
} as const;

/**
 * The bar, down the left-hand wall.
 *
 * Placed by what the camera can actually see, not by where a bar would go. The
 * frustum is narrow near the camera and wide at the back — at z=0 only about
 * six metres either side of centre is in shot, and at z=-12 it is fifteen. A
 * bar running the near half of the room would be almost entirely off-screen,
 * so this sits in the middle distance where the view has opened out.
 */
export const BAR = {
  /** Counter centreline, and the wall its back bar stands against. */
  x: -11.9,
  wallX: -13.85,
  /*
   * Sat deep, and that is the frustum's doing rather than a floor plan's.
   *
   * The side walls are only in shot beyond about z=-10: nearer than that the
   * frame is narrower than the room is wide, so anything against a wall is
   * outside it. The first pass ran the bar from -15.5 to -8 and the near third
   * was simply not in the picture.
   */
  from: -16.2,
  to: -9.5,
  counterHeight: 1.12,
  counterDepth: 0.95,
  /** The brass foot rail. Nothing says "bar" faster from across a room. */
  footRail: { y: 0.28, radius: 0.05, offset: 0.62 },
  /** Backlit bottle shelf, the only lit thing at standing height. */
  shelf: { bottom: 1.3, top: 2.9 },
  stools: {
    x: -10.75,
    from: -15.6,
    to: -10.1,
    spacing: 1.52,
    seatHeight: 0.79,
  },
} as const;

/**
 * Booths down the right-hand wall.
 *
 * The counterweight to the bar. Two runs converging toward the board is what
 * gives the room its perspective now that the seating rows are gone.
 */
export const BOOTHS = {
  x: 12.5,
  backX: 13.85,
  z: [-15.4, -13.1, -10.8],
  width: 2.05,
  seatHeight: 0.46,
  backHeight: 1.4,
  tableHeight: 0.75,
} as const;

/**
 * High tables, and the lamps over them.
 *
 * Kept out of the middle, and that is a sightline rule rather than taste. The
 * board occupies about the central third of the frame; anything nearer the
 * camera than it, and closer to the centreline than `x = 0.29 * distance`,
 * projects on top of it. Tables are below eye height so they can never do it,
 * but the pendant lamps hanging over them can — see `lib/hall.test.ts`.
 */
export const TABLES = [
  { position: [-6.4, 0, -2.6] as const, pendant: true },
  { position: [6.9, 0, -3.4] as const, pendant: true },
  { position: [-8.2, 0, -6.8] as const, pendant: true },
  { position: [8.6, 0, -7.4] as const, pendant: true },
  { position: [-5.6, 0, -11.2] as const, pendant: true },
  { position: [5.2, 0, -11.8] as const, pendant: true },
  { position: [-2.9, 0, -14.4] as const, pendant: false },
  { position: [3.1, 0, -14.9] as const, pendant: false },
] as const;

export const TABLE = {
  topRadius: 0.56,
  topThickness: 0.07,
  height: 1.06,
  columnRadius: 0.06,
  baseRadius: 0.42,
} as const;

export const PENDANTS = {
  /** Hung low over the tables, and low enough to clear the board's bottom edge
   *  everywhere it is allowed to be. */
  y: 2.32,
  shadeRadius: 0.24,
  shadeHeight: 0.2,
  globeRadius: 0.075,
  /** Only every other lamp is a real light. */
  lightEvery: 2,
} as const;

/**
 * Screens on the side walls.
 *
 * The cool counterpoint the whole palette rests on. A room lit entirely in
 * tungsten is monochrome in a warmer hue; a bank of blue-white screens is what
 * makes the amber read as amber, and it is the difference between a pub and a
 * sportsbook.
 *
 * They show markets, not stock footage. This room is already watching one
 * board — these are the same floor, seen closer.
 */
export const WALL_SCREENS = {
  y: 3.9,
  width: 2.5,
  height: 1.41,
  inset: 0.12,
  bezel: 0.06,
  /** z positions, mirrored to both walls. */
  z: [-15.9, -13.3, -10.7] as const,
  labels: ["Roadmap", "ARR", "Pricing", "Mobile", "Logos", "Enterprise"] as const,
} as const;

/** One neon sign, above the bar. Punctuation, not decor — a wall of it is a theme pub. */
export const NEON = {
  position: [BAR.wallX + 0.12, 4.4, (BAR.from + BAR.to) / 2] as const,
  width: 4.4,
  height: 1.1,
  text: "BELLWETHER",
} as const;

/**
 * Where the people stand.
 *
 * Five figures, not a crowd — and they are the actual traders in the room, not
 * extras. The crowd IS the data: you, and the four bots whose trades are moving
 * the board. Scattered at different depths and facing the board, so the camera
 * sees them from behind, silhouetted against the one bright thing in the room.
 * That backlighting is why they can stay this simple without looking cheap.
 */
/**
 * How the people are arranged, and why they are allowed to stand now.
 *
 * They used to be seated in auditorium rows, and that was never a staging
 * choice — it was a workaround. The board was DOM composited outside the
 * canvas, so geometry physically could not occlude it: a figure between the
 * camera and the screen rendered *behind* it, and the screen appeared to float
 * in front of their face. Seating everybody below the camera's eye height meant
 * no head could ever project onto the board, at any distance, at any focal
 * length. It bought that invariant outright, and it cost the room every sign
 * of life.
 *
 * The board is a mesh now and occludes correctly, so the constraint is gone and
 * the room can be a room. People stand at the rail, lean on the bar and perch
 * at the high tables, and some of them have their backs to the screen — which
 * is what a bar looks like and what an auditorium never does.
 *
 * One rule is kept from the old arrangement, for taste rather than necessity:
 * nobody stands in the middle distance dead ahead. A silhouette parked across
 * the odds is annoying rather than atmospheric.
 */
export type AvatarPose = "stand" | "lean" | "perch";

export const AVATAR = {
  /** Head height standing. Above the camera's eye line, and that is now fine. */
  standingHeadHeight: 1.68,
  /** Head height perched on a stool. */
  perchedHeadHeight: 1.44,
  /** Shoulder width, used to check a figure is not half out of frame. */
  width: 0.5,
} as const;

export const AVATARS = [
  {
    // At the rail down the left, watching the board.
    id: "bot-cynic",
    position: [-6.9, 0, -6.2] as const,
    pose: "stand" as AvatarPose,
    /** Rotation about y. 0 faces the board; PI turns their back on it. */
    facing: 0.18,
    scale: 1.03,
    phase: 3.1,
  },
  {
    // Perched at a high table, half turned away, mid-conversation.
    id: "bot-optimist",
    position: [7.5, 0, -3.9] as const,
    pose: "perch" as AvatarPose,
    facing: -0.62,
    scale: 0.97,
    phase: 1.7,
  },
  {
    // Leaning on the bar with their back to the room.
    id: "bot-contrarian",
    position: [BAR.stools.x + 0.3, 0, -11.4] as const,
    pose: "lean" as AvatarPose,
    facing: -1.42,
    scale: 0.95,
    phase: 4.6,
  },
  {
    // Well back, and far enough off centre to clear the odds. At x=2.6 they
    // stood squarely across the board; the framing test caught it.
    id: "bot-informed",
    position: [4.3, 0, -12.6] as const,
    pose: "stand" as AvatarPose,
    facing: -0.12,
    scale: 1.01,
    phase: 2.3,
  },
  {
    // You, near the camera and out to one side. Hidden in walk mode.
    id: "you",
    position: [-4.4, 0, -1.4] as const,
    pose: "stand" as AvatarPose,
    facing: 0.1,
    scale: 1.0,
    phase: 0.0,
  },
] as const;

/** @deprecated use AVATAR.width */
export const AVATAR_WIDTH = AVATAR.width;

/**
 * The floor, and the most expensive thing that used to be on it.
 *
 * This was a `MeshReflectorMaterial`: a mirrored, blurred re-render of the
 * entire scene, every frame, comfortably the largest single cost in the room.
 * It was there because a station platform has polished concrete.
 *
 * A sportsbook has carpet, and carpet does not reflect. So the change that
 * makes the room look right also deletes the biggest item in the frame budget,
 * which is not the usual direction of that trade. The slight sheen left below
 * is the pendant lamps pooling on the pile — a standard material gives that
 * away for nothing.
 */
export const FLOOR = {
  /** Metres of real floor covered by one tile of the carpet pattern. */
  patternMetres: 3.2,
  roughness: 0.86,
  metalness: 0.06,
} as const;

export const POST = {
  bloom: {
    intensity: 0.62,
    luminanceThreshold: 0.22,
    luminanceSmoothing: 0.5,
    mipmapBlur: true,
  },
  depthOfField: {
    /** Focus sits on the board, so the foreground and the far corners soften. */
    focusDistance: 0.0135,
    focalLength: 0.055,
    bokehScale: 3.4,
  },
  vignette: {
    offset: 0.24,
    darkness: 0.92,
  },
  noise: {
    opacity: 0.03,
  },
} as const;

/**
 * Quality tiers.
 *
 * The scene has three expensive things left in it and they are all optional.
 * In rough order of cost:
 *
 *   1. device pixel ratio, which is quadratic: dpr 2 on a 1600x900 canvas is
 *      3.2 million pixels shaded, dpr 1.5 is 1.8 million;
 *   2. depth of field, the costliest post pass;
 *   3. shadow mapping, which costs an extra scene pass per shadowed light.
 *
 * There used to be a fourth above all of them — the floor's real-time
 * reflection, an extra render of the whole scene into a blurred buffer every
 * frame. It went out with the polished concrete when the floor became carpet.
 * See FLOOR.
 *
 * There used to be a fifth, and it dwarfed all four: the board was a DOM layer
 * whose CSS matrix drei rewrote every frame, re-rasterising several thousand
 * nodes on the main thread. That is why the room sat at 10-20fps with buttons
 * that would not respond — a GPU bottleneck cannot block a click, a main-thread
 * one can. The board is a texture on a mesh now, and the tier that used to
 * shrink it (`boardPixelWidth`) is gone with it.
 *
 * What is left is honest GPU cost, and the list above is in the order it should
 * be spent.
 */
export const QUALITY = {
  high: {
    label: "High",
    dpr: [1, 2] as [number, number],
    depthOfField: true,
    bloom: true,
    shadows: true,
    noise: true,
  },
  balanced: {
    label: "Balanced",
    dpr: [1, 1.5] as [number, number],
    depthOfField: false,
    bloom: true,
    shadows: false,
    noise: false,
  },
  performance: {
    label: "Performance",
    dpr: [1, 1] as [number, number],
    depthOfField: false,
    bloom: true,
    shadows: false,
    noise: false,
  },
} as const;

export type QualityTier = keyof typeof QUALITY;

/**
 * How each person looks.
 *
 * Monochrome near-black figures read as blobs, not people. At this distance
 * detail is invisible but VALUE and HUE are not — a different coat and a
 * different hair colour is the whole difference between five silhouettes and
 * five recognisable colleagues. Kept desaturated so the room stays cinematic
 * and the board is still the brightest thing in it.
 */
export const AVATAR_LOOKS: Record<
  string,
  { coat: string; skin: string; hair: string; build: number; hairStyle: "short" | "bun" | "crop" }
> = {
  you: { coat: "#3d4a63", skin: "#c2957a", hair: "#2b2119", build: 1.0, hairStyle: "short" },
  "bot-optimist": { coat: "#6a4a52", skin: "#d8ab8b", hair: "#4a2f24", build: 0.95, hairStyle: "bun" },
  "bot-cynic": { coat: "#33404a", skin: "#a87c62", hair: "#201914", build: 1.06, hairStyle: "crop" },
  "bot-contrarian": { coat: "#4a4b39", skin: "#8d6247", hair: "#171310", build: 0.97, hairStyle: "short" },
  "bot-informed": { coat: "#3a3f4d", skin: "#c99e80", hair: "#5a4432", build: 1.02, hairStyle: "bun" },
};

export const AVATAR_FALLBACK_LOOK = {
  coat: "#3a4050",
  skin: "#b98d70",
  hair: "#241c15",
  build: 1.0,
  hairStyle: "short" as const,
};
