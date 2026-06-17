package io.territorial.sim;

/**
 * The whole game world. Plain data + grid helpers; all rules live in {@link Sim}.
 * Cells are a flat array indexed by {@code y * width + x}.
 */
public final class GameState {
    public static final int NEUTRAL = -1;

    // Match phases.
    public static final int PEACE = 0, WAR = 1, FINAL_WAR = 2;
    public int phase = PEACE;

    public final int width, height, cellCount;
    public final int numPlayers;
    public final Rng rng;

    // Per cell
    public final int[] owner;        // playerId or NEUTRAL
    public final Terrain[] terrain;

    // Per player
    public final double[] army;
    public final double[] momentum;
    public final int[] capitalCell;

    // Derived each tick by Sim.recomputeDerived
    public final int[] land;
    public final int[] border;
    public final boolean[] alive;

    // Diplomacy (symmetric). rel: 0 none, 1 peace, 2 ally. offer[a][b] = a has offered b peace.
    public final byte[][] rel;
    public final int[][] relUntil;       // tick at which a PEACE expires
    public final boolean[][] offer;

    // Precomputed 4-neighbours per cell (-1 padded for off-grid), and neighbour count
    final int[][] neighbours;

    public int tick = 0;

    public GameState(int width, int height, int numPlayers, long seed) {
        this.width = width;
        this.height = height;
        this.cellCount = width * height;
        this.numPlayers = numPlayers;
        this.rng = new Rng(seed);

        this.owner = new int[cellCount];
        this.terrain = new Terrain[cellCount];
        java.util.Arrays.fill(owner, NEUTRAL);
        java.util.Arrays.fill(terrain, Terrain.PLAIN);

        this.army = new double[numPlayers];
        this.momentum = new double[numPlayers];
        this.capitalCell = new int[numPlayers];
        java.util.Arrays.fill(momentum, 1.0);
        java.util.Arrays.fill(capitalCell, -1);

        this.land = new int[numPlayers];
        this.border = new int[numPlayers];
        this.alive = new boolean[numPlayers];

        this.rel = new byte[numPlayers][numPlayers];
        this.relUntil = new int[numPlayers][numPlayers];
        this.offer = new boolean[numPlayers][numPlayers];

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
        for (int c = 0; c < cellCount; c++) {
            int o = owner[c];
            if (o == NEUTRAL) continue;
            land[o]++;
            for (int nb : neighbours[c]) {
                if (owner[nb] != o) { border[o]++; break; }
            }
        }
        for (int p = 0; p < numPlayers; p++) alive[p] = land[p] > 0;
    }

    public double density(int p)        { return army[p] / Math.max(1, land[p]); }
    public double defensePerCell(int p)  { return army[p] / Math.max(1, border[p]); }
    public boolean ownsCapital(int p)    { return capitalCell[p] >= 0 && owner[capitalCell[p]] == p; }

    /** True if a and b are allied or in an active (unexpired) peace — they cannot attack each other. */
    public boolean areFriendly(int a, int b) {
        byte r = rel[a][b];
        return r == 2 || (r == 1 && tick < relUntil[a][b]);
    }
}
