# Production deployment

The application is deployed as two Docker Compose services: the Next.js API/application and PostgreSQL 16. Database data is stored in the `postgres_data` Docker volume.

## First deployment

1. Install Docker Engine with the Docker Compose plugin on the target host.
2. Copy `.env.example` to `.env` on the host and replace both password values with long, unique secrets. `ADMIN_PASSWORD` must be at least 12 characters.
3. Validate the production configuration with `docker compose -p lol-champion -f docker-compose.prod.yml --env-file .env config --quiet`.
4. Start it with `docker compose -p lol-champion -f docker-compose.prod.yml --env-file .env up -d --build`.
5. Confirm startup with `docker compose -p lol-champion -f docker-compose.prod.yml --env-file .env ps`. The application automatically applies the tracked Prisma migrations and creates or updates the configured administrator account.

The app listens on `APP_PORT` (default `3000`). Put a TLS reverse proxy such as Nginx or Caddy in front of it before exposing it publicly.

Session cookies (`lxl_user_id`, `lxl_captcha`) are marked `Secure` only when the incoming request is HTTPS. The app trusts the `x-forwarded-proto` header first and falls back to the request protocol, so a reverse proxy must forward that header (Nginx: `proxy_set_header X-Forwarded-Proto $scheme;`). Because of this, accessing the app directly over plain HTTP also works, but TLS is still strongly recommended.

## Uploaded files

Avatars and custom backgrounds are written to `UPLOAD_DIR`, which is bind-mounted into the container at `/app/data/uploads` (`UPLOAD_DIR` in `.env` sets the host directory, default `./data/uploads` relative to the deployment directory). Do not point it inside `public/`: `next start` only scans the public folder once at startup, so files created while the server is running would not be served in production and an avatar would stay missing until the next restart.

The app serves these files itself through `/assets/avatars/*` and `/assets/user-bg/*`, so an upload shows up immediately. Uploads live outside the image, so they survive `compose up -d --build`, but they are not part of the pipeline's SQL backup: back up that host directory together with the database dumps.

## Gitee workflow

The checked-in Gitee Go workflow uses Node 20 to generate Prisma Client, type-check, build and package the release. The deployment agent then validates the production Compose file, starts PostgreSQL, creates a pre-deployment SQL backup, builds the application image and waits for `/api/health` to confirm both the application and database are available.

Before the first manual workflow run:

1. Select the ECS deployment host group for the `deploy@agent` step in Gitee Go. This fills `hostGroupID`.
2. Create `~/gitee_go/deploy/lol-champion/.env` on the server from `.env.example`, replace every placeholder and run `chmod 600 .env`.
3. Make sure the deployment user can run `docker compose` without an interactive password prompt.
4. Open `APP_PORT` only to the reverse proxy or trusted clients. PostgreSQL is not published by `docker-compose.prod.yml`.

The `.env` file is deliberately excluded from the build artifact. Automatic SQL backups are stored outside the artifact directory at `~/gitee_go/backups/lol-champion`. Uploaded images are not covered by that backup: the SQL dumps reference files under `UPLOAD_DIR`, so keep a copy of that directory as well.

## Database operations

- `npm run db:migrate` creates a development migration after a schema change.
- `npm run db:deploy` applies committed migrations without creating a new one.
- `npm run db:seed` creates or updates the configured administrator.

The pipeline creates a `pg_dump` backup before every application rollout. Keep separate off-server backups as well. The migrations create the new project's schema only; they contain no legacy data import and do not touch the old project.
