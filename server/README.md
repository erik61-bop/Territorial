# Territorial — Server (Java)

Authoritative game simulation for the "One Pool" model. See
[`../shared/game-algorithm.md`](../shared/game-algorithm.md) for the design.

## Status

**Step 1 complete:** the pure, deterministic simulation + a bot-vs-bot balance proof.
**Step 2 complete:** a Spring Boot WebSocket server that wraps `sim/` unchanged — one
authoritative match on a fixed-tick loop, bots filling empty slots, live JSON snapshots.

## Layout

```
src/main/java/io/territorial/
  sim/                     PURE engine (no Spring) — see step 1
    Config, Terrain, Rng, Action, GameState, GameFactory, Sim, Bot
    GameRunner, BalanceMain    headless runner + balance proof
  Application.java         Spring Boot entry point
  room/GameRoom.java       authoritative tick loop, slot mgmt, snapshot broadcast
  net/GameHandler.java     WebSocket handler  (/ws/game)
  net/WebSocketConfig.java handler registration
  api/HealthController.java GET /api/health
```

## Run the balance proof (no deps, javac only)

```bash
../run-balance.sh
```
Expected: small starters win ~26%, biggest ~74%, decisive games, fully deterministic.

## Run (single port — recommended)

The server also serves the exported web client (from `../client/dist`), so players use ONE port and
the game WebSocket is same-origin (no second port to forward, no CORS, no Metro hot-reload sockets):

```bash
cd ../client && npx expo export --platform web   # build the web client -> client/dist
cd ../server && mvn spring-boot:run              # serves app + API + WS on :8080
# open http://localhost:8080
```

`WebConfig` serves `client/dist` at `/` (override the dir with `--territorial.webDir=file:/path/`).
`/api/*` and `/ws/game` take precedence over the static handler.

For live client development with hot-reload instead, run `npm run web` in `client/` (separate port);
then both 8080 (server) and the Expo port must be reachable.

WebSocket endpoint: `ws://localhost:8080/ws/game`

Protocol:
- server -> client: `{"type":"welcome","playerId":N}`, then `{"type":"map","width","height","terrain":[...],"capitals":[...]}`, then `{"type":"state","tick","owner":[...],"army":[...],"land":[...],"alive":[...],"winner"}` every tick (~8/s).
- client -> server: `{"type":"action","targetOwner":N,"fraction":0.5}` (targetOwner -1 = expand into neutral). One-shot, applied next tick.

Smoke test (JDK-only WebSocket client): `cd smoketest && javac WsSmoke.java && java WsSmoke`
(server must be running). Expects welcome+map+state frames at ~8/s.

## Design invariants (do not break)

- `sim/` has **no** Spring/IO/wall-clock imports. `Sim.tick(state, actions)` is pure.
- All randomness goes through `Rng` (seeded). Same seed + same actions => identical game.
- Iterate players/cells in stable id/index order everywhere.

These are what let the same `sim/` run on the authoritative server in step 2.
