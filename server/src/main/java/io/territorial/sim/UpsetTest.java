package io.territorial.sim;

import java.util.List;

/** "Army 7 beat army 22?!" Reproduce a small-army attacker beating a bigger-army defender, and show
 *  WHY: per-cell defence (army spread over border) and war escalation. Run: java -cp out io.territorial.sim.UpsetTest */
public final class UpsetTest {
    public static void main(String[] args) {
        // Defender has 22 army. We vary how WIDE its border is (concentrated vs spread) and the war stage.
        System.out.println("Attacker army=7 (all-in), defender army=22, plain, defender Normal stance.");
        System.out.println("borderW | warStage |  esc | defScore/cell | attacker took | result");
        for (int borderW : new int[]{1, 4, 10}) {
            for (int tick : new int[]{220, 1000}) {   // early war (esc~1.1) vs late war (esc~5)
                run(borderW, tick);
            }
        }
    }

    static void run(int borderW, int tick) {
        // A defender block borderW wide; attacker sits on the left edge sharing that border.
        int W = 14, H = Math.max(borderW, 1);
        GameState s = new GameState(W, H, 2, 3L);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
            s.owner[y * W + x] = (x < 7) ? 0 : 1;     // attacker | defender, border = H cells wide
        s.capitalCell[0] = 0; s.capitalCell[1] = W - 1;
        s.tick = tick;
        Sim sim = new Sim(s);
        sim.recomputeDerived();
        s.army[0] = 7; s.army[1] = 22;
        sim.recomputeDerived();

        double defCell = s.defScore[1];
        int dl0 = 0; for (int c = 0; c < s.cellCount; c++) if (s.owner[c] == 1) dl0++;
        sim.tick(List.of(new Action(0, 1, 1.0, -1)));   // attacker sends ALL 7
        sim.recomputeDerived();
        int took = dl0; for (int c = 0; c < s.cellCount; c++) if (s.owner[c] == 1) took--;
        System.out.printf("%7d | %-8s | %.1f | %12.2f  | %12d  | %s%n",
                s.border[1] == 0 ? borderW : borderW,
                tick < 300 ? "early" : "late", Config.warEscalation(tick), defCell, took,
                took > 0 ? "ATTACKER breaks in" : "defender holds");
    }
}
