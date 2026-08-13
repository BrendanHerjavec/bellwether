import * as THREE from "three";

/**
 * Procedural textures for the hall.
 *
 * Generated into a canvas rather than downloaded. Nothing here needs to be
 * photographic — the hall is dim and hazy and most surfaces sit well below mid
 * grey — and generating them keeps the app self-contained with no asset
 * licensing, no network fetch and no offline failure mode.
 *
 * The tile pattern is the single highest-leverage thing in the scene for
 * reading as a station rather than a meeting room. Nothing else says "subway"
 * as fast as a running-bond wall of glazed tile.
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
