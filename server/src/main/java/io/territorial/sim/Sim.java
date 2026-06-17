package io.territorial.sim;

import java.util.List;

/**
 * The authoritative, pure simulation. No I/O, no wall-clock, no randomness except {@link Rng}.
 * One instance is bound to one {@link GameState}; call {@link #tick(List)} once per game tick.
 */
public final class Sim {
    private final GameState s;

    // Per-tick scratch (reset every tick) feeding the momentum step.
    private final int[] captured;
    private final int[] lost;
    private final boolean[] attacked;

    public Sim(GameState state) {
        this.s = state;
        this.captured = new int[state.numPlayers];
        this.lost = new int[state.numPlayers];
        this.attacked = new boolean[state.numPlayers];
    }

    /**
     * Apply diplomacy for this tick: expire lapsed peaces, then process orders deterministically.
     * Call once per tick BEFORE {@link #tick(List)} (the attack gate reads the resulting relations).
     */
    public void applyDiplomacy(List<Diplo> orders) {
        // Expire lapsed peaces.
        for (int a = 0; a < s.numPlayers; a++) {
            for (int b = a + 1; b < s.numPlayers; b++) {
                if (s.rel[a][b] == 1 && s.tick >= s.relUntil[a][b]) {
                    s.rel[a][b] = 0; s.rel[b][a] = 0;
                }
            }
        }
        if (orders == null || orders.isEmpty()) return;

        List<Diplo> ordered = new java.util.ArrayList<>(orders);
        ordered.sort((x, y) -> x.from() != y.from() ? Integer.compare(x.from(), y.from())
                : x.to() != y.to() ? Integer.compare(x.to(), y.to())
                : Integer.compare(x.kind().ordinal(), y.kind().ordinal()));

        for (Diplo d : ordered) {
            int f = d.from(), t = d.to();
            if (f < 0 || t < 0 || f >= s.numPlayers || t >= s.numPlayers || f == t) continue;
            if (!s.alive[f] || !s.alive[t]) continue;
            switch (d.kind()) {
                case REQUEST_PEACE -> { if (s.rel[f][t] == 0) s.offer[f][t] = true; }
                case ACCEPT_PEACE -> {
                    if (s.offer[t][f]) {            // the other party had offered
                        setPeace(f, t);
                    }
                }
                case BREAK_PEACE -> {
                    s.rel[f][t] = 0; s.rel[t][f] = 0;
                    s.offer[f][t] = false; s.offer[t][f] = false;
                }
                case REQUEST_ALLY -> { if (s.rel[f][t] != 2) s.allyOffer[f][t] = true; }
                case ACCEPT_ALLY -> { if (s.allyOffer[t][f]) setAlly(f, t); }
                case BREAK_ALLY -> {
                    if (s.rel[f][t] == 2) { s.rel[f][t] = 0; s.rel[t][f] = 0; }
                    s.allyOffer[f][t] = false; s.allyOffer[t][f] = false;
                }
            }
        }
    }

    private void setAlly(int a, int b) {
        s.rel[a][b] = 2; s.rel[b][a] = 2;            // alliances don't expire
        s.allyOffer[a][b] = false; s.allyOffer[b][a] = false;
        s.offer[a][b] = false; s.offer[b][a] = false;
    }

    private void setPeace(int a, int b) {
        s.rel[a][b] = 1; s.rel[b][a] = 1;
        s.relUntil[a][b] = s.tick + Config.PEACE_TICKS;
        s.relUntil[b][a] = s.tick + Config.PEACE_TICKS;
        s.offer[a][b] = false; s.offer[b][a] = false;
    }

    /** Advance the world one tick. Actions are applied in ascending attackerId order. */
    public void tick(List<Action> actions) {
        recomputeDerived();
        s.phase = s.tick < Config.PEACE_PHASE_TICKS ? GameState.PEACE
                : s.tick >= Config.FINAL_WAR_TICK ? GameState.FINAL_WAR
                : GameState.WAR;
        java.util.Arrays.fill(captured, 0);
        java.util.Arrays.fill(lost, 0);
        java.util.Arrays.fill(attacked, false);

        applyIncome();
        resolveAttacks(actions);
        applyRebellion();
        applyMomentum();
        s.tick++;
    }

    public void recomputeDerived() { s.recompute(); }

    private void applyIncome() {
        for (int p = 0; p < s.numPlayers; p++) {
            if (!s.alive[p]) continue;
            double stability = clamp(s.density(p) / Config.STABILITY_TARGET, Config.STAB_MIN, 1.0);
            double capMult = s.ownsCapital(p) ? Config.CAPITAL_INCOME : 1.0;
            double income = Math.pow(s.incomeUnits[p], Config.LAND_INCOME_EXP)
                    * Config.INCOME_RATE * stability * capMult;
            double cap = s.land[p] * Config.ARMY_CAP_PER_LAND;
            s.army[p] = Math.min(s.army[p] + income, cap);
        }
    }

    private void resolveAttacks(List<Action> actions) {
        // Stable order: ascending attackerId, then by target for determinism.
        List<Action> ordered = new java.util.ArrayList<>(actions);
        ordered.sort((a, b) -> a.attackerId() != b.attackerId()
                ? Integer.compare(a.attackerId(), b.attackerId())
                : Integer.compare(a.targetOwner(), b.targetOwner()));

        for (Action a : ordered) {
            int x = a.attackerId();
            int t = a.targetOwner();
            if (x < 0 || x >= s.numPlayers || !s.alive[x]) continue;
            if (t == x) continue;
            if (t != GameState.NEUTRAL) {
                if (s.phase == GameState.PEACE) continue;                     // opening: no PvP
                if (s.phase != GameState.FINAL_WAR && s.areFriendly(x, t)) continue; // peace/ally holds (void in Final War)
            }
            double f = clamp(a.fraction(), 0.0, 1.0);
            if (f <= 0) continue;

            // Frontier: cells owned by t that touch a cell owned by x.
            int[] frontier = frontierCells(x, t);
            if (frontier.length == 0) continue;
            if (t != GameState.NEUTRAL) attacked[t] = true;

            double sent = s.army[x] * f;
            if (sent <= 0) continue;
            s.army[x] -= sent;
            double wave = sent * s.momentum[x];
            if (s.phase == GameState.FINAL_WAR) wave *= Config.FINAL_WAR_ATTACK; // gloves off

            // Defender morale hardens defence (so a turtle that keeps winning gets tougher).
            double baseDef = (t == GameState.NEUTRAL)
                    ? Config.NEUTRAL_COST
                    : s.defensePerCell(t) * s.momentum[t];

            // Cost per frontier cell. Order the wave: toward the directed cell if given
            // (reinforcement direction), else cheapest-first.
            double[] cost = new double[frontier.length];
            double[] key = new double[frontier.length];
            boolean directed = a.targetCell() >= 0;
            for (int k = 0; k < frontier.length; k++) {
                cost[k] = cellCost(frontier[k], t, baseDef);
                key[k] = directed ? s.distance(frontier[k], a.targetCell()) : cost[k];
            }
            sortByKey(frontier, cost, key);

            int takenThisWave = 0;
            for (int k = 0; k < frontier.length && wave > 0; k++) {
                int c = frontier[k];
                // Each successive cell costs more: you can chip a border, not blitz a nation.
                double effCost = cost[k] * (1.0 + takenThisWave * Config.PENETRATION_PENALTY);
                if (wave < effCost) break;
                int old = s.owner[c];
                s.owner[c] = x;
                wave -= effCost;
                takenThisWave++;
                captured[x]++;
                if (old != GameState.NEUTRAL) {
                    lost[old]++;
                    s.army[old] = Math.max(0, s.army[old] - Config.GARRISON_KILL * baseDef);
                }
            }
            s.army[x] += wave * Config.REFLUX;
        }
    }

    private double cellCost(int cell, int target, double baseDef) {
        double cost = baseDef * s.terrain[cell].defMult;
        if (target != GameState.NEUTRAL) {
            cost *= supplyMult(cell, target);
            if (cell == s.capitalCell[target]) cost *= Config.CAPITAL_DEF;
        }
        return Math.max(cost, 0.0001);
    }

    private double supplyMult(int cell, int player) {
        int cap = s.capitalCell[player];
        if (cap < 0) return 1.0;
        double m = 1.0 - s.distance(cell, cap) * Config.SUPPLY_FALLOFF;
        return clamp(m, Config.SUPPLY_MIN, 1.0);
    }

    /** Distinct cells owned by {@code target} adjacent to at least one cell owned by {@code attacker}. */
    private int[] frontierCells(int attacker, int target) {
        // Mark target cells touching attacker. Bounded scan over the grid keeps it deterministic.
        int[] buf = new int[s.cellCount];
        int n = 0;
        for (int c = 0; c < s.cellCount; c++) {
            if (s.owner[c] != target) continue;
            for (int nb : s.neighbours[c]) {
                if (s.owner[nb] == attacker) { buf[n++] = c; break; }
            }
        }
        return java.util.Arrays.copyOf(buf, n);
    }

    /** Insertion sort by {@code key} ascending, keeping cells+cost aligned (deterministic). */
    private static void sortByKey(int[] cells, double[] cost, double[] key) {
        for (int i = 1; i < cells.length; i++) {
            int c = cells[i];
            double co = cost[i], ke = key[i];
            int j = i - 1;
            while (j >= 0 && key[j] > ke) {
                cells[j + 1] = cells[j];
                cost[j + 1] = cost[j];
                key[j + 1] = key[j];
                j--;
            }
            cells[j + 1] = c;
            cost[j + 1] = co;
            key[j + 1] = ke;
        }
    }

    /** Overextended empires (army spread too thin) shed far-flung border cells back to neutral. */
    private void applyRebellion() {
        if (s.phase == GameState.FINAL_WAR) return;   // gloves off: empires consolidate, no rebellion
        for (int p = 0; p < s.numPlayers; p++) {
            if (!s.alive[p] || s.density(p) >= Config.REBEL_DENSITY) continue;
            int cap = s.capitalCell[p];
            for (int c = 0; c < s.cellCount; c++) {
                if (s.owner[c] != p || c == cap) continue;
                boolean border = false;
                for (int nb : s.neighbours[c]) if (s.owner[nb] != p) { border = true; break; }
                if (!border || supplyMult(c, p) > Config.REBEL_SUPPLY) continue;
                if (s.rng.nextDouble() < Config.REBEL_CHANCE) s.owner[c] = GameState.NEUTRAL;
            }
        }
    }

    private void applyMomentum() {
        for (int p = 0; p < s.numPlayers; p++) {
            if (!s.alive[p]) { s.momentum[p] = 1.0; continue; }
            double m = s.momentum[p];
            m += Config.MOMENTUM_WIN * captured[p];
            m -= Config.MOMENTUM_LOSS * lost[p];
            if (attacked[p] && lost[p] == 0) m += Config.MOMENTUM_DEFEND;
            m += (1.0 - m) * Config.MOMENTUM_DECAY;          // decay toward 1.0
            s.momentum[p] = clamp(m, Config.MOMENTUM_MIN, Config.MOMENTUM_MAX);
        }
    }

    /** Winner id, or -1 if the game continues. Call after a tick (uses current derived state). */
    public int winner() {
        int aliveCount = 0, last = -1, biggest = -1, biggestLand = -1;
        for (int p = 0; p < s.numPlayers; p++) {
            if (!s.alive[p]) continue;
            aliveCount++;
            last = p;
            if (s.land[p] > biggestLand) { biggestLand = s.land[p]; biggest = p; }
        }
        if (aliveCount == 0) return -1;
        if (aliveCount == 1) return last;
        // Domination: control WIN_FRACTION of the whole (ownable) map.
        if (s.ownableCells > 0 && (double) biggestLand / s.ownableCells >= Config.WIN_FRACTION) return biggest;
        // Alliance victory: while alliances hold (not Final War), if every survivor is mutually
        // allied the war is over — they share the win (represented by the lowest-id survivor).
        if (s.phase != GameState.FINAL_WAR && allSurvivorsAllied()) {
            for (int p = 0; p < s.numPlayers; p++) if (s.alive[p]) return p;
        }
        return -1;
    }

    private boolean allSurvivorsAllied() {
        for (int a = 0; a < s.numPlayers; a++) {
            if (!s.alive[a]) continue;
            for (int b = a + 1; b < s.numPlayers; b++) {
                if (!s.alive[b]) continue;
                if (s.rel[a][b] != 2) return false;   // an unallied survivor pair -> no victory
            }
        }
        return true;
    }

    private static double clamp(double v, double lo, double hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
}
