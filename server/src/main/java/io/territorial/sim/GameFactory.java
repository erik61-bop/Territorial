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

    private static void assignTerrain(GameState s) {
        for (int c = 0; c < s.cellCount; c++) {
            double r = s.rng.nextDouble();
            if      (r < 0.70) s.terrain[c] = Terrain.PLAIN;
            else if (r < 0.82) s.terrain[c] = Terrain.FOREST;
            else if (r < 0.90) s.terrain[c] = Terrain.MOUNTAIN;
            else if (r < 0.96) s.terrain[c] = Terrain.CITY;
            else               s.terrain[c] = Terrain.RIVER;
        }
    }

    /** Greedy spread: each capital is the unused cell farthest (min-distance) from those chosen. */
    private static int[] placeCapitals(GameState s, int numPlayers) {
        int[] caps = new int[numPlayers];
        int first = s.rng.nextInt(s.cellCount);
        caps[0] = first;
        for (int p = 1; p < numPlayers; p++) {
            int best = -1, bestDist = -1;
            for (int c = 0; c < s.cellCount; c++) {
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
            if (o != GameState.NEUTRAL) land[o]++;
        }
        return land;
    }
}
