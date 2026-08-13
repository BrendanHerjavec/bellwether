import { describe, expect, it } from "vitest";
import {
  ANCHORS,
  AVATAR,
  AVATARS,
  BOARD,
  BOARD_FRAME,
  CAMERA,
  CAMERA_DRIFT,
  COLUMNS,
  FOG,
  HALL,
  HTML_UNITS_PER_PIXEL,
  boardHtmlScale,
  LIGHTS,
  PODIUM,
  QUALITY,
  SCREEN_HALO,
  SCREEN_LIGHT,
  SEATING,
  STATION,
  TICKER_HOUSING,
  boardFogBlend,
  type QualityTier,
} from "./hall";

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

/** The DOM board's footprint in world units. */
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

  it("converts metres-per-pixel into drei's scale units", () => {
    // drei's <Html transform> maps 400 CSS px onto 10 world units at scale 1.
    // Passing metres-per-pixel straight through rendered the board 16 CSS
    // pixels wide instead of ~590. This is the conversion that was missing.
    expect(boardHtmlScale).toBeCloseTo(BOARD.metresPerPixel / HTML_UNITS_PER_PIXEL, 10);
    expect(boardHtmlScale * HTML_UNITS_PER_PIXEL * BOARD.pixelWidth).toBeCloseTo(
      boardWorld.width,
      6,
    );
  });

  it("keeps the measured aspect ratio of the real DOM board", () => {
    // Measured in the browser at 1520x729. If the board's layout changes
    // enough to move this, the frame has to be resized with it.
    expect(BOARD.pixelWidth / BOARD.pixelHeight).toBeCloseTo(2.05, 1);
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
    const { count, startZ, spacing, y } = LIGHTS.fixtures;
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

  it("can never let a head overlap the screen", () => {
    /*
     * The most important test in this file.
     *
     * The board is DOM composited outside the WebGL canvas, so 3D geometry
     * cannot occlude it: a figure standing between the camera and the screen
     * renders BEHIND it, and the screen appears to float in front of their
     * face. drei's occlusion modes do not help — the raycast modes hide the
     * whole element, so one passer-by would blank the entire board.
     *
     * The fix is projective, not technical. Anything below the camera's eye
     * height projects below the horizon line; anything above it projects above.
     * So if every head is lower than the camera and the screen's bottom edge is
     * higher, they cannot overlap — at any distance, at any focal length.
     *
     * Both halves are asserted here. Break either and the floating screen
     * comes back.
     */
    const eye = CAMERA.position[1];
    const boardBottom = ANCHORS.board.position[1] - boardWorld.height / 2;

    expect(AVATAR.seatedHeadHeight).toBeLessThan(eye);
    expect(boardBottom).toBeGreaterThan(eye);

    // And with enough margin that the drift and a bit of slouch cannot close it.
    expect(eye - AVATAR.seatedHeadHeight).toBeGreaterThan(0.3);
    expect(boardBottom - eye).toBeGreaterThan(0.3);
  });

  it("seats the audience low enough to clear the sill as well as the screen", () => {
    // The sill under the opening is the lowest part of the board assembly.
    const sillBottom = ANCHORS.ticker.position[1] - TICKER_HOUSING.height / 2;
    expect(sillBottom).toBeGreaterThan(CAMERA.position[1] - 0.1);
  });

  it("puts every figure on a seating row", () => {
    // A figure sitting where there is no seat is a figure hovering.
    for (const slot of AVATARS) {
      expect(SEATING.rows).toContain(slot.position[2]);
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

  it("puts the safety line in front of the camera", () => {
    // At z=9.5 it sat behind the viewer and never appeared in a frame.
    expect(STATION.safetyLine.z).toBeLessThan(CAMERA.position[2]);
    expect(STATION.safetyLine.z).toBeGreaterThan(HALL.backWallZ);
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

describe("the board is graded into the scene", () => {
  it("blends the board toward the fog by the amount actually between them", () => {
    // The board is composited outside the WebGL canvas and receives none of
    // the scene's fog, so it is painted on in CSS. Deriving it from the same
    // constants is what stops the two drifting apart.
    const distance = CAMERA.position[2] - ANCHORS.board.position[2];
    const expected = 1 - Math.exp(-Math.pow(FOG.density * distance, 2));
    expect(boardFogBlend()).toBeCloseTo(expected, 10);
  });

  it("grades the board without smothering it", () => {
    // Enough to sit in the same air as the room, not so much that the odds
    // stop being the brightest thing on screen.
    const blend = boardFogBlend();
    expect(blend).toBeGreaterThan(0.02);
    expect(blend).toBeLessThan(0.2);
  });

  it("oversizes the bloom halo so it bleeds past the board's edges", () => {
    // The halo is the only part of the board assembly the post chain can
    // actually touch; if it were not larger than the board it would be hidden
    // behind it and hide the seam it exists to hide.
    expect(SCREEN_HALO.overscan).toBeGreaterThan(0.2);
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
      expect(leaner.reflectionResolution).toBeLessThanOrEqual(richer.reflectionResolution);
    }
  });

  it("keeps bloom at every tier", () => {
    // Bloom is what the emissive fixtures and the screen halo are made of.
    // Losing it costs more than it saves.
    for (const tier of Object.values(QUALITY)) {
      expect(tier.bloom).toBe(true);
    }
  });

  it("drops depth of field before it drops reflections", () => {
    // DoF is the costliest pass and cannot touch the board anyway; the floor
    // reflection is the best-looking thing in the room.
    expect(QUALITY.balanced.depthOfField).toBe(false);
    expect(QUALITY.balanced.reflections).toBe(true);
  });
});

describe("haze", () => {
  it("dissolves the back of the room without blacking out the board", () => {
    // Exponential fog: transmittance is exp(-(density * distance)^2).
    const transmittance = (d: number) => Math.exp(-Math.pow(FOG.density * d, 2));

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
