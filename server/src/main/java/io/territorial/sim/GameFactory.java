package io.territorial.sim;

import java.util.ArrayDeque;
import java.util.Arrays;

/** Builds an initial {@link GameState}: random terrain, spread capitals, BFS-grown territories. */
public final class GameFactory {
    private GameFactory() {}

    /**
     * @param targetSizes desired starting land per player (length = player count). Uneven on
     *                    purpose so balance tests can compare "small" vs "big" starts.
     */
    public static GameState create(int width, int height, int[] targetSizes, long seed) {
        int numPlayers = targetSizes.length;
        GameState s = new GameState(width, height, numPlayers, seed);

        assignTerrain(s);
        carveWater(s);
        int[] capitals = placeCapitals(s, numPlayers);
        for (int p = 0; p < numPlayers; p++) {
            s.capitalCell[p] = capitals[p];
            s.owner[capitals[p]] = p;
        }
        growTerritories(s, targetSizes);

        s.recompute(); // fill land/border/alive once
        for (int p = 0; p < numPlayers; p++) {
            s.army[p] = s.land[p] * Config.START_ARMY_PER_LAND;
            // Deterministic AI personality per slot, hashed from the seed (NOT s.rng, so map/spawns
            // stay byte-identical and only bot behaviour varies between styles).
            long m = (seed + 0x9E3779B97F4A7C15L) * (p + 0xBF58476D1CE4E5B9L);
            m ^= (m >>> 30); m *= 0xBF58476D1CE4E5B9L; m ^= (m >>> 27);
            s.botStyle[p] = (byte) Math.floorMod(m, Bot.STYLES.length);
        }
        return s;
    }

    /** Coherent terrain: forests and mountain ranges grow as regions on a plain base, with a few
     *  scattered cities — far cleaner than per-cell random speckle. */
    private static void assignTerrain(GameState s) {
        Arrays.fill(s.terrain, Terrain.PLAIN);
        placeBlobs(s, Terrain.FOREST, 0.20, 8, 0.63);    // woodlands
        placeBlobs(s, Terrain.MOUNTAIN, 0.11, 6, 0.55);  // ranges
        for (int c = 0; c < s.cellCount; c++) {           // sparse cities (points of interest)
            if (s.terrain[c] == Terrain.PLAIN && s.rng.nextDouble() < 0.010) s.terrain[c] = Terrain.CITY;
        }
    }

    /** Grow {@code count} blobs of {@code type} over PLAIN cells until ~{@code frac} of the map is covered. */
    private static void placeBlobs(GameState s, Terrain type, double frac, int count, double spread) {
        int target = (int) (s.cellCount * frac);
        ArrayDeque<Integer> q = new ArrayDeque<>();
        int placed = 0;
        for (int bi = 0; bi < count && placed < target; bi++) {
            int seed = s.rng.nextInt(s.cellCount);
            int blobMax = target / count + s.rng.nextInt(target / count + 1);
            q.clear();
            q.add(seed);
            int n = 0;
            while (!q.isEmpty() && n < blobMax && placed < target) {
                int c = q.poll();
                if (s.terrain[c] != Terrain.PLAIN) continue;
                s.terrain[c] = type;
                n++; placed++;
                for (int nb : s.neighbours[c]) {
                    if (s.terrain[nb] == Terrain.PLAIN && s.rng.nextDouble() < spread) q.add(nb);
                }
            }
        }
    }

    /** True if any non-water (land) cell lies within Chebyshev distance r of cell. */
    private static boolean landWithin(GameState s, int cell, int r) {
        int W = s.width, H = s.height, x = cell % W, y = cell / W;
        for (int dy = -r; dy <= r; dy++)
            for (int dx = -r; dx <= r; dx++) {
                int nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                if (s.terrain[ny * W + nx] != Terrain.WATER) return true;
            }
        return false;
    }

    /** Carve several distributed seas (so coastlines are common — ships matter) and scatter islands
     *  NEAR those coasts so they're actually reachable by an amphibious wave. */
    private static void carveWater(GameState s) {
        int blobs = 7 + s.rng.nextInt(5);            // 7..11 bodies of water -> lots of coastline
        int target = (int) (s.cellCount * 0.16);     // ~16% of the map is water
        ArrayDeque<Integer> q = new ArrayDeque<>();
        int placed = 0;
        for (int bcount = 0; bcount < blobs && placed < target; bcount++) {
            int seed = s.rng.nextInt(s.cellCount);
            int blobMax = target / blobs + s.rng.nextInt(target / blobs + 1);
            q.clear();
            q.add(seed);
            int n = 0;
            while (!q.isEmpty() && n < blobMax && placed < target) {
                int c = q.poll();
                if (s.terrain[c] == Terrain.WATER) continue;
                s.terrain[c] = Terrain.WATER;
                s.owner[c] = GameState.WATER;
                n++; placed++;
                for (int nb : s.neighbours[c]) {
                    if (s.terrain[nb] != Terrain.WATER && s.rng.nextDouble() < 0.60) q.add(nb);
                }
            }
        }
        // Islands: a small NEUTRAL patch sitting just offshore (all-water neighbours) but with land
        // within NAVAL_RANGE so a coastal empire can ship over and take it.
        int islands = 5 + s.rng.nextInt(4), made = 0, tries = 0;
        while (made < islands && tries++ < 400) {
            int c = s.rng.nextInt(s.cellCount);
            if (s.terrain[c] != Terrain.WATER) continue;
            boolean offshore = true;                      // looks like an island (open water around it)
            for (int nb : s.neighbours[c]) if (s.terrain[nb] != Terrain.WATER) { offshore = false; break; }
            if (!offshore || !landWithin(s, c, Config.NAVAL_RANGE - 1)) continue;   // must be reachable
            s.terrain[c] = s.rng.nextDouble() < 0.4 ? Terrain.FOREST : Terrain.PLAIN;
            s.owner[c] = GameState.NEUTRAL;
            int extra = s.rng.nextInt(3);
            for (int e = 0; e < extra; e++) {
                int[] nbs = s.neighbours[c];
                int nb = nbs[s.rng.nextInt(nbs.length)];
                if (s.terrain[nb] == Terrain.WATER) {
                    s.terrain[nb] = s.rng.nextDouble() < 0.3 ? Terrain.FOREST : Terrain.PLAIN;
                    s.owner[nb] = GameState.NEUTRAL;
                }
            }
            made++;
        }

        // record water cells + ownable count (islands above are land again, so counted correctly)
        int[] tmp = new int[placed];
        int w = 0;
        for (int c = 0; c < s.cellCount; c++) if (s.terrain[c] == Terrain.WATER) tmp[w++] = c;
        s.waterCells = java.util.Arrays.copyOf(tmp, w);
        s.ownableCells = s.cellCount - w;
    }

    /** Greedy spread: each capital is the unused LAND cell farthest from those already chosen. */
    private static int[] placeCapitals(GameState s, int numPlayers) {
        int[] caps = new int[numPlayers];
        int first = s.rng.nextInt(s.cellCount);
        while (s.terrain[first] == Terrain.WATER) first = s.rng.nextInt(s.cellCount);
        caps[0] = first;
        for (int p = 1; p < numPlayers; p++) {
            int best = -1, bestDist = -1;
            for (int c = 0; c < s.cellCount; c++) {
                if (s.terrain[c] == Terrain.WATER) continue;   // capitals on land only
                int minD = Integer.MAX_VALUE;
                for (int q = 0; q < p; q++) minD = Math.min(minD, s.distance(c, caps[q]));
                if (minD > bestDist) { bestDist = minD; best = c; }
            }
            caps[p] = best;
        }
        return caps;
    }

    /** Round-robin BFS flood from each capital until every player reaches its target size. */
    @SuppressWarnings("unchecked")
    private static void growTerritories(GameState s, int[] targetSizes) {
        int numPlayers = targetSizes.length;
        int[] size = new int[numPlayers];
        ArrayDeque<Integer>[] frontier = new ArrayDeque[numPlayers];
        boolean[] done = new boolean[numPlayers];
        for (int p = 0; p < numPlayers; p++) {
            frontier[p] = new ArrayDeque<>();
            frontier[p].add(s.capitalCell[p]);
            size[p] = 1;
        }
        boolean progress = true;
        while (progress) {
            progress = false;
            for (int p = 0; p < numPlayers; p++) {
                if (done[p] || size[p] >= targetSizes[p]) { done[p] = true; continue; }
                Integer cell = frontier[p].poll();
                if (cell == null) { done[p] = true; continue; }
                for (int nb : s.neighbours[cell]) {
                    if (s.owner[nb] == GameState.NEUTRAL && size[p] < targetSizes[p]) {
                        s.owner[nb] = p;
                        size[p]++;
                        frontier[p].add(nb);
                        progress = true;
                    }
                }
                if (!frontier[p].isEmpty()) progress = true;
            }
        }
    }

    /** Initial land per player, computed straight from ownership (for balance reporting). */
    public static int[] landSnapshot(GameState s) {
        int[] land = new int[s.numPlayers];
        for (int c = 0; c < s.cellCount; c++) {
            int o = s.owner[c];
            if (o >= 0) land[o]++;
        }
        return land;
    }
}
