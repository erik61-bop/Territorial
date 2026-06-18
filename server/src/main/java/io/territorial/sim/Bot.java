package io.territorial.sim;

/**
 * 5-rule bot: expand into empty land, avoid stronger neighbours, punch the weakest one,
 * hold when overextended, and occasionally misplay so it feels beatable.
 */
public final class Bot {
    private Bot() {}

    // Difficulty: 0 Easy, 1 Normal, 2 Hard. Default Normal (so the balance harness is unaffected).
    public static volatile int level = 1;

    // Tunables for bot behaviour (kept here, not in Config, since they are AI not game rules).
    static final double EXPAND_MIN_DENSITY = 1.3;  // keep this much army/land in reserve to defend
    static final double EXPAND_FRACTION    = 0.45;  // commit to claiming empty land
    static final double ATTACK_FRACTION    = 0.60;  // commit enough to actually break a front
    static final double GANG_FRACTION      = 0.72;  // throw more at a runaway leader
    static final double AGGRO_MARGIN       = 1.02;  // attack neighbours up to ~as strong as me
    static final double BREAK_MARGIN       = 1.25;  // ...but only if my wave clearly exceeds their defence
    static final double LEADER_RATIO       = 1.20;  // a neighbour this much bigger is a "threat"
    static final double LEADER_DOMINANCE   = 0.28;  // gang up once leader holds this map share
    static final double GANG_UP_CHANCE     = 0.80;
    static final double MISPLAY_CHANCE     = 0.02;

    // Diplomacy tunables (AI behaviour, not game rules).
    static final double DIPLO_INIT_CHANCE = 0.04;  // chance/tick a bot considers initiating
    static final int    BETRAY_AFTER_WAR  = 500;   // ticks into war before betrayal is on the table
    static final double BETRAY_RATIO      = 0.5;   // turn on a friend who shrinks below half my land

    /**
     * Decide a diplomacy order for the tick, or null. Bots ACCEPT good offers, GANG UP on a runaway
     * leader by allying with fellow non-leaders, SUE FOR PEACE when overpowered, and BETRAY a friend
     * who has become easy prey late in the war. Easy bots (level 0) only react, never initiate.
     */
    public static Diplo decideDiplo(GameState s, int p) {
        if (!s.alive[p]) return null;

        // Global leader + map share (drives gang-ups and peace-buying), and how many remain.
        int leader = -1, leaderLand = -1, totalLand = 0, aliveCount = 0;
        for (int q = 0; q < s.numPlayers; q++) {
            if (!s.alive[q]) continue;
            aliveCount++;
            totalLand += s.land[q];
            if (s.land[q] > leaderLand) { leaderLand = s.land[q]; leader = q; }
        }
        boolean leaderDominant = totalLand > 0 && leaderLand > totalLand * LEADER_DOMINANCE && leader != p;
        // Endgame: with few players left, coalitions dissolve — everyone wants the SOLE win, so no new
        // alliances form and existing friends get betrayed. This keeps the finish a last-one-standing.
        boolean endgame = aliveCount <= 3;

        // 1. Accept incoming offers. Ally readily against a dominant leader (common enemy); otherwise
        //    only with someone not much weaker. No new alliances in the endgame (go for the solo win).
        for (int q = 0; q < s.numPlayers; q++) {
            if (q == p || !s.alive[q]) continue;
            boolean notMuchWeaker = s.land[q] >= s.land[p] * Config.BOT_ACCEPT_RATIO;
            boolean commonEnemy = leaderDominant && q != leader;
            if (!endgame && s.allyOffer[q][p] && (notMuchWeaker || commonEnemy)) return new Diplo(p, q, Diplo.Kind.ACCEPT_ALLY);
            if (s.offer[q][p] && notMuchWeaker)                                  return new Diplo(p, q, Diplo.Kind.ACCEPT_PEACE);
        }

        if (level < 1) return null;                        // Easy bots only react, never initiate.

        // 2. Betrayal — alliances are a temporary tool against a runaway leader, not a way to share the
        //    map. Break a friendship when (a) the endgame is here, (b) the common enemy is gone (no
        //    dominant leader left to fear), or (c) the war has dragged and the friend is easy prey.
        boolean obsolete = !leaderDominant;   // no runaway leader -> the alliance has lost its purpose
        boolean warDragged = s.tick - Config.PEACE_PHASE_TICKS > BETRAY_AFTER_WAR;
        if (p != leader || aliveCount <= 2) {
            int prey = -1, preyLand = Integer.MAX_VALUE;
            for (int q = 0; q < s.numPlayers; q++) {
                if (q == p || !s.alive[q] || !s.areFriendly(p, q)) continue;
                boolean breakIt = endgame || obsolete || (warDragged && s.land[q] < s.land[p] * BETRAY_RATIO);
                if (breakIt && s.land[q] < preyLand) { preyLand = s.land[q]; prey = q; }
            }
            double chance = (endgame || obsolete) ? 0.30 : DIPLO_INIT_CHANCE;
            if (prey >= 0 && s.rng.nextDouble() < chance) {
                return new Diplo(p, prey, s.rel[p][prey] == 2 ? Diplo.Kind.BREAK_ALLY : Diplo.Kind.BREAK_PEACE);
            }
        }

        if (s.rng.nextDouble() > DIPLO_INIT_CHANCE) return null;   // initiate only occasionally

        if (leaderDominant && !endgame) {
            // 3. Gang up: offer an alliance to the strongest OTHER non-leader to jointly resist.
            int ally = -1, allyLand = -1;
            for (int q = 0; q < s.numPlayers; q++) {
                if (q == p || q == leader || !s.alive[q]) continue;
                if (s.rel[p][q] == 2 || s.allyOffer[p][q]) continue;   // already allied / offered
                if (s.land[q] > allyLand) { allyLand = s.land[q]; ally = q; }
            }
            if (ally >= 0) return new Diplo(p, ally, Diplo.Kind.REQUEST_ALLY);

            // 4. Or, if the leader dwarfs me, sue for peace to buy time.
            if (s.land[leader] > s.land[p] * LEADER_RATIO && s.rel[p][leader] == 0 && !s.offer[p][leader]) {
                return new Diplo(p, leader, Diplo.Kind.REQUEST_PEACE);
            }
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
        int cityTarget = -1;              // a nearby neutral city to expand toward (income)
        int neutralTarget = -1;           // any neutral frontier cell (expansion direction)
        int weakestEnemy = -1;            // attackable enemy with the lowest defence-per-cell
        double weakestDef = Double.MAX_VALUE;
        int strongestEnemy = -1;          // most dangerous adjacent enemy (can it break me?)
        double strongestDef = -1;
        int biggestNeighbour = -1, biggestNeighbourLand = -1;

        boolean[] seen = new boolean[s.numPlayers];
        for (int c = 0; c < s.cellCount; c++) {
            if (s.owner[c] != p) continue;
            for (int nb : s.neighbours[c]) {
                int o = s.owner[nb];
                if (o == GameState.NEUTRAL) {
                    neutralAdjacent = true;
                    neutralTarget = nb;
                    if (s.terrain[nb] == Terrain.CITY) cityTarget = nb;
                } else if (o == GameState.WATER) {
                    /* coastline */
                } else if (o != p && !seen[o]) {
                    seen[o] = true;
                    if (s.areFriendly(p, o)) continue;        // don't waste turns on peace/allies
                    double d = s.defensePerCell(o);
                    if (d < weakestDef) { weakestDef = d; weakestEnemy = o; }
                    if (d > strongestDef) { strongestDef = d; strongestEnemy = o; }
                    if (s.land[o] > biggestNeighbourLand) { biggestNeighbourLand = s.land[o]; biggestNeighbour = o; }
                }
            }
        }

        double misplayChance = level == 2 ? 0.0 : level == 0 ? 0.12 : MISPLAY_CHANCE;
        double breakMargin = level == 2 ? 1.05 : BREAK_MARGIN;   // Hard bots commit more readily
        boolean defends = level >= 1;                            // Easy bots never hold -> overextend
        boolean misplay = s.rng.nextDouble() < misplayChance;
        double myDef = s.defensePerCell(p);
        double esc = Config.warEscalation(s.tick);
        double wave = s.army[p] * ATTACK_FRACTION * s.momentum[p] * esc;     // war exhaustion
        boolean warDragging = esc > 1.6;                                     // late war -> all-out aggression
        int expandTarget = cityTarget >= 0 ? cityTarget : neutralTarget;   // prefer cities
        // Only expand if the wave can actually capture neutral land; otherwise HOLD and let income
        // build the army up (expanding with too little army just wastes it and starves you).
        boolean canExpand = neutralAdjacent
                && (s.density(p) > EXPAND_MIN_DENSITY || warDragging)          // keep a reserve, but in
                                                                              // late war push to close gaps
                && s.army[p] * EXPAND_FRACTION * s.momentum[p] > Config.NEUTRAL_COST;

        // Opening Peace phase: no PvP — grab land (toward a city) when able, else accumulate.
        if (s.phase == GameState.PEACE) {
            return canExpand ? new Action(p, GameState.NEUTRAL, EXPAND_FRACTION, expandTarget) : null;
        }

        // GROW FIRST: claim free neutral land (cheap and always effective) before assaulting forts.
        // A smart player banks economy from empty land rather than bleeding on fortified borders.
        if (canExpand && !misplay) {
            return new Action(p, GameState.NEUTRAL, EXPAND_FRACTION, expandTarget);
        }

        // Gang up on a runaway leader: commit hard and drive at its capital.
        if (!misplay && leaderDominant && biggestNeighbour == leader && biggestNeighbour != p
                && biggestNeighbourLand > s.land[p] * LEADER_RATIO && s.rng.nextDouble() < GANG_UP_CHANCE) {
            return new Action(p, leader, GANG_FRACTION, s.capitalCell[leader]);
        }

        // Otherwise attack the weakest front my concentrated wave can break — even a bigger empire
        // (its defence is spread thin per cell; I mass on one point). Keeps the army WORKING.
        if (weakestEnemy >= 0 && wave > weakestDef * breakMargin) {
            return new Action(p, weakestEnemy, warDragging ? 0.85 : ATTACK_FRACTION, s.capitalCell[weakestEnemy]);
        }

        // Occasional probe so it stays beatable / unpredictable.
        if (misplay && weakestEnemy >= 0) {
            return new Action(p, weakestEnemy, ATTACK_FRACTION, s.capitalCell[weakestEnemy]);
        }

        // A strong neighbour can break me and I have no good move -> HOLD and regrow (defend),
        // keeping density high. Easy bots don't defend (they overextend and die). Otherwise grab land.
        boolean threatened = defends && !warDragging && strongestEnemy >= 0 && strongestDef > myDef;
        if (!threatened && canExpand) {
            return new Action(p, GameState.NEUTRAL, EXPAND_FRACTION, expandTarget);
        }
        if (!defends && weakestEnemy >= 0) {                      // Easy: keep poking even when weak
            return new Action(p, weakestEnemy, ATTACK_FRACTION, s.capitalCell[weakestEnemy]);
        }
        return null;   // hold and regrow
    }
}
