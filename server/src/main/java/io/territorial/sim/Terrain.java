package io.territorial.sim;

/** Terrain types. defMult raises the cost to capture a cell; incomeMult is reserved for cities. */
public enum Terrain {
    PLAIN   (1.00, 1.00),
    FOREST  (1.25, 1.00),
    MOUNTAIN(1.60, 1.00),
    CITY    (1.00, 1.20),
    RIVER   (1.35, 1.00),
    WATER   (1.00, 0.00);   // unownable ocean; splits the map, crossable only by amphibious assault

    public final double defMult;
    public final double incomeMult;

    Terrain(double defMult, double incomeMult) {
        this.defMult = defMult;
        this.incomeMult = incomeMult;
    }
}
