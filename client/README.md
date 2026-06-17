# Territorial — Client (Expo + Skia, web-first)

React Native (Expo) client. Renders the authoritative game from the Java server over WebSocket,
using `@shopify/react-native-skia` for the board (one pixel per cell, scaled up — like the real
Territorial.io). Web-first; the same code targets iOS/Android later.

## Status — step 3 complete

Verified end-to-end in a headless browser against the live server: connects, takes a player slot,
receives the map + live state snapshots (~8/s), and the Skia canvas renders the board.

## Layout

```
App.tsx                  platform gate; on web, loads Skia (CanvasKit) via WithSkiaWeb
src/
  state/store.ts         zustand store (connection, playerId, map, snapshot, commit fraction)
  net/socket.ts          WebSocket client -> store; sendAction()
  render/colors.ts       player palette + terrain colours
  render/GameCanvas.tsx  Skia: board as a scaled pixel image + capital rings
  ui/Hud.tsx             identity, my stats, leaderboard, fraction buttons, win banner
  GameScreen.tsx         board + tap-to-attack + HUD
public/
  canvaskit.wasm         REQUIRED for web (see below)
```

## Run (web)

1. Start the server first (see `../server`): `cd ../server && mvn spring-boot:run` (:8080).
2. Start the client dev server:
   ```bash
   npm run web        # http://localhost:8081 (or the port Expo prints)
   ```
3. Open it in a browser. Press **Play**, then **tap an empty (light) area to choose your spawn**.
   After that, tap a country to send the selected % of your army (tap neutral land to expand;
   `targetOwner: -1` = expand). Wheel = zoom, drag = pan. If you're wiped out, tap an empty area
   to respawn.

### CanvasKit wasm (important)

Skia on web needs `canvaskit.wasm` served at the site root. We keep a copy at
`public/canvaskit.wasm` (Expo serves `public/` at `/` in dev and copies it into `dist/` on export),
loaded by `WithSkiaWeb` in `App.tsx`. If you upgrade `@shopify/react-native-skia`, refresh it:

```bash
cp node_modules/canvaskit-wasm/bin/full/canvaskit.wasm public/canvaskit.wasm
```

Without this the board stays blank and the console shows
`Expected 'application/wasm'` — the wasm 404'd.

## Run (native, later)

`npm run ios` / `npm run android`. Skia is bundled natively (no wasm step). Point `serverUrl()` in
`src/net/socket.ts` at your machine's LAN IP instead of `window.location.hostname`.

## Dev verification helpers (not shipped)

- `static-server.js` — tiny static server for an exported `dist/`.
- `verify-e2e.js` — headless-Chrome check: asserts the client connects and renders.
  Run the server + `npm run web`, then `node verify-e2e.js http://localhost:8081`.
