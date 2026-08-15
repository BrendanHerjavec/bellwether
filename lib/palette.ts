/**
 * Every colour in the hall, in one place.
 *
 * This file exists because of a measurement. Before it, the room used twelve
 * separate hex literals scattered across the scene and they occupied a **13
 * degree hue spread** — one blue-grey at twelve brightnesses, plus a cool
 * ambient and a cool fog laid over the top of it. That is not a dark room, it
 * is a monochrome one, and no amount of extra light was ever going to fix it.
 *
 * The reference is a Vegas sportsbook rather than a station platform: deep
 * carpet, walnut, brass, low amber lamps and a wall of screens. It is the room
 * that makes a giant split-flap tote board make sense.
 *
 * Two rules hold the whole thing together, and both are easy to break by
 * adding one well-meaning colour:
 *
 * 1. **The room is warm and the screens are cool.** Every surface sits in
 *    amber/oxblood/brass. Every light source that is not a lamp — the board,
 *    the wall screens, the neon — is cool. That opposition is what makes the
 *    amber read as amber. Make it all warm and you have simply moved the
 *    monochrome problem to a different hue.
 * 2. **The board stays the brightest thing in the room.** The lamps and the
 *    bottle shelf are small and low. Nothing in here competes with the odds.
 */

/** Surfaces. Warm, saturated, and lit — never neutral grey. */
export const SURFACE = {
  /** Walnut panelling. Three values so panels have edges without extra geometry. */
  walnut: "#4a3020",
  walnutDeep: "#2e1c11",
  walnutDark: "#180e08",

  /** Paint above the picture rail, and the booth leather. */
  oxblood: "#4a1c21",
  oxbloodDeep: "#2a0f12",
  leather: "#5c262b",

  /** Brass: rails, banding, table bases, lamp shades. */
  brass: "#c08a3e",
  brassDeep: "#6f4c1c",

  /** Bottle green, for lampshades and the felt on the tables. */
  felt: "#1e4034",

  /** Pressed tin ceiling. Dark, but warm-dark. */
  tin: "#291f16",

  /** The carpet: burgundy ground, gold figure, teal accent. Loud on purpose —
   *  a plain floor in a room like this reads as an office. */
  carpetGround: "#3d1620",
  carpetFigure: "#8a6a2c",
  carpetAccent: "#1d4a48",

  /** Ivory, for anything that has to read as light-coloured without being white. */
  cream: "#e8d9b5",
} as const;

/**
 * Light sources.
 *
 * Everything here is emissive geometry rather than a real light unless it says
 * otherwise. A room reads as "lit by many small warm sources" from the *sight*
 * of them; the shader only needs a handful to actually do the lighting, and
 * every extra real light is paid for by every material in the scene, per
 * fragment, on every frame.
 */
export const GLOW = {
  /** Pendant lamps over the tables. The room's dominant note. */
  tungsten: "#ffb45c",
  /** Their shades and the pools they throw. */
  lampWarm: "#ffcf8a",
  /** Backlit bottle shelf behind the bar. */
  bottles: "#ffd9a0",

  /** The cool counterpoint. Wall screens and the board's own spill. */
  screen: "#9cc8ff",
  /** Neon. One sign, not a wall of them. */
  neonPink: "#ff4d7a",
  neonCyan: "#48d6ff",
} as const;

/**
 * Atmosphere.
 *
 * `fog` is the single highest-leverage colour in the file: exponential haze
 * tints *everything* by distance, so it sets the colour of the room's depth
 * before any material gets a say. It was `#141a24`, a cool blue, and it was
 * quietly greying out every warm surface behind it.
 */
export const AIR = {
  fog: "#1c1108",
  /** Fill light. Warm and low — this is bounce off carpet and wood, not sky. */
  ambient: "#6a4b30",
  /** What the camera sees past the far end of the room. */
  background: "#100a06",
} as const;
