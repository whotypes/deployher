[bun]: https://bun.sh/
[bun-install]: https://bun.sh/docs/installation
[docker-get]: https://docs.docker.com/get-docker/
[docker-desktop]: https://docs.docker.com/desktop/
[compose-install]: https://docs.docker.com/compose/install/
[garage]: https://garagehq.deuxfleurs.fr/
[github-oauth]: https://github.com/settings/developers

# Setup and development

Pdploy is a Bun-based deployment platform. Infra (Postgres, Redis, [garage] S3) runs in Docker. The app can run either **fully in Docker** (no Bun on host) or **on the host with hot reload** (Bun required). This doc covers both.

## Prerequisites

| Requirement | When needed | Install |
|-------------|-------------|---------|
| Docker | Always (infra and optionally app) | [Install Docker][docker-get] ([Docker Desktop][docker-desktop] includes Compose) |
| Docker Compose | Always | Bundled with Docker Desktop; on Linux see [Install Compose][compose-install] |
| Bun 1.3+ | Only for "app on host" workflow (hot reload) | [Bun installation][bun-install] |

> [!NOTE]
> You do not need Bun if you run the full stack in Docker. Use the [Full stack in Docker](#full-stack-in-docker) workflow.

> [!NOTE]
> The app Docker image includes Bun, Node.js, npm, pnpm, yarn, Python 3, pip, uv, Poetry, and `unzip` so deployment workers can build Node and Python repositories inside the container.

> [!IMPORTANT]
> 4 GB RAM is recommended for running the full stack.

## One-time bootstrap

From the repository root.

1. Copy env and edit as needed:

```bash
cp .env.example .env
```

2. Start infra and bootstrap [garage] (creates S3 bucket and key, writes `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` into `.env`):

```bash
./infra/dev.sh start
```

This starts Postgres, Redis, and Garage only. It does not start the app container.

> [!WARNING]
> Do not commit `.env`. It will contain secrets after bootstrap and OAuth setup.

3. Set auth and GitHub OAuth in `.env` (required for login and repo linking):

- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: from [GitHub OAuth Apps][github-oauth]. Create an OAuth App; set Authorization callback URL to `http://localhost:3000/api/auth/callback/github` for dev (or your app URL + `/api/auth/callback/github`).
- The app derives the auth base URL from `DEV_PROTOCOL`, `DEV_DOMAIN`, and `PORT` in development (and `PROD_*` in production). Ensure these match how you reach the app so callbacks work.
- `BETTER_AUTH_SECRET`: set for production (e.g. `openssl rand -base64 32`). Used by Better Auth for session signing. Optional in dev.
- `BETTER_AUTH_URL`: if your Better Auth setup expects it, set to your app URL (e.g. `http://localhost:3000`). The codebase builds the client URL from `DEV_*`/`PROD_*` and `PORT`.

## Workflow A: Full stack in Docker (no Bun)

Good for: CI, testing the containerized path, or running without installing [bun].

1. After [one-time bootstrap](#one-time-bootstrap), start the whole stack (infra + app):

```bash
docker compose up -d --build
```

2. App URL: `http://localhost:3000`

3. Logs:

```bash
docker compose logs -f app
```

4. Stop everything:

```bash
docker compose down
```

5. Stop only the app (keep Postgres, Redis, Garage):

```bash
docker compose stop app
```

6. Restart only the app:

```bash
docker compose up -d --build app
```

> [!NOTE]
> Inside the app container, migrations run on startup (`RUN_MIGRATIONS=1`). Services use container hostnames: `postgres`, `redis`, `garage`.

## Workflow B: Infra in Docker, app on host (hot reload)

Good for: daily development with fast feedback. Requires [bun] on the host.

1. After [one-time bootstrap](#one-time-bootstrap), run migrations and seed (if not already done):

```bash
bun run migrate
bun run seed
```

2. Start the app with hot reload:

```bash
bun run dev
```

3. App URL: `http://localhost:3000`

4. Stop the app: Ctrl+C. Infra (Postgres, Redis, Garage) keeps running.

5. Stop infra:

```bash
./infra/dev.sh stop
```

6. Full teardown (remove volumes, re-bootstrap infra):

```bash
./infra/dev.sh reset
bun run migrate
bun run seed
bun run dev
```

> [!TIP]
> For day-to-day dev, start infra once with `./infra/dev.sh start`, then run `bun run dev` whenever you work. Only run `reset` when you need a clean DB or Garage state.

## Infra script reference

All from repository root. `dc` in the script points at `docker-compose.yml` in the repo.

| Command | Description |
|---------|-------------|
| `./infra/dev.sh start` | Start Postgres, Redis, Garage; wait for healthy; ensure Garage layout/bucket/key; inject S3 vars into `.env`. Does not start the app. |
| `./infra/dev.sh stop` | Stop all compose services (garage, postgres, redis; and app if you started it with `docker compose up`). |
| `./infra/dev.sh reset` | `docker compose down -v`, clear Garage data and secrets, then run `start` again. Run migrate/seed after. |
| `./infra/dev.sh migrate` | Ensure stack is up, then run `bun migrate.ts`. |
| `./infra/dev.sh seed` | Ensure stack is up, then run `bun seed.ts`. |
| `./infra/dev.sh logs` | `docker compose logs -f`. |

> [!CAUTION]
> `./infra/dev.sh reset` destroys Postgres and Garage data. Use when you want a clean slate, not for routine restarts.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ENV` | Yes | `development` or `production` |
| `HOSTNAME` | Yes | Bind address (e.g. `0.0.0.0`) |
| `PORT` | No | Default `3000` |
| `DATABASE_URL` | Yes | Postgres connection string. Use `localhost:5432` when app runs on host; use `postgres:5432` inside app container. |
| `REDIS_URL` | Yes | Redis URL. Use `localhost:6379` on host; `redis:6379` in container. If unset or unreachable, build workers are disabled. |
| `S3_ENDPOINT` | Yes | Garage/S3 endpoint. Use `http://127.0.0.1:3900` on host; `http://garage:3900` in container. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Yes for storage | Injected by `./infra/dev.sh start` or set manually. Aliases: `AWS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. |
| `S3_REGION`, `AWS_REGION` | No | Default `garage`. |
| `BETTER_AUTH_URL` | Optional | App base URL if your Better Auth config expects it. Auth client URL is derived from `DEV_*`/`PROD_*` and `PORT`. |
| `BETTER_AUTH_SECRET` | Recommended in prod | Secret for session/signing (e.g. `openssl rand -base64 32`). |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Yes for GitHub | OAuth app credentials; callback URL must match your app URL + `/api/auth/callback/github`. |
| `DEV_DOMAIN`, `PROD_DOMAIN`, `DEV_PROTOCOL`, `PROD_PROTOCOL` | No | Used for auth callback URL and preview URLs. Defaults in `.env.example`. Subdomain previews match `Host` against `<id>.<DEV_DOMAIN>` or `<id>.<PROD_DOMAIN>`. |
| `BUILD_WORKERS` | No | Number of concurrent build workers (default `2`). Set to `0` to disable. |
| `SKIP_CLIENT_BUILD` | No | Set to `1` in Docker/prod so the app uses prebuilt client assets. |
| `RUN_MIGRATIONS` | No | Set to `1` to run migrations on app startup (default in Docker). |

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| App | 3000 | HTTP |
| Postgres | 5432 | Database |
| Redis | 6379 | Queue/cache |
| Garage | 3900 (S3 API), 3901 (RPC), 3902 (Web UI), 3903 (Admin) | Object storage |

## Health endpoint

`GET` or `POST` `/health` returns JSON with server status, uptime, memory, and domain config. With `Accept: text/html` it returns an HTML dashboard. Use the JSON response for load balancer or orchestrator health checks; the response body includes `status` (`ok` | `degraded` | `down`), `environment`, `uptimeSeconds`, and related fields.

## Preview URLs

Deployments can be viewed in two ways:

1. **Subdomain**: `https://<deploymentId>.<DEV_DOMAIN>:<PORT>` (or `.<PROD_DOMAIN>` in prod). `<deploymentId>` is the short id (e.g. `abc12def34`) or the deployment UUID. The server matches `Host` against `DEV_DOMAIN` / `PROD_DOMAIN`; ensure these match how you reach the app (e.g. `localhost` for local dev). Some browsers treat `*.localhost` specially.
2. **Path**: `/d/<deploymentId>/path` (e.g. `/d/abc12def34/` or `/d/abc12def34/assets/main.js`). Works without subdomain routing.

`/preview/<deploymentId>` redirects to the subdomain preview URL. Build logs and deployment detail pages link to the subdomain URL using `DEV_PROTOCOL`, `DEV_DOMAIN`, and `PORT`.

## Example deployment repos

Sample repositories for local development are in `examples/`:

- `examples/node-npm-static`
- `examples/node-pnpm-static`
- `examples/node-bun-static`
- `examples/node-yarn-static`
- `examples/python-mkdocs-pip`
- `examples/python-pdploy-pip`

Use one of these as a starting point, push it to GitHub, then create a pdploy project pointing at that repo.

## Build pipeline and workers

Deployments are queued in Redis and processed by build workers (Bun `Worker` threads). Worker count is `BUILD_WORKERS` (default `2`). If `REDIS_URL` is not set or Redis is unreachable, workers do not start and deployments stay queued.

Each worker: dequeues a job, clones the repo from GitHub (zipball), detects build strategy (Node or Python), installs dependencies via the relevant package manager, runs build, locates output artifacts, uploads them to S3 under the deployment's `artifactPrefix`, and updates deployment status and preview URL. Logs are streamed to Redis pub/sub and persisted to S3; the UI streams from the same channel.

## Database and migrations

Schema lives in `src/db/schema.ts`: Better Auth tables (`users`, `sessions`, `accounts`, `verification`) plus `projects` and `deployments`. Migrations are in `drizzle/` and run via `bun migrate.ts` (or on container startup when `RUN_MIGRATIONS=1`).

- **Generate a new migration**: `bun run db:generate`. Requires `DATABASE_URL` in `.env`. Writes to `drizzle/`.
- **Open Drizzle Studio**: `bun run db:studio`. Connects to the DB from `.env` for browsing and editing data.

## npm scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start app with hot reload (`bun --hot src/index.ts`). |
| `bun run start` | Start app without hot reload. |
| `bun run migrate` | Run `migrate.ts` (apply migrations). |
| `bun run seed` | Run `seed.ts` (insert demo project/deployment). Optional; skip in production. |
| `bun run build:client` | Build client assets into `dist/client`. |
| `bun run build:exe` | Build single-file executable for current platform. |
| `bun run build:exe:linux-x64` / `build:exe:linux-arm64` | Cross-compile Linux executable. |
| `bun run db:generate` | Generate Drizzle migration (requires `DATABASE_URL`). |
| `bun run db:studio` | Open Drizzle Studio. |
| `bun run garage` | Run `docker exec -ti garage /garage` to use the Garage CLI inside the container. |

## Production deployment

- Use the same `Dockerfile` and `docker-compose.yml` (or equivalent). Set `APP_ENV=production` and provide production `.env` (or inject secrets another way).
- The app listens on port 3000 inside the container. Expose it via a reverse proxy (e.g. Caddy, Nginx, Traefik) for TLS and single entrypoint.
- Migrations run on startup when `RUN_MIGRATIONS=1`. For zero-downtime deploys, consider running migrations in a separate step before rolling new app containers.
- Optional: build a single-file executable for non-Docker hosts; see [README](../README.md#build-a-single-file-executable).

> [!IMPORTANT]
> In production, set `PROD_PROTOCOL` and `PROD_DOMAIN` (and optionally `BETTER_AUTH_URL`) to your public app URL (HTTPS). GitHub OAuth callback URL must be `https://<your-domain>/api/auth/callback/github`. Do not rely on default or dev values for auth or OAuth redirects.
