import * as THREE from "three";
import { GLOW, SURFACE } from "@/lib/palette";

/**
 * Procedural textures for the hall.
 *
 * Generated into a canvas rather than downloaded. Nothing here needs to be
 * photographic — the room is dim and hazy, most of it sits behind fog, and the
 * camera never gets closer than a few metres to any of it. Generating them
 * keeps the app self-contained: no asset licensing, no network fetch, no
 * offline failure mode.
 *
 * The carpet is the highest-leverage thing in this file. A sportsbook floor is
 * a loud patterned carpet, and it does two jobs at once: it is most of what
 * makes the room read as a bar rather than a lobby, and it replaced a
 * real-time floor reflection that was the single most expensive thing in the
 * scene. Prettier and cheaper, which is not the usual trade.
 */

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Deterministic jitter, so a rebuild produces the same wall. */
function noise(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Glazed subway tile in a running bond, covering `metres` of real wall.
 *
 * Slight per-tile lightness variation is what stops it reading as wallpaper:
 * real glazed tile is never uniform, and a perfectly flat field of them looks
 * like a texture rather than a surface.
 */
export function subwayTileTexture(metres = 4): THREE.Texture {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;

  const cols = 6;
  const rows = 12;
  const tileW = size / cols;
  const tileH = size / rows;

  // Grout.
  ctx.fillStyle = "#171a1f";
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < rows; row += 1) {
    // Running bond: every other course is offset by half a tile.
    const offset = row % 2 === 0 ? 0 : tileW / 2;
    for (let col = -1; col <= cols; col += 1) {
      const x = col * tileW + offset;
      const y = row * tileH;
      const v = noise(col + offset, row);

      // Cream glaze, varying a little tile to tile.
      const base = 196 + Math.floor(v * 26);
      const g = ctx.createLinearGradient(x, y, x, y + tileH);
      g.addColorStop(0, `rgb(${base}, ${base - 6}, ${base - 18})`);
      g.addColorStop(1, `rgb(${base - 26}, ${base - 32}, ${base - 42})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, y + 2, tileW - 4, tileH - 4);

      // The bright edge along the top of each tile: glaze catching the light
      // from above, which is what makes the wall look wet and ceramic.
      ctx.fillStyle = `rgba(255,255,255,${0.16 + v * 0.1})`;
      ctx.fillRect(x + 2, y + 2, tileW - 4, 2);
    }
  }

  // Grime rising from the skirting. Clean tile everywhere reads as new-build.
  const grime = ctx.createLinearGradient(0, size, 0, size * 0.45);
  grime.addColorStop(0, "rgba(10,12,16,0.55)");
  grime.addColorStop(1, "rgba(10,12,16,0)");
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.metres = metres;
  return texture;
}

/** Finish a canvas as a tiling surface texture covering `metres` of surface. */
function tiling(canvas: HTMLCanvasElement, metres: number): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.metres = metres;
  return texture;
}

/**
 * Patterned carpet, in the sportsbook tradition.
 *
 * The pattern is deliberately busy. Casino and sportsbook carpet is loud for
 * a practical reason — it hides everything — and the visual effect is that the
 * floor stops being a surface and becomes texture, which is exactly what stops
 * a big room reading as empty. A tasteful floor here looks like a conference
 * centre.
 *
 * Every motif is drawn on a lattice whose cell divides the canvas evenly, and
 * the loops run one cell past each edge, so it tiles with no seam.
 */
export function carpetTexture(metres = 3): THREE.Texture {
  const size = 512;
  const cell = 128; // divides 512, so the lattice wraps
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = SURFACE.carpetGround;
  ctx.fillRect(0, 0, size, size);

  // Pile. Without this the pattern reads as printed vinyl rather than woven.
  for (let i = 0; i < 9000; i += 1) {
    const x = noise(i, 11) * size;
    const y = noise(i, 12) * size;
    const light = noise(i, 13);
    ctx.fillStyle =
      light > 0.5 ? `rgba(255,220,180,${0.03 + light * 0.05})` : `rgba(0,0,0,${0.04 + light * 0.08})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }

  // A diamond lattice: every other row offset by half a cell.
  for (let row = -1; row <= size / cell; row += 1) {
    for (let col = -1; col <= size / cell; col += 1) {
      const cx = col * cell + (row % 2 === 0 ? 0 : cell / 2);
      const cy = row * cell;
      const r = cell * 0.46;

      ctx.strokeStyle = SURFACE.carpetFigure;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();

      // A quatrefoil in the middle of each diamond, in the teal accent.
      ctx.fillStyle = SURFACE.carpetAccent;
      for (const [ox, oy] of [
        [0, -13],
        [13, 0],
        [0, 13],
        [-13, 0],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = SURFACE.carpetFigure;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();

      // Small gold pips out at the diamond points, to break up the lattice.
      for (const [ox, oy] of [
        [0, -r],
        [r, 0],
        [0, r],
        [-r, 0],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Knock the whole thing back. Fresh carpet in a bar is not a thing, and the
  // pattern has to sit under the furniture rather than shout over it.
  ctx.fillStyle = "rgba(20,8,10,0.32)";
  ctx.fillRect(0, 0, size, size);

  return tiling(canvas, metres);
}

/**
 * Walnut panelling: stiles, rails and a recessed panel, with grain.
 *
 * The bevel is what does the work. Two one-pixel lines — light along the top
 * and left of each recess, dark along the bottom and right — and a flat brown
 * rectangle becomes joinery under an overhead light. It is the cheapest
 * three-dimensionality in the whole scene.
 */
export function woodPanelTexture(metres = 2.4): THREE.Texture {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = SURFACE.walnutDeep;
  ctx.fillRect(0, 0, size, size);

  // Grain: long wavering vertical strokes, because the panels are quartersawn
  // and run with the height of the wall.
  for (let i = 0; i < 340; i += 1) {
    const x = noise(i, 21) * size;
    const light = noise(i, 22);
    ctx.strokeStyle =
      light > 0.55
        ? `rgba(150,105,64,${0.05 + light * 0.1})`
        : `rgba(12,6,3,${0.06 + light * 0.14})`;
    ctx.lineWidth = 0.6 + noise(i, 23) * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    for (let y = -10; y < size + 10; y += 32) {
      ctx.lineTo(x + Math.sin((y / size) * Math.PI * 2 + i) * 4, y);
    }
    ctx.stroke();
  }

  const panels = 2;
  const panelW = size / panels;
  const inset = 16;
  for (let p = 0; p < panels; p += 1) {
    const x = p * panelW;

    // The recessed field, a shade darker than the frame around it.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x + inset, inset, panelW - inset * 2, size - inset * 2);

    ctx.fillStyle = "rgba(196,150,96,0.22)"; // catching the light
    ctx.fillRect(x + inset, inset, panelW - inset * 2, 2);
    ctx.fillRect(x + inset, inset, 2, size - inset * 2);

    ctx.fillStyle = "rgba(0,0,0,0.55)"; // falling into shadow
    ctx.fillRect(x + inset, size - inset - 2, panelW - inset * 2, 2);
    ctx.fillRect(x + panelW - inset - 2, inset, 2, size - inset * 2);

    // The stile between panels.
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x - 1, 0, 2, size);
  }

  return tiling(canvas, metres);
}

/**
 * Pressed tin ceiling.
 *
 * A stamped square motif, repeated. Ceilings are the largest unbroken surface
 * in any room and the easiest to leave blank; a pattern up there is felt far
 * more than it is looked at.
 */
export function pressedTinTexture(metres = 2): THREE.Texture {
  const size = 512;
  const cell = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = SURFACE.tin;
  ctx.fillRect(0, 0, size, size);

  const emboss = (x: number, y: number, w: number, h: number, strength: number) => {
    ctx.strokeStyle = `rgba(214,168,104,${0.16 * strength})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0,0,0,${0.5 * strength})`;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  };

  for (let row = 0; row < size / cell; row += 1) {
    for (let col = 0; col < size / cell; col += 1) {
      const x = col * cell;
      const y = row * cell;
      emboss(x + 4, y + 4, cell - 8, cell - 8, 1);
      emboss(x + 20, y + 20, cell - 40, cell - 40, 0.8);
      emboss(x + 44, y + 44, cell - 88, cell - 88, 0.6);
      // The rosette in the middle of each tile.
      ctx.fillStyle = "rgba(214,168,104,0.1)";
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return tiling(canvas, metres);
}

/**
 * The back bar: rows of bottles against a lit shelf.
 *
 * Emissive, and the only place in the room with real colour saturation in the
 * bottles themselves. This is the single most recognisable object in a bar —
 * more than the counter, more than the stools — because it is the only lit
 * thing at standing height.
 */
export function bottleShelfTexture(): THREE.Texture {
  const w = 1024;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#120a06";
  ctx.fillRect(0, 0, w, h);

  const shelves = 3;
  const shelfH = h / shelves;
  const bottleTints = ["#c8912f", "#8a3f2a", "#2f6b4a", "#b8543a", "#d8b45a", "#3a5a8a"];

  for (let s = 0; s < shelves; s += 1) {
    const top = s * shelfH;

    // The lit strip under each shelf, which is what the bottles glow against.
    const wash = ctx.createLinearGradient(0, top, 0, top + shelfH);
    wash.addColorStop(0, "rgba(255,217,160,0.5)");
    wash.addColorStop(0.55, "rgba(255,190,120,0.14)");
    wash.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, top, w, shelfH);

    let x = 6;
    let i = 0;
    while (x < w) {
      const bw = 12 + noise(s * 31 + i, 41) * 12;
      const bh = shelfH * (0.5 + noise(s * 31 + i, 42) * 0.34);
      const tint = bottleTints[Math.floor(noise(s * 31 + i, 43) * bottleTints.length)];
      const by = top + shelfH - bh - 6;

      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, by, bw, bh);
      // Neck.
      ctx.fillRect(x + bw * 0.34, by - bh * 0.28, bw * 0.32, bh * 0.28);
      // The highlight down one side, which is all that makes it read as glass.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(255,240,210,0.9)";
      ctx.fillRect(x + 2, by, 2, bh);
      ctx.globalAlpha = 1;

      x += bw + 3 + noise(s * 31 + i, 44) * 5;
      i += 1;
    }

    // The shelf itself, in silhouette.
    ctx.fillStyle = "#0d0705";
    ctx.fillRect(0, top + shelfH - 6, w, 6);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * A secondary screen on a side wall.
 *
 * These are the cool counterpoint the palette depends on — a room lit entirely
 * in amber is monochrome in a warmer hue, and a bank of blue-white screens is
 * what makes the tungsten read as tungsten.
 *
 * They show a market moving rather than stock footage. The room is already
 * watching one board; these are the same floor, seen closer.
 */
export function wallScreenTexture(seed: number, label: string): THREE.Texture {
  const w = 512;
  const h = 288;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#071018";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(156,200,255,0.5)";
  ctx.font = "600 22px ui-monospace, monospace";
  ctx.fillText(label.toUpperCase(), 20, 38);

  // A price line, walked rather than random, so it looks like a series.
  const points: number[] = [];
  let value = 0.3 + noise(seed, 51) * 0.4;
  for (let i = 0; i < 48; i += 1) {
    value = Math.min(0.9, Math.max(0.1, value + (noise(seed * 13 + i, 52) - 0.5) * 0.09));
    points.push(value);
  }

  const plotTop = 62;
  const plotH = h - plotTop - 48;
  const xAt = (i: number) => 20 + (i / (points.length - 1)) * (w - 40);
  const yAt = (v: number) => plotTop + (1 - v) * plotH;

  const rising = points[points.length - 1] >= points[0];
  const line = rising ? "#6fca90" : "#e0715f";

  const fill = ctx.createLinearGradient(0, plotTop, 0, plotTop + plotH);
  fill.addColorStop(0, rising ? "rgba(111,202,144,0.34)" : "rgba(224,113,95,0.34)");
  fill.addColorStop(1, "rgba(7,16,24,0)");
  ctx.beginPath();
  ctx.moveTo(xAt(0), plotTop + plotH);
  points.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
  ctx.lineTo(xAt(points.length - 1), plotTop + plotH);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = line;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((v, i) => (i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v))));
  ctx.stroke();

  ctx.fillStyle = "#e8f2ff";
  ctx.font = "700 44px ui-monospace, monospace";
  ctx.fillText(`${Math.round(points[points.length - 1] * 100)}`, 20, h - 12);
  ctx.fillStyle = line;
  ctx.font = "600 20px ui-monospace, monospace";
  ctx.fillText(rising ? "▲" : "▼", 82, h - 14);

  // Scanlines. Barely visible, and the difference between "a screen" and "a
  // picture of a chart stuck to the wall".
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * A neon sign, as glowing tube on transparent.
 *
 * One sign. Neon is punctuation — a wall of it is a theme pub, and the room
 * only needs the single spot of saturated cool colour to sell the rest.
 */
export function neonSignTexture(text: string, color: string = GLOW.neonPink): THREE.Texture {
  const w = 1024;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d")!;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 128px 'Barlow Condensed', ui-sans-serif, sans-serif";

  // Three passes: a wide bloom, a tighter halo, then the tube itself. Neon is
  // mostly the glow — drawing the letterform alone gives you a sticker.
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.shadowBlur = 72;
  ctx.globalAlpha = 0.55;
  ctx.strokeText(text, w / 2, h / 2);

  ctx.shadowBlur = 28;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 7;
  ctx.strokeText(text, w / 2, h / 2);

  // The hot core of the tube reads as near-white, whatever colour the gas is.
  ctx.shadowBlur = 10;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#fff4f7";
  ctx.lineWidth = 2.5;
  ctx.strokeText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Poured concrete for the floor and ceiling. Mottled, never flat. */
export function concreteTexture(metres = 8): THREE.Texture {
  const size = 512;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#22252c";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i += 1) {
    const x = noise(i, 1) * size;
    const y = noise(i, 2) * size;
    const r = 1 + noise(i, 3) * 15;
    const shade = noise(i, 4);
    ctx.fillStyle =
      shade > 0.5
        ? `rgba(255,255,255,${0.012 + shade * 0.02})`
        : `rgba(0,0,0,${0.02 + shade * 0.05})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.metres = metres;
  return texture;
}

/**
 * The pane in front of the board.
 *
 * Glass is only ever visible as what it reflects, so this is nothing but a
 * reflection: one soft diagonal streak of the room across the top-left, a
 * darkening toward the edges where the pane turns away, and a bright hairline
 * along the top where it meets the bezel.
 *
 * It reads far more strongly than it should because of parallax — the pane
 * hangs a few centimetres in front of the drums, so walking past slides the
 * streak across them. That separation is the actual cue; this texture just
 * gives it something to move.
 */
export function glassTexture(): THREE.Texture {
  const w = 512;
  const h = 256;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d")!;

  /*
   * A small highlight in one corner. Small is the entire lesson here.
   *
   * Two earlier versions raked a soft band across the pane — 13% white, then
   * 6%. Both sounded subtle and both landed as a pale smear lying directly over
   * the odds, which are the one thing in this room that has to stay legible. On
   * a real pane the reflection of a lit room is a *small, bright, hard-edged*
   * shape in one corner, not an even wash: glass reads far better from that
   * than from a large dim gradient, and it leaves the middle alone.
   */
  const glint = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.5);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(214,232,255,${alpha})`);
    g.addColorStop(0.55, `rgba(186,212,250,${alpha * 0.35})`);
    g.addColorStop(1, "rgba(176,204,244,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Top-left, where the ceiling coves would fall. And a faint second one
  // bottom-right, so the pane does not look lit from a single point.
  glint(w * 0.18, h * 0.2, w * 0.2, h * 0.12, 0.085);
  glint(w * 0.82, h * 0.84, w * 0.13, h * 0.07, 0.035);

  // Edges of the pane, turning away from the room and going dark. Held well
  // out so it does not eat the bottom row of markets.
  const edge = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.62, w * 0.5, h * 0.5, h * 1.15);
  edge.addColorStop(0, "rgba(5,7,11,0)");
  edge.addColorStop(1, "rgba(5,7,11,0.3)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);

  // Where the glass meets the bezel: a lit top edge, a dark bottom one.
  ctx.fillStyle = "rgba(214,232,255,0.16)";
  ctx.fillRect(0, 0, w, 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, h - 2, w, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A trader's name tag, painted rather than rendered as DOM.
 *
 * These were drei `<Html>` elements. Five small divs is not a frame budget
 * problem in itself, but they were the last DOM inside the canvas, and DOM
 * inside the canvas cannot be occluded, fogged or dimmed by distance — the
 * tags floated in front of the columns and stayed pin-sharp at the back of the
 * hall while their owners hazed out. As textures they are simply in the room.
 */
export function nameTagTexture(
  name: string,
  options: { leadership?: boolean; highlight?: boolean } = {},
): THREE.Texture {
  const scale = 3;
  const padX = 12;
  const dotW = options.leadership ? 14 : 0;
  const font = `600 13px "IBM Plex Mono", ui-monospace, monospace`;

  const measure = makeCanvas(8, 8).getContext("2d")!;
  measure.font = font;
  const tracking = 1.4;
  const textW =
    Array.from(name).reduce((sum, c) => sum + measure.measureText(c).width + tracking, 0) -
    tracking;

  const w = Math.ceil(padX * 2 + dotW + textW);
  const h = 24;
  const canvas = makeCanvas(w * scale, h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const accent = options.highlight ? "#e0a94a" : "#c9d1e0";
  ctx.fillStyle = options.highlight ? "rgba(38,29,12,0.82)" : "rgba(10,13,19,0.74)";
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, w - 1, h - 1, h / 2);
    ctx.fill();
    ctx.strokeStyle = options.highlight ? "rgba(224,169,74,0.5)" : "rgba(255,255,255,0.13)";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillRect(0, 0, w, h);
  }

  let x = padX;
  if (options.leadership) {
    ctx.fillStyle = "#e0a94a";
    ctx.beginPath();
    ctx.arc(x + 3, h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    x += dotW;
  }

  ctx.fillStyle = accent;
  ctx.font = font;
  ctx.textBaseline = "middle";
  for (const char of name) {
    ctx.fillText(char, x, h / 2 + 0.5);
    x += ctx.measureText(char).width + tracking;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // The world size the sprite should take, so the caller does not have to
  // measure the same string a second time.
  texture.userData.aspect = w / h;
  return texture;
}

/** Set a texture's repeat so one canvas tile covers `metres` of surface. */
export function repeatFor(
  texture: THREE.Texture,
  widthMetres: number,
  heightMetres: number,
): THREE.Texture {
  const metres = (texture.userData.metres as number) || 4;
  texture.repeat.set(widthMetres / metres, heightMetres / metres);
  texture.needsUpdate = true;
  return texture;
}
