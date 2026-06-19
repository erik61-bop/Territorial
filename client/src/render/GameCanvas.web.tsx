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
      bg.addColorStop(0, '#0b1018'); bg.addColorStop(1, '#05070b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, screenW, screenH);

      const np = snap.army.length;
      const sumX = new Float64Array(np), sumY = new Float64Array(np), cnt = new Int32Array(np);
      const margin = cam.scale * (ISO_V + 4);
      const drawSides = cam.scale > 5;
      const borderDetail = cam.scale > 4;

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
