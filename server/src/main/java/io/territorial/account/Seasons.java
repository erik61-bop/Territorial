package io.territorial.account;

import java.time.Instant;

/** Time-boxed competitive ladder. Each season lasts SEASON_LENGTH_DAYS; season points reset every
 *  season (fresh leaderboard), but reaching the reward threshold unlocks that season's exclusive
 *  emblem PERMANENTLY (a flex you can never earn again). Pure math + account mutation — no scheduler. */
public final class Seasons {
    private Seasons() {}

    public static final int LENGTH_DAYS = 14;
    static final long EPOCH_DAY = 20626;          // launch day (2026-06-22) -> season 1
    public static final long REWARD_POINTS = 150; // season points to unlock the seasonal emblem

    // The seasonal emblem rotates so each season's reward looks distinct.
    static final String[] SEASON_EMOJIS = { "🥇", "🔱", "🌋", "🦅", "❄️", "🌠", "🏵️", "🪐" };

    private static long day() { return Instant.now().getEpochSecond() / 86_400L; }

    /** Stable season id (0-based period index). */
    public static long currentId() { return Math.max(0, (day() - EPOCH_DAY) / LENGTH_DAYS); }
    /** Human season number (1-based). */
    public static int number() { return (int) currentId() + 1; }
    /** Whole days left in the current season. */
    public static int endsInDays() {
        long into = Math.floorMod(day() - EPOCH_DAY, (long) LENGTH_DAYS);
        return (int) (LENGTH_DAYS - into);
    }

    /** Cosmetic id + emoji for a season's reward emblem. */
    public static String emblemId(long seasonId) { return "season" + seasonId; }
    public static String emblemEmoji(long seasonId) { return SEASON_EMOJIS[(int) Math.floorMod(seasonId, SEASON_EMOJIS.length)]; }

    /** Reset a stale season score, add points for a finished match, and grant the seasonal emblem the
     *  moment the threshold is reached. Runs inside the row-locked match transaction. */
    public static void applyMatch(Account a, boolean won, int place) {
        long cur = currentId();
        if (a.getSeasonId() != cur) { a.setSeasonId(cur); a.setSeasonPoints(0); }
        long pts = 1 + (won ? 10 : (place >= 1 && place <= 3 ? 4 : 0));   // play + win/podium bonus
        a.setSeasonPoints(a.getSeasonPoints() + pts);
        if (a.getSeasonPoints() >= REWARD_POINTS) a.addOwned(emblemId(cur));   // permanent unlock
    }
}
