package io.territorial.sim;

/** A diplomacy order. Peace is mutual and temporary; it can be requested, accepted, or broken. */
public record Diplo(int from, int to, Kind kind) {
    public enum Kind {
        REQUEST_PEACE, ACCEPT_PEACE, BREAK_PEACE,
        REQUEST_ALLY, ACCEPT_ALLY, BREAK_ALLY,
    }
}
