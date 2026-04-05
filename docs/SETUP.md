[bun]: https://bun.sh/
[bun-install]: https://bun.sh/docs/installation
[docker-get]: https://docs.docker.com/get-docker/
[docker-desktop]: https://docs.docker.com/desktop/
[compose-install]: https://docs.docker.com/compose/install/
[garage]: https://garagehq.deuxfleurs.fr/
[github-oauth]: https://github.com/settings/developers

# Setup and development

Pdploy is a Bun-based deployment platform. Infra (Postgres, Redis, [garage] S3) runs in Docker. The app can run either **fully in Docker** (no Bun on host *after* bootstrap) or **on the host with hot reload** (Bun required). This doc covers both.

## Table of contents

- [Prerequisites](#prerequisites)
- [One-time bootstrap](#one-time-bootstrap)
- [Workflow A: Full stack in Docker (no Bun)](#workflow-a-full-stack-in-docker-no-bun)
- [Workflow B: Infra in Docker, app and worker on host](#workflow-b-infra-in-docker-app-and-worker-on-host)
- [Infra script reference](#infra-script-reference)
- [Environment variables](#environment-variables)
- [Ports](#ports)
- [Health endpoint](#health-endpoint)
- [Preview URLs](#preview-urls)
- [Example deployment repos](#example-deployment-repos)
- [Build pipeline and workers](#build-pipeline-and-workers)
- [Database and migrations](#database-and-migrations)
- [npm scripts](#npm-scripts)
- [Troubleshooting](#troubleshooting)
- [Production deployment](#production-deployment)

## Prerequisites

| Requirement | When needed | Install |
|-------------|-------------|---------|
| Docker | Always (infra and optionally app) | [Install Docker][docker-get] ([Docker Desktop][docker-desktop] includes Compose) |
| Docker Compose | Always | Bundled with Docker Desktop; on Linux see [Install Compose][compose-install] |
| Bun 1.3+ | **`./infra/dev.sh start`** (migrate, seed, Garage/Nexus bootstrap), **and** [Workflow B](#workflow-b-infra-in-docker-app-and-worker-on-host) (host app/worker) | [Bun installation][bun-install] (use the official installer; avoid `npm i -g bun` without fixing global npm permissions) |
| Go 1.22+ | [Workflow B](#workflow-b-infra-in-docker-app-and-worker-on-host) (host worker only) | Required to build the `pdploy-repo-ingest` helper binary before `bun run start:worker`. |
| Disk | Full stack + Nexus + image builds | Leave plenty of free space on the Docker data disk (rough guide: **≥30–40 GB** for a comfortable dev VM). |

> [!NOTE]
> **`./infra/dev.sh start` requires Bun on the machine where you run it.** After a successful bootstrap, you can run **`docker compose up -d --build`** without Bun on the host for day-to-day full-stack-in-Docker use ([Workflow A](#workflow-a-full-stack-in-docker-no-bun)).

> [!NOTE]
> The app image is slim and does not run build jobs. Build toolchains (Docker CLI, Node/Python package managers, uv, Poetry, `unzip`) live in the dedicated `deployment-worker` image, which talks to the host Docker daemon through `/var/run/docker.sock`.

> [!IMPORTANT]
> **~4 GB RAM** is recommended for the full stack. **~30–40 GB+** free disk on the Docker volume avoids build failures when Nexus and worker images pull and build.

## One-time bootstrap

From the repository root.

1. Copy env and edit as needed:

```bash
cp .env.example .env
```

2. Fill **required** values in `.env` before the app can start:

- **`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`**: from [GitHub OAuth Apps][github-oauth]. **Required** — the app throws on startup if they are missing.
- **`BETTER_AUTH_SECRET`**: e.g. `openssl rand -base64 32`. Strongly recommended in dev and required in production. Changing it invalidates existing sessions.
- **`NEXUS_REGISTRY`**, **`NEXUS_USER`**, **`NEXUS_PASSWORD`**: all three must be set (non-empty) for the dev script to sync base images into the local Nexus registry used by `docker build`. If any are empty, image sync is skipped but builds may still target `localhost:8082` and fail. Use a password **at least 8 characters** for Nexus bootstrap.

3. Start the stack and bootstrap [garage] (creates S3 bucket and key, writes `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` into `.env`):

```bash
./infra/dev.sh start
```

This requires **Bun** on the host. It starts Postgres, Redis, Garage, Nexus, runs migrations and seed, syncs build images to Nexus when configured, then builds and starts the app and deployment-worker.

> [!WARNING]
> Do not commit `.env`. It will contain secrets after bootstrap and OAuth setup.

4. OAuth callback URL must match how you open the app:

- Host Bun dev: `http://localhost:3001/api/auth/callback/github` (or your chosen port).
- App in Docker: `http://localhost:3000/api/auth/callback/github`.
- **VM / remote IP:** `http://<host-or-vm-ip>:3000/api/auth/callback/github` (see [Troubleshooting](#troubleshooting)).

The app derives the auth base URL from `DEV_PROTOCOL`, `DEV_DOMAIN`, and `PORT` in development (and `PROD_*` in production). Ensure these match how you reach the app.

- `BETTER_AUTH_URL`: if your Better Auth config expects it, set to your app URL. For host Bun dev, use `http://localhost:3001`. For the Docker app, use `http://localhost:3000` (or your VM/public URL).

## Workflow A: Full stack in Docker (no Bun)

Good for: CI, testing the containerized path, or **running Compose without Bun on the host** after the repo is already bootstrapped.

**First-time setup:** run [One-time bootstrap](#one-time-bootstrap) (`./infra/dev.sh start` with Bun). That provisions Garage S3 keys in `.env`, Nexus, migrations, and seed. **Seed** (`seed.ts`) runs via that script, not automatically on every `docker compose up`.

**After bootstrap**, you can bring the stack up with Compose alone:

```bash
docker compose up -d --build
```

This also builds dedicated Node and Bun build images (`pdploy-node-build-image:latest` and `pdploy-bun-build-image:latest`) used by deployment workers for Node repos. The Bun image includes Python and common native build dependencies so packages like `canvas` can compile reliably.

**Migrations:** the app container runs `migrate.ts` on startup when `RUN_MIGRATIONS=1`. **Seeding** is not re-run by Compose; use `./infra/dev.sh seed` or `bun run seed` with a working `.env` if you need demo data again.

2. App URL: `http://localhost:3000` (or `http://<vm-ip>:3000` from another machine; see [Troubleshooting](#troubleshooting))

3. Logs (app + worker):

```bash
docker compose logs -f app deployment-worker
```

4. Stop everything:

```bash
docker compose down
```

5. Stop only app + deployment-worker (keep Postgres, Redis, Garage):

```bash
docker compose stop app deployment-worker
```

6. Restart app + deployment-worker:

```bash
docker compose up -d --build node-build-image bun-build-image app deployment-worker
```

> [!NOTE]
> Inside the app container, migrations run on startup (`RUN_MIGRATIONS=1`). The deployment-worker consumes Redis jobs and uses container hostnames: `postgres`, `redis`, `garage`.

## Workflow B: Infra in Docker, app and worker on host

Good for: daily development with fast feedback. Requires [bun] on the host.

1. After [one-time bootstrap](#one-time-bootstrap), stop Docker app services so host processes own app and queue consumption:

```bash
docker compose stop app deployment-worker
```

If OrbStack or another non-Compose service is already listening on the app port, that command is still required but not sufficient. Host Bun dev should use `PORT=3001` so it does not compete with the existing listener.

2. Run migrations and seed (if not already done):

```bash
bun run migrate
bun run seed
```

3. Start the app with hot reload:

```bash
bun run dev
```

4. Start the worker in a second terminal:

```bash
bun run start:worker
```

That command now builds the Go-based `pdploy-repo-ingest` helper before starting the Bun worker.

5. App URL: `http://localhost:3001`

6. Stop host app/worker with Ctrl+C. Infra (Postgres, Redis, Garage) keeps running.

7. Stop infra:

```bash
./infra/dev.sh stop
```

8. Full teardown (remove volumes, re-bootstrap infra):

```bash
./infra/dev.sh reset
bun run migrate
bun run seed
# terminal 1
bun run dev
# terminal 2
bun run start:worker
```

> [!TIP]
> For day-to-day dev, keep infra running and use either Docker (`app` + `deployment-worker`) or host processes (`bun run dev` + `bun run start:worker`) consistently for a session.

## Infra script reference

All from repository root. `dc` in the script points at `docker-compose.yml` in the repo.

| Command | Description |
|---------|-------------|
| `./infra/dev.sh start` | Start Postgres, Redis, Garage, Nexus; wait for healthy deps; ensure Garage layout/bucket/key; inject S3 vars into `.env`; run **`bun migrate.ts`** and **`bun seed.ts`** on the host; sync Nexus images when `NEXUS_*` are set; build and start app and deployment-worker; verify Docker access from deployment-worker. **Requires Bun on the host.** |
| `./infra/dev.sh stop` | Stop all compose services (including app and deployment-worker). |
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
| `PORT` | No | Code default `3000`. For host Bun dev, `.env.example` sets `3001`; Docker/container examples keep `3000`. |
| `DATABASE_URL` | Yes | Postgres connection string. Use `localhost:5432` when app runs on host; use `postgres:5432` inside app container. |
| `REDIS_URL` | Yes | Redis URL. Use `localhost:6379` on host; `redis:6379` in container. If unset or unreachable, deployment-worker cannot process deployments. |
| `S3_ENDPOINT` | Yes | Garage/S3 endpoint. Use `http://127.0.0.1:3900` on host; `http://garage:3900` in container. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Yes for storage | Injected by `./infra/dev.sh start` or set manually. Aliases: `AWS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. |
| `S3_REGION`, `AWS_REGION` | No | Default `garage`. |
| `BETTER_AUTH_URL` | Optional | App base URL if your Better Auth config expects it. Auth client URL is derived from `DEV_*`/`PROD_*` and `PORT` in development (and `PROD_*` in production). |
| `BETTER_AUTH_SECRET` | **Strongly recommended** (required in prod) | Secret for session/signing (e.g. `openssl rand -base64 32`). Set in dev to avoid flaky auth; changing it signs everyone out. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | **Yes (app startup)** | OAuth app credentials; **required** or the app exits on boot. Callback URL must match your app URL + `/api/auth/callback/github`. |
| `DEV_DOMAIN`, `PROD_DOMAIN`, `DEV_PROTOCOL`, `PROD_PROTOCOL` | No | Used for auth callback URL and preview URLs. Defaults in `.env.example`. Subdomain previews match `Host` against `<id>.<DEV_DOMAIN>` or `<id>.<PROD_DOMAIN>`. |
| `BUILD_WORKERS` | No | Legacy in-process worker count for app-thread workers. Keep `0` when using the standalone `deployment-worker` service. |
| `BUILD_COMMAND_INACTIVITY_TIMEOUT_MS` | No | Silence timeout for build commands. Default `300000` (5 minutes). Increase this for repos whose dependency installs go quiet during native/prebuilt package work such as `sharp`, `canvas`, or `node-gyp`. Set `0` or a negative value to disable the inactivity kill entirely. |
| `NEXUS_REGISTRY`, `NEXUS_USER`, `NEXUS_PASSWORD` | **All three required** for Nexus image sync | If any is empty, `./infra/dev.sh` skips pushing base images to the local registry, but Dockerfiles may still default to `localhost:8082`, causing confusing build failures. Set `NEXUS_PASSWORD` to **≥8 characters** for Nexus admin bootstrap. On Linux you may need Docker [`insecure-registries`](https://docs.docker.com/engine/daemon/insecure-registries/) for `localhost:8082` if pulls use HTTP. |
| `RUNTIME_STATIC_BASE_IMAGE` | No | Base image for standardized OCI runtime artifact generation from static build output. Default `nginx:alpine`. |
| `SKIP_CLIENT_BUILD` | No | Set to `1` in Docker/prod so the app uses prebuilt client assets. |
| `RUN_MIGRATIONS` | No | Set to `1` to run migrations on app startup (default in Docker). |

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| App (Docker) | 3000 | HTTP |
| App (host Bun dev) | 3001 | HTTP |
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

Deployments are queued in Redis and processed by a standalone worker process (`src/workers/runBuildWorker.ts`), usually via the `deployment-worker` Compose service. The app process does not start Bun `Worker` threads in this architecture.

Each worker process: dequeues a job, clones the repo from GitHub (zipball), detects build strategy (Node or Python), installs dependencies via the relevant package manager, runs build, locates output artifacts, uploads them to S3 under the deployment's `artifactPrefix`, and updates deployment status and preview URL. Logs are streamed to Redis pub/sub and persisted to S3; the UI streams from the same channel.

In addition to existing static artifact uploads, the worker builds and uploads a container image tarball (`runtime-image.tar`, Docker save format) at `<artifactPrefix>/runtime-image.tar`. This keeps current static preview behavior intact while standardizing deployment outputs for future long-running server workflows.

## Database and migrations

Schema lives in `src/db/schema.ts`: Better Auth tables (`users`, `sessions`, `accounts`, `verification`) plus `projects` and `deployments`. Migrations are in `drizzle/` and run via `bun migrate.ts` (or on container startup when `RUN_MIGRATIONS=1`).

- **Generate a new migration**: `bun run db:generate`. Requires `DATABASE_URL` in `.env`. Writes to `drizzle/`.
- **Open Drizzle Studio**: `bun run db:studio`. Connects to the DB from `.env` for browsing and editing data.

## npm scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start app with hot reload (`bun --hot src/index.ts`). |
| `bun run start` | Start app without hot reload. |
| `bun run start:worker` | Start the standalone build worker process. |
| `bun run migrate` | Run `migrate.ts` (apply migrations). |
| `bun run seed` | Run `seed.ts` (insert demo project/deployment). Optional; skip in production. |
| `bun run build:client` | Build client assets into `dist/client`. |
| `bun run build:exe` | Build single-file executable for current platform. |
| `bun run build:exe:linux-x64` / `build:exe:linux-arm64` | Cross-compile Linux executable. |
| `bun run db:generate` | Generate Drizzle migration (requires `DATABASE_URL`). |
| `bun run db:studio` | Open Drizzle Studio. |
| `bun run garage` | Run `docker exec -ti garage /garage` to use the Garage CLI inside the container. |

## Troubleshooting

### Postgres: “failed to start in time”

On a slow disk or first-time DB init, Postgres can take longer than the wait loop in `infra/dev.sh`. Check `docker logs postgres`. Wait until you see the database ready, then run `./infra/dev.sh start` again or `./infra/dev.sh migrate` once the DB is up.

### `bun: not found` when running `./infra/dev.sh`

Install [Bun][bun-install] on the host (official `curl` installer installs to your home directory). Avoid `npm i -g bun` without fixing global npm permissions (`EACCES`). Alternatively, after infra exists, use [Workflow A](#workflow-a-full-stack-in-docker-no-bun) with `docker compose` only — you still need seed/migrate parity documented there.

### Missing `.env`

Copy **`cp .env.example .env`** before bootstrap. A missing or empty `.env` causes confusing failures (including Postgres wait issues).

### Nexus / `localhost:8082` build errors

Set **`NEXUS_REGISTRY`**, **`NEXUS_USER`**, and **`NEXUS_PASSWORD`** in `.env`. If any is empty, the script skips syncing images to Nexus while builds still reference `localhost:8082`. On Linux, if Docker tries **HTTPS** against an **HTTP** registry, add `"insecure-registries": ["localhost:8082"]` to `/etc/docker/daemon.json` and restart Docker.

### No space left on device (during `docker build`)

Free space with `docker builder prune -af` and `docker system prune -af` (destructive to unused images/volumes). Enlarge the VM or Docker disk if usage stays high. The Bun builder image installs many `-dev` packages; full stack + Nexus needs a **generous** disk allocation.

### `npm ci` / `npm install` timed out after no output

The worker treats long silent commands as stuck and kills them after `BUILD_COMMAND_INACTIVITY_TIMEOUT_MS`. Some installs legitimately stay quiet while downloading or compiling native dependencies such as `sharp`, `canvas`, or `node-gyp`.

Set `BUILD_COMMAND_INACTIVITY_TIMEOUT_MS=300000` (5 minutes) or higher in the worker environment and restart `deployment-worker`. Set `0` to disable the inactivity kill if you prefer.

### App container `Restarting` — `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`

The app throws on load if GitHub OAuth vars are missing. Set both in `.env` and ensure **`DEV_*` / `PORT`** produce a valid client URL. Restart: `docker compose up -d app` or `docker compose restart app`.

### Better Auth secret

Set **`BETTER_AUTH_SECRET`** (e.g. `openssl rand -base64 32`). Omitting or rotating it affects sessions and login behavior.

### Browser: VM / Multipass / remote host

From your **PC**, open **`http://<vm-ip>:3000`**, not `http://localhost:3000` (that points at the machine running the browser). Find the IP with `multipass list` or your cloud panel. Register the **same origin** in the GitHub OAuth app callback (e.g. `http://192.168.x.x:3000/api/auth/callback/github`). Optional: SSH port-forward `3000` to use `localhost` in the browser.

## Production deployment

- Use the same `Dockerfile`, `docker/build-worker.Dockerfile`, and `docker-compose.yml` (or equivalent). Deploy both `app` and `deployment-worker` with production `.env` (or injected secrets).
- The app listens on port 3000 inside the container. Expose it via a reverse proxy (e.g. Caddy, Nginx, Traefik) for TLS and single entrypoint.
- Migrations run on startup when `RUN_MIGRATIONS=1`. For zero-downtime deploys, consider running migrations in a separate step before rolling new app containers.
- Optional: build a single-file executable for non-Docker hosts; see [README](../README.md#build-a-single-file-executable).

> [!IMPORTANT]
> In production, set `PROD_PROTOCOL` and `PROD_DOMAIN` (and optionally `BETTER_AUTH_URL`) to your public app URL (HTTPS). GitHub OAuth callback URL must be `https://<your-domain>/api/auth/callback/github`. Do not rely on default or dev values for auth or OAuth redirects.
