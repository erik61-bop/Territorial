package io.territorial.account;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Daily quests: a fixed set that reset each UTC day. Progress lives in the account's CSV fields so it
 *  updates inside the same row-locked match transaction (no extra storage). */
public final class Quests {
    private Quests() {}

    public record Quest(String id, String desc, int target, long reward) {}

    public static final List<Quest> DAILY = List.of(
            new Quest("play",  "Play 3 matches",        3, 100),
            new Quest("win",   "Win a match",           1, 250),
            new Quest("top3",  "Finish top 3 (x2)",     2, 150)
    );

    public static long today() { return Instant.now().getEpochSecond() / 86_400L; }

    /** Reset the account's quests if they belong to a previous day. */
    public static void rollDay(Account a) {
        if (a.getQuestDay() != today()) {
            a.setQuestDay(today());
            a.setQuestProgress("");
            a.setQuestClaimed("");
        }
    }

    private static Map<String, Integer> parse(String csv) {
        Map<String, Integer> m = new LinkedHashMap<>();
        for (String t : csv.split(",")) {
            int i = t.indexOf(':');
            if (i > 0) try { m.put(t.substring(0, i), Integer.parseInt(t.substring(i + 1))); } catch (NumberFormatException ignored) {}
        }
        return m;
    }
    private static String format(Map<String, Integer> m) {
        StringBuilder b = new StringBuilder();
        m.forEach((k, v) -> { if (b.length() > 0) b.append(','); b.append(k).append(':').append(v); });
        return b.toString();
    }

    /** Advance progress from one finished match (called inside the match transaction). */
    public static void applyMatch(Account a, boolean won, int place) {
        rollDay(a);
        Map<String, Integer> p = parse(a.getQuestProgress());
        p.merge("play", 1, Integer::sum);
        if (won) p.merge("win", 1, Integer::sum);
        if (place >= 1 && place <= 3) p.merge("top3", 1, Integer::sum);
        a.setQuestProgress(format(p));
    }

    public static int progress(Account a, String id) { return parse(a.getQuestProgress()).getOrDefault(id, 0); }
    public static boolean claimed(Account a, String id) {
        for (String t : a.getQuestClaimed().split(",")) if (t.equals(id)) return true;
        return false;
    }
    public static void markClaimed(Account a, String id) {
        if (!claimed(a, id)) a.setQuestClaimed(a.getQuestClaimed().isEmpty() ? id : a.getQuestClaimed() + "," + id);
    }

    /** A client-facing view of the account's quests today. */
    public static List<Map<String, Object>> view(Account a) {
        rollDay(a);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Quest q : DAILY) {
            int prog = Math.min(progress(a, q.id()), q.target());
            boolean done = prog >= q.target();
            boolean cl = claimed(a, q.id());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", q.id()); m.put("desc", q.desc()); m.put("target", q.target());
            m.put("progress", prog); m.put("reward", q.reward());
            m.put("complete", done); m.put("claimed", cl); m.put("claimable", done && !cl);
            out.add(m);
        }
        return out;
    }

    public static Quest byId(String id) { for (Quest q : DAILY) if (q.id().equals(id)) return q; return null; }
}
