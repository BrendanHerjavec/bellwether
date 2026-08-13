"use client";

import { useMemo } from "react";
import { SplitFlapChar } from "./SplitFlapChar";
import { flapAudio } from "./flap-audio";
import {
  DEFAULT_TIMING,
  DIGIT_CHARSET,
  TEXT_CHARSET,
  fitToWidth,
  priceToDigits,
  type FlipTiming,
} from "@/lib/splitflap";

export interface SplitFlapTextProps {
  value: string;
  /** Number of drums. Text is padded or clipped to fit; boards do not reflow. */
  width?: number;
  align?: "left" | "right";
  charset?: string;
  minFlips?: number;
  /** Delay between adjacent characters starting, in ms. This is the ripple. */
  staggerMs?: number;
  /**
   * Fraction of flips that make a sound, 0..1.
   *
   * A 34 character row flipping 11 times each is nearly 400 clicks. Playing all
   * of them is a wall of white noise. Thinning long rows keeps the clatter
   * sounding like a board and lets the short price rows cut through it.
   */
  soundDensity?: number;
  timing?: FlipTiming;
  className?: string;
  /** Extra offset applied to every character, for sequencing whole rows. */
  baseDelayMs?: number;
  seedOffset?: number;
}

/** A row of drums showing a fixed-width string. */
export function SplitFlapText({
  value,
  width,
  align = "left",
  charset = TEXT_CHARSET,
  minFlips = 6,
  staggerMs = 26,
  soundDensity = 0.35,
  timing = DEFAULT_TIMING,
  className,
  baseDelayMs = 0,
  seedOffset = 0,
}: SplitFlapTextProps) {
  const chars = useMemo(() => {
    const fitted = width ? fitToWidth(value, width, align) : value.toUpperCase();
    return fitted.split("");
  }, [value, width, align]);

  return (
    <div
      className={`flap-row${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={value}
    >
      {chars.map((char, index) => (
        <SplitFlapChar
          key={index}
          value={char}
          charset={charset}
          minFlips={minFlips}
          delayMs={baseDelayMs + index * staggerMs}
          seed={seedOffset + index}
          timing={timing}
          onFlip={(isLast) => {
            // The arriving flip always sounds; the ones passed through are
            // thinned. That is what makes a cascade resolve rather than just
            // stop — you hear the row land.
            if (isLast) flapAudio.click(0.95);
            else if (Math.random() < soundDensity) flapAudio.click(0.45);
          }}
        />
      ))}
    </div>
  );
}

export interface SplitFlapPriceProps {
  /** Probability in (0,1). Rendered as two digits. */
  price: number;
  minFlips?: number;
  staggerMs?: number;
  timing?: FlipTiming;
  className?: string;
  seedOffset?: number;
}

/**
 * The price readout: two digit drums.
 *
 * Digits get a higher minimum flip count than text. A price moving 23 -> 24 is
 * the single most important event on the board, and one lazy flip would not
 * register from the back of a room.
 */
export function SplitFlapPrice({
  price,
  minFlips = 9,
  staggerMs = 55,
  timing = DEFAULT_TIMING,
  className,
  seedOffset = 0,
}: SplitFlapPriceProps) {
  const digits = priceToDigits(price).split("");

  return (
    <div
      className={`flap-row${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`${Math.round(price * 100)} percent`}
    >
      {digits.map((digit, index) => (
        <SplitFlapChar
          key={index}
          value={digit}
          charset={DIGIT_CHARSET}
          minFlips={minFlips}
          delayMs={index * staggerMs}
          seed={seedOffset + index * 7}
          timing={timing}
          onFlip={(isLast) => flapAudio.click(isLast ? 1 : 0.6)}
        />
      ))}
    </div>
  );
}
