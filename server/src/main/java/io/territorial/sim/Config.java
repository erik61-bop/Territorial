package io.territorial.sim;

/** All tunable game numbers in one place. The "One Pool" model. */
public final class Config {
    private Config() {}

    // Economy
    public static final double INCOME_RATE       = 0.06;
    public static final double LAND_INCOME_EXP    = 1.0;   // linear income in land
    public static final double ARMY_CAP_PER_LAND  = 9.0;
    public static final double STABILITY_TARGET   = 6.0;   // target army-per-land for full income
    public static final double STAB_MIN           = 0.30;

    // Combat / waves
    public static final double NEUTRAL_COST        = 3.5;  // flat cost to eat a neutral cell
    public static final double GARRISON_KILL       = 1.5;  // defender army drained per captured cell
    public static final double REFLUX              = 0.25; // fraction of unused wave refunded
    public static final double PENETRATION_PENALTY = 0.10; // each captured cell in a wave costs more

    // Supply
    public static final double SUPPLY_FALLOFF     = 0.02;
    public static final double SUPPLY_MIN         = 0.50;

    // Capital
    public static final double CAPITAL_DEF        = 1.8;
    public static final double CAPITAL_INCOME     = 1.15;

    // Momentum
    public static final double MOMENTUM_MIN       = 0.60;
    public static final double MOMENTUM_MAX       = 1.50;
    public static final double MOMENTUM_DECAY     = 0.05;  // pull back toward 1.0
    public static final double MOMENTUM_WIN       = 0.0;   // capturing is its own reward; no morale
    public static final double MOMENTUM_LOSS      = 0.03;  // per lost cell
    public static final double MOMENTUM_DEFEND    = 0.06;  // attacked but lost nothing -> turtle hardens

    // Setup
    public static final double START_ARMY_PER_LAND = 3.0;

    // Win
    public static final double WIN_FRACTION       = 0.65;

    // Diplomacy
    public static final int PEACE_TICKS           = 480;   // a peace lasts ~60s at 8/s
    public static final double BOT_ACCEPT_RATIO   = 0.80;  // bots accept peace unless target is much weaker

    // Phases (ticks; 8/s). PEACE opening: expand into neutral only, no PvP. FINAL_WAR: peace void.
    public static final int PEACE_PHASE_TICKS     = 120;   // ~15s opening land-grab, no PvP
    public static final int FINAL_WAR_TICK        = 1200;  // ~150s in, all peace stripped -> forced finish
}
