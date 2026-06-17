import React, { useMemo } from 'react';
import {
  Canvas, Image, Skia, ColorType, AlphaType, FilterMode, MipmapMode, Circle, Group,
} from '@shopify/react-native-skia';
import { PLAYER_COLORS, TERRAIN_COLORS } from './colors';
import type { MapInfo, Snapshot } from '../state/store';

export interface Camera { scale: number; tx: number; ty: number; }
export interface TapMark { x: number; y: number; }

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
  const { width, height, terrain, capitals } = map;

  const image = useMemo(() => {
    const n = width * height;
    const px = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = snap.owner[i];
      const c = o >= 0 ? PLAYER_COLORS[o % PLAYER_COLORS.length] : TERRAIN_COLORS[terrain[i] ?? 0];
      const j = i * 4;
      px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = 255;
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
        <Circle cx={tap.x} cy={tap.y} r={14} color="rgba(255,255,255,0.9)" style="stroke" strokeWidth={3} />
      )}
    </Canvas>
  );
}
