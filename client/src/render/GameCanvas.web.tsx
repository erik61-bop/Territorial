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

    // Fog of war during PEACE only: you see your territory + a radius around it; rivals beyond that
    // are hidden. War lifts the fog. (Pre-spawn you see everything so you can pick a spawn.)
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

    for (let i = 0; i < n; i++) {
      const o = snap.owner[i];
      const t = terrain[i] ?? 0;
      const hidden = !!visible && visible[i] === 0;   // outside vision during PEACE -> fogged
      let r: number, g: number, b: number;
      if (o >= 0 && !hidden) {
        const base = PLAYER_COLORS[o % PLAYER_COLORS.length];
        const k = TERRAIN_SHADE[t] ?? 1;
        r = base[0] * k; g = base[1] * k; b = base[2] * k;
        // Nation border: darken the rim where this cell meets a different owner.
        const x = i % width, y = (i / width) | 0;
        sumX[o] += x; sumY[o] += y; cnt[o]++;        // only visible cells -> fogged nations get no label
        const edge =
          (x > 0 && snap.owner[i - 1] !== o) || (x < width - 1 && snap.owner[i + 1] !== o) ||
          (y > 0 && snap.owner[i - width] !== o) || (y < height - 1 && snap.owner[i + width] !== o);
        if (edge) { r *= 0.5; g *= 0.5; b *= 0.5; }
      } else {
        // Neutral, or a fogged cell: show only the terrain (ownership concealed).
        const c = TERRAIN_COLORS[t] ?? TERRAIN_COLORS[0];
        r = c[0]; g = c[1]; b = c[2];
      }
      if (!hidden) {
        if (!reset && prev![i] !== o) h[i] = 1; else h[i] *= 0.45;
        if (h[i] > 0.05) { const f = Math.min(1, h[i]) * 0.6; r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
      } else {
        r *= 0.4; g *= 0.4; b *= 0.42;               // fog of war: dim the unseen map
      }
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

    // Capitals: a crown, ringed in your relation colour (gold=you, green=ally, blue=peace, white=enemy).
    const caps = snap.capitals?.length ? snap.capitals : map.capitals;
    const relRow = snap.rel?.[myId] ?? [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let pid = 0; pid < caps.length; pid++) {
      const cell = caps[pid];
      if (!snap.alive[pid] || cell == null || cell < 0) continue;
      if (visible && visible[cell] === 0) continue;   // fogged capital -> hidden
      const cx = tx + (cell % width) * scale + scale / 2;
      const cy = ty + Math.floor(cell / width) * scale + scale / 2;
      const me = pid === myId;
      const col = me ? '#ffd54a' : relRow[pid] === 2 ? '#8affb0' : relRow[pid] === 1 ? '#86d6ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(4, scale * (me ? 1.5 : 1.0)), 0, Math.PI * 2);
      ctx.lineWidth = me ? 2.5 : 1.5;
      ctx.strokeStyle = col;
      ctx.stroke();
      const cs = Math.max(11, scale * (me ? 2.4 : 1.8));
      ctx.font = `${cs}px serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText('♛', cx, cy - cs * 0.05);
      ctx.fillStyle = col;
      ctx.fillText('♛', cx, cy - cs * 0.05);
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
