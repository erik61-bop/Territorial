package io.territorial.sim;

import java.util.ArrayList;
import java.util.List;

/**
 * Runs ONE 10-bot war with detailed logging so we can see how the bots actually play and find
 * weaknesses (passivity, wasted attacks, stalled expansion, snowballing, diplomacy use, etc.).
 *   java -cp out io.territorial.sim.WarLogMain [seed]
 */
public final class WarLogMain {
    static final int PLAYERS = 10;
    static final int W = 70, H = 70;
    static final int START = 18;
    static final int MAX_TICKS = 4000;
    static final int LOG = 100;

    public static void main(String[] args) {
        long seed = args.length > 0 ? Long.parseLong(args[0]) : 42L;
        int[] sizes = new int[PLAYERS];
        java.util.Arrays.fill(sizes, START);
        GameState s = GameFactory.create(W, H, sizes, seed);
        Sim sim = new Sim(s);

        System.out.printf("=== WAR LOG: %d bots, %dx%d, seed %d (ownable %d) ===%n", PLAYERS, W, H, seed, s.ownableCells);
        boolean[] wasAlive = new boolean[PLAYERS];
        java.util.Arrays.fill(wasAlive, true);
        int prevPhase = -1;
        long atk = 0, exp = 0, hold = 0, diplo = 0, ineffectiveAtk = 0;
        int[] landBefore = new int[PLAYERS];

        int winner = -1, endTick = 0;
        for (int t = 0; t < MAX_TICKS; t++) {
            sim.recomputeDerived();
            winner = sim.winner();
            if (winner != -1) { endTick = t; break; }

            if (s.phase != prevPhase) {
                System.out.printf("t%-5d PHASE -> %s%n", s.tick, phaseName(s.phase));
                prevPhase = s.phase;
            }
            for (int p = 0; p < PLAYERS; p++) landBefore[p] = s.land[p];

            List<Diplo> ds = new ArrayList<>();
            List<Action> as = new ArrayList<>();
            for (int p = 0; p < PLAYERS; p++) {
                if (!s.alive[p]) continue;
                Diplo d = Bot.decideDiplo(s, p);
                if (d != null) { ds.add(d); diplo++; }
                Action a = Bot.decide(s, p);
                if (a == null) { hold++; continue; }
                if (a.targetOwner() == GameState.NEUTRAL) exp++; else atk++;
                as.add(a);
            }
            sim.applyDiplomacy(ds);
            sim.tick(as);
            sim.recomputeDerived();

            // an attack is "ineffective" if the attacker spent army but didn't gain land this tick
            for (Action a : as) {
                if (a.targetOwner() != GameState.NEUTRAL && s.alive[a.attackerId()]
                        && s.land[a.attackerId()] <= landBefore[a.attackerId()]) ineffectiveAtk++;
            }

            for (int p = 0; p < PLAYERS; p++) {
                if (wasAlive[p] && !s.alive[p]) {
                    System.out.printf("  EVENT t%-5d  P%d eliminated%n", s.tick, p);
                    wasAlive[p] = false;
                }
            }

            if (s.tick % LOG == 0) logTable(s, atk, exp, hold, ineffectiveAtk);
        }
        if (winner == -1) { sim.recomputeDerived(); winner = largest(s); endTick = MAX_TICKS; }

        System.out.printf("%n=== END t%d  winner P%d  ===%n", endTick, winner);
        System.out.printf("actions: attack=%d expand=%d hold=%d diplo=%d | ineffective attacks=%d (%.0f%% of attacks)%n",
                atk, exp, hold, diplo, ineffectiveAtk, atk == 0 ? 0 : 100.0 * ineffectiveAtk / atk);
        System.out.printf("final neutral land: %.0f%% of map%n", 100.0 * neutral(s) / s.ownableCells);
        logTable(s, atk, exp, hold, ineffectiveAtk);
    }

    private static void logTable(GameState s, long atk, long exp, long hold, long ineff) {
        int alive = 0; for (int p = 0; p < PLAYERS; p++) if (s.alive[p]) alive++;
        System.out.printf("t%-5d %s | alive %d | neutral %.0f%% | atk %d exp %d hold %d ineff %d%n",
                s.tick, phaseName(s.phase), alive, 100.0 * neutral(s) / s.ownableCells, atk, exp, hold, ineff);
        Integer[] order = new Integer[PLAYERS];
        for (int p = 0; p < PLAYERS; p++) order[p] = p;
        java.util.Arrays.sort(order, (a, b) -> s.land[b] - s.land[a]);
        for (Integer p : order) {
            if (!s.alive[p]) continue;
            System.out.printf("   P%-2d land %-4d army %-5d dens %4.1f mom %.2f border %d%n",
                    p, s.land[p], (int) s.army[p], s.density(p), s.momentum[p], s.border[p]);
        }
    }

    private static int neutral(GameState s) {
        int owned = 0; for (int p = 0; p < PLAYERS; p++) owned += s.land[p];
        return s.ownableCells - owned;
    }
    private static int largest(GameState s) {
        int best = -1, bl = -1; for (int p = 0; p < PLAYERS; p++) if (s.land[p] > bl) { bl = s.land[p]; best = p; }
        return best;
    }
    private static String phaseName(int ph) { return ph == GameState.PEACE ? "PEACE" : "WAR"; }
}
