package io.territorial.sim;

/** Terrain types. defMult raises the cost to capture a cell; incomeMult is reserved for cities. */
public enum Terrain {
    //        defMult  incomeMult   — defensive terrain trades economy for protection
    PLAIN   (1.00, 1.00),   // balanced baseline
    FOREST  (1.25, 0.90),   // +25% defence, slightly poorer
    MOUNTAIN(1.60, 0.60),   // +60% defence, but barren — great to hold, poor to farm
    CITY    (1.30, 1.20),   // fortified AND richer — the prize holding
    RIVER   (1.35, 0.85),   // +35% defence (natural moat), modest economy
    WATER   (1.00, 0.00);   // unownable ocean; splits the map, crossable only by amphibious assault

    public final double defMult;
    public final double incomeMult;

    Terrain(double defMult, double incomeMult) {
        this.defMult = defMult;
        this.incomeMult = incomeMult;
    }
}
