package io.territorial.account;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Catalog of buyable cosmetic emblems (the equipped one shows by your name in-game & on the board).
 *  Pure status + a coin sink. Ids are stable codes; the emoji is what players see. */
public final class Cosmetics {
    private Cosmetics() {}

    public record Item(String id, String emoji, String name, long price) {}

    public static final List<Item> ITEMS = List.of(
            new Item("star",   "⭐", "Rising Star",   200),
            new Item("flame",  "🔥", "Firebrand",     300),
            new Item("bolt",   "⚡", "Storm",         500),
            new Item("castle", "🏰", "Stronghold",    600),
            new Item("blade",  "⚔️", "Warblade",      700),
            new Item("shield", "🛡️", "Aegis",         700),
            new Item("crown",  "👑", "Sovereign",     1200),
            new Item("skull",  "💀", "Conqueror",     1500),
            new Item("rocket", "🚀", "Vanguard",      1800),
            new Item("dragon", "🐉", "Dragonlord",    2500),
            new Item("gem",    "💎", "Diamond",       4000),
            new Item("trophy", "🏆", "Champion",      6000)
    );

    private static final Map<String, Item> BY_ID = new LinkedHashMap<>();
    static { for (Item i : ITEMS) BY_ID.put(i.id(), i); }

    public static Item byId(String id) { return id == null ? null : BY_ID.get(id); }

    /** Emoji for an owned/equipped item id, or "" if unknown. Resolves earned season emblems too. */
    public static String emoji(String id) {
        if (id != null && id.startsWith("season")) {
            try { return Seasons.emblemEmoji(Long.parseLong(id.substring(6))); } catch (NumberFormatException e) { return ""; }
        }
        Item i = byId(id);
        return i == null ? "" : i.emoji();
    }
}
