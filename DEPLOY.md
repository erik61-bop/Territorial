# Deploying Territorial

The whole stack runs from one `docker compose` command: **Postgres + the game server + Caddy**
(automatic HTTPS). The server serves the web client and the game WebSocket on the same origin, so
players only need the one domain.

## Prerequisites
- A Linux host (any small VM) with Docker + Docker Compose.
- A domain name pointed at the host's public IP (an `A` record), e.g. `play.example.com`.
- Ports **80** and **443** open (Caddy needs 80 to obtain the TLS certificate).

## 1. Configure secrets
Create a `.env` file next to `docker-compose.prod.yml`:

```env
DOMAIN=play.example.com
JWT_SECRET=<a long random string, >= 32 chars>     # e.g. openssl rand -base64 48
DB_PASSWORD=<a strong database password>
```

These are injected as environment variables — **nothing secret is baked into the image or git.**

## 2. Launch
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
- Builds the client (Expo web export) and server (Spring Boot jar) into one image.
- Caddy fetches a Let's Encrypt certificate for `$DOMAIN` and proxies `https://$DOMAIN` and
  `wss://$DOMAIN/ws/game` to the app.
- The DB schema is created automatically on first boot.

Visit `https://play.example.com` — sign up and play.

## 3. Operate
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`
- **Health:** `https://$DOMAIN/actuator/health` (also used as a container/LB probe).
- **Update:** `git pull && docker compose -f docker-compose.prod.yml up -d --build` (graceful shutdown
  drains in-flight requests before restart).
- **Backups:** the Postgres volume `pgdata` holds all accounts/wallets/ledger — back it up
  (`docker compose -f docker-compose.prod.yml exec db pg_dump -U territorial territorial > backup.sql`).

## Configuration reference (env vars)
| Var | Default | Purpose |
|-----|---------|---------|
| `DOMAIN` | — | Public hostname (Caddy TLS) |
| `JWT_SECRET` | dev-only | HMAC key for auth tokens — **must** be set in prod |
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | localhost/territorial | Postgres connection |
| `PORT` | 8080 | App port (internal) |
| `JWT_TTL_HOURS` | 168 | Login session length |

## Hardening checklist (recommended before real traffic)
- [ ] Replace `ddl-auto=update` with Flyway migrations (versioned, reviewable schema changes).
- [ ] Lock WebSocket `setAllowedOrigins` to your domain (currently `*` for dev).
- [ ] Put the app behind a CDN and add metrics scraping (Prometheus via actuator).
- [ ] **Real money** (gambling): a payment provider + KYC/AML + per-jurisdiction licensing are
      required before enabling deposits/withdrawals. The coin ledger is money-ready, but payments
      are intentionally not wired.
