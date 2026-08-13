import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMING,
  DIGIT_CHARSET,
  TEXT_CHARSET,
  fitToWidth,
  flipDurations,
  flipPath,
  hashRandom,
  normalizeChar,
  priceToDigits,
  runDuration,
} from "./splitflap";

describe("flipPath", () => {
  it("stays still when the character is unchanged", () => {
    // The one hard rule: an unchanged flap must not move, or the viewer cannot
    // tell which digit actually changed.
    expect(flipPath("A", "A", TEXT_CHARSET, 8)).toEqual([]);
    expect(flipPath("7", "7", DIGIT_CHARSET, 8)).toEqual([]);
  });

  it("only ever turns forward through the charset", () => {
    const path = flipPath("A", "D", TEXT_CHARSET, 1);
    expect(path).toEqual(["B", "C", "D"]);
  });

  it("wraps around the drum rather than reversing", () => {
    // 8 -> 1 on a digit drum goes 9, 0, 1. It never counts backwards.
    expect(flipPath("8", "1", DIGIT_CHARSET, 1)).toEqual(["9", "0", "1"]);
  });

  it("always lands on the target", () => {
    for (const from of DIGIT_CHARSET) {
      for (const to of DIGIT_CHARSET) {
        const path = flipPath(from, to, DIGIT_CHARSET, 8);
        if (from === to) {
          expect(path).toEqual([]);
        } else {
          expect(path[path.length - 1]).toBe(to);
        }
      }
    }
  });

  it("takes the long way round when the hop is too short to read", () => {
    // 3 -> 4 is one step. On its own that is a blink, not a mechanical event.
    const short = flipPath("3", "4", DIGIT_CHARSET, 1);
    expect(short).toHaveLength(1);

    const padded = flipPath("3", "4", DIGIT_CHARSET, 8);
    expect(padded.length).toBeGreaterThanOrEqual(8);
    expect(padded[padded.length - 1]).toBe("4");
    // A full extra revolution of the digit drum.
    expect(padded).toHaveLength(11);
  });

  it("never pads a run beyond one extra revolution than needed", () => {
    for (const from of DIGIT_CHARSET) {
      for (const to of DIGIT_CHARSET) {
        if (from === to) continue;
        const path = flipPath(from, to, DIGIT_CHARSET, 8);
        expect(path.length).toBeLessThanOrEqual(8 + DIGIT_CHARSET.length);
      }
    }
  });

  it("passes through every intermediate glyph exactly once per revolution", () => {
    const path = flipPath("0", "5", DIGIT_CHARSET, 8);
    expect(path).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1", "2", "3", "4", "5"]);
  });

  it("routes unknown characters to blank rather than throwing", () => {
    expect(normalizeChar("é", TEXT_CHARSET)).toBe(" ");
    expect(normalizeChar("~", TEXT_CHARSET)).toBe(" ");
    expect(() => flipPath("é", "A", TEXT_CHARSET, 4)).not.toThrow();
  });

  it("uppercases lowercase input, since the board has no lowercase drums", () => {
    expect(normalizeChar("q", TEXT_CHARSET)).toBe("Q");
    expect(flipPath("a", "c", TEXT_CHARSET, 1)).toEqual(["B", "C"]);
  });

  it("falls back to the first glyph when the charset has no blank", () => {
    expect(normalizeChar("Z", DIGIT_CHARSET)).toBe("0");
  });
});

describe("flipDurations", () => {
  it("produces one duration per flip", () => {
    expect(flipDurations(11, 1)).toHaveLength(11);
    expect(flipDurations(0, 1)).toHaveLength(0);
  });

  it("eases to a stop: the last flip is markedly slower than the middle", () => {
    const durations = flipDurations(14, 3, { ...DEFAULT_TIMING, jitter: 0 });
    const middle = durations[4];
    const last = durations[durations.length - 1];
    expect(last).toBeGreaterThan(middle * 2);
  });

  it("holds a constant speed before the deceleration window", () => {
    const durations = flipDurations(14, 3, { ...DEFAULT_TIMING, jitter: 0 });
    const cruise = durations.slice(0, 14 - DEFAULT_TIMING.decelFlips);
    for (const d of cruise) {
      expect(d).toBeCloseTo(DEFAULT_TIMING.baseMs, 8);
    }
  });

  it("slows monotonically once deceleration starts", () => {
    const durations = flipDurations(20, 7, { ...DEFAULT_TIMING, jitter: 0 });
    const tail = durations.slice(-DEFAULT_TIMING.decelFlips);
    for (let i = 1; i < tail.length; i += 1) {
      expect(tail[i]).toBeGreaterThan(tail[i - 1]);
    }
  });

  it("jitters so a row never sounds machine-timed", () => {
    const durations = flipDurations(10, 5);
    const unique = new Set(durations.map((d) => d.toFixed(6)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("is deterministic for the same seed, so tuning is repeatable", () => {
    expect(flipDurations(9, 42)).toEqual(flipDurations(9, 42));
    expect(flipDurations(9, 42)).not.toEqual(flipDurations(9, 43));
  });

  it("keeps a typical price move under a second", () => {
    // 11 flips is what a one-digit price change costs at minFlips 8.
    const total = runDuration(flipDurations(11, 1));
    expect(total).toBeGreaterThan(400);
    expect(total).toBeLessThan(1000);
  });

  it("never produces a non positive or absurd duration", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      for (const d of flipDurations(20, seed)) {
        expect(d).toBeGreaterThan(10);
        expect(d).toBeLessThan(400);
      }
    }
  });
});

describe("hashRandom", () => {
  it("stays inside [0,1)", () => {
    for (let i = 0; i < 1000; i += 1) {
      const v = hashRandom(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("fitToWidth", () => {
  it("pads short text to the number of drums", () => {
    expect(fitToWidth("ARR", 6)).toBe("ARR   ");
    expect(fitToWidth("ARR", 6, "right")).toBe("   ARR");
  });

  it("always returns exactly one character per drum", () => {
    for (const width of [4, 8, 12, 17, 28, 40]) {
      for (const text of ["", "ARR", "ENTERPRISE TIER DATED", "SUPERCALIFRAGILISTIC EXPI"]) {
        expect(fitToWidth(text, width)).toHaveLength(width);
      }
    }
  });

  it("cuts back to a word boundary instead of mid-word", () => {
    // A mid-word cut reads as a rendering fault. A clean cut reads as an
    // abbreviation, which is what a real board does.
    expect(fitToWidth("ENTERPRISE TIER DATED", 17)).toBe("ENTERPRISE TIER  ");
    expect(fitToWidth("PRICING CHANGE NAMED", 16)).toBe("PRICING CHANGE  ");
  });

  it("hard clips rather than blanking most of the row for one long word", () => {
    // Cutting at the space here would leave 3 of 12 drums lit, which is less
    // informative than a truncated word.
    expect(fitToWidth("ARR SUPERCALIFRAGILISTIC", 12)).toBe("ARR SUPERCAL");
  });

  it("uppercases, since the board has no lowercase drums", () => {
    expect(fitToWidth("arr clears 40m", 14)).toBe("ARR CLEARS 40M");
  });

  it("leaves exactly fitting text untouched", () => {
    expect(fitToWidth("ARR CLEARS 40M", 14)).toBe("ARR CLEARS 40M");
  });
});

describe("priceToDigits", () => {
  it("renders two digits", () => {
    expect(priceToDigits(0.18)).toBe("18");
    expect(priceToDigits(0.07)).toBe("07");
    expect(priceToDigits(0.5)).toBe("50");
  });

  it("clamps rather than showing 00 or 100", () => {
    expect(priceToDigits(0)).toBe("01");
    expect(priceToDigits(1)).toBe("99");
    expect(priceToDigits(0.999)).toBe("99");
  });

  it("rounds to the nearest point", () => {
    expect(priceToDigits(0.234)).toBe("23");
    expect(priceToDigits(0.236)).toBe("24");
  });
});
