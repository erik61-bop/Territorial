package io.territorial.sim;

/** Deterministic seeded PRNG (SplitMix64). The ONLY source of randomness in the sim. */
public final class Rng {
    private long state;

    public Rng(long seed) { this.state = seed; }

    public long nextLong() {
        long z = (state += 0x9E3779B97F4A7C15L);
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }

    /** Uniform double in [0, 1). */
    public double nextDouble() {
        return (nextLong() >>> 11) * 0x1.0p-53;
    }

    /** Uniform int in [0, bound). */
    public int nextInt(int bound) {
        if (bound <= 0) return 0;
        return (int) Math.floorMod(nextLong(), bound);
    }
}
