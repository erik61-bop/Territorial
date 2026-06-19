// 12 distinct player colours (RGB) — bright, friendly cartoon palette.
export const PLAYER_COLORS: [number, number, number][] = [
  [235, 83, 70],   // red
  [70, 158, 236],  // blue
  [74, 200, 120],  // green
  [246, 202, 64],  // gold
  [171, 110, 206], // purple
  [243, 146, 55],  // orange
  [44, 198, 176],  // teal
  [240, 104, 158], // pink
  [150, 166, 172], // slate
  [124, 150, 168], // steel
  [38, 176, 198],  // cyan
  [138, 196, 84],  // lime
];

// Terrain ordinals: PLAIN=0 FOREST=1 MOUNTAIN=2 CITY=3 RIVER=4 WATER=5. Cartoon palette: soft grass,
// cheerful blue sea.
export const TERRAIN_COLORS: [number, number, number][] = [
  [200, 220, 150], // plain (soft grass-tan)
  [92, 156, 78],   // forest
  [152, 152, 164], // mountain
  [216, 192, 142], // city
  [92, 172, 228],  // river
  [60, 134, 206],  // water (bright cartoon sea)
];

// Brightness multiplier applied to a player's colour by terrain. Lightened for a cartoon look while
// still reading defensive (darker) vs income (brighter) terrain.
export const TERRAIN_SHADE: number[] = [
  1.0,  // plain
  0.86, // forest   (+def)
  0.72, // mountain (+def, darker)
  1.18, // city     (income, brighter)
  0.88, // river    (+def)
  1.0,  // water     (never owned)
];

export const TERRAIN_INFO: { name: string; note: string }[] = [
  { name: 'Plain', note: '' },
  { name: 'Forest', note: '+25% def' },
  { name: 'Mountain', note: '+60% def' },
  { name: 'City', note: '+income' },
  { name: 'River', note: '+35% def' },
  { name: 'Water', note: 'cross at coasts' },
];

export function playerRGB(id: number): [number, number, number] {
  return PLAYER_COLORS[id % PLAYER_COLORS.length];
}

export function cssPlayer(id: number): string {
  const [r, g, b] = playerRGB(id);
  return `rgb(${r},${g},${b})`;
}
