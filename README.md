# Territorial

A real‑time **"One Pool"** conquest game (inspired by territorial.io): your one army is both your
sword and your shield. Grab neutral land during an opening peace, then attack, ally, and betray your
way to be the **last one standing** — against smart bots and other players.

- **Server** — Java 21 / Spring Boot. A pure, deterministic simulation on an authoritative
  tick loop; serves the REST API, the game WebSocket, **and** the web client on one port.
- **Client** — Expo (SDK 56) / React Native 0.85. Web build (Canvas2D) + native Android app (Skia).

## Quick start (local)

```bash
# 1) build the web client
cd client && npx expo export -p web

# 2) run the server (persistent local DB, serves the web build)
cd .. && ./run-server.sh

# 3) open http://localhost:8080  → Create account → Play
```

## Docs

| | |
|---|---|
| **[GUIDE.md](GUIDE.md)** | Full build & run guide — dev, **offline / air‑gapped**, **Android APK**, config, tuning, troubleshooting |
| [DEPLOY.md](DEPLOY.md) | Production hosting: Docker + Postgres + Caddy (automatic HTTPS) |
| [server/README.md](server/README.md) | Server design, the sim, WebSocket protocol |
| [client/README.md](client/README.md) | Client architecture (web/native renderers) |

## Build the mobile app

```bash
export ANDROID_HOME=$HOME/android-sdk JAVA17_HOME=/path/to/jdk17
./build-apk.sh          # -> territorial-v1.0.0-arm64.apk  (see GUIDE.md §6)
```

Requires the Android SDK + NDK 27.1.12297006 and a local **JDK 17** for the Gradle toolchain — the
guide explains the one‑time setup and the Gradle‑9/Foojay workaround.
