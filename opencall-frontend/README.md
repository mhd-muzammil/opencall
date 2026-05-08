# Open Call Frontend

Standalone frontend repo for the Open Call daily call plan application.

## Structure

```text
frontend/          Next.js app
shared/            Local shared constants and TypeScript types used by the UI
Dockerfile         Production web image
docker-compose.yml Optional standalone web deployment
```

## Local Development

```bash
pnpm install
copy frontend\.env.example frontend\.env.local
pnpm dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the backend API origin, for example:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

For the hosted backend, use:

```bash
NEXT_PUBLIC_API_BASE_URL=https://open.bazhilgroups.in
```

## Environment Files

```text
.env.example                  Docker Compose defaults for local deploys
.env.production.example       Docker Compose template for production deploys
frontend/.env.example         Next.js local development template
frontend/.env.production.example Production Next.js template
```

Do not commit `.env`, `.env.local`, or `.env.production.local`. `NEXT_PUBLIC_API_BASE_URL` is a public browser value and is baked into the Next.js build, so set it to the final public API URL before building the production image.

## Docker Deploy

```bash
copy .env.production.example .env
# edit .env and set NEXT_PUBLIC_API_BASE_URL
docker compose up -d --build
```

## Vercel Deploy

Use `opencall-frontend` as the Vercel project root so the `shared` workspace package is available during the build. The included `vercel.json` builds `@opencall/shared` first, then `@opencall/web`.

Set this environment variable for Production, Preview, and Development:

```bash
NEXT_PUBLIC_API_BASE_URL=https://open.bazhilgroups.in
```

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```
