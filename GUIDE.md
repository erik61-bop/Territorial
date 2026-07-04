# Territorial — Build & Run Guide

A complete guide to running, developing, and building **Territorial** — including on an
**offline / air‑gapped machine**. For production hosting (Docker + HTTPS) see
[`DEPLOY.md`](DEPLOY.md); for design/protocol details see [`server/README.md`](server/README.md)
and [`client/README.md`](client/README.md).

---

## 1. What it is

Territorial is a real‑time "One Pool" conquest game (inspired by territorial.io).

```
┌──────────────────────────┐        WebSocket  ws://host:8080/ws/game
│  Client (Expo / RN)      │  ───────────────────────────────────────►  ┌─────────────────────┐
│  • web  → Canvas2D       │        REST       http://host:8080/api/*     │  Server (Java 21)   │
│  • native (APK) → Skia   │  ◄───────────────────────────────────────  │  Spring Boot        │
└──────────────────────────┘        JSON snapshots (~8 ticks/s)          │  authoritative sim  │
                                                                          └─────────────────────┘
```

- **Server** (`server/`) — Spring Boot; a pure, deterministic simulation (`io.territorial.sim`)
  wrapped by an authoritative tick loop. Serves the **REST API**, the **game WebSocket**, **and the
  exported web client** — all on one port (`8080`). DB: **Postgres** in production, **H2** for
  local/offline.
- **Client** (`client/`) — Expo (SDK 56) / React Native 0.85. The **web** build (Canvas2D) is what
  the server serves; the **native Android APK** (Skia) is the mobile app.

Single‑origin by design: the client talks to `/ws/game` and `/api/*` on the **same host** that
served the page, so one port is all you need.

---

## 2. Toolchain (exact versions)

| Tool | Version | Used for |
|---|---|---|
| **JDK 21** | Temurin 21 | Running/building the **server** |
| **JDK 17** | Temurin 17 | The **Android Gradle** Java toolchain (see §6 — required, do not skip) |
| **Node.js** | 20.x | The **client** (Expo/Metro, web export) |
| **Maven** | 3.9+ | Server build |
| **Android SDK** | platform 36, build‑tools 36, platform‑tools | APK build |
| **Android NDK** | **27.1.12297006** | Skia native code (exact version required) |
| **CMake** | 3.22.1 | NDK build |
| **Gradle** | 9.3.1 (via the wrapper) | APK build |

Expo SDK **56**, React Native **0.85**, react‑native‑skia 2.6, react‑native‑safe‑area‑context 5.7.

> **Why two JDKs?** The server targets Java 21. The Android project pins `jvmToolchain(17)`, and
> the Gradle 9.3.1 wrapper it ships crashes if it tries to *auto‑download* JDK 17 (the Foojay
> resolver references `JvmVendorSpec.IBM_SEMERU`, which Gradle 9 removed). The fix is to **run
> Gradle on a locally‑installed JDK 17** — see §6.

---

## 3. Offline strategy (read this first if air‑gapped)

Nothing here needs the internet **at run time** once the caches are warm. The trick is a one‑time
**"warm the caches while online"** step, then run/build with the offline flags.

**While you still have a network**, from the repo root:

```bash
# 1) Server deps -> ~/.m2
( cd server && mvn -q -B dependency:go-offline )

# 2) Client deps -> client/node_modules   (commit node_modules or ship it with the repo if truly air-gapped)
( cd client && npm ci )

# 3) Web bundle (also verifies the client deps resolve offline afterwards)
( cd client && npx expo export -p web )

# 4) (APK only) Android SDK + a first Gradle build to fill ~/.gradle
#    -> see §6; run one online `./gradlew assembleRelease` so all plugins/deps get cached.
```

Then, **offline**, use:
- Server: `mvn -o spring-boot:run …` (the `-o` = offline) — or better, build a jar once and run
  `java -jar` (no Maven needed at all, see §4.2).
- Client web export: `EXPO_NO_TELEMETRY=1 CI=1 npx expo export -p web` (telemetry off so it never
  reaches out).
- APK: `./gradlew … --offline`.

Ship these to the air‑gapped box: the repo, `~/.m2/repository`, `client/node_modules`,
`~/.gradle` (caches + wrapper dists), and `~/android-sdk` (with the NDK/CMake from §6), plus the two
JDKs and Node.

---

## 4. Run the server

The server runs on **`:8080`** (override with `PORT`). It serves the web client from
`--territorial.webDir` (default `file:../client/dist/`), so **export the web bundle first** (§5.1).

### 4.1 Quick start (dev, persistent local DB — recommended)

Use **file‑based H2** so your account/coins **survive restarts** (in‑memory H2 wipes on every
restart — that's the cause of the "403 on /api/me after restart" symptom, see §9). The included
script does exactly this:

```bash
./run-server.sh            # file H2 at server/data/, serves client/dist, http://localhost:8080
```

Equivalent manual command:

```bash
cd server
JAVA_HOME=/path/to/jdk21 mvn -q spring-boot:run -Dspring-boot.run.arguments="\
  --spring.datasource.url=jdbc:h2:file:./data/territorial;MODE=PostgreSQL;DB_CLOSE_DELAY=-1 \
  --spring.datasource.driver-class-name=org.h2.Driver \
  --spring.datasource.username=sa --spring.datasource.password= \
  --spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
```

Use `jdbc:h2:mem:territorial;…` instead of `h2:file:` if you *want* a throwaway DB each run.

### 4.2 Offline / no‑Maven (build a jar once, then just `java`)

```bash
cd server && mvn -q -B -DskipTests package        # -> target/*.jar   (do this while online)
# then, anywhere/offline:
JAVA_HOME=/path/to/jdk21 java -jar target/*.jar \
  --spring.datasource.url=jdbc:h2:file:./data/territorial;MODE=PostgreSQL;DB_CLOSE_DELAY=-1 \
  --spring.datasource.driver-class-name=org.h2.Driver \
  --spring.datasource.username=sa --spring.datasource.password= \
  --territorial.webDir=file:/absolute/path/to/client/dist/
```

Health check: `curl http://localhost:8080/actuator/health` → `{"status":"UP"}`.

### 4.3 Production (Postgres)

Leave the datasource args off and provide env vars (`DB_URL`, `DB_USER`, `DB_PASSWORD`,
`JWT_SECRET`, `PORT`). See [`DEPLOY.md`](DEPLOY.md) for the full Docker + Caddy stack.

---

## 5. Run the client

### 5.1 Web (what the server serves — the normal path)

```bash
cd client
EXPO_NO_TELEMETRY=1 npx expo export -p web      # builds client/dist/
```
Now (re)start the server (§4) and open **http://localhost:8080**. Re‑export whenever you change
client code; a fresh browser tab picks it up (the server serves the files off disk).

### 5.2 Web (live hot‑reload dev)

```bash
cd client && npm run web        # Metro dev server on :8081
```
⚠️ On web the client talks to **`/ws/game` and `/api/*` on the page's own origin**. Metro serves on
`:8081`, which has no server — so for a *playable* web build use §5.1 (served by `:8080`). Use `npm
run web` only for fast UI iteration on the menus/HUD.

### 5.3 Controls
Menu → **Play** → you're given ~12 s to **tap an empty (light) area** to place your capital (or you
are auto‑placed). Then: tap a country to attack it, tap several to attack multiple fronts (the
send‑% splits across them), tap empty land to expand. **Hold** (Space) stops & digs in.
Pan = drag, zoom = pinch / wheel, recenter = ⌖.

---

## 6. Build the Android APK

This produces a **debug‑signed, installable** APK (fine for sideloading/testing; for Google Play
you need a real release keystore — see §6.4). The convenience script wraps all the steps and the
JDK17/Foojay fix:

```bash
export ANDROID_HOME=$HOME/android-sdk        # your SDK location
export JAVA17_HOME=/path/to/jdk17            # JDK 17 for the Gradle toolchain
./build-apk.sh                               # -> territorial-v1.0.0-arm64.apk (repo root)
```

If you'd rather do it by hand, or need to set the toolchain up the first time:

### 6.1 One‑time: install the Android SDK + NDK

```bash
# command-line tools
mkdir -p $HOME/android-sdk/cmdline-tools
curl -sLo /tmp/cmdtools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q /tmp/cmdtools.zip -d /tmp/cmdtools && mv /tmp/cmdtools/cmdline-tools $HOME/android-sdk/cmdline-tools/latest
export ANDROID_HOME=$HOME/android-sdk
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
           "ndk;27.1.12297006" "cmake;3.22.1"
```

### 6.2 Generate the native project + apply the toolchain fix

```bash
cd client
npx expo prebuild -p android --no-install     # generates client/android/ (gitignored)
cat >> android/gradle.properties <<EOF
# Build targets Java 17 (RN jvmToolchain(17)); run Gradle ON a local JDK 17 so the Foojay resolver
# (incompatible with Gradle 9) is never invoked.
org.gradle.java.home=${JAVA17_HOME:-/path/to/jdk17}
org.gradle.java.installations.auto-download=false
EOF
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

> `client/android/` is **gitignored** (regenerated by `prebuild`), so these two files must be
> re‑created each time you prebuild. `build-apk.sh` does this automatically.

### 6.3 Build

```bash
cd client/android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon   # add --offline once cached
# output: app/build/outputs/apk/release/app-release.apk  (~37 MB, arm64-v8a, debug-signed)
```
`arm64-v8a` covers essentially all real phones and halves the disk/time vs a universal build
(the full build peaks near **5 GB** of disk). Drop `-PreactNativeArchitectures` for a universal APK.

### 6.4 Install & connect

```bash
adb install territorial-v1.0.0-arm64.apk
```
⚠️ **The native app talks to `ws://localhost:8080` / `http://localhost:8080`.** On a phone,
`localhost` is the *phone*, not your server. Options:
- **USB test:** `adb reverse tcp:8080 tcp:8080` bridges the phone's `localhost:8080` to your machine.
- **Real use:** point the client at your server's LAN IP / domain — edit `serverUrl()` / `httpBase()`
  in [`client/src/net/socket.ts`](client/src/net/socket.ts) (the native fallback), then rebuild.

For a **cloud** build instead (no local SDK, but needs internet + a free Expo login — *not* offline):
`npx eas-cli build -p android --profile preview` (profiles are in `client/eas.json`).

---

## 7. Configuration reference

Server properties (env var → default; set via `--flag=value`, `-Dflag`, or environment):

| Property / env | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP + WS + static port |
| `territorial.tickMs` | `125` | Sim tick (8/s) |
| `territorial.webDir` | `file:../client/dist/` | Where the web bundle is served from |
| `DB_URL` / `spring.datasource.url` | `jdbc:postgresql://localhost:5432/territorial` | JDBC URL (use `jdbc:h2:file:…` for local) |
| `DB_USER` / `DB_PASSWORD` | `territorial` | DB creds |
| `JWT_SECRET` / `territorial.jwt.secret` | *dev secret* | **Override in prod** (≥ 32 bytes) |
| `JWT_TTL_HOURS` | `168` | Token lifetime |

New accounts start with 1000 coins. Auth is email + password → JWT (in the `Authorization: Bearer`
header; no cookies).

---

## 8. Testing, balancing & tuning

All headless, no server needed (pure `sim/`):

```bash
cd server && mvn -q compile
./run-balance.sh                                   # 300 bot-vs-bot games: proves "small beats big"
java -cp target/classes io.territorial.sim.BalanceMain -Dlevel=2   # level 0 Easy / 1 Normal / 2 Hard
java -cp target/classes io.territorial.sim.CombatTest              # attack/defence scenarios
java -cp target/classes io.territorial.sim.DefenseTest             # holding under fire
./run-fuzz.sh                                      # determinism check (same seed -> same game)
```

**Key gameplay knobs** — all in [`server/.../sim/Config.java`](server/src/main/java/io/territorial/sim/Config.java):

| Knob | What it does |
|---|---|
| `INCOME_RATE`, `LAND_INCOME_EXP`, `ARMY_CAP_PER_LAND` | Economy: income per land, cap |
| `DEFENSE_ADVANTAGE` (2.0) | Defence is this × attack — raise for stickier fronts |
| `ATTACK_COST_FRAC` (0.010) | Per‑tile occupation cost as a fraction of your army |
| `WAR_ESCALATION_PER_TICK` | How fast attacks strengthen over a long war (guarantees a finish) |
| `NAVAL_COST_MULT`, `NAVAL_RANGE` | Amphibious cost / reach |
| `PEACE_PHASE_TICKS` | Opening no‑PvP land‑grab length |

After any change: `mvn compile && ./run-balance.sh` and confirm it still **PASSes** (small‑starters
win ≥ 20%, no excessive draws, wars conclude).

---

## 9. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| **`403` on `/api/me`, `/api/quests` after a server restart** | In‑memory H2 wiped your account, but the browser kept the old JWT. It **self‑heals** (the client clears the token and shows sign‑in) — just **register again**. To stop it: use **file‑based H2** (§4.1 / `run-server.sh`). |
| **Sign‑in button stays disabled** | The first field is **Email** and must look like `x@y.z`; password ≥ 6 chars. A plain name won't validate. |
| **Gradle: `JvmVendorSpec … IBM_SEMERU`** | Gradle 9 tried to download JDK 17 via Foojay. Install JDK 17 and set `org.gradle.java.home` (§6.2). |
| **`CXX1101 NDK … did not have a source.properties`** | NDK not installed / wrong version — `sdkmanager "ndk;27.1.12297006"` (§6.1). |
| **APK installs but can't connect** | It's pointing at `localhost` (the phone). `adb reverse tcp:8080 tcp:8080`, or set the host in `socket.ts` (§6.4). |
| **`Port 8080 already in use`** | `fuser -k 8080/tcp` (Linux) then restart. Or run with `PORT=8090`. |
| **Board won't pan/zoom on web** | Fixed — board gestures use pointer events with `touch-action:none`. Rebuild the web bundle. |
| **Disk fills during APK build** | The NDK/Skia build needs ~5 GB free. Build `arm64-v8a` only (§6.3) and clean `client/android/app/build` between attempts. |

---

## 10. Repo map

```
territorial/
├── server/            Java 21 / Spring Boot — sim + WS + REST + static web
│   ├── src/main/java/io/territorial/
│   │   ├── sim/        PURE deterministic engine (Config, GameState, Sim, Bot, GameFactory…)
│   │   ├── room/       GameRoom (tick loop), RoomManager (matchmaking)
│   │   ├── net/        GameHandler (WS), WebConfig (serves client/dist)
│   │   └── auth/ account/ admin/   JWT auth, accounts/coins, admin
│   └── src/main/resources/application.properties
├── client/            Expo SDK 56 / RN 0.85 — web (Canvas2D) + native (Skia)
│   ├── src/            GameScreen, state/store, net/socket, ui/*, render/*
│   ├── app.json eas.json         Android package id + EAS/APK profiles
│   └── android/        generated by `expo prebuild` (gitignored)
├── run-server.sh      dev server on :8080 with persistent file H2
├── build-apk.sh       one-shot APK build (installs nothing; expects SDK/NDK + JDK17)
├── run-balance.sh run-fuzz.sh    headless sim proofs
├── DEPLOY.md          production Docker + Caddy (HTTPS) deployment
└── GUIDE.md           (this file)
```
