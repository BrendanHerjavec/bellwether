/**
 * The hall's board, painted into a 2D canvas.
 *
 * Two decisions are baked in here and both reversed something earlier.
 *
 * **It is a texture, not DOM.** Inside the hall the board used to be a drei
 * `<Html transform>` — real DOM, positioned by the camera matrix but composited
 * outside the WebGL canvas. That kept the glyphs as text and cost two things
 * that mattered more: the frame rate, because drei rewrote a 3,700-node
 * subtree's CSS matrix every frame on the main thread; and any sense of
 * belonging, because a layer outside the canvas gets no fog, no bloom, no depth
 * of field, and cannot be occluded. Painted into a texture it is ordinary
 * geometry, and it stops touching the DOM entirely.
 *
 * **It is bulbs, not flaps.** It was a Solari split-flap board — genuinely
 * charming, and a *departure board*, which is a train station's display. The
 * room around it is a sportsbook. This is the 1970s race-and-sports book
 * equivalent: incandescent bulbs on a black field, which is both the display
 * this room would actually have and the most legible thing you can hang on a
 * wall. It is also about a third the drawing cost per character of a flap.
 *
 * The repaint is banded. A row is the unit of damage: when a price in row 3 is
 * mid-wipe, only row 3's band is cleared and repainted. A quiet board costs a
 * loop over a few integers and uploads nothing.
 */

import { fitToWidth, priceToDigits } from "@/lib/splitflap";
import { GLOW, SURFACE } from "@/lib/palette";
import {
  BOARD_LAYOUT,
  STAKE_RULE_WIDTH,
  boardPanelHeight,
  tapeRect,
} from "@/lib/board-layout";
import type { MarketRowStatus } from "@/components/board/MarketRow";

/* ------------------------------------------------------------------ palette */

const INK = {
  /** The case: walnut catching the key light at the top, bronze in shadow. */
  caseTop: "#3a2a1a",
  caseBottom: "#170f08",
  wellTop: "#080502",
  wellBottom: "#040201",
  /** A bulb, lit and unlit. The halo is drawn as a second flat fill. */
  bulb: GLOW.tungsten,
  bulbCore: "#fff0d0",
  bulbHalo: "rgba(255,180,92,0.20)",
  bulbDark: "#2a1d0e",
  brass: SURFACE.brass,
  brassDeep: SURFACE.brassDeep,
  caption: "#8a7350",
  rule: "rgba(255,190,110,0.06)",
  stakeTrack: "rgba(255,190,110,0.10)",
  /** Semantic, and deliberately not warm: a move has to say so in a colour
   *  nobody has to learn. */
  up: "#7fe0a0",
  down: "#ff8a6a",
  flat: "#8a7350",
  amber: "#e0a94a",
  voided: "#9aa8bd",
  tape: "#c9bda4",
} as const;

const STATUS_COLOR: Record<MarketRowStatus, string> = {
  open: INK.amber,
  locked: INK.caption,
  "settled-yes": INK.up,
  "settled-no": INK.down,
  void: INK.voided,
};

/* -------------------------------------------------------------------- model */

export interface BoardRowModel {
  id: string;
  question: string;
  /** Current YES price, 0..1. */
  price: number;
  openingPrice: number;
  status: MarketRowStatus;
  /**
   * How much is riding on this market, 0..1 against the busiest one.
   *
   * Real outstanding shares rather than a flourish — see `BoardScreen`, which
   * takes it from the market maker's own state.
   */
  weight?: number;
}

export interface BoardTapeItem {
  market: string;
  side: "YES" | "NO";
  contracts: number;
  price: number;
  move: number;
  /** Only leadership is named; everyone else moves the tape anonymously. */
  who?: string;
}

export interface BoardModel {
  rows: BoardRowModel[];
  openCount: number;
  tradeCount: number;
}

/* ------------------------------------------------------------------- fonts */

/**
 * The font families next/font actually generated.
 *
 * They are hashed at build time, so the only way to name them is to read the
 * custom properties back off the document. Falls back to the same stacks the
 * CSS declares, which is what a test environment gets.
 */
export function boardFonts(): { flap: string; mono: string; ui: string } {
  const fallback = {
    flap: '"Barlow Condensed", "Oswald", sans-serif',
    mono: '"IBM Plex Mono", monospace',
    ui: 'Inter, "Helvetica Neue", Arial, sans-serif',
  };
  if (typeof document === "undefined") return fallback;
  const style = getComputedStyle(document.documentElement);
  const flap = style.getPropertyValue("--font-flap").trim();
  const mono = style.getPropertyValue("--font-mono").trim();
  const ui = style.getPropertyValue("--font-ui").trim();
  return {
    flap: flap ? `${flap}, ${fallback.flap}` : fallback.flap,
    mono: mono ? `${mono}, ${fallback.mono}` : fallback.mono,
    ui: ui ? `${ui}, ${fallback.ui}` : fallback.ui,
  };
}

/* ------------------------------------------------------------- dot matrix */

export interface DotGrid {
  cols: number;
  rows: number;
  on: boolean[];
}

/**
 * Rasterise text into a grid of on/off dots.
 *
 * No hand-authored bitmap font: the text is drawn into a tiny offscreen canvas
 * and a dot is lit wherever a pixel came out dark enough. That is roughly how
 * sign-driver software actually works, it costs no font data, and any string
 * renders in the app's own typeface for free.
 *
 * Two choices in here are the difference between a readable board and a mess,
 * and both were found by rendering the thing and squinting at it:
 *
 *   - **The face must be a grotesque, not the condensed one the board uses
 *     elsewhere.** Barlow Condensed at this size is about four dots wide, which
 *     cannot keep B from R or G from C: "PRICING CHANGE NAMED" rendered as
 *     "PBICIOB CHAOBE HAMED". Inter resolves all of them.
 *   - **The threshold is 60, not 128.** At 128 the antialiased pixels are
 *     discarded and the first casualties are thin diagonals — M lost its middle
 *     vertex and read as N, Q lost its tail and read as O. Catching the
 *     half-covered pixels costs a slightly fatter letterform and buys back the
 *     characters that were actually being misread.
 */
export function textDots(text: string, rows: number, font: string, tracking = 1): DotGrid {
  const size = Math.round(rows * 1.42);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `700 ${size}px ${font}`;

  const advance = Array.from(text).map(
    (c) => Math.max(1, Math.round(measure.measureText(c).width)) + tracking,
  );
  const cols = Math.max(1, advance.reduce((a, b) => a + b, 0));

  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `700 ${size}px ${font}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";

  let x = 0;
  Array.from(text).forEach((c, i) => {
    ctx.fillText(c, x, rows);
    x += advance[i];
  });

  const data = ctx.getImageData(0, 0, cols, rows).data;
  const on: boolean[] = new Array(cols * rows);
  for (let i = 0; i < cols * rows; i += 1) on[i] = data[i * 4 + 3] > 60;
  return { cols, rows, on };
}

function paintBulb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, heat: number) {
  if (heat <= 0.02) {
    ctx.fillStyle = INK.bulbDark;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Halo, body, core: three flat fills stand in for a glow that would
  // otherwise cost a shadowBlur per bulb, and the scene's bloom pass finishes
  // the job. With several thousand bulbs on the board that difference is the
  // whole frame budget.
  ctx.globalAlpha = heat;
  ctx.fillStyle = INK.bulbHalo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK.bulb;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK.bulbCore;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------------------- row */

/** How long a price takes to sweep across, in milliseconds. */
const WIPE_MS = 620;
/** Columns the leading edge of the sweep is spread over. */
const WIPE_LEAD = 7;

interface RowState {
  model: BoardRowModel;
  label: DotGrid;
  /** The digits being displayed, and the ones being wiped away. */
  digits: DotGrid;
  previous: DotGrid | null;
  /** 0..1 across the wipe, or 1 when settled. */
  wipe: number;
  /** Session history, appended as prices actually arrive. */
  history: number[];
  dirty: boolean;
}

/* ------------------------------------------------------------------ painter */

export interface BoardRasterOptions {
  /**
   * Texture pixels per design pixel.
   *
   * The crispness knob, and also the upload cost of every change — the whole
   * texture goes to the GPU whenever anything moves.
   */
  scale?: number;
  /** Fired as the sweep crosses a character, so the room can hear it. */
  onFlip?: (isLast: boolean, loud: boolean) => void;
}

export class BoardRaster {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scale: number;
  private readonly onFlip: (isLast: boolean, loud: boolean) => void;
  private fonts = boardFonts();

  private rows: RowState[] = [];
  private model: BoardModel = { rows: [], openCount: 0, tradeCount: 0 };
  private everythingDirty = true;
  private headerDirty = false;

  panelWidth = BOARD_LAYOUT.designWidth;
  panelHeight = boardPanelHeight(0);

  constructor(model: BoardModel, options: BoardRasterOptions = {}) {
    this.scale = options.scale ?? 1;
    this.onFlip = options.onFlip ?? (() => {});
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is unavailable, so the board cannot be painted");
    this.ctx = ctx;
    this.setModel(model, true);
    // Painted here rather than on the first frame, so the canvas is never
    // handed to a texture blank whatever order the caller's frame loop runs in.
    this.update(0);
  }

  /** Re-read the font names once the webfonts have actually arrived. */
  refreshFonts() {
    this.fonts = boardFonts();
    this.rows.forEach((row) => {
      row.label = this.labelGrid(row.model.question);
      row.digits = this.digitGrid(row.model.price);
      row.previous = null;
      row.wipe = 1;
    });
    this.everythingDirty = true;
  }

  private labelGrid(question: string): DotGrid {
    const { chars, rows, tracking } = BOARD_LAYOUT.label;
    return textDots(fitToWidth(question, chars), rows, this.fonts.ui, tracking);
  }

  private digitGrid(price: number): DotGrid {
    const { rows, tracking } = BOARD_LAYOUT.price;
    return textDots(priceToDigits(price), rows, this.fonts.ui, tracking);
  }

  setModel(model: BoardModel, boot = false) {
    if (model.rows.length !== this.rows.length || boot) {
      this.rows = model.rows.map((row) => ({
        model: row,
        label: this.labelGrid(row.question),
        digits: this.digitGrid(row.price),
        previous: null,
        // Boot sweeps the whole board in, staggered by row below.
        wipe: boot ? 0 : 1,
        history: [row.openingPrice, row.price],
        dirty: true,
      }));
      if (boot) this.rows.forEach((row, i) => (row.wipe = -i * 0.22));
      this.panelHeight = boardPanelHeight(model.rows.length);
      this.canvas.width = Math.round(this.panelWidth * this.scale);
      this.canvas.height = Math.round(this.panelHeight * this.scale);
      this.everythingDirty = true;
    } else {
      model.rows.forEach((next, i) => this.updateRow(this.rows[i], next));
    }

    /*
     * The header only, and that distinction is worth a lot.
     *
     * The trade counter changes on every single trade, and marking the whole
     * board dirty for it meant repainting twenty-two thousand bulbs several
     * times a second — for two digits in a caption. The header is its own band
     * and repaints on its own.
     */
    if (
      model.openCount !== this.model.openCount ||
      model.tradeCount !== this.model.tradeCount
    ) {
      this.headerDirty = true;
    }
    this.model = model;
  }

  private updateRow(row: RowState, next: BoardRowModel) {
    const moved = priceToDigits(next.price) !== priceToDigits(row.model.price);
    if (moved) {
      row.previous = row.digits;
      row.digits = this.digitGrid(next.price);
      row.wipe = 0;
    }
    // History records what actually happened, so the session line and the
    // number beside it can never disagree. Capped, because a long meeting
    // should not grow an array forever.
    if (next.price !== row.model.price) {
      row.history.push(next.price);
      if (row.history.length > 64) row.history.shift();
    }
    if (
      moved ||
      next.status !== row.model.status ||
      next.question !== row.model.question ||
      next.weight !== row.model.weight
    ) {
      row.dirty = true;
    }
    if (next.question !== row.model.question) row.label = this.labelGrid(next.question);
    row.model = next;
  }

  /**
   * Step the board and repaint whatever moved.
   *
   * Returns true when the canvas changed, which is the caller's cue to upload
   * it. A settled board returns false forever.
   */
  update(dtMs: number): boolean {
    const dt = Math.min(dtMs, 100); // a backgrounded tab must not fast-forward
    let painted = false;

    if (this.everythingDirty) {
      this.paintAll();
      this.everythingDirty = false;
      this.rows.forEach((row) => (row.dirty = false));
      painted = true;
    }

    this.rows.forEach((row, index) => {
      let wiping = false;
      if (row.wipe < 1) {
        const before = row.wipe;
        row.wipe = Math.min(1, row.wipe + dt / WIPE_MS);
        if (row.wipe > 0) {
          wiping = true;
          // One tick per character crossed, so the sweep is audible as a run
          // rather than as a single event.
          const step = Math.max(1, Math.floor(row.digits.cols / 4));
          const was = Math.floor((Math.max(0, before) * row.digits.cols) / step);
          const now = Math.floor((row.wipe * row.digits.cols) / step);
          if (now > was) this.onFlip(row.wipe >= 1, true);
        }
        if (row.wipe >= 1) row.previous = null;
      }

      /*
       * A wipe repaints the price alone, not the row around it.
       *
       * The label is twenty-one characters of eleven-row dot grid — some two
       * and a half thousand bulbs that have not changed and will not — and
       * redrawing them sixty times a second to move two digits is most of a
       * frame for nothing. The row only repaints entire when its content
       * actually changed.
       */
      if (row.dirty) {
        this.paintRow(index);
        painted = true;
      } else if (wiping) {
        this.paintPrice(index);
        painted = true;
      }
      row.dirty = false;
    });

    if (this.headerDirty) {
      this.paintHeaderBand();
      this.headerDirty = false;
      painted = true;
    }

    return painted;
  }

  /* ------------------------------------------------------------- painting */

  private begin(y: number, h: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.beginPath();
    ctx.rect(-1, y, this.panelWidth + 2, h);
    ctx.clip();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    return ctx;
  }

  private paintAll() {
    const ctx = this.begin(0, this.panelHeight);

    const grad = ctx.createLinearGradient(0, 0, 0, this.panelHeight);
    grad.addColorStop(0, INK.caseTop);
    grad.addColorStop(1, INK.caseBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(-1, -1, this.panelWidth + 2, this.panelHeight + 2);

    this.paintWell(ctx);
    this.paintTapeRecess(ctx);
    this.paintHeader(ctx);
    ctx.restore();

    this.rows.forEach((_, index) => this.paintRow(index));
  }

  private wellRect() {
    const { pad, wellTop, rowH } = BOARD_LAYOUT;
    return {
      x: pad + 2,
      y: wellTop,
      width: this.panelWidth - (pad + 2) * 2,
      height: this.rows.length * rowH,
    };
  }

  private paintWell(ctx: CanvasRenderingContext2D) {
    const r = this.wellRect();
    const well = ctx.createLinearGradient(0, r.y, 0, r.y + r.height);
    well.addColorStop(0, INK.wellTop);
    well.addColorStop(1, INK.wellBottom);
    roundRectPath(ctx, r.x, r.y, r.width, r.height, 8);
    ctx.fillStyle = well;
    ctx.fill();
    ctx.strokeStyle = INK.brassDeep;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private paintTapeRecess(ctx: CanvasRenderingContext2D) {
    const rect = tapeRect(this.rows.length);
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 6);
    ctx.fillStyle = "#0a0704";
    ctx.fill();
    ctx.strokeStyle = "rgba(246,214,158,0.05)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private paintHeader(ctx: CanvasRenderingContext2D) {
    const { wordmark, captionY } = BOARD_LAYOUT.header;
    this.paintGrid(
      ctx,
      textDots("BELLWETHER", wordmark.rows, this.fonts.ui, wordmark.tracking),
      wordmark.x,
      wordmark.y,
      wordmark.pitch,
      wordmark.radius,
      (_, lit) => (lit ? 1 : 0),
    );

    ctx.fillStyle = INK.brass;
    ctx.font = `600 12px ${this.fonts.mono}`;
    ctx.fillText("MARKET · RULE SHOWS CREDITS AT RISK", BOARD_LAYOUT.label.x, captionY);
    ctx.fillText("SESSION", BOARD_LAYOUT.spark.x, captionY);
    ctx.fillText("YES", BOARD_LAYOUT.price.x + 6, captionY);
    ctx.textAlign = "right";
    ctx.fillStyle = INK.caption;
    ctx.fillText(
      `${this.model.openCount} OPEN · ${this.model.tradeCount} TRADES`,
      this.panelWidth - BOARD_LAYOUT.pad - 20,
      captionY,
    );
    ctx.textAlign = "left";
  }

  /** Light a grid of bulbs, asking `heat` how bright each column should be. */
  private paintGrid(
    ctx: CanvasRenderingContext2D,
    grid: DotGrid,
    originX: number,
    originY: number,
    pitch: number,
    radius: number,
    heat: (col: number, lit: boolean) => number,
  ) {
    for (let r = 0; r < grid.rows; r += 1) {
      const y = originY + r * pitch;
      for (let c = 0; c < grid.cols; c += 1) {
        paintBulb(ctx, originX + c * pitch, y, radius, heat(c, grid.on[r * grid.cols + c]));
      }
    }
  }

  private paintRow(index: number) {
    const row = this.rows[index];
    if (!row) return;
    const L = BOARD_LAYOUT;
    const top = L.wellTop + index * L.rowH;
    const ctx = this.begin(top, L.rowH);

    // The well's gradient and its rounded corners belong to the well, not to
    // any row, so both are rebuilt at full extent and cropped to the band.
    const well = this.wellRect();
    roundRectPath(ctx, well.x, well.y, well.width, well.height, 8);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, well.y, 0, well.y + well.height);
    grad.addColorStop(0, INK.wellTop);
    grad.addColorStop(1, INK.wellBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(well.x, top, well.width, L.rowH);

    if (index > 0) {
      ctx.fillStyle = INK.rule;
      ctx.fillRect(well.x + 14, top, well.width - 28, 1);
    }

    const resolved = row.model.status !== "open";
    const dim = resolved ? 0.55 : 1;

    // The question.
    this.paintGrid(ctx, row.label, L.label.x, top + 8, L.label.pitch, L.label.radius, (_, lit) =>
      lit ? dim : 0,
    );

    // Credits at risk, as a rule under it.
    const weight = Math.min(1, Math.max(0.04, row.model.weight ?? 0));
    ctx.fillStyle = INK.stakeTrack;
    ctx.fillRect(L.label.x, top + L.stake.y, STAKE_RULE_WIDTH, L.stake.height);
    ctx.fillStyle = resolved ? INK.caption : INK.brass;
    ctx.fillRect(L.label.x, top + L.stake.y, STAKE_RULE_WIDTH * weight, L.stake.height);

    const move =
      Math.round(row.model.price * 100) - Math.round(row.model.openingPrice * 100);
    const tone = move > 0 ? INK.up : move < 0 ? INK.down : INK.flat;

    this.paintSpark(ctx, row, top, tone);

    /*
     * The price, wiped in column by column.
     *
     * A split-flap flips; a bulb board sweeps. Each column crosses from the old
     * digits to the new ones as the leading edge passes it, with the edge
     * itself running hot — which is what a bank of incandescents does when it
     * changes, and it costs one number per column rather than a state machine
     * per character.
     */
    this.paintPriceInto(ctx, row, top, tone, dim);

    if (resolved) {
      ctx.fillStyle = STATUS_COLOR[row.model.status];
      ctx.font = `600 11px ${this.fonts.mono}`;
      ctx.fillText(row.model.status.replace("-", " ").toUpperCase(), L.label.x, top + L.rowH - 4);
    }

    ctx.restore();
  }

  /** Repaint just the price cell of a row, mid-wipe. */
  private paintPrice(index: number) {
    const row = this.rows[index];
    if (!row) return;
    const L = BOARD_LAYOUT;
    const top = L.wellTop + index * L.rowH;
    const x = L.price.x - 8;
    const width = L.designWidth - L.pad - 2 - x;

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.beginPath();
    ctx.rect(x, top, width, L.rowH);
    ctx.clip();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    const well = this.wellRect();
    const grad = ctx.createLinearGradient(0, well.y, 0, well.y + well.height);
    grad.addColorStop(0, INK.wellTop);
    grad.addColorStop(1, INK.wellBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(x, top, width, L.rowH);
    if (index > 0) {
      ctx.fillStyle = INK.rule;
      ctx.fillRect(x, top, width, 1);
    }

    const move =
      Math.round(row.model.price * 100) - Math.round(row.model.openingPrice * 100);
    const tone = move > 0 ? INK.up : move < 0 ? INK.down : INK.flat;
    this.paintPriceInto(ctx, row, top, tone, row.model.status === "open" ? 1 : 0.55);
    ctx.restore();
  }

  /**
   * The price, wiped in column by column, plus the move beside it.
   *
   * A split-flap flips; a bulb board sweeps. Each column crosses from the old
   * digits to the new as the leading edge passes it, and the edge itself runs
   * hot — which is what a bank of incandescents does when it changes, and it
   * costs one number per column rather than a state machine per character.
   */
  private paintPriceInto(
    ctx: CanvasRenderingContext2D,
    row: RowState,
    top: number,
    tone: string,
    dim: number,
  ) {
    const L = BOARD_LAYOUT;
    const next = row.digits;
    const previous = row.previous;
    const cols = Math.max(next.cols, previous?.cols ?? 0);
    const edge = Math.max(0, row.wipe) * (cols + WIPE_LEAD * 2) - WIPE_LEAD;
    // Sampled by column and row rather than by flat index: the two grids can
    // differ in width — "9" is narrower than "50" — and anything outside the
    // outgoing grid is simply dark.
    const litIn = (grid: DotGrid | null, c: number, r: number) =>
      !!grid && c < grid.cols && grid.on[r * grid.cols + c];

    for (let r = 0; r < next.rows; r += 1) {
      const y = top + 5 + r * L.price.pitch;
      for (let c = 0; c < cols; c += 1) {
        const t = Math.min(1, Math.max(0, (edge - c) / WIPE_LEAD));
        const lit = t >= 0.5 ? litIn(next, c, r) : litIn(previous, c, r);
        const flare = lit && t > 0 && t < 1 ? 1.35 : 1;
        paintBulb(
          ctx,
          L.price.x + c * L.price.pitch,
          y,
          L.price.radius,
          lit ? dim * flare : 0,
        );
      }
    }

    const move =
      Math.round(row.model.price * 100) - Math.round(row.model.openingPrice * 100);
    ctx.fillStyle = tone;
    ctx.font = `700 21px ${this.fonts.mono}`;
    ctx.textAlign = "right";
    ctx.fillText(
      move === 0 ? "—" : `${move > 0 ? "▲" : "▼"}${Math.abs(move)}`,
      L.delta.x,
      top + L.delta.y,
    );
    ctx.textAlign = "left";
  }

  /** Repaint just the header strip, for the trade counter. */
  private paintHeaderBand() {
    const ctx = this.begin(0, BOARD_LAYOUT.wellTop);
    const grad = ctx.createLinearGradient(0, 0, 0, this.panelHeight);
    grad.addColorStop(0, INK.caseTop);
    grad.addColorStop(1, INK.caseBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(-1, -1, this.panelWidth + 2, BOARD_LAYOUT.wellTop + 1);
    this.paintHeader(ctx);
    ctx.restore();
  }

  /**
   * The session line, scaled to its own range rather than to 0..100.
   *
   * Absolute scaling drew eight almost perfectly flat lines at eight different
   * heights, which told you what the price column already had. A sparkline's
   * whole job is the shape, so it gets the full height of its cell whatever the
   * range — and the dashed line is the opening price, so the shape has
   * something to be a move *from*.
   */
  private paintSpark(
    ctx: CanvasRenderingContext2D,
    row: RowState,
    top: number,
    tone: string,
  ) {
    const S = BOARD_LAYOUT.spark;
    const points = row.history.length >= 2 ? row.history : [row.model.openingPrice, row.model.price];
    const lo = Math.min(...points, row.model.openingPrice);
    const hi = Math.max(...points, row.model.openingPrice);
    const span = Math.max(0.04, hi - lo);
    const at = (v: number) => top + S.y + (1 - (v - lo) / span) * S.height;

    ctx.strokeStyle = "rgba(255,190,110,0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(S.x, at(row.model.openingPrice));
    ctx.lineTo(S.x + S.width, at(row.model.openingPrice));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = tone;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = S.x + (i / Math.max(1, points.length - 1)) * S.width;
      if (i) ctx.lineTo(x, at(v));
      else ctx.moveTo(x, at(v));
    });
    ctx.stroke();
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/* --------------------------------------------------------------------- tape */

/**
 * The tape, painted as one long strip that tiles.
 *
 * This is why the tape costs nothing. The strip is drawn once per change and
 * then scrolled by sliding the texture's UV offset — no repaint, no upload, no
 * DOM animation. The canvas ends exactly after the last whole item so the wrap
 * has no seam to show.
 */
export function paintTapeStrip(
  items: BoardTapeItem[],
  scale: number,
  minWidth: number,
): HTMLCanvasElement {
  const fonts = boardFonts();
  const height = BOARD_LAYOUT.tapeH;
  if (items.length === 0) return blankTape(scale, minWidth, fonts.mono);

  /**
   * Lay one item out, and optionally draw it. Returns how far it advances.
   *
   * Measuring and drawing are the same pass on purpose. They were separate,
   * with the measurer estimating what the drawer would do, and the two
   * disagreed by a few pixels an item — invisible on a static strip and fatal
   * on a tiling one, because the accumulated error is exactly the gap that
   * appears every time the loop comes round.
   */
  const layout = (
    ctx: CanvasRenderingContext2D,
    item: BoardTapeItem,
    startX: number,
    paint: boolean,
  ): number => {
    let x = startX;
    const y = height / 2;
    const put = (text: string, color: string, size: number, gap: number) => {
      ctx.font = `${size}px ${fonts.mono}`;
      if (paint) {
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      }
      x += ctx.measureText(text).width + gap;
    };

    put(item.market, INK.tape, 11, 8);
    put(item.side, item.side === "YES" ? INK.up : INK.down, 11, 8);
    put(String(Math.round(item.contracts)), INK.caption, 11, 8);
    put(String(Math.round(item.price * 100)), "#f4e9cf", 11, item.move !== 0 ? 3 : 8);
    if (item.move !== 0) {
      const delta = `${item.move > 0 ? "▲" : "▼"}${Math.abs(item.move)}`;
      put(delta, item.move > 0 ? INK.up : INK.down, 9.5, 8);
    }
    if (item.who) put(item.who, INK.amber, 11, 8);

    x += 16;
    put("◆", "#4a3a26", 7, 16);
    return x - startX;
  };

  const ruler = document.createElement("canvas").getContext("2d")!;
  ruler.textBaseline = "middle";
  const order: number[] = [];
  let total = 0;
  while (total < minWidth * 1.4 && order.length < 400) {
    const index = order.length % items.length;
    order.push(index);
    total += layout(ruler, items[index], 0, false);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(total * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "middle";

  let x = 0;
  for (const index of order) x += layout(ctx, items[index], x, true);

  return canvas;
}

function blankTape(scale: number, minWidth: number, mono: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(minWidth * scale);
  canvas.height = Math.round(BOARD_LAYOUT.tapeH * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "middle";
  ctx.font = `11px ${mono}`;
  ctx.fillStyle = INK.flat;
  ctx.fillText("WAITING FOR THE FIRST TRADE OF THE SESSION", 24, BOARD_LAYOUT.tapeH / 2);
  return canvas;
}

/**
 * The tape's fixed furniture: the label block at the left and the fades at both
 * ends, so items enter and leave the tape rather than popping.
 *
 * Painted separately and laid over the crawling strip, because it is the one
 * part of the tape that must not move.
 */
export function paintTapeOverlay(scale: number, width: number): HTMLCanvasElement {
  const fonts = boardFonts();
  const height = BOARD_LAYOUT.tapeH;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const labelW = 74;
  ctx.fillStyle = "#0d0906";
  ctx.fillRect(0, 0, labelW, height);
  ctx.fillStyle = "rgba(246,214,158,0.035)";
  ctx.fillRect(0, 0, labelW, height);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(labelW - 1, 0, 1, height);

  ctx.fillStyle = INK.caption;
  ctx.font = `9px ${fonts.mono}`;
  ctx.textBaseline = "middle";
  let cursor = 12;
  for (const char of "TAPE") {
    ctx.fillText(char, cursor, height / 2);
    cursor += ctx.measureText(char).width + 9 * 0.24;
  }

  const fade = (from: number, to: number) => {
    const gradient = ctx.createLinearGradient(from, 0, to, 0);
    gradient.addColorStop(0, "rgba(6,4,3,1)");
    gradient.addColorStop(1, "rgba(6,4,3,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.min(from, to), 0, Math.abs(to - from), height);
  };
  fade(labelW, labelW + 44);
  fade(width, width - 44);

  return canvas;
}
