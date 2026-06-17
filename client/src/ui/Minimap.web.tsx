import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGame } from '../state/store';
import { PLAYER_COLORS, TERRAIN_COLORS } from '../render/colors';
import type { Camera } from '../render/GameCanvas';

const W = 196, H = 150;

/** Bottom-right overview of the whole map with a viewport rectangle. Web (Canvas2D). */
export default function Minimap({ camera, screenW, screenH }: { camera: Camera; screenW: number; screenH: number }) {
  const map = useGame((s) => s.map);
  const snap = useGame((s) => s.snap);
  const ref = useRef<any>(null);
  const offRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !snap) return;
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const { width, height, terrain } = map;
    if (!offRef.current) offRef.current = document.createElement('canvas');
    const off = offRef.current; off.width = width; off.height = height;
    const octx = off.getContext('2d');
    const img = octx.createImageData(width, height);
    const px = img.data;
    for (let i = 0; i < width * height; i++) {
      const o = snap.owner[i];
      const col = o >= 0 ? PLAYER_COLORS[o % PLAYER_COLORS.length] : (TERRAIN_COLORS[terrain[i] ?? 0] ?? TERRAIN_COLORS[0]);
      const j = i * 4; px[j] = col[0]; px[j + 1] = col[1]; px[j + 2] = col[2]; px[j + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    const scale = Math.min(W / width, H / height);
    const dw = width * scale, dh = height * scale, ox = (W - dw) / 2, oy = (H - dh) / 2;
    ctx.fillStyle = '#0a0c12'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, width, height, ox, oy, dw, dh);
    // viewport rectangle (map cells currently on screen)
    const vx0 = Math.max(0, -camera.tx / camera.scale);
    const vy0 = Math.max(0, -camera.ty / camera.scale);
    const vx1 = Math.min(width, (screenW - camera.tx) / camera.scale);
    const vy1 = Math.min(height, (screenH - camera.ty) / camera.scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + vx0 * scale, oy + vy0 * scale, (vx1 - vx0) * scale, (vy1 - vy0) * scale);
  }, [map, snap, camera, screenW, screenH]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>MINIMAP</Text>
      {React.createElement('canvas', { ref, width: W, height: H, style: { width: W, height: H, borderRadius: 8, display: 'block' } })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', right: 12, bottom: 12, padding: 8, borderRadius: 12,
    backgroundColor: 'rgba(15,18,28,0.9)', borderWidth: 1, borderColor: '#2a3145',
  },
  label: { color: '#8aa0c8', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
});
