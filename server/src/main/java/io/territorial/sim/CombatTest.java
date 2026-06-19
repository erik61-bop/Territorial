package io.territorial.sim;

import java.util.List;

/** Controlled combat demonstration. Run: java -cp out io.territorial.sim.CombatTest */
public final class CombatTest {
    public static void main(String[] args) {
        scenario("A) Strong attacker vs THIN defender", 240, 30);
        scenario("B) Same attacker vs CONCENTRATED defender", 240, 1800);
        scenario("C) Weak attacker vs thin defender", 25, 30);
    }

    static int count(GameState s, int p) {
        int n = 0;
        for (int c = 0; c < s.cellCount; c++) if (s.owner[c] == p) n++;
        return n;
    }

    static void scenario(String title, double attackerArmy, double defenderArmy) {
        int W = 12, H = 6;
        GameState s = new GameState(W, H, 2, 1L);
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
                s.owner[y * W + x] = (x < W / 2) ? 0 : 1;
        s.capitalCell[0] = 0;
        s.capitalCell[1] = W - 1;
        s.tick = 300;
        Sim sim = new Sim(s);
        sim.recomputeDerived();
        s.army[0] = attackerArmy;
        s.army[1] = defenderArmy;

        int aL = count(s, 0), dL = count(s, 1);
        double aA = s.army[0], dA = s.army[1];
        double defPerCell = s.defensePerCell(1);
        int dBorder = s.border[1];

        sim.tick(List.of(new Action(0, 1, 0.6, -1)));   // cheapest-first
        sim.recomputeDerived();                          // GameRoom does this after every tick

        System.out.println(title);
        System.out.printf("   defence %.2f/cell (army %.0f / border %d)%n", defPerCell, dA, dBorder);
        System.out.printf("   attacker: land %d->%d  army %.0f->%.0f%n", aL, count(s, 0), aA, s.army[0]);
        System.out.printf("   defender: land %d->%d  army %.0f->%.0f   (cells lost: %d)%n%n",
                dL, count(s, 1), dA, s.army[1], dL - count(s, 1));
    }
}
