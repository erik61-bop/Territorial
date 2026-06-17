package io.territorial.sim;

import java.util.ArrayList;
import java.util.List;

/**
 * Robustness harness. Runs many randomized games that throw MALFORMED and chaotic input at the
 * sim — out-of-range targets, NaN/huge/negative fractions, junk target cells, random diplomacy,
 * and simulated joins/leaves (clearPlayer/spawnBlob) — and asserts core invariants every tick:
 *   - no exception is ever thrown
 *   - every army is finite and >= 0
 *   - every momentum is within [MIN, MAX]
 *   - every cell owner is valid (water, neutral, or a real player) and land[] matches ownership
 *   - relations are symmetric
 *   - games always terminate (no infinite loop) and replays are deterministic
 */
public final class FuzzMain {
    static final int GAMES = 400;
    static final int MAX_TICKS = 2500;

    public static void main(String[] args) {
        int ok = 0;
        for (int g = 0; g < GAMES; g++) {
            long seed = 7000L + g;
            long h1 = runChaos(seed, false);
            long h2 = runChaos(seed, false);   // determinism: same seed -> same hash
            if (h1 != h2) fail("non-deterministic at game " + g + " (" + h1 + " != " + h2 + ")");
            ok++;
        }
        System.out.println("invariants held across " + ok + "/" + GAMES + " chaotic games");
        System.out.println("PASS — sim is robust to malformed input, deterministic, and terminates.");
    }

    /** One chaotic game. Returns a hash of the final state (for the determinism check). */
    static long runChaos(long seed, boolean verbose) {
        Rng fz = new Rng(seed ^ 0xABCDEF);                  // drives the chaos, separate from game rng
        int players = 4 + (int) Math.floorMod(fz.nextLong(), 9); // 4..12
        int dim = 30 + (int) Math.floorMod(fz.nextLong(), 60);   // 30..89
        int[] sizes = new int[players];
        for (int p = 0; p < players; p++) sizes[p] = 8 + (int) Math.floorMod(fz.nextLong(), 40);

        GameState s = GameFactory.create(dim, dim, sizes, seed);
        Sim sim = new Sim(s);

        for (int t = 0; t < MAX_TICKS; t++) {
            sim.recomputeDerived();
            if (sim.winner() != -1) break;

            // chaotic diplomacy (incl. invalid ids)
            List<Diplo> diplo = new ArrayList<>();
            if (fz.nextDouble() < 0.3) {
                diplo.add(new Diplo(randId(fz, players, true), randId(fz, players, true), randKind(fz)));
            }

            // chaotic actions: real bots + malformed human-like orders
            List<Action> acts = new ArrayList<>();
            for (int p = 0; p < players; p++) {
                if (!s.alive[p]) continue;
                if (fz.nextDouble() < 0.5) {
                    Action a = Bot.decide(s, p);
                    if (a != null) acts.add(a);
                } else {
                    acts.add(new Action(p, randTarget(fz, players), randFraction(fz), randCell(fz, s.cellCount)));
                }
            }
            // occasionally inject a totally invalid attacker id too
            if (fz.nextDouble() < 0.1) acts.add(new Action(players + 3, 0, 0.5, -1));

            sim.applyDiplomacy(diplo);
            sim.tick(acts);

            // simulate a leave (wipe) and a join (respawn) sometimes
            if (fz.nextDouble() < 0.05) s.clearPlayer((int) Math.floorMod(fz.nextLong(), players));
            if (fz.nextDouble() < 0.05) {
                int p = (int) Math.floorMod(fz.nextLong(), players);
                if (!s.hasLand(p)) { int cell = randCell(fz, s.cellCount); if (cell >= 0 && cell < s.cellCount && s.owner[cell] == GameState.NEUTRAL) s.spawnBlob(p, cell, 10); }
            }

            sim.recomputeDerived();   // derived state is always refreshed before it's read (as on the server)
            checkInvariants(s, t);
        }
        return hash(s);
    }

    private static int randId(Rng fz, int players, boolean allowBad) {
        int r = (int) Math.floorMod(fz.nextLong(), players + (allowBad ? 4 : 0));
        return r;  // may be >= players (invalid) when allowBad
    }
    private static int randTarget(Rng fz, int players) {
        double r = fz.nextDouble();
        if (r < 0.2) return GameState.NEUTRAL;            // expand
        if (r < 0.3) return players + 5;                  // invalid (must be ignored, not crash)
        if (r < 0.35) return GameState.WATER;             // water target (invalid)
        return (int) Math.floorMod(fz.nextLong(), players);
    }
    private static double randFraction(Rng fz) {
        double r = fz.nextDouble();
        if (r < 0.1) return Double.NaN;
        if (r < 0.2) return -2.0;
        if (r < 0.3) return 99.0;
        return fz.nextDouble();
    }
    private static int randCell(Rng fz, int cellCount) {
        double r = fz.nextDouble();
        if (r < 0.1) return -5;
        if (r < 0.2) return cellCount + 1000;             // out of range (must not crash)
        return (int) Math.floorMod(fz.nextLong(), cellCount);
    }
    private static Diplo.Kind randKind(Rng fz) {
        Diplo.Kind[] ks = Diplo.Kind.values();
        return ks[(int) Math.floorMod(fz.nextLong(), ks.length)];
    }

    private static void checkInvariants(GameState s, int tick) {
        int[] land = new int[s.numPlayers];
        for (int c = 0; c < s.cellCount; c++) {
            int o = s.owner[c];
            if (o < GameState.WATER || o >= s.numPlayers) fail("bad owner " + o + " at cell " + c + " tick " + tick);
            if (o >= 0) land[o]++;
        }
        for (int p = 0; p < s.numPlayers; p++) {
            if (!Double.isFinite(s.army[p]) || s.army[p] < 0) fail("bad army " + s.army[p] + " for " + p + " tick " + tick);
            if (s.momentum[p] < Config.MOMENTUM_MIN - 1e-9 || s.momentum[p] > Config.MOMENTUM_MAX + 1e-9)
                fail("bad momentum " + s.momentum[p] + " for " + p + " tick " + tick);
            if (s.land[p] != land[p]) fail("land mismatch p" + p + " " + s.land[p] + " != " + land[p] + " tick " + tick);
            for (int q = 0; q < s.numPlayers; q++) {
                if (s.rel[p][q] != s.rel[q][p]) fail("asymmetric rel " + p + "," + q + " tick " + tick);
            }
        }
    }

    private static long hash(GameState s) {
        long h = 1125899906842597L;
        for (int c = 0; c < s.cellCount; c++) h = h * 31 + s.owner[c];
        for (int p = 0; p < s.numPlayers; p++) h = h * 31 + Math.round(s.army[p] * 1000);
        return h;
    }

    private static void fail(String msg) {
        System.out.println("FAIL — " + msg);
        throw new AssertionError(msg);
    }
}
