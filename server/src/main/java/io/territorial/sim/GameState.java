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

    // Derived each tick by Sim.recomputeDerived
    public final int[] land;
    public final int[] border;
    public final boolean[] alive;
    public final double[] incomeUnits;   // sum of terrain income multipliers over owned cells
    public final double[] lastIncome;    // army/tick added last tick (for the UI income readout)

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
        java.util.Arrays.fill(momentum, 1.0);
        java.util.Arrays.fill(capitalCell, -1);

        this.land = new int[numPlayers];
        this.border = new int[numPlayers];
        this.alive = new boolean[numPlayers];
        this.incomeUnits = new double[numPlayers];
        this.lastIncome = new double[numPlayers];

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
        for (int c = 0; c < cellCount; c++) {
            int o = owner[c];
            if (o < 0) continue;                       // neutral or water: unowned
            land[o]++;
            incomeUnits[o] += terrain[c].incomeMult;   // cities (1.2x) etc. boost income
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
        for (int c = 0; c < cellCount; c++) if (owner[c] == p) { owner[c] = NEUTRAL; n++; }
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
