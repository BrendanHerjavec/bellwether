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
 * Mapping the DOM board into world space.
 *
 * `metresPerPixel` is the honest, testable number: how big a CSS pixel of the
 * board is in the room. It is NOT what gets passed to drei.
 */
export const BOARD = {
  /** Pixel width the DOM board is laid out at, before scaling into the scene. */
  pixelWidth: 1500,
  /**
   * Measured height of the rendered board at that width. Row height is fixed
   * by --flap-h and does not vary with width — only the drum count does — so
   * this stays put as the board is resized.
   *
   * It is measured rather than assumed because the scale below is derived from
   * it: at the first guessed scale the board came out 12.03m tall inside a
   * 9.9m frame opening and would have punched straight through its housing.
   */
  pixelHeight: 730,
  /** World metres per CSS pixel. Sized to the platform, not the cathedral. */
  metresPerPixel: 0.0078,
} as const;

/**
 * drei's <Html transform> does not render one CSS pixel as one world unit.
 *
 * At `scale={1}` it maps 400 CSS pixels onto 10 world units — 0.025 units per
 * pixel — see the `(distanceFactor || 10) / 400` factor in its source. Passing
 * metres-per-pixel straight through therefore lands the board 40x too small,
 * which is exactly what happened: a 21.75m board rendered 16 CSS pixels wide.
 */
export const HTML_UNITS_PER_PIXEL = 0.025;

/** What actually goes on the <Html transform scale={...}> prop. */
export const boardHtmlScale = BOARD.metresPerPixel / HTML_UNITS_PER_PIXEL;

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
 * Warm key from above, cool fill from behind.
 *
 * Substantially brighter than the first pass, which was atmospheric and
 * genuinely hard to look at. A station concourse at night is dim but it is not
 * a cave — the tiled walls bounce a lot of light, and the room has to be
 * readable before it is moody.
 */
export const LIGHTS = {
  ambient: { intensity: 0.42, color: "#8b97ad" },
  key: {
    position: [0, 9.2, 2] as const,
    target: [0, 5.4, HALL.backWallZ] as const,
    intensity: 190,
    color: "#ffd7a0",
    angle: 0.72,
    penumbra: 0.85,
    distance: 60,
  },
  /** Cool rim from behind the board, separating the frame from the wall. */
  rim: {
    position: [0, 6.8, HALL.backWallZ - 1.5] as const,
    intensity: 30,
    color: "#6f96d6",
    distance: 24,
  },
  /**
   * Practical ceiling fixtures, running the length of the hall.
   *
   * Doubled up and brightened. In a station these are the main source, not an
   * accent, and a long receding row of them is half of why a platform reads as
   * a platform.
   */
  fixtures: {
    count: 10,
    startZ: -14,
    spacing: 4.4,
    y: HALL.height - 0.4,
    intensity: 34,
    color: "#ffeacb",
    distance: 22,
    size: [6.5, 0.42] as const,
  },
  /*
   * There was a warm floor bounce here, to keep the underside of the frame off
   * pure black. It is gone deliberately.
   *
   * A point light near a floor always lays down a hard elliptical pool, and in
   * the blockout renders it read as a lamp lying on the ground. Moving it and
   * dimming it only relocated the artifact. The key light and the ceiling
   * fixtures already reach the base of the frame, so the light was fighting the
   * composition for no gain. If the frame base ever reads too dark against the
   * reflective floor, the fix is a wide, very low area light facing up from
   * under the bezel — not a point light on the floor.
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
export const FOG = {
  color: "#0d1119",
  density: 0.012,
} as const;

/**
 * Station fittings. These are what turn a big room into a platform.
 *
 * None of it is decoration: the tiled walls, the safety line, the benches and
 * the beam ceiling are the four cues that make the space read as somewhere you
 * wait, which is the point — an all hands is a room full of people waiting for
 * something to be announced.
 */
export const STATION = {
  /** Tiled dado, plain render above, as in most stations. */
  tileHeight: 4.0,
  /** The painted safety line along the platform edge. */
  safetyLine: {
    // In front of the camera. At z=9.5 it was behind the viewer and never
    // appeared in a single frame.
    z: -8,
    width: 0.5,
    color: "#d8a12a",
  },
  /** Exposed ceiling beams across the width. */
  beams: {
    count: 16,
    startZ: -15,
    spacing: 3.2,
    depth: 0.42,
    drop: 0.45,
  },
  // The audience seating replaced the loose platform benches; these are the
  // few left along the side walls, well behind the rows.
  benches: [
    { position: [-11.5, 0, -12] as const, rotation: 0 },
    { position: [11.5, 0, -12] as const, rotation: Math.PI },
  ],
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
 * Rows of seating facing the screen.
 *
 * Built as continuous benches rather than individual chairs: at this distance
 * the difference is invisible, and it is three meshes a row instead of fifty.
 */
export const SEATING = {
  rows: [-10, -7, -4, -1, 2, 5],
  width: 19,
  seatHeight: 0.45,
  backHeight: 0.55,
  depth: 0.6,
} as const;

/**
 * Where the people sit.
 *
 * SEATED, and that is the whole point. The board is DOM composited outside the
 * WebGL canvas, so 3D geometry physically cannot occlude it — a figure standing
 * between the camera and the screen renders *behind* it, and the screen looks
 * like it is floating in front of their face.
 *
 * The fix is geometric rather than technical. A point below the camera's eye
 * height always projects below the horizon line; a point above it always
 * projects above. So as long as every head is lower than the camera and the
 * board's bottom edge is higher than it, no head can overlap the board at any
 * distance, at any focal length. Seating everybody buys that invariant, and it
 * is exactly what an auditorium looks like anyway.
 *
 * `lib/hall.test.ts` enforces both halves of it.
 */
export const AVATAR = {
  /** Head height when seated. Must stay below CAMERA.position[1]. */
  seatedHeadHeight: 1.25,
  /** Shoulder width, used to check a figure is not half out of frame. */
  width: 0.5,
} as const;

export const AVATARS = [
  { id: "you", position: [-1.2, 0, -1] as const, scale: 1.0, phase: 0.0 },
  { id: "bot-optimist", position: [2.6, 0, -1] as const, scale: 0.97, phase: 1.7 },
  { id: "bot-cynic", position: [-4.5, 0, -4] as const, scale: 1.03, phase: 3.1 },
  { id: "bot-contrarian", position: [5.0, 0, -4] as const, scale: 0.95, phase: 4.6 },
  { id: "bot-informed", position: [0.8, 0, -10] as const, scale: 1.01, phase: 2.3 },
] as const;

/** @deprecated use AVATAR.width */
export const AVATAR_WIDTH = AVATAR.width;

export const FLOOR = {
  /** Reflection blur, in drei's MeshReflectorMaterial units. */
  blur: [340, 90] as const,
  resolution: 1024,
  mixBlur: 1.05,
  mixStrength: 32,
  roughness: 0.82,
  depthScale: 1.15,
  minDepthThreshold: 0.35,
  maxDepthThreshold: 1.3,
  color: "#0a0b10",
  metalness: 0.62,
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
    opacity: 0.035,
  },
} as const;
