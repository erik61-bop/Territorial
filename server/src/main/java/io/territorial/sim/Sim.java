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
        for (int c = 0; c < s.cellCount; c++) if (s.settle[c] > 0) s.settle[c]--;   // captured land settles
        recomputeDerived();
        s.phase = s.tick < Config.PEACE_PHASE_TICKS ? GameState.PEACE : GameState.WAR;
        java.util.Arrays.fill(captured, 0);
        java.util.Arrays.fill(lost, 0);
        java.util.Arrays.fill(attacked, false);

        applyIncome();
        resolveAttacks(actions);
        applyRebellion();
        applyMomentum();
        for (int p = 0; p < s.numPlayers; p++) {            // defensive: never NaN/Inf/negative
            if (!Double.isFinite(s.army[p]) || s.army[p] < 0) s.army[p] = 0;
            // Enforce the army cap AFTER combat too (reflux/captures can't push it past the cap) —
            // otherwise leaders hoard armies far beyond land*cap.
            double cap = s.land[p] * Config.ARMY_CAP_PER_LAND;
            if (s.army[p] > cap) s.army[p] = cap;
        }
        s.tick++;
    }

    public void recomputeDerived() { s.recompute(); }

    private void applyIncome() {
        // territorial.io-style: most income accrues smoothly EVERY tick, plus a visible BONUS pulse every
        // INCOME_PERIOD_TICKS. Total over a period equals the per-tick income x the period, so balance is
        // unchanged — only the delivery is lumpier (you see a jump on the pulse).
        boolean pulse = (s.tick % Config.INCOME_PERIOD_TICKS == 0);
        // Early boost: the opening earns EARLY_BOOST_MAX× and decays to 1× over EARLY_BOOST_TICKS.
        double boost = 1.0 + (Config.EARLY_BOOST_MAX - 1.0)
                * Math.max(0.0, 1.0 - (double) s.tick / Config.EARLY_BOOST_TICKS);
        for (int p = 0; p < s.numPlayers; p++) {
            if (!s.alive[p]) continue;
            double stability = clamp(s.density(p) / Config.STABILITY_TARGET, Config.STAB_MIN, 1.0);
            double capMult = s.ownsCapital(p) ? Config.CAPITAL_INCOME : 1.0;
            double perTick = Math.pow(s.incomeUnits[p], Config.LAND_INCOME_EXP)
                    * Config.INCOME_RATE * stability * capMult * boost;
            double gain = perTick * Config.INCOME_CONTINUOUS_FRAC;   // the smooth per-tick share
            if (pulse) gain += perTick * (1.0 - Config.INCOME_CONTINUOUS_FRAC) * Config.INCOME_PERIOD_TICKS; // bonus lump
            double cap = s.land[p] * Config.ARMY_CAP_PER_LAND;
            s.army[p] = Math.min(s.army[p] + gain, cap);
            s.lastIncome[p] = perTick;   // steady "+X/s" readout (the full average rate)
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
            if (t != GameState.NEUTRAL && (t < 0 || t >= s.numPlayers)) continue; // invalid/water target
            if (t != GameState.NEUTRAL) {
                if (s.phase == GameState.PEACE) continue;                     // opening: no PvP
                if (s.areFriendly(x, t)) continue;                            // peace/ally holds
            }
            double f = clamp(a.fraction(), 0.0, 1.0);
            if (f <= 0) continue;

            // Frontier: land cells of t adjacent to x, plus amphibious cells of t reachable
            // across a single water tile (strait) from x. naval[] marks the latter (extra cost).
            java.util.List<Integer> fl = new java.util.ArrayList<>();
            java.util.List<Double> nv = new java.util.ArrayList<>();   // per-cell cost multiplier (1.0 land)
            java.util.HashSet<Integer> seen = new java.util.HashSet<>();
            for (int c : frontierCells(x, t)) { if (seen.add(c)) { fl.add(c); nv.add(1.0); } }
            // Amphibious "ships": BFS through open water from X's coast up to NAVAL_RANGE tiles. Any
            // land cell of t touching reachable water is an invasion target (islands + far coasts);
            // cost rises with the sea distance crossed.
            java.util.HashMap<Integer, Integer> wd = new java.util.HashMap<>();
            java.util.ArrayDeque<Integer> wq = new java.util.ArrayDeque<>();
            for (int wcell : s.waterCells) {
                for (int nb : s.neighbours[wcell]) if (s.owner[nb] == x) { if (wd.putIfAbsent(wcell, 1) == null) wq.add(wcell); break; }
            }
            while (!wq.isEmpty()) {
                int w = wq.poll(); int d = wd.get(w);
                double mult = Config.NAVAL_COST_MULT * (1.0 + (d - 1) * Config.NAVAL_RANGE_PENALTY);
                for (int nb : s.neighbours[w]) if (s.owner[nb] == t && seen.add(nb)) { fl.add(nb); nv.add(mult); }
                if (d < Config.NAVAL_RANGE) for (int nb : s.neighbours[w]) {
                    if (s.owner[nb] == GameState.WATER && wd.putIfAbsent(nb, d + 1) == null) wq.add(nb);
                }
            }
            if (fl.isEmpty()) continue;
            int[] frontier = new int[fl.size()];
            double[] navalMult = new double[fl.size()];
            for (int k = 0; k < frontier.length; k++) { frontier[k] = fl.get(k); navalMult[k] = nv.get(k); }
            if (t != GameState.NEUTRAL) attacked[t] = true;

            double bal0 = s.army[x];                         // balance before this wave leaves (for occupation cost)
            double sent = s.army[x] * f;
            if (sent <= 0) continue;
            s.army[x] -= sent;
            // War exhaustion: attacks grow stronger AND can blitz deeper (penetration fades) the
            // longer the war lasts (vs players only), so empires can be overrun and the war ends.
            double esc = (t != GameState.NEUTRAL) ? Config.warEscalation(s.tick) : 1.0;
            double wave = sent * s.momentum[x] * esc;
            final double wave0 = wave;                       // initial wave, for proportional reflux

            // Defender morale hardens defence (a turtle that keeps winning gets tougher); a defender
            // in the HOLD stance (not attacking this tick) digs in for +25%.
            double baseDef = (t == GameState.NEUTRAL)
                    ? Config.NEUTRAL_COST
                    : s.defensePerCell(t) * s.momentum[t] * (s.stance[t] == 1 ? Config.HOLD_DEFENSE : 1.0);

            // Cost per frontier cell. Order the wave: toward the directed cell if given
            // (reinforcement direction), else cheapest-first.
            // Occupation cost: every captured tile costs a flat fraction of the attacker's balance
            // (territorial.io ~1.17%/tile), terrain-scaled — so conquest scales with your size and an
            // attack can only take ~ send%/ATTACK_COST_FRAC tiles before the wave is spent.
            double occ = Config.ATTACK_COST_FRAC * bal0;
            double[] cost = new double[frontier.length];
            double[] key = new double[frontier.length];
            boolean directed = a.targetCell() >= 0 && a.targetCell() < s.cellCount;
            for (int k = 0; k < frontier.length; k++) {
                cost[k] = (cellCost(frontier[k], t, baseDef) + occ * s.terrain[frontier[k]].defMult) * navalMult[k];
                key[k] = directed ? s.distance(frontier[k], a.targetCell()) : cost[k];
            }
            sortByKey(frontier, cost, key);

            int takenThisWave = 0;
            for (int k = 0; k < frontier.length && wave > 0; k++) {
                int c = frontier[k];
                // Each successive cell costs more: you can chip a border, not blitz a nation.
                double effCost = cost[k] * (1.0 + takenThisWave * Config.PENETRATION_PENALTY / esc);
                if (wave <= effCost) break;   // must STRICTLY exceed the cell's cost to capture it
                int old = s.owner[c];
                s.owner[c] = x;
                s.settle[c] = Config.SETTLE_TICKS;   // freshly captured: integrates before it earns income
                wave -= effCost;
                takenThisWave++;
                captured[x]++;
                if (old != GameState.NEUTRAL) {
                    lost[old]++;
                    // Defender loses HALF the wave spent breaking this cell (territorial.io "lose x/2"),
                    // i.e. proportional to the ATTACK — not to the defender's own density — so a strong
                    // defender bleeds only as much as it's actually hit, instead of collapsing.
                    s.army[old] = Math.max(0, s.army[old] - Config.GARRISON_KILL * effCost);
                    if (c == s.capitalCell[old]) {                 // capital snipe = decapitation
                        s.army[old] *= Config.CAPITAL_STRIKE_ARMY; // army thrown into chaos
                        s.momentum[old] = Config.MOMENTUM_MIN;     // morale collapses
                        s.capitalCell[old] = -1;                   // capital lost (relocated next recompute)
                    }
                }
            }
            // Refund the UNSPENT portion of the wave, in real-army terms (not escalated) so an
            // attack can never mint army: refund <= sent * REFLUX, i.e. attacking always costs you.
            s.army[x] += (wave0 > 0 ? wave / wave0 : 1.0) * sent * Config.REFLUX;
        }
    }

    /** Wave-cost to capture a cell. Neutral land is a flat terrain-scaled cost; an enemy cell uses the
     *  shared per-cell defence formula (GameState.cellDefenseWith) so combat and the HUD never diverge. */
    private double cellCost(int cell, int target, double baseDef) {
        double cost = (target == GameState.NEUTRAL)
                ? baseDef * s.terrain[cell].defMult
                : s.cellDefenseWith(cell, target, baseDef);
        return Math.max(cost, 0.0001);
    }

    private double supplyMult(int cell, int player) { return s.supplyMult(cell, player); }

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
            // Successful defence: attacked but you held (losing only a sliver) -> morale up.
            // This stops a defender who loses a couple cells from spiralling.
            if (attacked[p] && lost[p] <= Math.max(1, s.land[p] / 25)) m += Config.MOMENTUM_DEFEND;
            m += (1.0 - m) * Config.MOMENTUM_DECAY;          // decay toward 1.0
            // Holding (digging in) steadily builds morale, up to a cap — reward turtling + a stronger
            // counter-strike when you finally break out.
            if (s.stance[p] == 1 && m < Config.HOLD_MORALE_CAP) m = Math.min(Config.HOLD_MORALE_CAP, m + Config.MOMENTUM_HOLD);
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
        // Last one standing only: alliances help you win but never SHARE the win — a coalition must
        // betray and fight to a single victor (bots do this in the endgame). The deadline below is a
        // pure safety so the live match can never hang on a rare stalemate.
        if (s.tick - Config.PEACE_PHASE_TICKS > Config.WAR_DEADLINE) return biggest;
        return -1;
    }

    private static double clamp(double v, double lo, double hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
}
