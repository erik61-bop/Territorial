package io.territorial.sim;

import java.util.List;

/** Reproduce the live case: a human (player 0) holding a STANDING 50% attack on a bordering
 *  enemy, fired every ATTACK_PERIOD_TICKS like GameRoom. Does the army drop?
 *  Run: java -cp out io.territorial.sim.BotAttackTest */
public final class BotAttackTest {
    public static void main(String[] args) {
        run("A) vs a weak bot you CAN break (tick 300, esc 1.5)", 300, 300, 300);
        run("B) vs a STRONG bordering bot you CANNOT break, late war (tick 1000, esc 5.0)", 1000, 120, 4000);
    }

    static void run(String title, int startTick, double p0army, double p1army) {
        int W = 20, H = 10;
        GameState s = new GameState(W, H, 2, 7L);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
            s.owner[y * W + x] = (x < 10) ? 0 : 1;
        s.capitalCell[0] = 0; s.capitalCell[1] = W - 1;
        s.tick = startTick;
        Sim sim = new Sim(s);
        sim.recomputeDerived();
        s.army[0] = p0army;
        s.army[1] = p1army;

        System.out.println(title);
        System.out.printf("   esc=%.1f | P0 army=%.0f land=%d border=%d | P1 army=%.0f land=%d%n",
                Config.warEscalation(s.tick), s.army[0], s.land[0], s.border[0], s.army[1], s.land[1]);
        for (int i = 0; i < 8; i++) {
            boolean fire = s.tick % Config.ATTACK_PERIOD_TICKS == 0;
            double before = s.army[0]; int landBefore = s.land[0];
            sim.tick(fire ? List.of(new Action(0, 1, 0.50, -1)) : List.of());
            sim.recomputeDerived();
            if (fire) System.out.printf("   FIRE 50%%: army %.0f -> %.0f  [%+.0f]   (captured %d cells)%n",
                    before, s.army[0], s.army[0] - before, s.land[0] - landBefore);
        }
        System.out.println();
    }
}
