// 12 distinct player colours (RGB).
export const PLAYER_COLORS: [number, number, number][] = [
  [231, 76, 60], [52, 152, 219], [46, 204, 113], [241, 196, 15],
  [155, 89, 182], [230, 126, 34], [26, 188, 156], [236, 64, 122],
  [149, 165, 166], [120, 144, 156], [0, 151, 167], [124, 179, 66],
];

// Terrain ordinals: PLAIN=0 FOREST=1 MOUNTAIN=2 CITY=3 RIVER=4 WATER=5.
export const TERRAIN_COLORS: [number, number, number][] = [
  [225, 222, 200], // plain
  [120, 160, 90],  // forest
  [140, 140, 150], // mountain
  [205, 180, 140], // city
  [110, 160, 210], // river
  [38, 78, 142],   // water (deep ocean)
];

// Brightness multiplier applied to a player's colour by terrain, so defensive (darker) and
// income (brighter) terrain is readable even inside owned territory.
export const TERRAIN_SHADE: number[] = [
  1.0,  // plain
  0.80, // forest   (+def)
  0.60, // mountain (+def, clearly darker)
  1.20, // city     (income, brighter)
  0.84, // river    (+def)
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
