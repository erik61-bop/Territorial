package io.territorial.sim;

import java.util.ArrayList;
import java.util.List;

/** Runs REAL bot-vs-bot games on real generated maps and catches actual "smaller army beats bigger army"
 *  captures, logging the real numbers so we can see WHY. Run: java -cp out io.territorial.sim.RealUpsetTest */
public final class RealUpsetTest {
    public static void main(String[] args) {
        int[] SIZES = {120, 120, 30, 30, 30, 30, 30, 30};
        int logged = 0, totalUpsets = 0, totalCaptures = 0;
        System.out.println("Real games. An 'upset' = attacker's TOTAL army < defender's TOTAL army, yet it captured a cell.\n");
        System.out.println("seed  tick |  esc | attacker army(land) | defender army(land,border) defScore/cell | took | armyRatio");
        for (int g = 0; g < 40 && logged < 25; g++) {
            long seed = 1000L + g;
            GameState s = GameFactory.create(50, 50, SIZES, seed);
            Sim sim = new Sim(s);
            for (int t = 0; t < 4000; t++) {
                sim.recomputeDerived();
                if (sim.winner() != -1) break;
                // snapshot pre-tick state
                int[] ownerBefore = s.owner.clone();
                double[] armyBefore = s.army.clone();
                int[] landBefore = s.land.clone();
                int[] borderBefore = s.border.clone();
                double[] defBefore = s.defScore.clone();
                double esc = Config.warEscalation(s.tick);

                List<Diplo> diplos = new ArrayList<>();
                List<Action> actions = new ArrayList<>();
                for (int p = 0; p < s.numPlayers; p++) {
                    Diplo d = Bot.decideDiplo(s, p); if (d != null) diplos.add(d);
                    Action a = Bot.decide(s, p);
                    s.stance[p] = (a == null) ? 1 : 0;
                    if (a != null) actions.add(a);
                }
                sim.applyDiplomacy(diplos);
                sim.tick(actions);

                // Tally captures per (attacker, defender) pair from ownership changes.
                int[][] took = new int[s.numPlayers][s.numPlayers];
                for (int c = 0; c < s.cellCount; c++) {
                    int a = s.owner[c], d = ownerBefore[c];
                    if (a >= 0 && d >= 0 && a != d) { took[a][d]++; totalCaptures++; }
                }
                for (int a = 0; a < s.numPlayers; a++) for (int d = 0; d < s.numPlayers; d++) {
                    if (took[a][d] == 0) continue;
                    if (armyBefore[a] < armyBefore[d]) {        // UPSET: smaller army won the exchange
                        totalUpsets++;
                        double ratio = armyBefore[a] / Math.max(1, armyBefore[d]);
                        if (logged < 25 && ratio < 0.85) {       // show the clearest upsets
                            logged++;
                            System.out.printf("%4d %5d | %4.1f | %7.0f (%4d)        | %7.0f (%4d,%3d)   %8.2f      | %3d  | %.2f%n",
                                    seed, s.tick, esc, armyBefore[a], landBefore[a],
                                    armyBefore[d], landBefore[d], borderBefore[d], defBefore[d], took[a][d], ratio);
                        }
                    }
                }
            }
        }
        System.out.printf("%n%d captures total; %d were 'smaller-army-beats-bigger' upsets (%.0f%%).%n",
                totalCaptures, totalUpsets, 100.0 * totalUpsets / Math.max(1, totalCaptures));
    }
}
