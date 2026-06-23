package io.territorial.sim;
/** Show how each terrain affects a border cell's defence. Run: java -cp out io.territorial.sim.TerrainTest */
public final class TerrainTest {
    public static void main(String[] a) {
        int W=8,H=6; GameState s=new GameState(W,H,2,1L);
        for(int y=0;y<H;y++)for(int x=0;x<W;x++) s.owner[y*W+x]=(x<4)?0:1;
        s.capitalCell[0]=0; s.capitalCell[1]=W-1; Sim sim=new Sim(s); sim.recomputeDerived();
        s.army[1]=120; sim.recomputeDerived();                 // defender: 120 army
        double base = s.baseDef(1);                            // army/border × morale × stance
        System.out.printf("Defender base (army/border × morale × stance) = %.2f/cell%n", base);
        System.out.printf("%-9s %-7s = control(2.0×t) + armyDef(base×t×supply)%n","terrain","defMult");
        for(Terrain t : new Terrain[]{Terrain.PLAIN,Terrain.FOREST,Terrain.CITY,Terrain.RIVER,Terrain.MOUNTAIN}){
            double control = Config.CONTROL_COST * t.defMult;
            double army = base * t.defMult * 1.0;              // supply 1.0 (near capital)
            System.out.printf("%-9s ×%-6.2f -> %.2f  (control %.2f + army %.2f)%n", t, t.defMult, control+army, control, army);
        }
    }
}
