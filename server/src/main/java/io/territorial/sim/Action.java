package io.territorial.sim;

/**
 * A player's intent for one tick: commit {@code fraction} of the army as a wave against
 * cells owned by {@code targetOwner} (use {@link GameState#NEUTRAL} to expand into empty land).
 */
public record Action(int attackerId, int targetOwner, double fraction) {}
