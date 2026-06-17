package io.territorial.sim;

/**
 * Headless balance proof. Runs many bot-vs-bot games on a deliberately uneven map
 * (a few big starters, many small) and measures how often a SMALL starter wins.
 *
 * This is the whole point of the "One Pool" model: small must beat big, often.
 */
public final class BalanceMain {
    static final int WIDTH = 50, HEIGHT = 50;
    static final int MAX_TICKS = 4000;
    static final int GAMES = 300;

    // 2 big starters, 6 small. Size-to-player assignment is shuffled each game so that
    // results measure SIZE, not capital position.
    static final int[] SIZES = {120, 120, 30, 30, 30, 30, 30, 30};
    static final int MEDIAN_START = 30;  // winner with initial land <= this counts as "small"

    public static void main(String[] args) {
        int smallWins = 0, biggestStarterWins = 0, draws = 0;
        int timeouts = 0;
        long totalTicks = 0, winnerStartLandSum = 0;

        for (int g = 0; g < GAMES; g++) {
            long seed = 1000L + g;
            int[] sizes = shuffled(SIZES, seed);
            GameState s = GameFactory.create(WIDTH, HEIGHT, sizes, seed);
            GameRunner.Result r = GameRunner.run(s, MAX_TICKS);
            totalTicks += r.ticks();
            if (r.ticks() >= MAX_TICKS) timeouts++;

            if (r.winner() < 0) { draws++; continue; }
            int startLand = r.initialLand()[r.winner()];
            winnerStartLandSum += startLand;
            if (startLand <= MEDIAN_START) smallWins++;
            if (isBiggestStarter(r.initialLand(), r.winner())) biggestStarterWins++;
        }

        double smallRate = smallWins / (double) GAMES;
        double bigStarterRate = biggestStarterWins / (double) GAMES;

        System.out.println("=== One Pool — balance report (" + GAMES + " games) ===");
        System.out.printf("avg game length      : %.0f ticks%n", totalTicks / (double) GAMES);
        System.out.println("timeouts (hit cap): " + timeouts + " / " + GAMES);
        System.out.printf("avg winner start land: %.0f  (big start=120, small start=30)%n",
                winnerStartLandSum / (double) GAMES);
        System.out.printf("SMALL-starter wins   : %d / %d  = %.1f%%%n", smallWins, GAMES, smallRate * 100);
        System.out.printf("biggest-starter wins : %d / %d  = %.1f%%%n", biggestStarterWins, GAMES, bigStarterRate * 100);
        System.out.println("draws/timeouts       : " + draws);

        // Assertions: the model must let small win often, and must not be big-deterministic.
        boolean ok = true;
        ok &= check("small starters win >= 20% of games", smallRate >= 0.20);
        ok &= check("biggest starter does NOT win > 80%", bigStarterRate <= 0.80);
        ok &= check("no excessive draws (< 10%)", draws < GAMES * 0.10);

        System.out.println(ok ? "\nPASS — the model delivers small-beats-big." : "\nFAIL — needs tuning.");
        if (!ok) System.exit(1);
    }

    /** Deterministic Fisher-Yates shuffle of the sizes for one game. */
    private static int[] shuffled(int[] base, long seed) {
        int[] a = base.clone();
        Rng rng = new Rng(seed ^ 0x5DEECE66DL);
        for (int i = a.length - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);
            int tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    private static boolean isBiggestStarter(int[] initialLand, int winner) {
        int max = -1;
        for (int v : initialLand) max = Math.max(max, v);
        return initialLand[winner] == max;
    }

    private static boolean check(String label, boolean pass) {
        System.out.println("  [" + (pass ? "PASS" : "FAIL") + "] " + label);
        return pass;
    }
}
