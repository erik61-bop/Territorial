package io.territorial.sim;

/** All tunable game numbers in one place. The "One Pool" model. */
public final class Config {
    private Config() {}

    // Economy — income per (terrain-weighted) land, with two territorial.io-style touches on top:
    // an EARLY BOOST that makes the opening grow fast and decays to 1x, and a much higher army cap so
    // your pool keeps climbing instead of flat-lining. Linear-in-land keeps "small beats big" intact.
    public static final double INCOME_RATE        = 0.06;  // base income / tick per land unit
    public static final double LAND_INCOME_EXP     = 1.0;  // linear income in land
    // Like territorial.io: most income accrues every tick (its per-tick "interest"), plus a visible BONUS
    // pulse every INCOME_PERIOD_TICKS (its "territorial income", ~5.6s). A PURE batch stalemated wars, so
    // only (1 - INCOME_CONTINUOUS_FRAC) of income is periodic.
    public static final int    INCOME_PERIOD_TICKS  = 24;    // income-bonus pulse cadence (~3s)
    public static final double INCOME_CONTINUOUS_FRAC = 0.85; // share paid smoothly each tick; the rest pulses
    public static final double EARLY_BOOST_MAX     = 1.5;  // opening income is x this at tick 0...
    public static final int    EARLY_BOOST_TICKS   = 400;  // ...decaying linearly to x1 over ~50s (8 ticks/s)
    public static final double ARMY_CAP_PER_LAND   = 40.0; // hard cap on army (was 9) — pool climbs much longer
    public static final double STABILITY_TARGET    = 6.0;  // target army-per-land for full income
    public static final double STAB_MIN            = 0.30;
    public static final int    SETTLE_TICKS         = 40;  // ~5s before a freshly captured cell earns income

    // Combat / waves
    public static final double NEUTRAL_COST        = 2.3;  // claiming empty land is fairly cheap (fills the map)
    public static final double CONTROL_COST        = 2.0;  // floor to OCCUPY an enemy cell, even if its army
                                                           // defence is ~0 — stops a tiny wave sweeping a
                                                           // hollow giant (supply does NOT reduce this).
    public static final double NAVAL_COST_MULT     = 2.5;  // amphibious (cross-water) capture is costlier
    public static final int    NAVAL_RANGE         = 8;    // how many open-water tiles a "ship" wave can cross
    public static final double NAVAL_RANGE_PENALTY = 0.4;  // each extra sea tile crossed adds this to the cost mult
    public static final double GARRISON_KILL       = 0.5;  // defender army lost = this × the wave spent taking
                                                           // the cell (territorial.io: "attacked with x, lose
                                                           // x/2") — tied to the ATTACK, not the defender's own
                                                           // density, so a strong defender doesn't death-spiral.
    public static final double REFLUX              = 0.40; // unused/failed wave refunded (less waste)
    public static final double PENETRATION_PENALTY = 0.10; // each captured cell in a wave costs more

    // territorial.io-style combat. DEFENSE_ADVANTAGE makes a defended cell cost this much more than the
    // defender's raw per-cell strength — "defence is ~2x attack", so you must roughly double a border to
    // break it. ATTACK_COST_FRAC is a flat OCCUPATION cost per captured tile as a fraction of the
    // attacker's army (cf. territorial.io's ~1.17%/tile): conquest scales with your size and each attack
    // can only take ~ send% / this many tiles. War escalation still erodes the defence edge over time.
    public static final double DEFENSE_ADVANTAGE   = 2.0;
    public static final double ATTACK_COST_FRAC    = 0.010;

    // Supply
    public static final double SUPPLY_FALLOFF     = 0.02;
    public static final double SUPPLY_MIN         = 0.50;

    // Capital
    public static final double HOLD_DEFENSE        = 1.25; // "Hold" stance: +25% defence (you're not attacking)
    public static final double CAPITAL_DEF         = 1.8;
    public static final double CAPITAL_INCOME      = 1.15;
    public static final double CAPITAL_STRIKE_ARMY = 0.5;  // losing your capital halves your army (chaos)

    // Momentum
    public static final double MOMENTUM_MIN       = 0.60;
    public static final double MOMENTUM_MAX       = 1.50;
    public static final double MOMENTUM_DECAY     = 0.05;  // pull back toward 1.0
    public static final double MOMENTUM_WIN       = 0.0;   // capturing is its own reward; no morale
    public static final double MOMENTUM_LOSS      = 0.02;  // per lost cell (softened death-spiral)
    public static final double MOMENTUM_DEFEND    = 0.06;  // attacked but lost nothing -> turtle hardens
    public static final double MOMENTUM_HOLD      = 0.03;  // Hold stance steadily builds morale...
    public static final double HOLD_MORALE_CAP    = 1.40;  // ...up to this cap (below MOMENTUM_MAX)

    // Setup
    public static final double START_ARMY_PER_LAND = 3.0;

    // Win — pure conquest: a match ends only when one side remains (last player / alliance standing).
    // "War exhaustion": the longer the war drags, the stronger attacks get, so defences eventually
    // crumble and the war always concludes (no phases / no domination shortcut).
    public static final double WAR_ESCALATION_PER_TICK = 0.005;
    // Safety only: if a war drags this many ticks past the opening (rare pathological stalemate),
    // the largest power wins so the live server can never hang. Most games end by true conquest first.
    public static final int WAR_DEADLINE = 1400;

    /** Attack-strength multiplier that grows the longer the war has lasted (1.0 at war start). */
    public static double warEscalation(int tick) {
        return 1.0 + Math.max(0, tick - PEACE_PHASE_TICKS) * WAR_ESCALATION_PER_TICK;
    }

    // Territorial rebellion: disabled (0) — it dumped land back to neutral and prevented the
    // consolidation needed for a last-man-standing finish. War exhaustion is the anti-snowball now.
    public static final double REBEL_DENSITY      = 0.6;   // army/land below this = overextended
    public static final double REBEL_SUPPLY       = 0.66;  // only cells this far out can rebel
    public static final double REBEL_CHANCE       = 0.0;   // per qualifying border cell per tick

    // Diplomacy
    public static final int PEACE_TICKS           = 480;   // a peace lasts ~60s at 8/s
    public static final double BOT_ACCEPT_RATIO   = 0.80;  // bots accept peace unless target is much weaker

    // Phase (ticks; 8/s). PEACE opening: expand into neutral only, no PvP. Then WAR until one remains.
    public static final int PEACE_PHASE_TICKS     = 200;   // ~25s opening land-grab, no PvP

    // A human's standing order launches a wave every this many ticks (8/s) — period 2 => ~4 waves/sec.
    public static final int ATTACK_PERIOD_TICKS   = 2;
}
