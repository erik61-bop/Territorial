package io.territorial.sim;
import java.util.List;
/** The user's bug: can a tiny army sweep a hollow giant? Run: java -cp out io.territorial.sim.FloorTest */
public final class FloorTest {
    public static void main(String[] a) {
        System.out.println("Hollow giant: army 21 over a wide border. Attacker sends ALL of N army (early war).");
        for (int atk : new int[]{1, 3, 5, 10, 50, 200}) run(atk);
    }
    static void run(int atkArmy) {
        int W=70,H=10; GameState s=new GameState(W,H,2,5L);
        for(int y=0;y<H;y++)for(int x=0;x<W;x++) s.owner[y*W+x]=(x<3)?0:1;   // attacker left 3 cols, defender huge
        s.capitalCell[0]=0; s.capitalCell[1]=W-1; s.tick=210;                // just into war (esc~1.05)
        Sim sim=new Sim(s); sim.recomputeDerived();
        s.army[0]=atkArmy; s.army[1]=21;                                     // hollow giant: 21 army, ~big border
        sim.recomputeDerived();
        int dl0=count(s,1); double weak=s.defWeak[1];
        sim.tick(List.of(new Action(0,1,1.0,-1)));                          // all-in
        sim.recomputeDerived();
        int took=dl0-count(s,1);
        System.out.printf("  attacker %3d army  vs giant(land %d, border %d, weak %.2f/cell) -> captured %d cells%n",
                atkArmy, dl0, s.border[1], weak, took);
    }
    static int count(GameState s,int p){int n=0;for(int c=0;c<s.cellCount;c++)if(s.owner[c]==p)n++;return n;}
}
