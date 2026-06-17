# Territorial — Game Algorithm ("One Pool" model)

> **Pitch:** Your army is your sword *and* your shield — a single number. Every troop
> you send to attack is a troop not defending. So **every attack opens a window for
> someone else.** That tension is the whole game, and it is what lets small countries
> beat big ones, often and for real reasons.

This is the canonical design. The authoritative simulation lives in Java (`server/.../sim/`),
is pure/headless/deterministic, and is validated by bot-vs-bot balance tests that measure
how often a small country wins.

## The 5 rules

1. **One army pool.** Each player has a single number `army`. Income grows it; attacking
   spends it; it is also the only defense. There is no separate defense stat.
2. **Defense = concentration.** Strength per border cell = `army / borderLength`.
   A short border out-defends a long one *everywhere*. Big empires are thin.
3. **Attacks are waves that eat cells until spent.** Sent troops leave the pool
   immediately and become a wave that captures front cells cheapest-first until exhausted.
4. **Supply fades with distance.** Far from your capital, attack reach and the defense of
   your far cells both weaken. Empires are weakest at the rim.
5. **Momentum.** Win a defense -> short attack boost; lose ground fast -> brief slump.
   Decays back to 1.0, so it is never permanent. The underdog's comeback engine.

Social layer (implemented): **quick-chat** (preset messages with optional target, server-relayed
with a per-player cooldown) and **diplomacy** — mutual temporary peace (`PEACE_TICKS` ~60s) you
can request, accept, or betray. The attack resolver skips friendly pairs (`areFriendly`), so bots
honour peace too. Bots only ACCEPT peace (never initiate), so bot-only balance is unchanged.
Still to come: alliances with shared vision, and a Final War clock that strips peace and forces a
finish.

## State

```
GameState { width, height, tick, rng(seed),
            owner[cell]      (playerId | -1 neutral),
            terrain[cell],
            capitalCell[player], army[player], momentum[player],
            // derived each tick: land[player], border[player], alive[player] }
```

## Tick order (determinism depends on it)

```
recomputeDerived  -> land, border, alive
applyIncome       -> grow armies, gated by stability, capped by land
resolveAttacks    -> the wave model (actions processed by ascending playerId)
applyMomentum     -> update from this tick's captures/losses/defends
checkWin          -> last-standing or land fraction >= WIN_FRACTION
```

## Formulas

```
density(p)        = army[p] / max(1, land[p])
stability(p)      = clamp(density(p) / STABILITY_TARGET, STAB_MIN, 1.0)
income(p)         = land[p] * INCOME_RATE * stability(p) * (ownsCapital ? CAPITAL_INCOME : 1)
army[p]           = min(army[p] + income(p), land[p] * ARMY_CAP_PER_LAND)

defensePerCell(p) = army[p] / max(1, border[p])
supplyMult(c, p)  = clamp(1 - dist(c, capitalCell[p]) * SUPPLY_FALLOFF, SUPPLY_MIN, 1)

attack X -> target T (T may be neutral), fraction f:
  sent  = army[X] * f ;  army[X] -= sent
  wave  = sent * momentum[X]
  baseDef = (T == neutral) ? NEUTRAL_COST : defensePerCell(T)
  frontier = cells owned by T adjacent to a cell owned by X, sorted cheapest-first by:
      cost(c) = baseDef * terrain(c).defMult * supplyMult(c, T) * (isCapital ? CAPITAL_DEF : 1)
  for c in frontier while wave > 0:
      if wave >= cost(c): capture c for X; wave -= cost(c)
                          if T != neutral: army[T] -= GARRISON_KILL * baseDef
      else: break
  army[X] += wave * REFLUX            // small refund of unused wave
```

## Why small beats big (all emergent from the 5 rules)

Counterpunch (1+2) · Fortress (2+terrain) · Turtle-to-Tyrant (5) · Rim Raid (4+2) ·
Capital Snipe (3+capital) · Gang-Up (2+chat) · Pinata/overexpansion (2) ·
Patience Play (1+cap) · Betrayal (diplomacy) · Pincer Bait (1+4).

## Constants (tuned values, all in Config.java)

These are the values the balance harness validated (see "Balance result" below).

```
INCOME_RATE=0.06  LAND_INCOME_EXP=1.0  ARMY_CAP_PER_LAND=9  STABILITY_TARGET=6  STAB_MIN=0.30
NEUTRAL_COST=3.5  GARRISON_KILL=1.5  REFLUX=0.25  PENETRATION_PENALTY=0.10
SUPPLY_FALLOFF=0.02  SUPPLY_MIN=0.50
terrain.defMult: PLAIN 1.0  FOREST 1.25  MOUNTAIN 1.6  CITY 1.0  RIVER 1.35
CAPITAL_DEF=1.8   CAPITAL_INCOME=1.15
MOMENTUM: MIN 0.6  MAX 1.5  DECAY 0.05  WIN 0.02  LOSS 0.03  DEFEND 0.06
START_ARMY_PER_LAND=3.0  WIN_FRACTION=0.65  TICK_RATE=8/s
PEACE_TICKS=480  PEACE_PHASE_TICKS=120  FINAL_WAR_TICK=1200
```

## Phases (implemented)

A match runs PEACE → WAR → FINAL_WAR by tick count:
- **PEACE** (first `PEACE_PHASE_TICKS`): no PvP — players may only expand into neutral land.
  This opening land-grab is a big equaliser (see balance note).
- **WAR**: normal play; peace/alliance treaties are honoured.
- **FINAL_WAR** (from `FINAL_WAR_TICK`): all treaties are void — everyone can attack everyone,
  forcing a decisive finish. Bots only expand during PEACE.

Two combat refinements that proved essential for fun + fairness:
- **Penetration penalty** — each cell a single wave eats costs `×(1 + n·0.10)` more than the
  last, so you can chip a border but never blitz a whole nation in one tick. Forces sustained
  pressure, which is what gives third parties (and the victim's income) time to matter.
- **Garrison drain** — each captured cell drains the defender's shared pool, so a beaten player
  keeps weakening. This makes games resolve decisively instead of freezing into a stalemate.

## Bots (validation AI)

The 5-rule bot also models the social reality that makes small-beats-big real: **gang up on a
runaway leader.** Once one player passes ~30% of the map, neighbours probabilistically pile onto
it — and because defence is one shared pool (rule 1), being hit from many sides at once drains
that pool fast. This coalition behaviour is what keeps the biggest starter from dominating.

## Balance result (300 games, 8 players: 2 big start + 6 small, sizes shuffled)

```
With phases (current): small starters 56.0% · biggest 44.0% · avg 449 ticks · draws 0
  (the PEACE opening land-grab is a strong equaliser; per-capita a big start is still ~2x favoured)
Without the phase opening (earlier): small 25.7% · biggest 74.3% · avg 649 ticks
Fully deterministic; bot-only games carry no diplomacy/phase-PvP differences beyond the opening.
```

Run it: `./run-balance.sh` (or see server/README.md).
