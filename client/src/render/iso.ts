// Isometric (2.5D) projection + terrain elevation, shared by the renderer, input picking, minimap.
//
// Grid step +x -> screen (+scale, +scale/2); +y -> screen (-scale, +scale/2). Height lifts a cell
// up the screen by h * scale * V. We project grid VERTICES (i in 0..W, j in 0..H); a cell (x,y)'s
// top face is the quad of vertices (x,y)(x+1,y)(x+1,y+1)(x,y+1) at that cell's height.

export const ISO_V = 2.2;          // vertical exaggeration per unit of terrain height
export const BASE_H = -0.32;       // ground/water floor the map edges + water drop down to

// Terrain ordinals: PLAIN=0 FOREST=1 MOUNTAIN=2 CITY=3 RIVER=4 WATER=5
const HEIGHTS = [0.0, 0.16, 0.62, 0.26, -0.06, -0.22];
export function terrainHeight(t: number): number {
  return HEIGHTS[t] ?? 0;
}

export interface IsoCam {
  scale: number; // px per grid half-step (zoom)
  tx: number;    // screen origin x (vertex 0,0 lands here)
  ty: number;    // screen origin y
}

/** Project grid vertex (x,y) at height h to screen [sx, sy]. */
export function projX(x: number, y: number, cam: IsoCam): number {
  return cam.tx + (x - y) * cam.scale;
}
export function projY(x: number, y: number, h: number, cam: IsoCam): number {
  return cam.ty + (x + y) * cam.scale * 0.5 - h * cam.scale * ISO_V;
}

/** Flat inverse (ignores height) — cursor screen point -> continuous grid (x,y). Good enough for picking. */
export function unproject(sx: number, sy: number, cam: IsoCam): { x: number; y: number } {
  const a = (sx - cam.tx) / cam.scale;          // = x - y
  const b = (sy - cam.ty) / (cam.scale * 0.5);  // = x + y  (height ignored)
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Height-aware inverse: a raised tile's TOP appears shifted up the screen by 2*h*ISO_V in (x+y).
 * Iterate so clicking a mountain/city picks that tile, not the ground cell in front of it.
 * `heightOf(x,y)` returns a cell's terrain height (BASE_H off-map).
 */
export function unprojectH(sx: number, sy: number, cam: IsoCam, heightOf: (x: number, y: number) => number): { x: number; y: number } {
  const a = (sx - cam.tx) / cam.scale;          // x - y (height-independent)
  const b0 = (sy - cam.ty) / (cam.scale * 0.5); // x + y at height 0
  let x = (a + b0) / 2, y = (b0 - a) / 2;
  for (let iter = 0; iter < 5; iter++) {
    const h = heightOf(Math.floor(x), Math.floor(y));
    const b = b0 + 2 * h * ISO_V;
    x = (a + b) / 2; y = (b - a) / 2;
  }
  return { x, y };
}

/** Camera so that grid cell (cx,cy) at height h sits at screen (centerX, centerY). */
export function centerOn(cx: number, cy: number, h: number, scale: number, centerX: number, centerY: number): IsoCam {
  const base: IsoCam = { scale, tx: 0, ty: 0 };
  // Solve tx,ty so proj(cx+0.5, cy+0.5) == center.
  return {
    scale,
    tx: centerX - (projX(cx + 0.5, cy + 0.5, base) - base.tx),
    ty: centerY - (projY(cx + 0.5, cy + 0.5, h, base) - base.ty),
  };
}
