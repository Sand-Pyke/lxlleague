# Production deployment

The application is deployed as two Docker Compose services: the Next.js API/application and PostgreSQL 16. Database data is stored in the `postgres_data` Docker volume.

## First deployment

1. Install Docker Engine with the Docker Compose plugin on the target host.
2. Copy `.env.example` to `.env` on the host and replace every placeholder with a long, unique secret: `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, `CAPTCHA_SECRET` and `SESSION_SECRET`. `ADMIN_PASSWORD` must be at least 12 characters. `SESSION_SECRET` should always be set to its own 32+ character random value: when it is empty the session signing key is derived from `CAPTCHA_SECRET` (and then `ADMIN_PASSWORD`), and the application logs a warning because captcha MACs are handed to anonymous visitors. Leaving it empty is backward compatible — the container still starts — but a dedicated secret is recommended.
3. Validate the production configuration with `docker compose -p lol-champion -f docker-compose.prod.yml --env-file .env config --quiet`.
4. Start it with `docker compose -p lol-champion -f docker-compose.prod.yml --env-file .env up -d --build`.
5. Confirm startup with `docker compose -p lol-champion -f docker-compose.prod.yml --env-file .env ps`. A one-shot `migrate` service applies the tracked Prisma migrations and creates or updates the configured administrator account before `app` starts.

The app listens on `APP_PORT` (default `3000`). Put a TLS reverse proxy such as Nginx or Caddy in front of it before exposing it publicly.

### Building on the server is slow or hangs

`up -d --build` compiles the Next.js app on the host with `next build`, which is CPU- and memory-intensive. On a small VPS (especially with PostgreSQL running on the same box) this can exhaust RAM: the kernel starts swapping or the OOM killer takes over, which looks like the SSH session or the whole machine freezing. This is a host-resource problem, not an application bug.

- **Preferred:** build the image in CI (or on a more powerful machine), push it to a registry, then on the server run `docker compose ... pull && docker compose ... up -d` without `--build`.
- Give the server at least 2 GB of free RAM (or add swap) if you must build in place.
- The production image now uses Next.js `output: "standalone"`, so the runtime image no longer carries `typescript`, the Prisma CLI or any other devDependencies — it is much smaller and starts faster.

Session cookies (`lxl_user_id`, `lxl_captcha`) are marked `Secure` only when the incoming request is HTTPS. The app trusts the `x-forwarded-proto` header first and falls back to the request protocol, so a reverse proxy must forward that header (Nginx: `proxy_set_header X-Forwarded-Proto $scheme;`). Because of this, accessing the app directly over plain HTTP also works, but TLS is still strongly recommended.

## Login and request hardening

- `lxl_user_id` is no longer a raw user id: it is `<userId>.<expiresAt>.<HMAC-SHA256>` signed with the auth secret and expires after 7 days. A forged or hand-edited cookie is treated as "not logged in". The session and captcha MACs use separate sub-keys derived from that secret (`HMAC(secret, "lol-champion:session"|"lol-champion:captcha")`), so a captcha token — whose MAC is returned to any anonymous caller by `GET /api/captcha` — cannot be reused as a session signature. **Changing `SESSION_SECRET`/`CAPTCHA_SECRET`/`ADMIN_PASSWORD` invalidates every existing session, so everyone (including the administrator) has to log in again** — this happens once when upgrading to the release that introduced signed cookies.
- Only `APPROVED` accounts can hold a session: removing a user's approval takes effect on their next request even if they still have a cookie.
- Account ids (login names) are ASCII-only: letters, digits and underscore, 2-24 characters. Registration, "change account id" and login all share the rule in `src/lib/credentials.ts`; Chinese characters, full-width characters and spaces are rejected. Passwords are 6-64 printable ASCII characters (no Chinese, no spaces).
- Repeated failed logins for the same account + client IP are throttled (8 failures per 10 minutes, then a 10 minute block; HTTP 429).
- `src/middleware.ts` rejects cross-site `POST`/`PUT`/`PATCH`/`DELETE` requests (HTTP 403) by validating `Sec-Fetch-Site`, then `Origin`/`Referer` against the request host, and adds `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and (over HTTPS) `Strict-Transport-Security` to every response. The reverse proxy must forward the original `Host` header (Nginx default) and, behind another proxy, `X-Forwarded-Host`, otherwise the origin check would reject legitimate form submissions. Plain `curl`/script clients that send no `Origin`, `Referer` or `Sec-Fetch-Site` header are unaffected.
- `POST /api/logout` is the only logout method. `GET /api/logout` is no longer routed, because a cross-site top-level GET navigation would carry the `SameSite=Lax` session cookie and would let any third-party page silently log a user out.

## Uploaded files

Avatars and custom backgrounds are written to `UPLOAD_DIR`, which is bind-mounted into the container at `/app/data/uploads` (`UPLOAD_DIR` in `.env` sets the host directory, default `./data/uploads` relative to the deployment directory). Do not point it inside `public/`: the standalone server (`node server.js`) only scans the public folder once at startup, so files created while the server is running would not be served in production and an avatar would stay missing until the next restart.

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
