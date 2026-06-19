package io.territorial.sim;

import java.util.ArrayList;
import java.util.List;

/** Does an army ship across open water to take an island / far coast? Run:
 *  java -cp out io.territorial.sim.NavalTest */
public final class NavalTest {
    public static void main(String[] args) {
        for (int gap = 1; gap <= 5; gap++) island(gap);
        System.out.println("\n--- reachability on real generated 120x120 maps ---");
        for (long seed = 1; seed <= 3; seed++) probe(seed);
    }

    /** On a real map, how many enemy/neutral land cells can player 0 reach by sea at various ranges? */
    static void probe(long seed) {
        int[] sizes = new int[12]; java.util.Arrays.fill(sizes, 30);
        GameState s = GameFactory.create(120, 120, sizes, seed);
        Sim sim = new Sim(s);
        // play ~700 ticks so empires expand to the coasts
        for (int t = 0; t < 700; t++) {
            sim.recomputeDerived();
            List<Action> as = new ArrayList<>();
            for (int p = 0; p < s.numPlayers; p++) { Action a = Bot.decide(s, p); if (a != null) as.add(a); }
            sim.tick(as);
        }
        sim.recomputeDerived();
        int coastal = 0, anyReach = 0;
        for (int p = 0; p < s.numPlayers; p++) {
            if (!s.alive[p]) continue;
            boolean coast = false;
            for (int c = 0; c < s.cellCount && !coast; c++) if (s.owner[c] == p)
                for (int nb : s.neighbours[c]) if (s.owner[nb] == GameState.WATER) { coast = true; break; }
            if (coast) coastal++;
            if (reachable(s, p, Config.NAVAL_RANGE) > 0) anyReach++;
        }
        int alive = 0; for (int p = 0; p < s.numPlayers; p++) if (s.alive[p]) alive++;
        System.out.printf("seed %d after 700 ticks: %d/%d alive empires have a COAST, %d can reach a sea target at range %d%n",
                seed, coastal, alive, anyReach, Config.NAVAL_RANGE);
    }

    static int reachable(GameState s, int p, int range) {
        java.util.HashMap<Integer, Integer> wd = new java.util.HashMap<>();
        java.util.ArrayDeque<Integer> q = new java.util.ArrayDeque<>();
        java.util.HashSet<Integer> targets = new java.util.HashSet<>();
        for (int w : s.waterCells)
            for (int nb : s.neighbours[w]) if (s.owner[nb] == p) { if (wd.putIfAbsent(w, 1) == null) q.add(w); break; }
        while (!q.isEmpty()) {
            int w = q.poll(); int d = wd.get(w);
            for (int nb : s.neighbours[w]) { int o = s.owner[nb]; if (o != p && o != GameState.WATER) targets.add(nb); }
            if (d < range) for (int nb : s.neighbours[w]) if (s.owner[nb] == GameState.WATER && wd.putIfAbsent(nb, d + 1) == null) q.add(nb);
        }
        return targets.size();
    }

    static void island(int gap) {
        int W = 2 + gap + 1 + 2, H = 3;
        GameState s = new GameState(W, H, 2, 1L);
        List<Integer> water = new ArrayList<>();
        int islandX = 2 + gap;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int c = y * W + x;
            if (x < 2) { s.owner[c] = 0; s.terrain[c] = Terrain.PLAIN; }            // attacker
            else if (x == islandX) { s.owner[c] = GameState.NEUTRAL; s.terrain[c] = Terrain.PLAIN; } // island
            else { s.owner[c] = GameState.WATER; s.terrain[c] = Terrain.WATER; water.add(c); }        // sea
        }
        s.waterCells = water.stream().mapToInt(Integer::intValue).toArray();
        s.capitalCell[0] = 0;
        s.tick = 300;
        Sim sim = new Sim(s);
        sim.recomputeDerived();
        s.army[0] = 500;

        int islandCell = 0 * W + islandX;   // top-row island cell
        int islandBefore = count(s, 0);
        // attack NEUTRAL, directed at the island (this is exactly what a tap on the island sends)
        sim.tick(List.of(new Action(0, GameState.NEUTRAL, 0.6, islandCell)));
        sim.recomputeDerived();

        boolean took = s.owner[islandCell] == 0;
        System.out.printf("gap=%d sea tiles  (NAVAL_RANGE=%d)  -> island captured: %s   attacker land %d->%d%n",
                gap, Config.NAVAL_RANGE, took ? "YES" : "no", islandBefore, count(s, 0));
    }

    static int count(GameState s, int p) {
        int n = 0;
        for (int c = 0; c < s.cellCount; c++) if (s.owner[c] == p) n++;
        return n;
    }
}
