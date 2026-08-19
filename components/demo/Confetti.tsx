"use client";

/**
 * A burst of paper when a call comes in.
 *
 * Hand-rolled rather than pulled in, for the same reason the board is: it is
 * eighty lines of canvas, it has to match a specific palette, and a dependency
 * that ships its own colours and its own idea of physics would be more work to
 * talk out of them than to write.
 *
 * Two rules it follows. It only fires when *you* won something — confetti for a
 * market you had no stake in is noise, and confetti for a loss is worse than
 * noise. And it respects `prefers-reduced-motion` by not running at all, since
 * there is nothing here to degrade to; the payout is already stated in numbers
 * a foot high.
 */

import { useEffect, useRef } from "react";
import type { SettlementEvent } from "@/components/trading/TradingProvider";

const COLORS = ["#7fe0a0", "#e0a94a", "#e8e4da", "#c9bda4", "#5fbf85"];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
}

/**
 * Takes the settlement rather than a boolean, and decides for itself.
 *
 * Deciding here keeps the whole thing stateless — a ref remembers which
 * settlement has already been celebrated, and no React state is written from an
 * effect. The rules it applies: only if you were holding, only if it paid more
 * than it cost, and never on a void, because being handed your own money back
 * is a relief rather than a win.
 */
export function Confetti({ settlement }: { settlement: SettlementEvent | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const frameRef = useRef(0);
  const celebratedRef = useRef<number | null>(null);

  useEffect(() => {
    const yours = settlement?.yours;
    if (!settlement || !yours) return;
    if (celebratedRef.current === settlement.at) return;
    celebratedRef.current = settlement.at;
    if (yours.outcome === "VOID" || yours.profit <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Scaled by how well the call did, so the long shot coming in is visibly a
    // bigger deal than the safe one — which it is.
    const ratio = yours.staked > 0 ? yours.profit / yours.staked : 1;
    const intensity = Math.min(2.2, 0.8 + ratio * 0.5);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /*
     * Two cannons, from the bottom corners, angled inwards.
     *
     * A single burst from the centre reads as a popup effect; two from the
     * edges reads as a room reacting, and it leaves the middle of the screen —
     * where the payout figure is — comparatively clear.
     */
    const count = Math.round(70 * intensity);
    const pieces: Piece[] = [];
    for (let i = 0; i < count; i += 1) {
      const fromLeft = i % 2 === 0;
      const spread = (Math.random() - 0.5) * 0.7;
      const speed = 11 + Math.random() * 9;
      const angle = (fromLeft ? -1.05 : -2.09) + spread;
      pieces.push({
        x: fromLeft ? -10 : width + 10,
        y: height * (0.82 + Math.random() * 0.12),
        vx: Math.cos(angle) * speed * (fromLeft ? -1 : 1) * -1,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 6,
        h: 3 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
      });
    }
    piecesRef.current = pieces;

    const step = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = 0;

      for (const p of piecesRef.current) {
        if (p.life <= 0) continue;
        p.vy += 0.34; // gravity
        p.vx *= 0.992; // drag
        p.vy *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        // Fades only once it is falling, so the rise reads at full strength.
        if (p.vy > 0) p.life -= 0.011;
        if (p.y > height + 40 || p.life <= 0) {
          p.life = 0;
          continue;
        }
        alive += 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (alive > 0) {
        frameRef.current = window.requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(step);

    return () => window.cancelAnimationFrame(frameRef.current);
  }, [settlement]);

  return <canvas ref={canvasRef} className="confetti-layer" aria-hidden="true" />;
}
