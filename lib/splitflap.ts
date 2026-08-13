/**
 * Split-flap mechanics, kept pure so the feel can be tuned and tested without
 * a browser.
 *
 * The physical constraint being modelled: a Solari drum only turns one way. To
 * get from Q to B it passes through R, S, T ... and wraps around through blank.
 * That constraint is the whole reason the display is satisfying, so we obey it
 * rather than teleporting to the target.
 */

/** Blank first, then letters, then digits, then punctuation — as on a real board. */
export const TEXT_CHARSET =
  " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,'?!-/&%:+";

export const DIGIT_CHARSET = "0123456789";

export interface FlipTiming {
  /** Milliseconds for one flap to fall, before deceleration. */
  baseMs: number;
  /** How many flips at the end of the run are slowed down. */
  decelFlips: number;
  /** Duration multiplier on the final flip. */
  decelMax: number;
  /** Fractional random variation per flip, so the row never sounds machine-timed. */
  jitter: number;
}

export const DEFAULT_TIMING: FlipTiming = {
  baseMs: 56,
  decelFlips: 5,
  decelMax: 2.8,
  jitter: 0.14,
};

/**
 * Cheap deterministic hash to a 0..1 float. Deterministic matters: the same
 * price change produces the same clatter every time, so tuning is repeatable.
 */
export function hashRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Normalise an arbitrary character onto the board's alphabet. */
export function normalizeChar(char: string, charset: string): string {
  const upper = char.toUpperCase();
  return charset.includes(upper) ? upper : charset.includes(" ") ? " " : charset[0];
}

/**
 * The glyphs a single position passes through, in order, ending on `to`.
 *
 * Returns an empty array when the character is unchanged: an unchanged flap
 * must stay still, otherwise the eye cannot tell which numbers actually moved,
 * which is the one thing the board exists to communicate.
 *
 * `minFlips` forces a short hop like 3 -> 4 to take the long way round the
 * drum, so every change reads as a real mechanical event rather than a blink.
 */
export function flipPath(
  from: string,
  to: string,
  charset: string = TEXT_CHARSET,
  minFlips = 1,
): string[] {
  const n = charset.length;
  const start = charset.indexOf(normalizeChar(from, charset));
  const end = charset.indexOf(normalizeChar(to, charset));

  if (start < 0 || end < 0) return [];
  if (start === end) return [];

  let distance = (end - start + n) % n;
  // Add whole revolutions until the run is long enough to look mechanical.
  while (distance < minFlips) distance += n;

  const path: string[] = [];
  for (let k = 1; k <= distance; k += 1) {
    path.push(charset[(start + k) % n]);
  }
  return path;
}

/**
 * Per-flip durations for one character's run.
 *
 * Constant speed through the middle, then the last few flips stretch out so the
 * drum eases to a stop instead of stopping dead. The deceleration is quadratic,
 * which lands closer to how a real flap loses momentum than a linear ramp.
 */
export function flipDurations(
  count: number,
  seed = 0,
  timing: FlipTiming = DEFAULT_TIMING,
): number[] {
  const { baseMs, decelFlips, decelMax, jitter } = timing;
  const durations: number[] = [];

  for (let k = 0; k < count; k += 1) {
    const remaining = count - k; // count down to 1 on the final flip
    let multiplier = 1;
    if (remaining <= decelFlips) {
      const t = (decelFlips - remaining) / Math.max(1, decelFlips - 1); // 0 -> 1
      multiplier = 1 + (decelMax - 1) * t * t;
    }
    const wobble = 1 + jitter * (hashRandom(seed * 31 + k) - 0.5);
    durations.push(baseMs * multiplier * wobble);
  }
  return durations;
}

/** Total wall time for a run of flips, ignoring stagger. */
export function runDuration(durations: number[]): number {
  return durations.reduce((sum, d) => sum + d, 0);
}

/**
 * Pad and clip a string to a fixed number of flap positions.
 *
 * Boards have a fixed number of drums; text does not get to overflow them. When
 * the text is too long it is cut back to a word boundary rather than mid-word,
 * so a narrow board shows "ENTERPRISE TIER" instead of "ENTERPRISE TIER D".
 * A mid-word cut reads as a rendering fault; a clean word cut reads as an
 * abbreviation, which is what a real board does.
 *
 * The word boundary is only used if it keeps most of the available drums lit.
 * Otherwise a single long word would blank most of the row, and a hard clip is
 * the more informative failure.
 */
export function fitToWidth(
  text: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  const source = text.toUpperCase();
  let clipped = source.slice(0, width);

  if (source.length > width) {
    const lastSpace = clipped.lastIndexOf(" ");
    if (lastSpace >= Math.floor(width * 0.6)) {
      clipped = clipped.slice(0, lastSpace);
    }
  }

  return align === "left" ? clipped.padEnd(width, " ") : clipped.padStart(width, " ");
}

/** A price in (0,1) as the two digits the board shows. */
export function priceToDigits(price: number): string {
  const pct = Math.round(Math.min(0.99, Math.max(0.01, price)) * 100);
  return String(pct).padStart(2, "0");
}
