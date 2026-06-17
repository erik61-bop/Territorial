package io.territorial.sim;

/**
 * A player's intent for one tick: commit {@code fraction} of the army as a wave against
 * cells owned by {@code targetOwner} (use {@link GameState#NEUTRAL} to expand into empty land).
 *
 * {@code targetCell} directs the wave: if >= 0 the wave concentrates on frontier cells nearest
 * that cell (reinforcement direction); if -1 it falls back to cheapest-first (used by bots, so
 * bot-only balance is unchanged).
 */
public record Action(int attackerId, int targetOwner, double fraction, int targetCell) {
    public Action(int attackerId, int targetOwner, double fraction) {
        this(attackerId, targetOwner, fraction, -1);
    }
}
