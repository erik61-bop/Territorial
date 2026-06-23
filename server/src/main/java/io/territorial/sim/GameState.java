package io.territorial.sim;

/**
 * The whole game world. Plain data + grid helpers; all rules live in {@link Sim}.
 * Cells are a flat array indexed by {@code y * width + x}.
 */
public final class GameState {
    public static final int NEUTRAL = -1;
    public static final int WATER = -2;   // sentinel owner for ocean cells (never ownable)

    public int[] waterCells = new int[0];  // indices of water cells (set by GameFactory)

    // Match phases. Flow is PEACE -> WAR (no Final War — win is last one standing).
    public static final int PEACE = 0, WAR = 1;
    public int phase = PEACE;

    public final int width, height, cellCount;
    public final int numPlayers;
    public final Rng rng;
    public int ownableCells;   // cells that can be owned (cellCount minus water); the win denominator

    // Per cell
    public final int[] owner;        // playerId or NEUTRAL
    public final Terrain[] terrain;

    // Per player
    public final double[] army;
    public final double[] momentum;
    public final int[] capitalCell;
    public final byte[] botStyle;        // AI personality per slot (see Bot.STYLES); 0 = Balanced
    public final int[] stance;           // defence posture: 0 = Normal, 1 = Hold (+25% defence)

    // Derived each tick by Sim.recomputeDerived
    public final int[] land;
    public final int[] border;
    public final boolean[] alive;
    public final double[] incomeUnits;   // sum of terrain income multipliers over owned cells
    public final double[] lastIncome;    // army/tick added last tick (for the UI income readout)
    public final int[] developing;       // per-player count of just-captured cells not yet producing income
    public final int[] settle;           // per-cell ticks until a captured cell starts producing income
    public final double[] defScore;      // AVG terrain/supply/morale/stance-aware defence per border cell
    public final double[] defWeak;       // WEAKEST border cell's defence (the breach point attacks exploit)

    // Diplomacy (symmetric). rel: 0 none, 1 peace, 2 ally. offer[a][b] = a has offered b peace.
    public final byte[][] rel;
    public final int[][] relUntil;       // tick at which a PEACE expires
    public final boolean[][] offer;      // pending peace offers
    public final boolean[][] allyOffer;  // pending alliance offers

    // Precomputed 4-neighbours per cell (-1 padded for off-grid), and neighbour count
    final int[][] neighbours;

    public int tick = 0;

    public GameState(int width, int height, int numPlayers, long seed) {
        this.width = width;
        this.height = height;
        this.cellCount = width * height;
        this.ownableCells = cellCount;   // reduced by GameFactory when water is carved out
        this.numPlayers = numPlayers;
        this.rng = new Rng(seed);

        this.owner = new int[cellCount];
        this.terrain = new Terrain[cellCount];
        java.util.Arrays.fill(owner, NEUTRAL);
        java.util.Arrays.fill(terrain, Terrain.PLAIN);

        this.army = new double[numPlayers];
        this.momentum = new double[numPlayers];
        this.capitalCell = new int[numPlayers];
        this.botStyle = new byte[numPlayers];   // all Balanced until GameFactory assigns
        this.stance = new int[numPlayers];      // all Normal (0); set per tick by the room/runner
        java.util.Arrays.fill(momentum, 1.0);
        java.util.Arrays.fill(capitalCell, -1);

        this.land = new int[numPlayers];
        this.border = new int[numPlayers];
        this.alive = new boolean[numPlayers];
        this.incomeUnits = new double[numPlayers];
        this.lastIncome = new double[numPlayers];
        this.developing = new int[numPlayers];
        this.settle = new int[cellCount];
        this.defScore = new double[numPlayers];
        this.defWeak = new double[numPlayers];

        this.rel = new byte[numPlayers][numPlayers];
        this.relUntil = new int[numPlayers][numPlayers];
        this.offer = new boolean[numPlayers][numPlayers];
        this.allyOffer = new boolean[numPlayers][numPlayers];

        this.neighbours = new int[cellCount][];
        buildNeighbours();
    }

    private void buildNeighbours() {
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int i = idx(x, y);
                int[] tmp = new int[4];
                int n = 0;
                if (x > 0)          tmp[n++] = idx(x - 1, y);
                if (x < width - 1)  tmp[n++] = idx(x + 1, y);
                if (y > 0)          tmp[n++] = idx(x, y - 1);
                if (y < height - 1) tmp[n++] = idx(x, y + 1);
                neighbours[i] = java.util.Arrays.copyOf(tmp, n);
            }
        }
    }

    public int idx(int x, int y) { return y * width + x; }
    public int xOf(int cell)     { return cell % width; }
    public int yOf(int cell)     { return cell / width; }

    /** Manhattan distance between two cells. */
    public int distance(int a, int b) {
        return Math.abs(xOf(a) - xOf(b)) + Math.abs(yOf(a) - yOf(b));
    }

    /** Recompute land, border and alive from current ownership. */
    public void recompute() {
        java.util.Arrays.fill(land, 0);
        java.util.Arrays.fill(border, 0);
        java.util.Arrays.fill(incomeUnits, 0);
        java.util.Arrays.fill(developing, 0);
        for (int c = 0; c < cellCount; c++) {
            int o = owner[c];
            if (o < 0) continue;                       // neutral or water: unowned
            land[o]++;
            if (settle[c] > 0) developing[o]++;         // freshly captured: held but not yet productive
            else incomeUnits[o] += terrain[c].incomeMult;   // settled land earns (cities 1.2x etc.)
            for (int nb : neighbours[c]) {
                int no = owner[nb];
                if (no != o && no != WATER) { border[o]++; break; }  // water is a safe edge
            }
        }
        for (int p = 0; p < numPlayers; p++) alive[p] = land[p] > 0;
        // Relocate a lost/invalid capital to a surviving cell (after a capital snipe).
        for (int p = 0; p < numPlayers; p++) {
            if (!alive[p]) continue;
            if (capitalCell[p] >= 0 && owner[capitalCell[p]] == p) continue;
            for (int c = 0; c < cellCount; c++) if (owner[c] == p) { capitalCell[p] = c; break; }
        }
        // Defence readout, using the SAME per-cell formula combat charges (cellDefense): the AVERAGE
        // and the WEAKEST border cell. The weakest is what matters — attacks eat the cheapest cell
        // first, so that's where you actually get breached.
        java.util.Arrays.fill(defScore, 0);
        java.util.Arrays.fill(defWeak, 0);
        for (int p = 0; p < numPlayers; p++) {
            if (!alive[p] || border[p] == 0) continue;
            double base = baseDef(p);
            double sum = 0, min = Double.MAX_VALUE; int n = 0;
            for (int c = 0; c < cellCount; c++) {
                if (owner[c] != p || !isBorderCell(c, p)) continue;
                double d = cellDefenseWith(c, p, base);
                sum += d; if (d < min) min = d; n++;
            }
            defScore[p] = n > 0 ? sum / n : 0;
            defWeak[p]  = n > 0 ? min : 0;
        }
    }

    /** Is cell {@code c} (owned by p) on the front — adjacent to a non-friendly land cell? (Water is
     *  a safe edge, so it doesn't count.) */
    public boolean isBorderCell(int c, int p) {
        for (int nb : neighbours[c]) { int no = owner[nb]; if (no != p && no != WATER) return true; }
        return false;
    }

    /** Supply multiplier for a cell: defence falls off with distance from the owner's capital. */
    public double supplyMult(int cell, int p) {
        int cap = capitalCell[p];
        if (cap < 0) return 1.0;
        double m = 1.0 - distance(cell, cap) * Config.SUPPLY_FALLOFF;
        return Math.max(Config.SUPPLY_MIN, Math.min(1.0, m));
    }

    /** A player's base per-cell defence: army concentration x morale x stance (before terrain/supply). */
    public double baseDef(int p) {
        return defensePerCell(p) * momentum[p] * (stance[p] == 1 ? Config.HOLD_DEFENSE : 1.0);
    }

    /** THE per-cell defence formula — the wave-cost to crack one of {@code p}'s cells. Single source of
     *  truth shared by combat ({@link Sim}) and the HUD readout. {@code base} = {@link #baseDef(int)}.
     *
     *  Two parts: a CONTROL floor (cost to occupy the land at all, supply-independent) PLUS the
     *  army-scaled defence. The floor stops a near-zero army value (a hollow giant) from letting one
     *  army sweep many cells — every enemy cell costs at least ~CONTROL_COST to take. */
    public double cellDefenseWith(int cell, int p, double base) {
        double terr = terrain[cell].defMult;
        double capMul = (cell == capitalCell[p]) ? Config.CAPITAL_DEF : 1.0;
        double armyDef = base * terr * supplyMult(cell, p) * capMul;
        double control = Config.CONTROL_COST * terr * capMul;   // supply does NOT cheapen the floor
        return control + armyDef;
    }

    public double density(int p)        { return army[p] / Math.max(1, land[p]); }
    public double defensePerCell(int p)  { return army[p] / Math.max(1, border[p]); }
    public boolean ownsCapital(int p)    { return capitalCell[p] >= 0 && owner[capitalCell[p]] == p; }

    public boolean hasLand(int p) {
        for (int c = 0; c < cellCount; c++) if (owner[c] == p) return true;
        return false;
    }

    /** Wipe a player's territory + army + treaties (used on join/leave/respawn). Returns cells freed. */
    public int clearPlayer(int p) {
        int n = 0;
        for (int c = 0; c < cellCount; c++) if (owner[c] == p) { owner[c] = NEUTRAL; settle[c] = 0; n++; }
        army[p] = 0;
        for (int q = 0; q < numPlayers; q++) {
            rel[p][q] = 0; rel[q][p] = 0;
            offer[p][q] = false; offer[q][p] = false;
            allyOffer[p][q] = false; allyOffer[q][p] = false;
        }
        return n;
    }

    /** Seed player p a fresh blob (BFS over neutral) of up to {@code size} cells at {@code start}. */
    public int spawnBlob(int p, int start, int size) {
        if (start < 0 || start >= cellCount || owner[start] != NEUTRAL) return 0;
        java.util.ArrayDeque<Integer> q = new java.util.ArrayDeque<>();
        owner[start] = p;
        capitalCell[p] = start;
        int cnt = 1;
        q.add(start);
        while (!q.isEmpty() && cnt < size) {
            int c = q.poll();
            for (int nb : neighbours[c]) {
                if (cnt >= size) break;
                if (owner[nb] == NEUTRAL) { owner[nb] = p; cnt++; q.add(nb); }
            }
        }
        return cnt;
    }

    /** True if a and b are allied or in an active (unexpired) peace — they cannot attack each other. */
    public boolean areFriendly(int a, int b) {
        byte r = rel[a][b];
        return r == 2 || (r == 1 && tick < relUntil[a][b]);
    }
}
