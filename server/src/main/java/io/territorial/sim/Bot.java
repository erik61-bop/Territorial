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

    /**
     * AI PERSONALITY. Each slot gets one (assigned deterministically in GameFactory), so every match
     * has a mix of play-styles and feels different — aggressors blitz, turtles dig in, expanders race
     * for land, backstabbers betray. Difficulty ({@link #level}) layers competence on top of style.
     */
    public static final class Style {
        public final String name;
        final double attackFraction, expandFraction, expandMinDensity, breakMargin, gangChance, betrayMul;
        final boolean defends;
        Style(String name, double atk, double exp, double minDens, double brk, double gang, double betray, boolean defends) {
            this.name = name; this.attackFraction = atk; this.expandFraction = exp; this.expandMinDensity = minDens;
            this.breakMargin = brk; this.gangChance = gang; this.betrayMul = betray; this.defends = defends;
        }
    }
    public static final Style[] STYLES = {
        //        name           atkF  expF  minDens brkM  gang  betray defends
        new Style("Balanced",    0.60, 0.45, 1.30,   1.25, 0.80, 1.0,   true),
        new Style("Aggressor",   0.74, 0.40, 1.00,   1.10, 0.90, 1.4,   false),  // blitz, little reserve
        new Style("Turtle",      0.54, 0.40, 1.75,   1.42, 0.55, 0.6,   true),   // big reserve, cautious hits
        new Style("Expander",    0.58, 0.55, 1.00,   1.35, 0.70, 0.9,   true),   // races for neutral land
        new Style("Backstabber", 0.64, 0.45, 1.25,   1.18, 0.85, 2.2,   true),   // befriends then betrays
    };
    static Style styleOf(GameState s, int p) {
        byte b = (s.botStyle != null && p < s.botStyle.length) ? s.botStyle[p] : 0;
        return STYLES[(b & 0xFF) % STYLES.length];
    }

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
        // Also kicks in once the war has dragged on (escalation high), so blocs can't stalemate forever.
        double esc = Config.warEscalation(s.tick);
        boolean endgame = aliveCount <= 4 || esc >= 2.5;

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
            // Betrayal gets likelier the longer the war drags (escalation) — alliances are temporary.
            double chance = ((endgame || obsolete) ? 0.30 : DIPLO_INIT_CHANCE) * styleOf(s, p).betrayMul
                    * Math.min(3.0, Math.max(1.0, esc));
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

        boolean hasCoast = false;
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
                    hasCoast = true;
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

        Style st = styleOf(s, p);                                // personality
        double misplayChance = level == 2 ? 0.0 : level == 0 ? 0.12 : MISPLAY_CHANCE;
        double breakMargin = st.breakMargin * (level == 2 ? 0.88 : 1.0);   // Hard bots commit more readily
        boolean defends = st.defends && level >= 1;              // Aggressors/Easy never hold -> overextend
        boolean misplay = s.rng.nextDouble() < misplayChance;
        double myDef = s.defensePerCell(p);
        double esc = Config.warEscalation(s.tick);
        double wave = s.army[p] * st.attackFraction * s.momentum[p] * esc;   // war exhaustion
        boolean warDragging = esc > 1.6;                                     // late war -> all-out aggression
        int expandTarget = cityTarget >= 0 ? cityTarget : neutralTarget;   // prefer cities
        // Only expand if the wave can actually capture neutral land; otherwise HOLD and let income
        // build the army up (expanding with too little army just wastes it and starves you).
        boolean canExpand = neutralAdjacent
                && (s.density(p) > st.expandMinDensity || warDragging)         // keep a reserve, but in
                                                                              // late war push to close gaps
                && s.army[p] * st.expandFraction * s.momentum[p] > Config.NEUTRAL_COST;

        // Opening Peace phase: no PvP — grab land (toward a city); if landlocked-out, ship to an island.
        if (s.phase == GameState.PEACE) {
            if (canExpand) return new Action(p, GameState.NEUTRAL, st.expandFraction, expandTarget);
            if (hasCoast && !misplay && s.density(p) > st.expandMinDensity) {
                int nt = navalTarget(s, p, true);                  // neutral islands only during peace
                if (nt >= 0 && s.army[p] * st.expandFraction * s.momentum[p] > Config.NEUTRAL_COST * Config.NAVAL_COST_MULT * 1.3)
                    return new Action(p, GameState.NEUTRAL, st.expandFraction, nt);
            }
            return null;
        }

        // GROW FIRST: claim free neutral land (cheap and always effective) before assaulting forts.
        // A smart player banks economy from empty land rather than bleeding on fortified borders.
        if (canExpand && !misplay) {
            return new Action(p, GameState.NEUTRAL, st.expandFraction, expandTarget);
        }

        // Gang up on a runaway leader: commit hard and drive at its capital.
        if (!misplay && leaderDominant && biggestNeighbour == leader && biggestNeighbour != p
                && biggestNeighbourLand > s.land[p] * LEADER_RATIO && s.rng.nextDouble() < st.gangChance) {
            return new Action(p, leader, GANG_FRACTION, s.capitalCell[leader]);
        }

        // Otherwise attack the weakest front my concentrated wave can break — even a bigger empire
        // (its defence is spread thin per cell; I mass on one point). Keeps the army WORKING.
        if (weakestEnemy >= 0 && wave > weakestDef * breakMargin) {
            return new Action(p, weakestEnemy, warDragging ? 0.85 : st.attackFraction, s.capitalCell[weakestEnemy]);
        }

        // Occasional probe so it stays beatable / unpredictable.
        if (misplay && weakestEnemy >= 0) {
            return new Action(p, weakestEnemy, st.attackFraction, s.capitalCell[weakestEnemy]);
        }

        // A strong neighbour can break me and I have no good move -> HOLD and regrow (defend),
        // keeping density high. Aggressors/Easy don't defend (they overextend). Otherwise grab land.
        boolean threatened = defends && !warDragging && strongestEnemy >= 0 && strongestDef > myDef;
        if (!threatened && canExpand) {
            return new Action(p, GameState.NEUTRAL, st.expandFraction, expandTarget);
        }
        if (!defends && weakestEnemy >= 0) {                      // Aggressor: keep poking even when weak
            return new Action(p, weakestEnemy, st.attackFraction, s.capitalCell[weakestEnemy]);
        }
        // No good land move — if I have a coast and a healthy reserve, launch a naval invasion
        // (island or enemy coast across the sea) so the seas/islands get contested too.
        if (hasCoast && !misplay && !threatened && s.density(p) > st.expandMinDensity) {
            int nt = navalTarget(s, p, false);
            if (nt >= 0) {
                int no = s.owner[nt];
                double cost = (no == GameState.NEUTRAL ? Config.NEUTRAL_COST : s.defensePerCell(no) * s.momentum[no]) * Config.NAVAL_COST_MULT;
                if (wave > cost * 1.4) return new Action(p, no, st.attackFraction, nt);
            }
        }
        return null;   // hold and regrow
    }

    /** Nearest land cell reachable by sea (≤ NAVAL_RANGE water tiles) that p may invade, or -1.
     *  neutralOnly restricts to neutral land (islands) — used during the Peace phase. */
    static int navalTarget(GameState s, int p, boolean neutralOnly) {
        java.util.HashMap<Integer, Integer> wd = new java.util.HashMap<>();
        java.util.ArrayDeque<Integer> q = new java.util.ArrayDeque<>();
        for (int w : s.waterCells)
            for (int nb : s.neighbours[w]) if (s.owner[nb] == p) { if (wd.putIfAbsent(w, 1) == null) q.add(w); break; }
        while (!q.isEmpty()) {
            int w = q.poll(); int d = wd.get(w);
            for (int nb : s.neighbours[w]) {
                int o = s.owner[nb];
                if (o == GameState.NEUTRAL) return nb;                                  // island — easiest
                if (!neutralOnly && o >= 0 && o != p && !s.areFriendly(p, o)) return nb; // enemy coast
            }
            if (d < Config.NAVAL_RANGE)
                for (int nb : s.neighbours[w]) if (s.owner[nb] == GameState.WATER && wd.putIfAbsent(nb, d + 1) == null) q.add(nb);
        }
        return -1;
    }
}
