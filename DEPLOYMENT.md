# Production deployment

The application is deployed as two Docker Compose services: the Next.js API/application and PostgreSQL 16. Database data is stored in the `postgres_data` Docker volume.

## First deployment

1. Install Docker Engine with the Docker Compose plugin on the target host.
2. Copy `.env.example` to `.env` on the host and replace both password values with long, unique secrets. `ADMIN_PASSWORD` must be at least 12 characters.
3. Run `docker compose --env-file .env up -d --build`.
4. Confirm startup with `docker compose logs -f app`. The application automatically applies the tracked Prisma migrations and creates or updates the configured administrator account.

The app listens on `APP_PORT` (default `3000`). Put a TLS reverse proxy such as Nginx or Caddy in front of it before exposing it publicly.

## Gitee workflow

The checked-in workflow uses Node 20 to validate and package the release, then deploys it to `~/gitee_go/deploy/lol-champion` using Docker Compose. Before the first manual workflow run, create the production `.env` in that target directory. It is deliberately not included in the artifact.

## Database operations

- `npm run db:migrate` creates a development migration after a schema change.
- `npm run db:deploy` applies committed migrations without creating a new one.
- `npm run db:seed` creates or updates the configured administrator.

Back up the `postgres_data` Docker volume before destructive database operations. The first migration creates users, player profiles, matches, and match registrations; it contains no legacy data import.
