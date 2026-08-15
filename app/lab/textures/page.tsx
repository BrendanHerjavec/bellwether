"use client";

/**
 * Every surface in the hall, flat.
 *
 * The room's materials are generated into canvases (`components/hall/
 * textures.ts`), and in the scene they are seen at an angle, in fog, at a low
 * light level, twenty metres away. That is a terrible place to find out that
 * the carpet does not tile or that the panelling has no grain in it.
 *
 * So: each one at full size, on the ground it will actually sit against, with
 * the tiling ones repeated four times so a seam has somewhere to show.
 */

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  bottleShelfTexture,
  carpetTexture,
  neonSignTexture,
  pressedTinTexture,
  wallScreenTexture,
  woodPanelTexture,
} from "@/components/hall/textures";
import { AIR, GLOW } from "@/lib/palette";
import type * as THREE from "three";

interface Sample {
  name: string;
  note: string;
  texture: () => THREE.Texture;
  /** Tiling textures get repeated, so a seam has somewhere to show. */
  tile?: boolean;
  height?: number;
}

const SAMPLES: Sample[] = [
  {
    name: "Carpet",
    note: "Burgundy ground, gold lattice, teal quatrefoil. Loud on purpose — it is most of what makes the room a bar, and it replaced the floor reflection.",
    texture: carpetTexture,
    tile: true,
  },
  {
    name: "Walnut panelling",
    note: "Stiles, rails and a recessed field. The one-pixel bevel is what turns a brown rectangle into joinery.",
    texture: woodPanelTexture,
    tile: true,
  },
  {
    name: "Pressed tin ceiling",
    note: "Stamped squares. Felt more than looked at, but a blank ceiling is the fastest way to make a big room feel like an office.",
    texture: pressedTinTexture,
    tile: true,
  },
  {
    name: "Back bar",
    note: "Backlit bottles. The only saturated colour in the room and the only lit thing at standing height.",
    texture: bottleShelfTexture,
    height: 150,
  },
  {
    name: "Wall screen",
    note: "The cool counterpoint. A room lit entirely in amber is monochrome in a warmer hue; these are what make the tungsten read as tungsten.",
    texture: () => wallScreenTexture(3, "Roadmap"),
    height: 250,
  },
  {
    name: "Neon",
    note: "Three passes — wide bloom, halo, then a near-white core. Neon is mostly the glow; the letterform alone is a sticker.",
    texture: () => neonSignTexture("BELLWETHER", GLOW.neonPink),
    height: 170,
  },
];

export default function TextureLabPage() {
  return (
    <div className="min-h-full p-8" style={{ background: AIR.background }}>
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Link href="/board" className={LINK}>
            ← The hall
          </Link>
          <Link href="/lab/raster" className={LINK}>
            The board
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6a5236]">
            Tiling samples are repeated 2×2 — look for the seam
          </span>
        </div>

        <div className="grid gap-8">
          {SAMPLES.map((sample) => (
            <Swatch key={sample.name} sample={sample} />
          ))}
        </div>
      </div>
    </div>
  );
}

const LINK =
  "rounded border border-[#c08a3e]/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c08a3e] transition-colors hover:border-[#c08a3e]/60";

function Swatch({ sample }: { sample: Sample }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const texture = sample.texture();
    const source = texture.image as HTMLCanvasElement;

    const repeat = sample.tile ? 2 : 1;
    const out = document.createElement("canvas");
    out.width = source.width * repeat;
    out.height = source.height * repeat;
    const ctx = out.getContext("2d")!;
    for (let y = 0; y < repeat; y += 1) {
      for (let x = 0; x < repeat; x += 1) {
        ctx.drawImage(source, x * source.width, y * source.height);
      }
    }

    out.style.display = "block";
    out.style.width = "100%";
    out.style.height = "auto";
    out.style.borderRadius = "4px";
    element.replaceChildren(out);
    return () => texture.dispose();
  }, [sample]);

  return (
    <section>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#c08a3e]">
        {sample.name}
      </h2>
      <p className="mb-2 mt-1 max-w-3xl text-[12px] leading-snug text-[#8a7358]">
        {sample.note}
      </p>
      <div ref={host} style={{ maxHeight: sample.height, overflow: "hidden" }} />
    </section>
  );
}
