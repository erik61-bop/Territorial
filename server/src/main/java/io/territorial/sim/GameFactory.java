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

    /** Carve a few water blobs (seas/lakes) that split the map; mark them unownable. */
    private static void carveWater(GameState s) {
        int blobs = 3 + s.rng.nextInt(3);            // 3..5 bodies of water
        int target = (int) (s.cellCount * 0.15);     // ~15% of the map is water
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
                    if (s.terrain[nb] != Terrain.WATER && s.rng.nextDouble() < 0.62) q.add(nb);
                }
            }
        }
        // record water cells + ownable count
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
