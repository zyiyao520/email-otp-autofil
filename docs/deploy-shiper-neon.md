# Deploy the Agent to Shiper with Neon

## Architecture

- Shiper runs `agent/Dockerfile`.
- Neon PostgreSQL stores users, hashed sessions, encrypted mailbox credentials, OAuth refresh tokens, configuration, settings, and invites.
- OTP codes and verification links remain short-lived in memory.
- Local development falls back to SQLite when `DATABASE_URL` is unset.

## Shiper project settings

- Deployment method: `Dockerfile`
- Base path: `agent`
- Dockerfile: `Dockerfile`
- Health check path: `/health`

## Required variables

```env
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
OTP_AGENT_MASTER_KEY=<stable random 32-byte base64 value>
OTP_ADMIN_TOKEN=<independent random token>
OTP_AGENT_HOST=0.0.0.0
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=128
DB_POOL_MAX=3
```

`PORT` is read automatically when Shiper injects it. Otherwise the agent uses `OTP_AGENT_PORT`, then `17373`.

## Verification

```bash
curl -fsS https://YOUR-SHIPER-DOMAIN/health
curl -fsS https://YOUR-SHIPER-DOMAIN/v1/status
```

Never commit `DATABASE_URL`, `OTP_AGENT_MASTER_KEY`, or `OTP_ADMIN_TOKEN`.
