"use client";

/**
 * The presenter's controls, and nothing the room needs to read.
 *
 * The caption is for the screen; the note underneath is for whoever is
 * talking. Keeping the speaker's line on the same strip as the transport is
 * the difference between a demo someone has rehearsed and one they are
 * remembering — and it means the beat sheet is legible without opening the
 * source.
 */

import type { Director } from "./useDemoDirector";
import { DEMO_DURATION_MS } from "@/lib/demo-script";

export function HostStrip({ director }: { director: Director }) {
  const { running, elapsedMs, beat, beats, beatIndex, toggle, next, restart } = director;
  const progress = Math.min(100, (elapsedMs / DEMO_DURATION_MS) * 100);

  return (
    <div className="host-strip">
      <div className="mx-auto max-w-[1500px]">
        <div className="host-strip__track">
          <div className="host-strip__fill" style={{ width: `${progress}%` }} />
          {/* A tick per beat, so a presenter can see how far the next one is. */}
          {beats.map((b, i) => (
            <span
              key={b.id}
              className="absolute top-0 h-full w-px"
              style={{
                left: `${(b.atMs / DEMO_DURATION_MS) * 100}%`,
                background: i <= beatIndex ? "rgba(5,6,10,0.5)" : "rgba(255,255,255,0.16)",
              }}
            />
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button type="button" className="host-button" data-primary={!running} onClick={toggle}>
            {running ? "Pause" : "Play"}
          </button>
          <button type="button" className="host-button" onClick={next}>
            Next beat →
          </button>
          <button type="button" className="host-button" onClick={restart}>
            Restart
          </button>

          <span className="ml-1 font-mono text-[10px] tabular-nums text-[#4d5464]">
            {clock(elapsedMs)}
          </span>

          <span className="ml-2 min-w-0 flex-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#e0a94a]">
              {beat?.caption ?? "Ready — press play"}
            </span>
            {beat && (
              <span className="ml-3 text-[11.5px] text-[#6a7183]">{beat.note}</span>
            )}
          </span>

          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#3d4352]">
            space · → · r
          </span>
        </div>
      </div>
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
