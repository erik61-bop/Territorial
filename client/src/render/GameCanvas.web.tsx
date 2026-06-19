import React, { useRef, useEffect } from 'react';
import { PLAYER_COLORS, TERRAIN_COLORS, TERRAIN_SHADE } from './colors';
import { terrainHeight, projX, projY, BASE_H, ISO_V } from './iso';
import type { MapInfo, Snapshot } from '../state/store';

// Web renderer — 2.5D ISOMETRIC on plain Canvas2D (no WebGL). Driven by a requestAnimationFrame loop
// that reads a LIVE camera ref, so panning/zooming stays smooth and never waits on React re-renders.
// Terrain sets each cell's height (mountains/cities up, water sunk) with shaded side-faces; painter's
// order back-to-front by x+y.
export interface Camera { scale: number; tx: number; ty: number; }
export interface TapMark { x: number; y: number; kind: 'attack' | 'expand' | 'spawn'; }

const TAP_COLOR = { attack: 'rgba(255,80,80,0.95)', expand: 'rgba(255,255,255,0.9)', spawn: 'rgba(120,255,150,0.95)' };
const RIGHT_FACE = 0.60;
const FRONT_FACE = 0.44;

// Terrain sprite icons (served from public/terrain/*.png). Lazily loaded once; returns the image
// only when it's decoded, so the renderer falls back to vector shapes until then.
const ICON_SRC: Record<string, string> = { forest: '/terrain/forest.png', mountain: '/terrain/mountain.png', city: '/terrain/city.png' };
const iconCache: Record<string, HTMLImageElement | undefined> = {};
function icon(name: string): HTMLImageElement | undefined {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return undefined;
  if (!iconCache[name]) { const im = new Image(); im.src = ICON_SRC[name]; iconCache[name] = im; }
  const im = iconCache[name];
  return im && im.complete && im.naturalWidth > 0 ? im : undefined;
}

interface Props {
  map: MapInfo;
  snap: Snapshot;
  cameraRef: { current: Camera };   // live camera (mutated by input) — read every animation frame
  screenW: number;
  screenH: number;
  tap: TapMark | null;
  myId: number;
}

export default function GameCanvas({ map, snap, cameraRef, screenW, screenH, tap, myId }: Props) {
  const canvasRef = useRef<any>(null);
  const prevOwner = useRef<number[] | null>(null);
  const heat = useRef<Float32Array | null>(null);
  const heights = useRef<{ w: number; h: number; arr: Float32Array } | null>(null);
  const arrows = useRef<Map<number, number>>(new Map());
  const arrowsTick = useRef<number>(-1);

  // Latest props mirrored into refs so the rAF loop always reads current data without re-subscribing.
  const P = useRef({ map, snap, screenW, screenH, tap, myId });
  P.current = { map, snap, screenW, screenH, tap, myId };

  useEffect(() => {
    let raf = 0;
    const last = { tx: NaN, ty: NaN, scale: NaN, snap: null as Snapshot | null, tap: null as TapMark | null, w: 0, h: 0 };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { map, snap, screenW, screenH, tap, myId } = P.current;
      const cam = cameraRef.current;
      const { width, height, terrain } = map;
      const n = width * height;

      if (!heights.current || heights.current.w !== width || heights.current.h !== height) {
        const arr = new Float32Array(n);
        for (let i = 0; i < n; i++) arr[i] = terrainHeight(terrain[i] ?? 0);
        heights.current = { w: width, h: height, arr };
      }
      const hgt = heights.current.arr;
      const heightAt = (x: number, y: number) =>
        (x < 0 || y < 0 || x >= width || y >= height) ? BASE_H : hgt[y * width + x];

      if (!heat.current || heat.current.length !== n) heat.current = new Float32Array(n);
      const hh = heat.current;
      const prev = prevOwner.current;
      let changed = 0;
      if (prev && prev.length === n) for (let i = 0; i < n; i++) if (prev[i] !== snap.owner[i]) changed++;
      const reset = !prev || prev.length !== n || changed > n * 0.2;

      const VISION = 11;
      const fog = snap.phase === 0 && myId >= 0 && (snap.land?.[myId] ?? 0) > 0;
      let visible: Uint8Array | null = null;
      if (fog) {
        visible = new Uint8Array(n);
        let frontier: number[] = [];
        for (let i = 0; i < n; i++) if (snap.owner[i] === myId) { visible[i] = 1; frontier.push(i); }
        for (let step = 0; step < VISION && frontier.length; step++) {
          const next: number[] = [];
          for (const c of frontier) {
            const x = c % width, y = (c / width) | 0;
            if (x > 0 && !visible[c - 1]) { visible[c - 1] = 1; next.push(c - 1); }
            if (x < width - 1 && !visible[c + 1]) { visible[c + 1] = 1; next.push(c + 1); }
            if (y > 0 && !visible[c - width]) { visible[c - width] = 1; next.push(c - width); }
            if (y < height - 1 && !visible[c + width]) { visible[c + width] = 1; next.push(c + width); }
          }
          frontier = next;
        }
      }

      const bg = ctx.createLinearGradient(0, 0, 0, screenH);
      bg.addColorStop(0, '#16395c'); bg.addColorStop(1, '#0a2236');   // deep ocean (land sits in a sea)
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, screenW, screenH);

      const np = snap.army.length;
      const sumX = new Float64Array(np), sumY = new Float64Array(np), cnt = new Int32Array(np);
      const margin = cam.scale * (ISO_V + 4);
      const drawSides = cam.scale > 5;
      const borderDetail = cam.scale > 4;
      const decor = cam.scale > 6.5;   // draw terrain icons (trees/peaks/castles) once zoomed in enough
      const coast = cam.scale > 5;     // sandy beach rim where land meets sea

      const quad = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, css: string) => {
        ctx.fillStyle = css;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath();
        ctx.fill();
      };

      for (let d = 0; d <= (width - 1) + (height - 1); d++) {
        const cxLo = Math.max(0, d - (height - 1));
        const cxHi = Math.min(width - 1, d);
        for (let cx = cxLo; cx <= cxHi; cx++) {
          const cy = d - cx;
          const i = cy * width + cx;
          const h = hgt[i];
          const scx = projX(cx + 0.5, cy + 0.5, cam);
          const scy = projY(cx + 0.5, cy + 0.5, h, cam);
          if (scx < -margin || scx > screenW + margin || scy < -margin || scy > screenH + margin) continue;

          const o = snap.owner[i];
          const t = terrain[i] ?? 0;
          const hidden = !!visible && visible[i] === 0;

          let r: number, g: number, b: number;
          if (o >= 0 && !hidden) {
            const base = PLAYER_COLORS[(snap.colors?.[o] ?? o) % PLAYER_COLORS.length];
            const k = TERRAIN_SHADE[t] ?? 1;
            r = base[0] * k; g = base[1] * k; b = base[2] * k;
            const x = i % width, y = (i / width) | 0;
            sumX[o] += x; sumY[o] += y; cnt[o]++;
            if (borderDetail) {
              const edge =
                (x > 0 && snap.owner[i - 1] !== o) || (x < width - 1 && snap.owner[i + 1] !== o) ||
                (y > 0 && snap.owner[i - width] !== o) || (y < height - 1 && snap.owner[i + width] !== o);
              if (edge) { r *= 0.62; g *= 0.62; b *= 0.62; }
            }
          } else {
            const c = TERRAIN_COLORS[t] ?? TERRAIN_COLORS[0];
            r = c[0]; g = c[1]; b = c[2];
          }
          // Beach: tint land/neutral cells that border the sea toward sand.
          if (coast && !hidden && o !== -2 && t !== 5) {
            const wn = (cx > 0 && snap.owner[i - 1] === -2) || (cx < width - 1 && snap.owner[i + 1] === -2) ||
                       (cy > 0 && snap.owner[i - width] === -2) || (cy < height - 1 && snap.owner[i + width] === -2);
            if (wn) { r += (228 - r) * 0.34; g += (210 - g) * 0.34; b += (162 - b) * 0.34; }
          }
          if (!hidden) {
            if (!reset && prev![i] !== o) hh[i] = (prev![i] === myId && o !== myId) ? -1 : 1;
            else hh[i] *= 0.45;
            const fa = Math.min(1, Math.abs(hh[i]));
            if (fa > 0.05) {
              const f = fa * 0.6;
              if (hh[i] > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
              else { r += (255 - r) * f; g -= g * f * 0.6; b -= b * f * 0.6; }
            }
          } else {
            r *= 0.4; g *= 0.4; b *= 0.42;
          }
          const topLight = 1 + h * 0.12;
          r = Math.min(255, r * topLight); g = Math.min(255, g * topLight); b = Math.min(255, b * topLight);

          const ax = projX(cx, cy, cam),       ay = projY(cx, cy, h, cam);
          const bx = projX(cx + 1, cy, cam),   by = projY(cx + 1, cy, h, cam);
          const dx = projX(cx + 1, cy + 1, cam), dy = projY(cx + 1, cy + 1, h, cam);
          const ex = projX(cx, cy + 1, cam),   ey = projY(cx, cy + 1, h, cam);

          if (drawSides) {
            const hR = heightAt(cx + 1, cy);
            if (hR < h) {
              const byb = projY(cx + 1, cy, hR, cam), dyb = projY(cx + 1, cy + 1, hR, cam);
              quad(bx, by, dx, dy, dx, dyb, bx, byb, `rgb(${(r * RIGHT_FACE) | 0},${(g * RIGHT_FACE) | 0},${(b * RIGHT_FACE) | 0})`);
            }
            const hF = heightAt(cx, cy + 1);
            if (hF < h) {
              const eyb = projY(cx, cy + 1, hF, cam), dyb = projY(cx + 1, cy + 1, hF, cam);
              quad(ex, ey, dx, dy, dx, dyb, ex, eyb, `rgb(${(r * FRONT_FACE) | 0},${(g * FRONT_FACE) | 0},${(b * FRONT_FACE) | 0})`);
            }
          }
          quad(ax, ay, bx, by, dx, dy, ex, ey, `rgb(${r | 0},${g | 0},${b | 0})`);

          // Terrain icons so cities/forests/mountains are legible (not just a brightness shade).
          // Forest/mountain are regions, so only decorate ~half the cells (a stable checker) — enough
          // to read the terrain without burying the owner colour; cities are sparse so always shown.
          if (decor && !hidden && (t === 1 || t === 2 || t === 3)) {
            const ccx = (ax + bx + dx + ex) / 4, ccy = (ay + by + dy + ey) / 4;
            const s = cam.scale;
            const sparse = ((cx + cy) & 1) === 0;
            const img = (t === 3 || sparse) ? icon(t === 1 ? 'forest' : t === 2 ? 'mountain' : 'city') : undefined;
            if (img) {                                       // sprite icon (preferred)
              const sz = s * (t === 3 ? 1.9 : 1.5);
              ctx.drawImage(img, ccx - sz * 0.5, ccy - sz * 0.82, sz, sz);
            } else if (t === 2 && sparse) {                  // --- vector fallback while sprites load ---
                                                             // MOUNTAIN: grey peak with a snow cap
              ctx.fillStyle = 'rgba(95,98,110,0.92)';
              ctx.beginPath(); ctx.moveTo(ccx, ccy - s * 0.5); ctx.lineTo(ccx - s * 0.42, ccy + s * 0.22); ctx.lineTo(ccx + s * 0.42, ccy + s * 0.22); ctx.closePath(); ctx.fill();
              ctx.fillStyle = 'rgba(238,242,250,0.92)';
              ctx.beginPath(); ctx.moveTo(ccx, ccy - s * 0.5); ctx.lineTo(ccx - s * 0.13, ccy - s * 0.18); ctx.lineTo(ccx + s * 0.13, ccy - s * 0.18); ctx.closePath(); ctx.fill();
            } else if (t === 1 && sparse) {                  // FOREST: a little pine
              ctx.fillStyle = 'rgba(70,48,28,0.9)'; ctx.fillRect(ccx - s * 0.04, ccy + s * 0.06, s * 0.08, s * 0.18);
              ctx.fillStyle = 'rgba(30,98,50,0.92)';
              ctx.beginPath(); ctx.moveTo(ccx, ccy - s * 0.4); ctx.lineTo(ccx - s * 0.24, ccy + s * 0.1); ctx.lineTo(ccx + s * 0.24, ccy + s * 0.1); ctx.closePath(); ctx.fill();
            } else if (t === 3) {                            // CITY: a pale keep with battlements (always)
              ctx.fillStyle = 'rgba(235,220,180,0.98)';
              ctx.fillRect(ccx - s * 0.32, ccy - s * 0.1, s * 0.64, s * 0.4);
              for (let kk = -1; kk <= 1; kk++) ctx.fillRect(ccx + kk * s * 0.22 - s * 0.08, ccy - s * 0.26, s * 0.16, s * 0.18);
              ctx.strokeStyle = 'rgba(70,52,28,0.85)'; ctx.lineWidth = 1; ctx.strokeRect(ccx - s * 0.32, ccy - s * 0.1, s * 0.64, s * 0.4);
            }
          }
          // Water ripples so the sea isn't flat (sparse light arcs).
          if (decor && t === 5 && ((cx * 3 + cy) % 3 === 0)) {
            const ccx = (ax + bx + dx + ex) / 4, ccy = (ay + by + dy + ey) / 4, s = cam.scale;
            ctx.strokeStyle = 'rgba(196,224,247,0.40)'; ctx.lineWidth = Math.max(1, s * 0.07);
            ctx.beginPath(); ctx.arc(ccx, ccy + s * 0.06, s * 0.26, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
          }
          // River ripple (smaller, bluer than sea).
          if (decor && t === 4 && ((cx + cy) & 1) === 0) {
            const ccx = (ax + bx + dx + ex) / 4, ccy = (ay + by + dy + ey) / 4, s = cam.scale;
            ctx.strokeStyle = 'rgba(150,200,238,0.55)'; ctx.lineWidth = Math.max(1, s * 0.08);
            ctx.beginPath(); ctx.arc(ccx, ccy, s * 0.2, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
          }
          // Plain: faint grass flecks so flat land isn't a solid colour block.
          if (decor && t === 0 && !hidden && ((cx * 2 + cy) % 3 === 0)) {
            const ccx = (ax + bx + dx + ex) / 4, ccy = (ay + by + dy + ey) / 4, s = cam.scale;
            ctx.fillStyle = 'rgba(110,135,72,0.26)';
            ctx.fillRect(ccx - s * 0.16, ccy + s * 0.02, s * 0.1, s * 0.08);
            ctx.fillRect(ccx + s * 0.05, ccy - s * 0.05, s * 0.08, s * 0.07);
          }
        }
      }
      prevOwner.current = snap.owner;

      const cenX = new Float64Array(np), cenY = new Float64Array(np);
      const hasC = new Uint8Array(np);
      for (let p = 0; p < np; p++) {
        if (!snap.alive[p] || cnt[p] < 8) continue;
        cenX[p] = projX(sumX[p] / cnt[p] + 0.5, sumY[p] / cnt[p] + 0.5, cam);
        cenY[p] = projY(sumX[p] / cnt[p] + 0.5, sumY[p] / cnt[p] + 0.5, 0.4, cam);
        hasC[p] = 1;
      }

      const am = arrows.current;
      if (snap.tick !== arrowsTick.current) {
        arrowsTick.current = snap.tick;
        for (const k of [...am.keys()]) { const v = am.get(k)! * 0.5; if (v < 0.06) am.delete(k); else am.set(k, v); }
        const at = snap.attacks ?? [];
        for (let i = 0; i + 1 < at.length; i += 2) am.set(at[i] * 1000 + at[i + 1], 1);
      }
      for (const [key, str] of am) {
        const a = (key / 1000) | 0, t = key % 1000;
        if (!hasC[a] || !hasC[t]) continue;
        const x1 = cenX[a], y1 = cenY[a], x2 = cenX[t], y2 = cenY[t];
        const dxx = x2 - x1, dyy = y2 - y1; const len = Math.hypot(dxx, dyy) || 1;
        const ux = dxx / len, uy = dyy / len;
        const mine = a === myId, threat = t === myId;
        const col = mine ? '255,213,74' : threat ? '255,90,80' : '230,235,247';
        const alpha = (mine || threat ? 0.85 : 0.4) * Math.min(1, str);
        const tipX = x2 - ux * (cam.scale * 0.6), tipY = y2 - uy * (cam.scale * 0.6);
        ctx.strokeStyle = `rgba(${col},${alpha})`;
        ctx.lineWidth = mine || threat ? 3 : 1.6;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(tipX, tipY); ctx.stroke();
        const ah = Math.max(6, cam.scale * 0.7), pa = 0.5;
        ctx.fillStyle = `rgba(${col},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(tipX + ux * ah, tipY + uy * ah);
        ctx.lineTo(tipX - uy * ah * pa, tipY + ux * ah * pa);
        ctx.lineTo(tipX + uy * ah * pa, tipY - ux * ah * pa);
        ctx.closePath(); ctx.fill();
        // If the arrow crosses open sea, it's a naval invasion — draw a little ship at the midpoint.
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const ua = (mx - cam.tx) / cam.scale, ub = (my - cam.ty) / (cam.scale * 0.5);
        const gx = Math.floor((ua + ub) / 2), gy = Math.floor((ub - ua) / 2);
        if (gx >= 0 && gy >= 0 && gx < width && gy < height && snap.owner[gy * width + gx] === -2) {
          const ss = Math.max(7, cam.scale * 0.8);
          ctx.strokeStyle = 'rgba(50,38,20,0.95)'; ctx.lineWidth = Math.max(1, ss * 0.08);
          ctx.beginPath(); ctx.moveTo(mx, my - ss * 0.7); ctx.lineTo(mx, my + ss * 0.05); ctx.stroke();   // mast
          ctx.fillStyle = 'rgba(245,245,235,0.96)';                                                       // sail
          ctx.beginPath(); ctx.moveTo(mx, my - ss * 0.7); ctx.lineTo(mx, my); ctx.lineTo(mx + ss * 0.5, my); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(96,62,34,0.97)';                                                          // hull
          ctx.beginPath(); ctx.moveTo(mx - ss * 0.6, my); ctx.lineTo(mx + ss * 0.6, my); ctx.lineTo(mx + ss * 0.38, my + ss * 0.34); ctx.lineTo(mx - ss * 0.38, my + ss * 0.34); ctx.closePath(); ctx.fill();
        }
      }

      const caps = snap.capitals?.length ? snap.capitals : map.capitals;
      const relRow = snap.rel?.[myId] ?? [];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let pid = 0; pid < caps.length; pid++) {
        const cell = caps[pid];
        if (!snap.alive[pid] || cell == null || cell < 0) continue;
        if (visible && visible[cell] === 0) continue;
        const cxp = cell % width, cyp = (cell / width) | 0;
        const px = projX(cxp + 0.5, cyp + 0.5, cam);
        const py = projY(cxp + 0.5, cyp + 0.5, hgt[cell], cam) - cam.scale * 0.9;
        const me = pid === myId;
        const col = me ? '#ffd54a' : relRow[pid] === 2 ? '#8affb0' : relRow[pid] === 1 ? '#86d6ff' : '#ffffff';
        const cs = Math.max(12, cam.scale * (me ? 2.2 : 1.7));
        ctx.font = `${cs}px serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText('♛', px, py);
        ctx.fillStyle = col;
        ctx.fillText('♛', px, py);
        // A pennant in the OWNER's colour, so you can tell whose capital it is at a glance.
        const pc = PLAYER_COLORS[(snap.colors?.[pid] ?? pid) % PLAYER_COLORS.length];
        const fx = px + cs * 0.42, ftop = py - cs * 0.62;
        ctx.strokeStyle = 'rgba(40,30,15,0.9)'; ctx.lineWidth = Math.max(1, cs * 0.06);
        ctx.beginPath(); ctx.moveTo(fx, ftop); ctx.lineTo(fx, ftop + cs * 0.62); ctx.stroke();
        ctx.fillStyle = `rgb(${pc[0]},${pc[1]},${pc[2]})`;
        ctx.beginPath(); ctx.moveTo(fx, ftop); ctx.lineTo(fx + cs * 0.46, ftop + cs * 0.12); ctx.lineTo(fx, ftop + cs * 0.26); ctx.closePath(); ctx.fill();
      }

      const rel = snap.rel?.[myId] ?? [];
      for (let p = 0; p < np; p++) {
        if (!hasC[p]) continue;
        const lx = cenX[p], ly = cenY[p];
        if (lx < -40 || lx > screenW + 40 || ly < -20 || ly > screenH + 20) continue;
        const me = p === myId;
        const col = me ? '#ffd54a' : rel[p] === 2 ? '#8affb0' : rel[p] === 1 ? '#86d6ff' : '#ffffff';
        const txt = `${Math.round(snap.army[p])}`;
        ctx.font = `bold ${me ? 16 : 13}px sans-serif`;
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(txt, lx, ly);
        ctx.fillStyle = col;
        ctx.fillText(txt, lx, ly);
      }

      if (tap) {
        ctx.beginPath();
        ctx.arc(tap.x, tap.y, 15, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = TAP_COLOR[tap.kind];
        ctx.stroke();
      }
    };

    const loop = () => {
      const cam = cameraRef.current;
      const { snap, tap, screenW, screenH } = P.current;
      // Redraw only when something visible changed (camera moved, new snapshot/tap, or resize).
      if (cam.tx !== last.tx || cam.ty !== last.ty || cam.scale !== last.scale ||
          snap !== last.snap || tap !== last.tap || screenW !== last.w || screenH !== last.h) {
        last.tx = cam.tx; last.ty = cam.ty; last.scale = cam.scale;
        last.snap = snap; last.tap = tap; last.w = screenW; last.h = screenH;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cameraRef]);

  return React.createElement('canvas', {
    ref: canvasRef,
    width: screenW,
    height: screenH,
    style: { position: 'absolute', left: 0, top: 0, width: screenW, height: screenH, pointerEvents: 'none' },
  });
}
