"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  DEFAULT_TIMING,
  TEXT_CHARSET,
  flipDurations,
  flipPath,
  normalizeChar,
  type FlipTiming,
} from "@/lib/splitflap";

export interface SplitFlapCharProps {
  value: string;
  charset?: string;
  /** Force short hops to take the long way round the drum. */
  minFlips?: number;
  /** Stagger offset, in ms, applied before this character starts moving. */
  delayMs?: number;
  /** Deterministic variation seed, usually the character's index. */
  seed?: number;
  timing?: FlipTiming;
  /** Called once per landed flip. `isLast` marks the flip that arrives home. */
  onFlip?: (isLast: boolean) => void;
  className?: string;
}

/**
 * One character position on the board.
 *
 * React renders the shell exactly once. Every frame of the animation is written
 * straight to the DOM by GSAP and by direct textContent assignment — a state
 * update per flip would mean thousands of React renders during a cascade, and
 * the board would stutter precisely when it most needs to look expensive.
 */
export function SplitFlapChar({
  value,
  charset = TEXT_CHARSET,
  minFlips = 8,
  delayMs = 0,
  seed = 0,
  timing = DEFAULT_TIMING,
  onFlip,
  className,
}: SplitFlapCharProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const staticTopRef = useRef<HTMLSpanElement>(null);
  const staticBottomRef = useRef<HTMLSpanElement>(null);
  const leafFrontRef = useRef<HTMLDivElement>(null);
  const leafBackRef = useRef<HTMLDivElement>(null);
  const leafFrontGlyphRef = useRef<HTMLSpanElement>(null);
  const leafBackGlyphRef = useRef<HTMLSpanElement>(null);
  const shadeFrontRef = useRef<HTMLDivElement>(null);
  const shadeBackRef = useRef<HTMLDivElement>(null);

  /** The glyph actually on display right now. Updated as each flip lands. */
  const displayedRef = useRef<string>(normalizeChar(value, charset));
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  // Keep the callback fresh without making it an effect dependency, so a
  // parent re-render never restarts an in-flight animation. Assigned in an
  // effect rather than during render; this effect is declared first, so it has
  // always run by the time the animation effect below reads the ref.
  const onFlipRef = useRef(onFlip);
  useEffect(() => {
    onFlipRef.current = onFlip;
  });

  useEffect(() => {
    const target = normalizeChar(value, charset);
    if (target === displayedRef.current) return;

    const leafFront = leafFrontRef.current;
    const leafBack = leafBackRef.current;
    const shadeFront = shadeFrontRef.current;
    const shadeBack = shadeBackRef.current;
    const staticTop = staticTopRef.current;
    const staticBottom = staticBottomRef.current;
    const frontGlyph = leafFrontGlyphRef.current;
    const backGlyph = leafBackGlyphRef.current;
    const root = rootRef.current;
    if (
      !leafFront || !leafBack || !shadeFront || !shadeBack ||
      !staticTop || !staticBottom || !frontGlyph || !backGlyph || !root
    ) {
      return;
    }

    /** Snap every face to one glyph and reset the leaves to rest. */
    const commit = (glyph: string) => {
      staticTop.textContent = glyph;
      staticBottom.textContent = glyph;
      frontGlyph.textContent = glyph;
      backGlyph.textContent = glyph;
      gsap.set(leafFront, { rotateX: 0 });
      gsap.set(leafBack, { rotateX: 90 });
      gsap.set([shadeFront, shadeBack], { opacity: 0 });
      displayedRef.current = glyph;
    };

    // A new target arriving mid-run: stop where we are and re-path from the
    // glyph currently on display. The board does not queue, it redirects.
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
      commit(displayedRef.current);
    }

    const path = flipPath(displayedRef.current, target, charset, minFlips);
    if (path.length === 0) return;

    const durations = flipDurations(path.length, seed, timing);
    const tl = gsap.timeline({
      delay: delayMs / 1000,
      onStart: () => root.classList.add("is-flipping"),
      onComplete: () => {
        root.classList.remove("is-flipping");
        timelineRef.current = null;
      },
    });

    path.forEach((glyph, index) => {
      const half = durations[index] / 2000; // ms -> s, split across the two leaves
      const isLast = index === path.length - 1;

      // Stage the incoming glyph behind the falling leaf. The outgoing glyph
      // stays on the front leaf and on the static bottom until it is covered.
      tl.call(() => {
        staticTop.textContent = glyph;
        backGlyph.textContent = glyph;
      });

      // The upper card falls forward, uncovering the incoming top half.
      tl.set(leafFront, { rotateX: 0 })
        .set(shadeFront, { opacity: 0 })
        .to(leafFront, { rotateX: -90, duration: half, ease: "power2.in" })
        .to(shadeFront, { opacity: 0.9, duration: half, ease: "power2.in" }, "<");

      // The lower card swings down over the outgoing bottom half.
      tl.set(leafBack, { rotateX: 90 })
        .set(shadeBack, { opacity: 0.9 })
        .to(leafBack, { rotateX: 0, duration: half, ease: "power2.out" })
        .to(shadeBack, { opacity: 0, duration: half, ease: "power2.out" }, "<");

      // Landed. Reset both leaves for the next flip without a visible frame:
      // the static faces already show this glyph, so nothing flickers.
      tl.call(() => {
        staticBottom.textContent = glyph;
        frontGlyph.textContent = glyph;
        gsap.set(leafFront, { rotateX: 0 });
        gsap.set(leafBack, { rotateX: 90 });
        gsap.set([shadeFront, shadeBack], { opacity: 0 });
        displayedRef.current = glyph;
        onFlipRef.current?.(isLast);
      });
    });

    timelineRef.current = tl;

    return () => {
      tl.kill();
      if (timelineRef.current === tl) timelineRef.current = null;
      root.classList.remove("is-flipping");
    };
  }, [value, charset, minFlips, delayMs, seed, timing]);

  const initial = normalizeChar(value, charset);

  return (
    <div
      ref={rootRef}
      className={`flap${className ? ` ${className}` : ""}`}
      data-space={initial === " " ? "true" : undefined}
      aria-hidden="true"
    >
      {/* Static halves, behind the leaves. */}
      <div className="flap__face flap__face--top">
        <span className="flap__glyph" ref={staticTopRef}>
          {initial}
        </span>
      </div>
      <div className="flap__face flap__face--bottom">
        <span className="flap__glyph" ref={staticBottomRef}>
          {initial}
        </span>
      </div>

      {/* The two moving leaves. */}
      <div
        className="flap__face flap__face--top flap__face--leaf flap__face--leaf-front"
        ref={leafFrontRef}
      >
        <span className="flap__glyph" ref={leafFrontGlyphRef}>
          {initial}
        </span>
        <div className="flap__shade" ref={shadeFrontRef} />
      </div>
      <div
        className="flap__face flap__face--bottom flap__face--leaf flap__face--leaf-back"
        ref={leafBackRef}
      >
        <span className="flap__glyph" ref={leafBackGlyphRef}>
          {initial}
        </span>
        <div className="flap__shade" ref={shadeBackRef} />
      </div>

      <div className="flap__seam" />
      <div className="flap__pin flap__pin--left" />
      <div className="flap__pin flap__pin--right" />
    </div>
  );
}
