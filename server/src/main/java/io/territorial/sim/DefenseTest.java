package io.territorial.sim;

import java.util.List;

/** Why does a defender's defence SCORE fall while under attack? Track it tick by tick.
 *  P1 defends (Hold), P0 attacks 50% every other tick. Run: java -cp out io.territorial.sim.DefenseTest */
public final class DefenseTest {
    public static void main(String[] args) {
        int W = 20, H = 10;
        GameState s = new GameState(W, H, 2, 7L);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
            s.owner[y * W + x] = (x < 10) ? 0 : 1;
        s.capitalCell[0] = 0; s.capitalCell[1] = W - 1;
        s.tick = 300;
        Sim sim = new Sim(s);
        sim.recomputeDerived();
        s.army[0] = 360; s.army[1] = 300;   // attacker only slightly stronger
        s.stance[1] = 1;                     // defender HOLDS

        System.out.printf("Defender P1 HOLDS. GARRISON_KILL=%.1f%n", Config.GARRISON_KILL);
        System.out.println("PHASE 1 (ticks 1-8): holding, NOT attacked -> score should RISE");
        System.out.println("PHASE 2 (ticks 9-18): under 50% attack -> score falls as army/morale are worn down");
        System.out.println("tick | P1 defScore | P1 army | P1 morale | P1 land | lost");
        int prevLand = s.land[1];
        for (int i = 0; i < 18; i++) {
            boolean attacked = i >= 8 && s.tick % 2 == 0;
            sim.tick(attacked ? List.of(new Action(0, 1, 0.50, -1)) : List.of());
            sim.recomputeDerived();
            int lost = prevLand - s.land[1]; prevLand = s.land[1];
            System.out.printf("%4d | %10.2f | %7.0f | %8.0f%% | %7d | %d%s%n",
                    s.tick, s.defScore[1], s.army[1], s.momentum[1] * 100, s.land[1], lost,
                    i == 7 ? "   <-- attack begins next tick" : "");
        }
    }
}
