# Open Call Backend

Standalone backend repo for the Open Call daily call plan API, database migrations, and production infrastructure.

## Structure

```text
backend/           Express API
shared/            Local shared constants and TypeScript types used by the API
infra/postgres/    Init scripts, raw SQL migrations, and seeds
infra/caddy/       Optional API reverse proxy config
scripts/           Migration helper scripts
docs/              Operations notes
Dockerfile         Production API image
docker-compose.yml API + Postgres deployment
```

## Local Development

```bash
pnpm install
copy backend\.env.example backend\.env
pnpm dev
```

Required runtime environment lives in `backend/src/config/env.ts`. Do not commit `.env` files.

## Environment Files

```text
.env.example                  Docker Compose defaults for API + Postgres
.env.production.example       Docker Compose template for production deploys
backend/.env.example          Local API development template
backend/.env.production.example Production API process template
```

Use unique 32+ character values for `JWT_ACCESS_SECRET`, `ADMIN_COOKIE_SECRET`, and `ADMIN_SESSION_SECRET` in production. `CORS_ORIGIN` must be the public frontend origin, for example `https://opencall.example.com`; comma-separate multiple origins only when needed.

## Docker Deploy

```bash
copy .env.production.example .env
# edit .env and replace every placeholder secret/domain
docker compose up -d --build
```

For API TLS/reverse proxy:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
```

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Frontend Integration

Point the separate frontend repo at this API with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```
