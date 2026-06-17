import React, { useMemo } from 'react';
import {
  Canvas, Image, Skia, ColorType, AlphaType, FilterMode, MipmapMode, Circle, Group,
} from '@shopify/react-native-skia';
import { PLAYER_COLORS, TERRAIN_COLORS, TERRAIN_SHADE } from './colors';
import type { MapInfo, Snapshot } from '../state/store';

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

/**
 * Full-screen Skia canvas. The board is a width x height pixel image (owner colour, or terrain
 * when neutral) drawn under a camera transform (translate + scale, nearest-neighbour). Capitals
 * are ringed; your own capital is highlighted; a tap leaves a brief marker.
 */
export default function GameCanvas({ map, snap, camera, screenW, screenH, tap, myId }: Props) {
  const { width, height, terrain } = map;
  const capitals = snap.capitals?.length ? snap.capitals : map.capitals; // chosen spawns override

  const image = useMemo(() => {
    const n = width * height;
    const px = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = snap.owner[i];
      const t = terrain[i] ?? 0;
      const j = i * 4;
      if (o >= 0) {
        // Owned cell: player colour shaded by terrain so mountains/forests stay readable.
        const base = PLAYER_COLORS[o % PLAYER_COLORS.length];
        const k = TERRAIN_SHADE[t] ?? 1;
        px[j] = Math.min(255, base[0] * k);
        px[j + 1] = Math.min(255, base[1] * k);
        px[j + 2] = Math.min(255, base[2] * k);
      } else {
        const c = TERRAIN_COLORS[t];
        px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2];
      }
      px[j + 3] = 255;
    }
    const data = Skia.Data.fromBytes(px);
    return Skia.Image.MakeImage(
      { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
      data,
      width * 4,
    );
  }, [snap, width, height, terrain]);

  if (!image) return null;

  const { scale, tx, ty } = camera;
  const drawW = width * scale;
  const drawH = height * scale;
  const cellCx = (cell: number) => tx + (cell % width) * scale + scale / 2;
  const cellCy = (cell: number) => ty + Math.floor(cell / width) * scale + scale / 2;

  return (
    <Canvas style={{ width: screenW, height: screenH }}>
      <Image
        image={image}
        x={tx}
        y={ty}
        width={drawW}
        height={drawH}
        fit="fill"
        sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
      />
      <Group>
        {capitals.map((cell, pid) =>
          snap.alive[pid] && cell >= 0 ? (
            <Circle
              key={pid}
              cx={cellCx(cell)}
              cy={cellCy(cell)}
              r={Math.max(3, scale * (pid === myId ? 1.4 : 0.9))}
              color={pid === myId ? '#fff' : 'rgba(255,255,255,0.8)'}
              style="stroke"
              strokeWidth={pid === myId ? 2.5 : 1.5}
            />
          ) : null,
        )}
      </Group>
      {tap && (
        <Circle cx={tap.x} cy={tap.y} r={15} color={TAP_COLOR[tap.kind]} style="stroke" strokeWidth={3} />
      )}
    </Canvas>
  );
}
