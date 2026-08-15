import { describe, expect, it } from "vitest";
import {
  ANCHORS,
  AVATAR,
  AVATARS,
  BOARD,
  BOARD_FRAME,
  BOARD_SCREEN,
  CAMERA,
  CAMERA_DRIFT,
  COLUMNS,
  FOG,
  HALL,
  LIGHTS,
  PODIUM,
  QUALITY,
  BAR,
  BEZEL,
  SCREEN_LIGHT,
  TABLES,
  TICKER_HOUSING,
  boardGeometry,
  transmittanceAt,
  type QualityTier,
} from "./hall";
import {
  BOARD_LAYOUT,
  BOARD_PANEL,
  BOARD_ROWS,
  STAKE_RULE_WIDTH,
  boardPanelHeight,
  tapeRect,
} from "./board-layout";
import { createSeedMarkets } from "./markets";

/**
 * Geometric sanity for the 3D hall.
 *
 * These exist because the scene cannot be seen from here: WebGL never
 * initialises in a headless pane, so the usual "look at it" loop is
 * unavailable. What can still be checked is that the numbers describe a
 * coherent room — that the board fits its frame, that the camera is inside the
 * building and pointed at the board, that nothing is buried in a wall.
 *
 * They caught a real one: the board was 12.03m tall inside a 9.9m opening.
 *
 * They cannot judge whether it looks good. That still needs eyes.
 */

/** The board's footprint in world units. */
const boardWorld = {
  width: BOARD.pixelWidth * BOARD.metresPerPixel,
  height: BOARD.pixelHeight * BOARD.metresPerPixel,
};

/** The clear opening inside the bezel. */
const frameOpening = {
  width: BOARD_FRAME.width - BOARD_FRAME.bezel * 2,
  height: BOARD_FRAME.height - BOARD_FRAME.bezel * 2,
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Half-extents of the view frustum at a given distance, for a 16:9 frame. */
function frustumAt(distance: number, fovDeg: number, aspect = 16 / 9) {
  const halfHeight = distance * Math.tan(toRad(fovDeg) / 2);
  return { halfHeight, halfWidth: halfHeight * aspect };
}

describe("the board fits its housing", () => {
  it("fits inside the frame opening horizontally", () => {
    expect(boardWorld.width).toBeLessThan(frameOpening.width);
  });

  it("fits inside the frame opening vertically", () => {
    // The bug this caught: at the first guessed scale the board was 12.03m
    // tall in a 9.9m opening and punched through its own housing.
    expect(boardWorld.height).toBeLessThan(frameOpening.height);
  });

  it("does not rattle around inside an oversized frame", () => {
    // A board much smaller than its opening reads as a picture hung in a box
    // rather than a display set into a wall.
    expect(boardWorld.width / frameOpening.width).toBeGreaterThan(0.85);
    expect(boardWorld.height / frameOpening.height).toBeGreaterThan(0.85);
  });

  it("takes its proportions from the layout rather than a measurement", () => {
    // These used to be numbers read off a screenshot of the DOM board, which
    // meant a layout change silently desynced the mesh from its housing. Now
    // the panel size IS the layout, so the two cannot disagree.
    expect(BOARD.pixelWidth).toBe(BOARD_LAYOUT.designWidth);
    expect(BOARD.pixelHeight).toBe(boardPanelHeight(BOARD_ROWS));
  });

  it("fills the opening on whichever axis binds first", () => {
    // The board is fitted, not scaled by a guessed constant: one axis lands
    // exactly on its clearance and the other has slack.
    const clearWidth = frameOpening.width - BOARD_SCREEN.inset * 2;
    const clearHeight = frameOpening.height - BOARD_SCREEN.inset * 2;
    expect(boardWorld.width).toBeLessThanOrEqual(clearWidth + 1e-9);
    expect(boardWorld.height).toBeLessThanOrEqual(clearHeight + 1e-9);
    const slack = Math.min(clearWidth - boardWorld.width, clearHeight - boardWorld.height);
    expect(slack).toBeCloseTo(0, 6);
  });

  it("grows a taller panel when a market is added rather than a wider one", () => {
    // Sizing is by row count, and the mesh refits. A ninth market must not
    // widen the board past an opening cut for eight.
    expect(boardPanelHeight(BOARD_ROWS + 1)).toBeGreaterThan(BOARD_PANEL.height);
    expect(BOARD_PANEL.width).toBe(BOARD_LAYOUT.designWidth);
  });
});

describe("the board's own layout", () => {
  it("puts the tape recess inside the panel, below the last row", () => {
    const rect = tapeRect(BOARD_ROWS);
    const lastRowBottom = BOARD_LAYOUT.wellTop + BOARD_ROWS * BOARD_LAYOUT.rowH;
    expect(rect.y).toBeGreaterThanOrEqual(lastRowBottom);
    expect(rect.y + rect.height).toBeLessThanOrEqual(BOARD_PANEL.height - BOARD_LAYOUT.pad);
  });

  it("fits the question, its rule and the price inside a row", () => {
    /*
     * Vertical overlap is the failure mode this board has, and it is not
     * obvious from the constants. An early pass sized the price at fifteen dot
     * rows on a six-pixel pitch — ninety pixels in a seventy-four pixel row —
     * and eight prices piled into one unreadable column down the right of the
     * board before anyone noticed.
     */
    const L = BOARD_LAYOUT;
    const labelBottom = 8 + L.label.rows * L.label.pitch;
    const ruleBottom = L.stake.y + L.stake.height;
    const priceBottom = 5 + L.price.rows * L.price.pitch;
    const sparkBottom = L.spark.y + L.spark.height;

    expect(labelBottom).toBeLessThanOrEqual(L.stake.y);
    for (const bottom of [ruleBottom, priceBottom, sparkBottom]) {
      expect(bottom).toBeLessThanOrEqual(L.rowH);
    }
  });

  it("keeps the columns from running into each other", () => {
    /*
     * The label is a dot grid, so its width is a character count times a pitch
     * rather than a box anyone declared. It overran the session column once
     * already — twenty characters at a four-pixel pitch is nine hundred and
     * sixty pixels, and the sparkline started at eight hundred and sixty.
     */
    const L = BOARD_LAYOUT;
    expect(L.label.x + STAKE_RULE_WIDTH).toBeLessThanOrEqual(L.spark.x);
    expect(L.spark.x + L.spark.width).toBeLessThanOrEqual(L.price.x);
    // Two digits of price, plus room for the move at the right edge.
    const priceWidth = 2 * 12 * L.price.pitch;
    expect(L.price.x + priceWidth).toBeLessThan(L.delta.x);
    expect(L.delta.x).toBeLessThan(L.designWidth - L.pad);
  });

  it("shows every seed label without clipping it mid-word", () => {
    /*
     * Sixteen characters clipped "ROADMAP CONFIDENCE" to "ROADMAP CONFIDEN",
     * which reads as a fault rather than as an abbreviation. Twenty-one clears
     * every label outright — and if a longer one is ever added, this fails
     * rather than silently truncating it on the wall.
     */
    for (const market of createSeedMarkets()) {
      expect(market.boardLabel.length).toBeLessThanOrEqual(BOARD_LAYOUT.label.chars);
    }
  });

  it("makes the price far larger than the question", () => {
    /*
     * The hierarchy is the whole point of this board, and it is easy to undo by
     * "improving" the label. From the fixed camera the board is only about 500
     * screen pixels wide, so an eleven-dot label is roughly four pixels tall
     * and legible to nobody — the price and the shape of the session line are
     * what read from a seat. The label is a detail you get by walking over.
     */
    const label = BOARD_LAYOUT.label.rows * BOARD_LAYOUT.label.pitch;
    const price = BOARD_LAYOUT.price.rows * BOARD_LAYOUT.price.pitch;
    expect(price).toBeGreaterThan(label * 1.3);
    expect(BOARD_LAYOUT.price.radius).toBeGreaterThan(BOARD_LAYOUT.label.radius);
  });
});

describe("everything is inside the building", () => {
  const halfWidth = HALL.width / 2;
  const frontZ = HALL.backWallZ + HALL.depth;

  it("puts the board frame within the walls, floor and ceiling", () => {
    const [, by] = ANCHORS.board.position;
    expect(BOARD_FRAME.width).toBeLessThan(HALL.width);
    expect(by - BOARD_FRAME.height / 2).toBeGreaterThan(0);
    expect(by + BOARD_FRAME.height / 2).toBeLessThan(HALL.height);
  });

  it("sets the board into the wall opening rather than hanging it in front", () => {
    // A panel floating proud of a flat wall reads as a different scene
    // composited on top, which is exactly how it looked at +0.42m.
    const [, , bz] = ANCHORS.board.position;
    expect(bz).toBeGreaterThan(HALL.backWallZ);
    expect(bz - HALL.backWallZ).toBeLessThan(BOARD_FRAME.reveal);
  });

  it("keeps the board inside the opening cut through the wall", () => {
    expect(boardWorld.width).toBeLessThan(BOARD_FRAME.width);
    expect(boardWorld.height).toBeLessThan(BOARD_FRAME.height);
  });

  it("sits the sill inside the opening, not on the floor", () => {
    const openingBottom = ANCHORS.board.position[1] - BOARD_FRAME.height / 2;
    const sillBottom = ANCHORS.ticker.position[1] - TICKER_HOUSING.height / 2;
    expect(sillBottom).toBeGreaterThanOrEqual(openingBottom - 0.05);
    expect(sillBottom).toBeLessThan(openingBottom + 0.6);
  });

  it("stands the podium on the floor, inside the room", () => {
    for (const step of ANCHORS.podium) {
      const [x, , z] = step.position;
      expect(Math.abs(x)).toBeLessThan(halfWidth);
      expect(z).toBeGreaterThan(HALL.backWallZ);
      expect(z).toBeLessThan(frontZ);
      expect(step.height).toBeGreaterThan(0);
    }
  });

  it("does not stand the podium inside the board frame", () => {
    const frameBottom = ANCHORS.board.position[1] - BOARD_FRAME.height / 2;
    for (const step of ANCHORS.podium) {
      const withinFrameX = Math.abs(step.position[0]) < BOARD_FRAME.width / 2;
      const withinFrameZ = step.position[2] < ANCHORS.board.position[2] + 1;
      // Either clear of the frame in plan, or short enough to pass beneath it.
      expect(!(withinFrameX && withinFrameZ) || step.height < frameBottom).toBe(true);
    }
  });

  it("hangs the ceiling fixtures below the ceiling and inside the room", () => {
    const { count, startZ, spacing, y } = LIGHTS.coves;
    expect(y).toBeLessThan(HALL.height);
    for (let i = 0; i < count; i += 1) {
      const z = startZ + i * spacing;
      expect(z).toBeGreaterThan(HALL.backWallZ);
      expect(z).toBeLessThan(frontZ);
    }
  });

  it("keeps the key light inside the room and above the board", () => {
    const [, ky, kz] = LIGHTS.key.position;
    expect(ky).toBeLessThan(HALL.height);
    expect(ky).toBeGreaterThan(ANCHORS.board.position[1]);
    expect(kz).toBeLessThan(frontZ);
  });

  it("puts the rim light behind the board, out of shot", () => {
    // Behind the back wall on purpose: it is a glow around the frame, and it
    // must never be visible as a lamp in the room.
    expect(LIGHTS.rim.position[2]).toBeLessThan(HALL.backWallZ);
  });
});

describe("the camera", () => {
  const [cx, cy, cz] = CAMERA.position;
  const boardZ = ANCHORS.board.position[2];
  const distance = cz - boardZ;

  it("stands inside the room, above the floor and below the ceiling", () => {
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(HALL.height);
    expect(Math.abs(cx)).toBeLessThan(HALL.width / 2);
    expect(cz).toBeLessThan(HALL.backWallZ + HALL.depth);
    expect(cz).toBeGreaterThan(boardZ);
  });

  it("looks at the board", () => {
    expect(CAMERA.target[2]).toBeCloseTo(boardZ, 5);
    expect(Math.abs(CAMERA.target[0] - ANCHORS.board.position[0])).toBeLessThan(1);
  });

  it("looks slightly up, the way you would from a crowd", () => {
    expect(CAMERA.target[1]).toBeGreaterThan(cy);
  });

  it("frames the board so the hall exists around it", () => {
    /*
     * These bounds come from looking at renders, not from reasoning.
     *
     * The first guess demanded the board fill 40-80% of frame height, and it
     * passed at 55% — while the render showed a whiteboard on a wall with no
     * room around it at all. A third of the frame feels far too small on paper
     * and is correct in practice, because the columns and the receding ceiling
     * fixtures are what carry the sense of place; the board only has to be the
     * brightest thing in it.
     */
    const { halfHeight, halfWidth } = frustumAt(distance, CAMERA.fov);
    const heightFill = boardWorld.height / (halfHeight * 2);
    const widthFill = boardWorld.width / (halfWidth * 2);
    expect(heightFill).toBeGreaterThan(0.25);
    expect(heightFill).toBeLessThan(0.45);
    expect(widthFill).toBeGreaterThan(0.3);
    expect(widthFill).toBeLessThan(0.55);
  });

  it("stands far enough back that columns run past it on both sides", () => {
    // The camera must be deep inside the hall, not parked at the entrance,
    // or there is nothing beside it to give the room length.
    const columnsBehindCamera = Array.from(
      { length: COLUMNS.count },
      (_, i) => COLUMNS.startZ + i * COLUMNS.spacing,
    ).filter((z) => z > CAMERA.position[2]);
    expect(columnsBehindCamera.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the whole board inside the frame", () => {
    const { halfHeight } = frustumAt(distance, CAMERA.fov);
    const boardTop = ANCHORS.board.position[1] + boardWorld.height / 2;
    const boardBottom = ANCHORS.board.position[1] - boardWorld.height / 2;
    // Frame centre at the board plane sits on the look-at target.
    expect(boardTop).toBeLessThan(CAMERA.target[1] + halfHeight);
    expect(boardBottom).toBeGreaterThan(CAMERA.target[1] - halfHeight);
  });

  it("leaves the centre of the frame clear of standing heads", () => {
    /*
     * This used to be the most important test in the file, and it used to say
     * something much stronger: that no head could EVER overlap the board. The
     * board was DOM composited outside the canvas, so geometry physically could
     * not occlude it — a figure between camera and screen rendered BEHIND it,
     * and the screen appeared to float in front of their face. Seating everyone
     * below the camera's eye height bought that invariant outright, because a
     * point below the eye line always projects below the horizon.
     *
     * The board is a mesh now and occludes correctly, so people can stand. What
     * survives is the weaker, and purely aesthetic, version: nobody parks in the
     * middle of the frame in front of the odds. Standing figures are allowed to
     * cross the board — that reads as a room — but not down the centreline.
     *
     * The board covers roughly the central third of the frame. A figure at
     * distance d is inside that band when |x| < 0.31 * halfWidth(d), so being
     * comfortably outside it is the rule.
     */
    for (const slot of AVATARS) {
      const distance = CAMERA.position[2] - slot.position[2];
      const { halfWidth } = frustumAt(distance, CAMERA.fov);
      const boardBand = halfWidth * (boardWorld.width / 2 / frustumAt(
        CAMERA.position[2] - ANCHORS.board.position[2],
        CAMERA.fov,
      ).halfWidth);
      expect(Math.abs(slot.position[0])).toBeGreaterThan(boardBand * 0.55);
    }
  });

  it("keeps the sill above the camera, so the tape is never looked down on", () => {
    // The sill under the opening is the lowest part of the board assembly.
    const sillBottom = ANCHORS.ticker.position[1] - TICKER_HOUSING.height / 2;
    expect(sillBottom).toBeGreaterThan(CAMERA.position[1] - 0.1);
  });

  it("stands everybody on the floor", () => {
    // A figure with its feet anywhere but zero is a figure hovering. The pose
    // does the rest — see POSE in Avatars.tsx.
    for (const slot of AVATARS) {
      expect(slot.position[1]).toBe(0);
      expect(["stand", "lean", "perch"]).toContain(slot.pose);
    }
  });

  it("gives the crowd something to stand at", () => {
    // Somebody leaning on thin air is worse than an empty room. Whoever is
    // leaning has to be at the bar, and whoever is perched has to be at a table
    // or a stool.
    for (const slot of AVATARS) {
      if (slot.pose === "lean") {
        expect(Math.abs(slot.position[0] - BAR.stools.x)).toBeLessThan(1);
        expect(slot.position[2]).toBeGreaterThan(BAR.from);
        expect(slot.position[2]).toBeLessThan(BAR.to);
      }
      if (slot.pose === "perch") {
        const nearTable = TABLES.some(
          (table) =>
            Math.hypot(
              table.position[0] - slot.position[0],
              table.position[2] - slot.position[2],
            ) < 1.6,
        );
        const nearStool =
          Math.abs(slot.position[0] - BAR.stools.x) < 1 &&
          slot.position[2] > BAR.from &&
          slot.position[2] < BAR.to;
        expect(nearTable || nearStool).toBe(true);
      }
    }
  });

  it("keeps every figure in shot", () => {
    /*
     * The failure this guards: the frustum is narrow near the camera, and a
     * first pass placed four of the five figures close and wide — every one of
     * them off-screen. The room rendered deserted with a single lone silhouette
     * in it, which is the opposite of the point.
     */
    for (const slot of AVATARS) {
      const distance = CAMERA.position[2] - slot.position[2];
      expect(distance).toBeGreaterThan(1);
      const { halfWidth } = frustumAt(distance, CAMERA.fov);
      const outerEdge = Math.abs(slot.position[0]) + AVATAR.width / 2;
      expect(outerEdge).toBeLessThan(halfWidth);
    }
  });

  it("spreads the figures through the room rather than clumping them", () => {
    const depths = AVATARS.map((a) => a.position[2]).sort((a, b) => a - b);
    // A crowd all at one distance reads as a chorus line.
    expect(depths[depths.length - 1] - depths[0]).toBeGreaterThan(6);
  });

  it("puts the bar where the camera can actually see it", () => {
    /*
     * The frustum is narrow near the camera and wide at the back — six metres
     * either side of centre at z=0, fifteen at z=-12. A bar running down the
     * near half of the room would be almost entirely off-screen, which is how
     * a fitting that took an afternoon ends up invisible.
     *
     * Checked at the near end, which is the end that fails.
     */
    const nearest = Math.max(BAR.from, BAR.to);
    const { halfWidth } = frustumAt(CAMERA.position[2] - nearest, CAMERA.fov);
    expect(Math.abs(BAR.x)).toBeLessThan(halfWidth);
    expect(Math.abs(BAR.wallX)).toBeLessThan(HALL.width / 2);
  });

  it("hangs the pendant lamps clear of the board", () => {
    /*
     * Tables cannot cover the board — they sit below the camera's eye line, so
     * they always project below it. The lamps over them hang above eye level
     * and can, which is why their placement is asserted rather than eyeballed.
     *
     * They are allowed to be in front of the board's outer edges; what they may
     * not do is hang across the middle of the odds.
     */
    const boardHalf = frustumAt(
      CAMERA.position[2] - ANCHORS.board.position[2],
      CAMERA.fov,
    ).halfWidth;
    for (const table of TABLES) {
      if (!table.pendant) continue;
      const distance = CAMERA.position[2] - table.position[2];
      // Only lamps nearer than the board can occlude it.
      if (distance >= CAMERA.position[2] - ANCHORS.board.position[2]) continue;
      const { halfWidth } = frustumAt(distance, CAMERA.fov);
      const lampFraction = Math.abs(table.position[0]) / halfWidth;
      const boardFraction = boardWorld.width / 2 / boardHalf;
      expect(lampFraction).toBeGreaterThan(boardFraction * 0.6);
    }
  });

  it("keeps the whole podium in shot, including each step's own width", () => {
    // A podium the camera never sees is just polygons. Checking the centre
    // point is not enough — a step can be centred in frame with half of it
    // hanging outside.
    for (const step of ANCHORS.podium) {
      const stepDistance = CAMERA.position[2] - step.position[2];
      const { halfWidth } = frustumAt(stepDistance, CAMERA.fov);
      const outerEdge = Math.abs(step.position[0]) + PODIUM.stepWidth / 2;
      expect(outerEdge).toBeLessThan(halfWidth);
    }
  });

  it("keeps the podium clear of the board, not silhouetted against it", () => {
    const boardBottom = ANCHORS.board.position[1] - boardWorld.height / 2;
    for (const step of ANCHORS.podium) {
      expect(step.height).toBeLessThan(boardBottom);
    }
  });

  it("never drifts through a wall or the floor", () => {
    const [ax, ay] = CAMERA_DRIFT.amplitude;
    expect(Math.abs(cx) + ax).toBeLessThan(HALL.width / 2);
    expect(cy - ay).toBeGreaterThan(0.5);
    expect(cy + ay).toBeLessThan(HALL.height);
  });

  it("drifts on periods that do not resolve into a visible loop", () => {
    const [px, py] = CAMERA_DRIFT.period;
    expect(px).not.toBe(py);
    // Neither period is a near-multiple of the other, so the path does not
    // retrace itself on a short cycle.
    const ratio = Math.max(px, py) / Math.min(px, py);
    expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.15);
  });

  it("sees the back wall within its far plane", () => {
    expect(CAMERA.far).toBeGreaterThan(distance + HALL.depth);
  });
});

describe("the board is set into the wall", () => {
  /**
   * Every plane in the opening, back to front, in world z.
   *
   * Nearer the camera means larger z: the camera stands at +z and looks toward
   * the back wall.
   */
  const assembly = {
    recessBackFace: HALL.backWallZ,
    panel: ANCHORS.board.position[2] + BOARD_SCREEN.depth,
    glass: ANCHORS.board.position[2] + BOARD_SCREEN.glassZ,
    bezelBack: ANCHORS.board.position[2] + BEZEL.z - BEZEL.depth / 2,
    bezelFront: ANCHORS.board.position[2] + BEZEL.z + BEZEL.depth / 2,
    wallFace: HALL.backWallZ + BOARD_FRAME.reveal,
  };

  it("puts nothing opaque between the camera and the drums", () => {
    /*
     * The bug this exists for, in full, because it cost a blank screen:
     *
     * `ScreenHalo` was an emissive plane LARGER than the board, sitting one
     * centimetre nearer the camera than it. That was harmless for as long as
     * the board was DOM composited on top of the canvas — the depth buffer did
     * not get a say. The moment the board became geometry, an opaque oversized
     * rectangle was in front of it and the screen went dark.
     *
     * So the rule is stated rather than assumed: between the drums and the
     * room there is the pane, and nothing else. Anything added to the opening
     * belongs behind `panel` or must be transparent, and this list is where it
     * gets declared.
     */
    expect(assembly.panel).toBeGreaterThan(assembly.recessBackFace);
    expect(assembly.glass).toBeGreaterThan(assembly.panel);
    // And the drums are clear of the recess's own back face by enough that the
    // depth buffer can tell them apart at 25 metres.
    expect(assembly.panel - assembly.recessBackFace).toBeGreaterThan(0.03);
  });

  it("swallows the whole assembly inside the bezel", () => {
    // The bezel has to reach behind the drums and past the pane, or the glass
    // reads as a sheet stuck on the front of the frame.
    expect(assembly.bezelBack).toBeLessThan(assembly.panel);
    expect(assembly.bezelFront).toBeGreaterThan(assembly.glass);
    // ...and the whole thing still sits inside the wall's own thickness.
    expect(assembly.bezelFront).toBeLessThan(assembly.wallFace);
  });

  it("hangs the glass well clear of the drums", () => {
    /*
     * The "behind glass" reading is entirely parallax. Two planes a few
     * centimetres apart slide against each other as you walk, and that
     * separation is what the eye reads as depth — collapse it and the
     * reflection becomes a decal printed on the board.
     */
    const separation = BOARD_SCREEN.glassZ - BOARD_SCREEN.depth;
    expect(separation).toBeGreaterThan(0.04);
  });

  it("keeps both planes inside the opening's own thickness", () => {
    // Neither may poke out through the front of the wall, nor sink back
    // through the recess's rear face.
    expect(assembly.panel).toBeGreaterThan(assembly.recessBackFace);
    expect(assembly.glass).toBeLessThan(assembly.wallFace);
  });

  it("puts the tape in its recess and nowhere else", () => {
    /*
     * The tape is a separate mesh laid over a recess painted into the panel,
     * and nothing lines the two up at runtime — if these disagree the tape
     * crawls across the bottom row of markets. Both come from `tapeRect`, and
     * this is the assertion that they still do.
     */
    const { panel, tape, metresPerPixel } = boardGeometry(BOARD_ROWS);
    const [panelWidth, panelHeight] = panel;

    expect(tape.x).toBeCloseTo(0, 9); // centred, like the recess it sits in
    expect(tape.width).toBeLessThan(panelWidth);
    // Below the last row, and above the frame's bottom padding.
    const lastRowBottom =
      panelHeight / 2 -
      (BOARD_LAYOUT.wellTop + BOARD_ROWS * BOARD_LAYOUT.rowH) * metresPerPixel;
    expect(tape.y + tape.height / 2).toBeLessThanOrEqual(lastRowBottom + 1e-9);
    expect(tape.y - tape.height / 2).toBeGreaterThan(-panelHeight / 2);
  });

  it("refits rather than overflowing when a market is added", () => {
    const clearHeight =
      BOARD_FRAME.height - BOARD_FRAME.bezel * 2 - BOARD_SCREEN.inset * 2;
    for (const rows of [BOARD_ROWS, BOARD_ROWS + 1, BOARD_ROWS + 4]) {
      const [width, height] = boardGeometry(rows).panel;
      expect(width).toBeLessThanOrEqual(frameOpening.width);
      expect(height).toBeLessThanOrEqual(clearHeight + 1e-9);
    }
  });

  it("leaves detail in the glyphs for someone who walks up to it", () => {
    /*
     * Measured where it matters — texels per bulb — rather than as a bare
     * supersampling factor, which is what this used to assert.
     *
     * That distinction bit once already: the factor dropped from 1.2 to 1.0 and
     * the board got *sharper*, because the characters had grown. A test on the
     * factor alone would have called that a regression.
     *
     * A bulb needs several texels across it or it stops being a round lit thing
     * and becomes an aliased speck, and a grid of aliased specks is exactly the
     * shimmer this board would be worst at.
     */
    const across = (dot: { radius: number }) =>
      dot.radius * 2 * BOARD_SCREEN.textureScale;

    expect(across(BOARD_LAYOUT.label)).toBeGreaterThan(3);
    expect(across(BOARD_LAYOUT.price)).toBeGreaterThan(4);
    // And the pitch has to leave a gap, or the dots merge into strokes and the
    // whole point of a dot-matrix board is lost.
    expect(BOARD_LAYOUT.label.pitch).toBeGreaterThan(BOARD_LAYOUT.label.radius * 2);
    expect(BOARD_LAYOUT.price.pitch).toBeGreaterThan(BOARD_LAYOUT.price.radius * 2);
  });

  it("puts the screen's own light in front of the screen", () => {
    // Behind it, it would light the inside of the wall and nothing else.
    expect(SCREEN_LIGHT.offsetZ).toBeGreaterThan(0);
    // And it has to reach the front rows to be worth having.
    const nearestRow = Math.min(...AVATARS.map((a) => a.position[2]));
    const farthestRow = Math.max(...AVATARS.map((a) => a.position[2]));
    const reach = farthestRow - ANCHORS.board.position[2];
    expect(SCREEN_LIGHT.distance).toBeGreaterThan(reach);
    expect(nearestRow).toBeGreaterThan(ANCHORS.board.position[2]);
  });
});

describe("quality tiers", () => {
  it("gets cheaper monotonically", () => {
    const order: QualityTier[] = ["high", "balanced", "performance"];
    for (let i = 1; i < order.length; i += 1) {
      const richer = QUALITY[order[i - 1]];
      const leaner = QUALITY[order[i]];
      expect(leaner.dpr[1]).toBeLessThanOrEqual(richer.dpr[1]);
      expect(Number(leaner.depthOfField)).toBeLessThanOrEqual(Number(richer.depthOfField));
      expect(Number(leaner.shadows)).toBeLessThanOrEqual(Number(richer.shadows));
      expect(Number(leaner.noise)).toBeLessThanOrEqual(Number(richer.noise));
    }
  });

  it("keeps bloom at every tier", () => {
    /*
     * Bloom is not an effect here, it is the lighting. Every warm source in the
     * room — the pendant globes, the coves, the bottle shelf, the neon — is
     * emissive geometry rather than a real light, and bloom is what turns a
     * bright quad into something that looks like it is glowing. Lose it and the
     * bar goes out.
     */
    for (const tier of Object.values(QUALITY)) {
      expect(tier.bloom).toBe(true);
    }
  });

  it("has nothing left as expensive as the floor reflection was", () => {
    /*
     * There used to be a `reflections` flag here, and a test asserting depth of
     * field was dropped before it, because a mirrored floor was the best-looking
     * thing in the room and also the costliest.
     *
     * The floor is carpet now — a sportsbook does not have polished concrete —
     * which deleted an entire extra render of the scene per frame. What is left
     * is resolution and two post passes, and resolution is the one that matters,
     * so every tier moves it.
     */
    expect(QUALITY.high.dpr[1]).toBeGreaterThan(QUALITY.performance.dpr[1]);
    expect(QUALITY.balanced.depthOfField).toBe(false);
  });
});

describe("haze", () => {
  it("dissolves the back of the room without blacking out the board", () => {
    // Exponential fog: transmittance is exp(-(density * distance)^2).
    const transmittance = transmittanceAt;
    expect(transmittance(10)).toBeCloseTo(Math.exp(-Math.pow(FOG.density * 10, 2)), 12);

    const toBoard = CAMERA.position[2] - ANCHORS.board.position[2];
    const toFarCorner = Math.hypot(HALL.width / 2, HALL.depth);

    // The board must stay clearly readable through the haze. This is coupled
    // to the camera distance: pulling the camera back without thinning the fog
    // put the board at 0.52 and washed it out.
    expect(transmittance(toBoard)).toBeGreaterThan(0.7);
    // The far corners must be well on their way into darkness.
    expect(transmittance(toFarCorner)).toBeLessThan(0.85);
  });
});
