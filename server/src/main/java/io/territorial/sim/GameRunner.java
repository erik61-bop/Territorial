package io.territorial.sim;

import java.util.ArrayList;
import java.util.List;

/** Runs one headless bot-vs-bot game to completion and reports the outcome. */
public final class GameRunner {
    private GameRunner() {}

    public record Result(int winner, int ticks, int[] initialLand, int[] finalLand) {}

    public static Result run(GameState s, int maxTicks) {
        Sim sim = new Sim(s);
        int[] initialLand = GameFactory.landSnapshot(s);

        int winner = -1;
        for (int t = 0; t < maxTicks; t++) {
            sim.recomputeDerived();
            winner = sim.winner();
            if (winner != -1) break;

            List<Diplo> diplos = new ArrayList<>();
            List<Action> actions = new ArrayList<>(s.numPlayers);
            for (int p = 0; p < s.numPlayers; p++) {
                Diplo d = Bot.decideDiplo(s, p);
                if (d != null) diplos.add(d);
                Action a = Bot.decide(s, p);
                if (a != null) actions.add(a);
            }
            sim.applyDiplomacy(diplos);
            sim.tick(actions);
        }
        sim.recomputeDerived();
        if (winner == -1) winner = sim.winner();           // may still be -1 (timeout draw)
        if (winner == -1) winner = largestLand(s);          // resolve a timeout by territory

        return new Result(winner, s.tick, initialLand, s.land.clone());
    }

    private static int largestLand(GameState s) {
        int best = -1, bestLand = -1;
        for (int p = 0; p < s.numPlayers; p++) {
            if (s.land[p] > bestLand) { bestLand = s.land[p]; best = p; }
        }
        return best;
    }
}
