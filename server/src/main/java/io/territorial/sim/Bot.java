package io.territorial.sim;

/**
 * 5-rule bot: expand into empty land, avoid stronger neighbours, punch the weakest one,
 * hold when overextended, and occasionally misplay so it feels beatable.
 */
public final class Bot {
    private Bot() {}

    // Tunables for bot behaviour (kept here, not in Config, since they are AI not game rules).
    static final double EXPAND_MIN_DENSITY = 2.0;  // only expand if army-per-land is healthy
    static final double EXPAND_FRACTION    = 0.35;
    static final double ATTACK_FRACTION    = 0.55;
    static final double AGGRO_MARGIN       = 0.90;  // attack only neighbours meaningfully weaker
    static final double LEADER_RATIO       = 1.20;  // a neighbour this much bigger is a "threat"
    static final double LEADER_DOMINANCE   = 0.30;  // gang up only once leader holds this map share
    static final double GANG_UP_CHANCE     = 0.70;  // and only probabilistically (coalitions are loose)
    static final double MISPLAY_CHANCE     = 0.05;

    /**
     * Decide a diplomacy order for the tick, or null. Bots only ACCEPT peace offers (and only if
     * the offerer is not much weaker, so they don't make peace with easy prey). They never
     * initiate — so bot-only games generate no diplomacy traffic and balance is unchanged.
     */
    public static Diplo decideDiplo(GameState s, int p) {
        if (!s.alive[p]) return null;
        for (int q = 0; q < s.numPlayers; q++) {
            if (q == p || !s.alive[q]) continue;
            boolean notMuchWeaker = s.land[q] >= s.land[p] * Config.BOT_ACCEPT_RATIO;
            if (s.allyOffer[q][p] && notMuchWeaker) return new Diplo(p, q, Diplo.Kind.ACCEPT_ALLY);
            if (s.offer[q][p] && notMuchWeaker) return new Diplo(p, q, Diplo.Kind.ACCEPT_PEACE);
        }
        return null;
    }

    /** Decide this player's single action for the tick, or null to hold. */
    public static Action decide(GameState s, int p) {
        if (!s.alive[p]) return null;

        // Global leader (the player everyone has reason to fear) and total occupied land.
        int leader = -1, leaderLand = -1, totalLand = 0;
        for (int q = 0; q < s.numPlayers; q++) {
            if (!s.alive[q]) continue;
            totalLand += s.land[q];
            if (s.land[q] > leaderLand) { leaderLand = s.land[q]; leader = q; }
        }
        boolean leaderDominant = totalLand > 0 && leaderLand > totalLand * LEADER_DOMINANCE;

        boolean neutralAdjacent = false;
        int weakestEnemy = -1;
        double weakestDef = Double.MAX_VALUE;
        int biggestNeighbour = -1, biggestNeighbourLand = -1;

        boolean[] seen = new boolean[s.numPlayers];
        for (int c = 0; c < s.cellCount; c++) {
            if (s.owner[c] != p) continue;
            for (int nb : s.neighbours[c]) {
                int o = s.owner[nb];
                if (o == GameState.NEUTRAL) { neutralAdjacent = true; }
                else if (o != p && !seen[o]) {
                    seen[o] = true;
                    double d = s.defensePerCell(o);
                    if (d < weakestDef) { weakestDef = d; weakestEnemy = o; }
                    if (s.land[o] > biggestNeighbourLand) { biggestNeighbourLand = s.land[o]; biggestNeighbour = o; }
                }
            }
        }

        boolean misplay = s.rng.nextDouble() < MISPLAY_CHANCE;

        // Opening Peace phase: no PvP allowed, so just grab neutral land (or hold).
        if (s.phase == GameState.PEACE) {
            return neutralAdjacent ? new Action(p, GameState.NEUTRAL, EXPAND_FRACTION) : null;
        }

        // Rule: gang up on a RUNAWAY leader. Only once the leader is map-dominant, only if it
        // borders me and dwarfs me, and only probabilistically (coalitions are loose). Many
        // players doing this drain the leader's single pool from all sides at once.
        if (!misplay && leaderDominant && biggestNeighbour == leader && biggestNeighbour != p
                && biggestNeighbourLand > s.land[p] * LEADER_RATIO
                && s.rng.nextDouble() < GANG_UP_CHANCE) {
            return new Action(p, biggestNeighbour, ATTACK_FRACTION);
        }

        // Rule 1: expand into empty land while the army can spare it.
        if (neutralAdjacent && s.density(p) > EXPAND_MIN_DENSITY && !misplay) {
            return new Action(p, GameState.NEUTRAL, EXPAND_FRACTION);
        }

        // Rules 2-3: attack the weakest neighbour, but only if it is meaningfully weaker than me.
        if (weakestEnemy >= 0) {
            double myDef = s.defensePerCell(p);
            boolean worthIt = weakestDef < myDef * AGGRO_MARGIN;
            if (misplay || worthIt) {
                return new Action(p, weakestEnemy, ATTACK_FRACTION);
            }
        }

        // Rule 1 fallback: nothing safe to hit, but neutral land exists -> grab some.
        if (neutralAdjacent && !misplay) {
            return new Action(p, GameState.NEUTRAL, EXPAND_FRACTION);
        }

        // Rule 4: surrounded by stronger foes / nothing to do -> hold and regrow.
        return null;
    }
}
