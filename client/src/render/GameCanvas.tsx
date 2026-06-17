import React, { useMemo } from 'react';
import {
  Canvas, Image, Skia, ColorType, AlphaType, FilterMode, MipmapMode, Circle, Group,
} from '@shopify/react-native-skia';
import { PLAYER_COLORS, TERRAIN_COLORS } from './colors';
import type { MapInfo, Snapshot } from '../state/store';

interface Props {
  map: MapInfo;
  snap: Snapshot;
  scale: number;
}

/**
 * Renders the board as a width x height pixel image (owner colour, or terrain when neutral),
 * scaled up with nearest-neighbour sampling. Capitals are drawn as ringed dots on top.
 */
export default function GameCanvas({ map, snap, scale }: Props) {
  const { width, height, terrain, capitals } = map;
  const drawW = width * scale;
  const drawH = height * scale;

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

  return (
    <Canvas style={{ width: drawW, height: drawH }}>
      <Image
        image={image}
        x={0}
        y={0}
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
              cx={(cell % width) * scale + scale / 2}
              cy={Math.floor(cell / width) * scale + scale / 2}
              r={Math.max(2, scale * 0.9)}
              color="white"
              style="stroke"
              strokeWidth={1.5}
            />
          ) : null,
        )}
      </Group>
    </Canvas>
  );
}
