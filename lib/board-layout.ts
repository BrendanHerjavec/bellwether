/**
 * The hall board's layout, as numbers.
 *
 * The board exists twice, and this file describes one of them: the canvas
 * raster painted onto a mesh inside the hall (`board-raster.ts`). The DOM board
 * in `board.css` and `splitflap.css` is a separate thing with its own layout.
 *
 * That divergence used to be about density; it is now about *kind*. The DOM
 * board is still a split-flap — a Solari departure board, charming, and
 * unmistakably a train station. The hall board is a 1970s race-and-sports book
 * display: incandescent bulbs on a black field. The room is a sportsbook and a
 * departure board was the last thing in it still speaking the old language.
 *
 * Three things follow from bulbs that are worth stating before anyone tunes
 * these numbers:
 *
 *   1. **Bright points on black is the most legible display there is**, which
 *      is why every board meant to be read across a large room has looked
 *      roughly like this. It is also the cheapest to draw — filled circles, no
 *      gradients, no clipping, no per-character compositing.
 *   2. **The label is not readable from a seat, and that is fine.** The whole
 *      board is only about 500 screen pixels wide from the fixed camera, so an
 *      11-dot label is four pixels tall. The price and the shape of the session
 *      line are what read from the room; the question is a detail you get by
 *      walking over. The sizes below are set to that hierarchy deliberately.
 *   3. **Dot matrix has a legibility floor.** See `board-raster.ts` for the
 *      two font choices that took "PRICING CHANGE NAMED" from rendering as
 *      "PBICIOB CHAOBE HAMED" to rendering as itself.
 *
 * Units are "design pixels". The raster multiplies them by a supersampling
 * factor and the hall converts them to metres; neither belongs here.
 */

export const BOARD_LAYOUT = {
  /** Width the board is laid out at, before any scaling. */
  designWidth: 1500,
  /** Frame padding, and the corner radius of the case. */
  pad: 14,
  radius: 10,

  /** The wordmark, and the column captions under it. */
  header: {
    wordmark: { x: 34, y: 20, rows: 9, pitch: 5, radius: 2.1, tracking: 2 },
    captionY: 86,
  },

  /** Top of the well the rows sit in. */
  wellTop: 96,
  rowH: 70,

  /**
   * The question.
   *
   * Twenty-one characters clears every label in the seed set outright. Sixteen
   * did not, and clipped "ROADMAP CONFIDENCE" to "ROADMAP CONFIDEN" — mid-word,
   * which reads as a fault rather than as an abbreviation.
   */
  label: { x: 40, chars: 21, rows: 11, pitch: 4, radius: 1.7, tracking: 1 },

  /**
   * Credits at risk, as a rule under the question rather than its own column.
   *
   * It is a magnitude, not a figure anyone reads off a board, so it needs no
   * axis, scale or digits — and underlining the question it belongs to says
   * which market it is about without a caption to explain it. Deleting that
   * column is where the label's extra five characters came from.
   */
  stake: { y: 56, height: 4 },

  /** The session so far. Shape, not level — see `board-raster.ts`. */
  spark: { x: 1090, width: 150, y: 10, height: 42 },

  /**
   * The headline. Fewer dot rows than the label but a much wider pitch, which
   * is the opposite of what it looks like it should be — see the note above
   * about what actually reads from a seat.
   */
  price: { x: 1275, rows: 10, pitch: 6, radius: 2.3, tracking: 1 },

  /** The session move, in plain text at the right edge. */
  delta: { x: 1460, y: 46 },

  /** The tape recess along the bottom, and the gap above it. */
  tapeGap: 12,
  tapeH: 36,
} as const;

/** Width of the rule under a full-length label, and so of a full stake bar. */
export const STAKE_RULE_WIDTH =
  BOARD_LAYOUT.label.chars * 12 * BOARD_LAYOUT.label.pitch;

/** Panel height for a given number of market rows, including the tape recess. */
export function boardPanelHeight(rowCount: number): number {
  return (
    BOARD_LAYOUT.wellTop +
    rowCount * BOARD_LAYOUT.rowH +
    BOARD_LAYOUT.tapeGap +
    BOARD_LAYOUT.tapeH +
    BOARD_LAYOUT.pad
  );
}

/** The tape recess, in panel coordinates. */
export function tapeRect(rowCount: number) {
  return {
    x: BOARD_LAYOUT.pad,
    y: BOARD_LAYOUT.wellTop + rowCount * BOARD_LAYOUT.rowH + BOARD_LAYOUT.tapeGap,
    width: BOARD_LAYOUT.designWidth - BOARD_LAYOUT.pad * 2,
    height: BOARD_LAYOUT.tapeH,
  };
}

/** How fast the tape crawls, in design pixels per second. */
export const TAPE_SPEED = 84;

/**
 * The canonical board: eight markets, which is what `lib/markets.ts` ships.
 *
 * The hall's geometry is checked against this size so the opening can be cut
 * once. The mesh still fits whatever it is actually given — a ninth market
 * makes the board taller and it scales down to suit, rather than growing out
 * through its own housing.
 */
export const BOARD_ROWS = 8;

export const BOARD_PANEL = {
  width: BOARD_LAYOUT.designWidth,
  height: boardPanelHeight(BOARD_ROWS),
} as const;
