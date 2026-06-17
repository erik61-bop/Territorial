import React, { useRef, useEffect } from 'react';
import { PLAYER_COLORS, TERRAIN_COLORS, TERRAIN_SHADE } from './colors';
import type { MapInfo, Snapshot } from '../state/store';

// Web renderer using a plain Canvas2D context — no WebGL, no WASM. The board is a width x height
// pixel image (owner colour shaded by terrain, with a capture-flash) scaled up, plus capital rings
// and a tap marker. Same props/interface as the native Skia GameCanvas.
export interface Camera { scale: number; tx: number; ty: number; }
export interface TapMark { x: number; y: number; kind: 'attack' | 'expand' | 'spawn'; }

const TAP_COLOR = { attack: 'rgba(255,80,80,0.95)', expand: 'rgba(255,255,255,0.9)', spawn: 'rgba(120,255,150,0.95)' };

interface Props {
  map: MapInfo;
  snap: Snapshot;
  camera: Camera;
  screenW: number;
  screenH: number;
  tap: TapMark | null;
  myId: number;
}

export default function GameCanvas({ map, snap, camera, screenW, screenH, tap, myId }: Props) {
  const canvasRef = useRef<any>(null);
  const offRef = useRef<any>(null);
  const prevOwner = useRef<number[] | null>(null);
  const heat = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, terrain } = map;
    const n = width * height;

    // Offscreen 1px-per-cell image.
    if (!offRef.current) offRef.current = document.createElement('canvas');
    const off = offRef.current;
    off.width = width; off.height = height;
    const octx = off.getContext('2d');
    const img = octx.createImageData(width, height);
    const px = img.data;

    if (!heat.current || heat.current.length !== n) heat.current = new Float32Array(n);
    const h = heat.current;
    const prev = prevOwner.current;
    let changed = 0;
    if (prev && prev.length === n) for (let i = 0; i < n; i++) if (prev[i] !== snap.owner[i]) changed++;
    const reset = !prev || prev.length !== n || changed > n * 0.2;

    const np = snap.army.length;
    const sumX = new Float64Array(np), sumY = new Float64Array(np), cnt = new Int32Array(np);

    for (let i = 0; i < n; i++) {
      const o = snap.owner[i];
      const t = terrain[i] ?? 0;
      let r: number, g: number, b: number;
      if (o >= 0) {
        const base = PLAYER_COLORS[o % PLAYER_COLORS.length];
        const k = TERRAIN_SHADE[t] ?? 1;
        r = base[0] * k; g = base[1] * k; b = base[2] * k;
        // Nation border: darken the rim where this cell meets a different owner.
        const x = i % width, y = (i / width) | 0;
        sumX[o] += x; sumY[o] += y; cnt[o]++;
        const edge =
          (x > 0 && snap.owner[i - 1] !== o) || (x < width - 1 && snap.owner[i + 1] !== o) ||
          (y > 0 && snap.owner[i - width] !== o) || (y < height - 1 && snap.owner[i + width] !== o);
        if (edge) { r *= 0.5; g *= 0.5; b *= 0.5; }
      } else {
        const c = TERRAIN_COLORS[t] ?? TERRAIN_COLORS[0];
        r = c[0]; g = c[1]; b = c[2];
      }
      if (!reset && prev![i] !== o) h[i] = 1; else h[i] *= 0.45;
      if (h[i] > 0.05) { const f = Math.min(1, h[i]) * 0.6; r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
      const j = i * 4;
      px[j] = Math.min(255, r); px[j + 1] = Math.min(255, g); px[j + 2] = Math.min(255, b); px[j + 3] = 255;
    }
    prevOwner.current = snap.owner;
    octx.putImageData(img, 0, 0);

    // Composite to the visible canvas under the camera transform, crisp pixels.
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.imageSmoothingEnabled = false;
    const { scale, tx, ty } = camera;
    ctx.drawImage(off, 0, 0, width, height, tx, ty, width * scale, height * scale);

    // Capital rings (snapshot capitals reflect chosen spawns).
    const caps = snap.capitals?.length ? snap.capitals : map.capitals;
    for (let pid = 0; pid < caps.length; pid++) {
      const cell = caps[pid];
      if (!snap.alive[pid] || cell == null || cell < 0) continue;
      const cx = tx + (cell % width) * scale + scale / 2;
      const cy = ty + Math.floor(cell / width) * scale + scale / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, scale * (pid === myId ? 1.4 : 0.9)), 0, Math.PI * 2);
      ctx.lineWidth = pid === myId ? 2.5 : 1.5;
      ctx.strokeStyle = pid === myId ? '#fff' : 'rgba(255,255,255,0.8)';
      ctx.stroke();
    }

    // Nation army labels at each territory's centroid, coloured by your relation to them, so the
    // strategy is readable: army vs land shows who's overextended; colour shows friend/foe.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rel = snap.rel?.[myId] ?? [];
    for (let p = 0; p < np; p++) {
      if (!snap.alive[p] || cnt[p] < 8) continue;
      const lx = tx + (sumX[p] / cnt[p] + 0.5) * scale;
      const ly = ty + (sumY[p] / cnt[p] + 0.5) * scale;
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
  }, [map, snap, camera, screenW, screenH, tap, myId]);

  return React.createElement('canvas', {
    ref: canvasRef,
    width: screenW,
    height: screenH,
    style: { position: 'absolute', left: 0, top: 0, width: screenW, height: screenH, pointerEvents: 'none' },
  });
}
