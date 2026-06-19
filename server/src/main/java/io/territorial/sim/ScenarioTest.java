package io.territorial.sim;

import java.util.List;

/** The user's scenario: attacker 5000 vs defender 2500 over a 10-cell plain border, morale 1.0, esc 1.0.
 *  Run one wave at each send%. Run: java -cp out io.territorial.sim.ScenarioTest */
public final class ScenarioTest {
    public static void main(String[] args) {
        for (double f : new double[]{0.25, 0.50, 0.75, 1.00}) run(f, false, Terrain.PLAIN);
        System.out.println("--- defender HOLD (+25%) ---");
        for (double f : new double[]{0.50, 0.75, 1.00}) run(f, true, Terrain.PLAIN);
        System.out.println("--- defender on MOUNTAIN (x1.6) ---");
        for (double f : new double[]{0.50, 0.75, 1.00}) run(f, false, Terrain.MOUNTAIN);
    }

    static void run(double frac, boolean hold, Terrain terr) {
        // 10x10: attacker x<5, defender x>=5. The x=5 column is the 10-cell shared border.
        int W = 10, H = 10;
        GameState s = new GameState(W, H, 2, 1L);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int c = y * W + x;
            s.owner[c] = x < 5 ? 0 : 1;
            if (x >= 5) s.terrain[c] = terr;   // defender terrain
        }
        s.capitalCell[0] = 0; s.capitalCell[1] = W - 1;
        s.tick = 200;                          // war just started -> escalation = 1.0
        Sim sim = new Sim(s);
        sim.recomputeDerived();
        s.army[0] = 5000; s.army[1] = 2500;
        s.stance[1] = hold ? 1 : 0;

        int dBorder = s.border[1];
        double defPerCell = s.defensePerCell(1);
        int dl0 = count(s, 1);
        sim.tick(List.of(new Action(0, 1, frac, -1)));
        sim.recomputeDerived();
        int captured = dl0 - count(s, 1);
        System.out.printf("send %3.0f%% (%4.0f army)  terr=%-8s hold=%-5s | def %.0f/cell over %d border -> captured %2d cells, defender army %.0f -> %.0f%n",
                frac * 100, 5000 * frac, terr, hold, defPerCell, dBorder, captured, 2500.0, s.army[1]);
    }

    static int count(GameState s, int p) {
        int n = 0; for (int c = 0; c < s.cellCount; c++) if (s.owner[c] == p) n++; return n;
    }
}
