[bun]: https://bun.sh/
[bun-install]: https://bun.sh/docs/installation
[docker-get]: https://docs.docker.com/get-docker/
[docker-desktop]: https://docs.docker.com/desktop/
[compose-install]: https://docs.docker.com/compose/install/
[garage]: https://garagehq.deuxfleurs.fr/
[github-oauth]: https://github.com/settings/developers

# Setup and development

Deployher is a Bun-based deployment platform ([deployher.com](https://deployher.com)). Infra (Postgres, Redis, [garage] S3) runs in Docker. **`deployher` does not require Bun on the host** for migrate/seed (they run inside **`oven/bun`** via Docker). From the repo root run the CLI with **`bun run deployher <command>`** or **`bun cli/index.ts <command>`** (implementation in [`cli/`](../cli/)). After **`bun run build:cli`**, **`./dist/deployher-cli <command>`** is a standalone binary (no Bun at runtime). Put **`deployher`** on `PATH` via **`bun link --global`** (Bun runs `cli/index.ts`) or **`bun run cli:link`** after a compile (symlink **`dist/deployher-cli`** → **`~/.local/bin/deployher`**). You can also run the app **fully in Docker** or **on the host with hot reload** ([Workflow B](#workflow-b-infra-in-docker-app-and-worker-on-host), Bun required on the host). This doc covers both.

## Table of contents

- [Prerequisites](#prerequisites)
- [One-time bootstrap](#one-time-bootstrap)
- [Workflow A: Full stack in Docker (no Bun)](#workflow-a-full-stack-in-docker-no-bun)
- [Workflow B: Infra in Docker, app and worker on host](#workflow-b-infra-in-docker-app-and-worker-on-host)
- [Deployher CLI reference](#deployher-cli-reference)
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
| Bun 1.3+ | Only [Workflow B](#workflow-b-infra-in-docker-app-and-worker-on-host) (host app + worker, hot reload) | [Bun installation][bun-install] (use the official installer; avoid `npm i -g bun` without fixing global npm permissions) |
| Disk | Full stack + Nexus + image builds | Leave plenty of free space on the Docker data disk (rough guide: **≥30–40 GB** for a comfortable dev VM). |

> [!NOTE]
> **`deployher`** runs migrate/seed inside **`oven/bun`** via Docker — **no Bun on the host.** Override image with **`BUN_IMAGE`** if needed. After bootstrap, you can use **`docker compose up -d --build`** for day-to-day full-stack-in-Docker ([Workflow A](#workflow-a-full-stack-in-docker-no-bun)).

> [!NOTE]
> The app image is slim and does not run build jobs. Build toolchains (Docker CLI, Node/Python package managers, uv, Poetry, `unzip`) live in the dedicated `deployment-worker` image, which talks to the host Docker daemon through `/var/run/docker.sock`.

> [!IMPORTANT]
> **~4 GB RAM** is recommended for the full stack. **~30–40 GB+** free disk on the Docker volume avoids build failures when Nexus and worker images pull and build.

## One-time bootstrap

From the repository root.

1. **Configuration layers** (orchestration vs app config):

- **Orchestration** — [`docker-compose.yml`](../docker-compose.yml) wires services (images, networks, in-container URLs like `postgres:5432` / `http://garage:3900`). You normally do not duplicate those in app config files.
- **App config** — committed defaults live in [`config/default.toml`](../config/default.toml). Optional overrides: copy [`config/local.example.toml`](../config/local.example.toml) to **`config/local.toml`** (gitignored). **Environment variables and `.env` override** TOML when set (non-empty).
- **Slim `.env`** — copy [`.env.example`](../.env.example) to `.env` for **Docker Compose `${VAR}` substitutions** and **secrets** (GitHub OAuth, auth secret, S3 keys, Nexus password). Most tunables stay in `config/default.toml`, not in a hundred-line env file. Regenerate the compose-var list anytime: `bun run config:write-dotenv`.

```bash
cp .env.example .env
# optional: cp config/local.example.toml config/local.toml
```

**VPS / production (guided):** from the repo root, with Docker available, run **`bun run deployher bootstrap`** (or **`./dist/deployher-cli bootstrap`** after `bun run build:cli`). It creates `.env` from `.env.example` if missing, fills generated secrets (`BETTER_AUTH_SECRET`, `NEXUS_*`, `RUNNER_SHARED_SECRET`), prompts for GitHub OAuth and public domain routing (or use **`-y`** with those values already in `.env`), then runs the same Docker bring-up as **`deployher start`** but **skips demo `seed.ts` by default** (pass **`--seed`** if you want the demo project). Use **`--dry-run`** to print planned `.env` keys without writing files or starting containers. For local laptops you can keep using **`deployher start`** (includes demo seed and sets `VITE_DEV_API_URL` for host Vite).

2. Fill **required** values (in `.env` and/or `config/local.toml`) before the app can start:

- **`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`**: from [GitHub OAuth Apps][github-oauth]. **Required** — the app throws on startup if they are missing.
- **`BETTER_AUTH_SECRET`**: e.g. `openssl rand -base64 32`. Strongly recommended in dev and required in production. Changing it invalidates existing sessions.
- **`NEXUS_REGISTRY`**, **`NEXUS_USER`**, **`NEXUS_PASSWORD`**: all three must be set (non-empty) for the dev script to sync base images into the local Nexus registry used by `docker build`. If any are empty, image sync is skipped but builds may still target `localhost:8082` and fail. Use a password **at least 8 characters** for Nexus bootstrap.

3. Start the stack and bootstrap [garage] (creates S3 bucket and key, writes `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` into `.env`):

```bash
bun run deployher bootstrap
# or: bun run deployher start   # includes demo seed + VITE_DEV_API_URL for host Vite
# or after: bun run build:cli
# ./dist/deployher-cli bootstrap
```

It starts Postgres, Redis, Garage, Nexus, runs migrations and seed **in Docker** (`oven/bun` by default), syncs build images to Nexus when configured, then builds and starts **edge**, **app-api**, **marketing**, and deployment-worker. **No Bun on the host** — only Docker.

> [!WARNING]
> Do not commit `.env`. It will contain secrets after bootstrap and OAuth setup.

4. OAuth callback URL must point at the **API** public origin (path `/api/auth/callback/github`):

- Host Bun dev: `http://localhost:3001/api/auth/callback/github` (or your chosen port).
- Docker (default path routing, **edge** on 3000): `http://localhost:3000/api/auth/callback/github` (traffic reaches **`app-api`** via Caddy).
- **Multi-host production:** `https://api.yourdomain.com/api/auth/callback/github` — set **`BETTER_AUTH_URL=https://api.yourdomain.com`** and match in GitHub OAuth app settings.
- **VM / remote IP:** `http://<host-or-vm-ip>:3000/api/auth/callback/github` (see [Troubleshooting](#troubleshooting)).

In development, the auth base URL comes from `DEV_PROTOCOL`, `DEV_DOMAIN`, and `PORT` unless **`BETTER_AUTH_URL`** is set. In production, prefer **`BETTER_AUTH_URL`** to the **api** host; **`getTrustedAppOrigins`** includes landing, dash, and api origins when **`DEPLOYHER_PRIMARY_DOMAIN`** is set (see **`.env.example`**).

- `BETTER_AUTH_URL`: set to the **public API origin** (e.g. `https://api.deployher.com` or `http://localhost:3000` for local Docker through **edge**).

## Workflow A: Full stack in Docker (no Bun)

Good for: CI, testing the containerized path, or **running Compose without Bun on the host** after the repo is already bootstrapped.

**First-time setup:** run [One-time bootstrap](#one-time-bootstrap): **`deployher start`** (includes demo seed) or **`deployher bootstrap`** on a server (skips seed unless `--seed`). That provisions Garage S3 keys in `.env`, Nexus when `NEXUS_*` are set, migrations, and seed only when using **`start`** or **`bootstrap --seed`** (via **`oven/bun` in Docker**). **Seed** (`seed.ts`) is not run on every `docker compose up`.

**After bootstrap**, you can bring the stack up with Compose alone:

```bash
docker compose up -d --build
```

This also builds dedicated Node and Bun build images (`deployher-node-build-image:latest` and `deployher-bun-build-image:latest`) used by deployment workers for Node repos. The Bun image includes Python and common native build dependencies so packages like `canvas` can compile reliably.

**Migrations:** the app container runs `migrate.ts` on startup when `RUN_MIGRATIONS=1`. **Seeding** is not re-run by Compose; use **`deployher seed`** (Dockerized Bun) or **`bun run seed`** on the host if you use [Workflow B](#workflow-b-infra-in-docker-app-and-worker-on-host) and need demo data again.

2. App URL: `http://localhost:3000` (or `http://<vm-ip>:3000` from another machine; see [Troubleshooting](#troubleshooting))

3. Logs (app + worker):

```bash
docker compose logs -f edge app-api marketing deployment-worker
```

4. Stop everything:

```bash
docker compose down
```

5. Stop only app + deployment-worker (keep Postgres, Redis, Garage):

```bash
docker compose stop edge app-api marketing deployment-worker
```

6. Restart app + deployment-worker:

```bash
docker compose up -d --build node-build-image bun-build-image app-api marketing edge deployment-worker
```

> [!NOTE]
> Inside the app container, migrations run on startup (`RUN_MIGRATIONS=1`). The deployment-worker consumes Redis jobs and uses container hostnames: `postgres`, `redis`, `garage`.

## Workflow B: Infra in Docker, app and worker on host

Good for: daily development with fast feedback. Requires [bun] on the host.

1. After [one-time bootstrap](#one-time-bootstrap), stop Docker app services so host processes own app and queue consumption:

```bash
docker compose stop edge app-api marketing deployment-worker
```

If OrbStack or another non-Compose service is already listening on the app port, that command is still required but not sufficient. Host Bun dev should use `PORT=3001` so it does not compete with the existing listener.

2. Run migrations and seed (if not already done). With **Bun** on the host:

```bash
bun run migrate
bun run seed
```

Without Bun on the host, use Docker (same as bootstrap) while infra is up:

```bash
deployher migrate
deployher seed
```

3. Start the app with hot reload:

```bash
bun run dev
```

4. Start the worker in a second terminal:

```bash
bun run start:worker
```

5. App API URL: `http://localhost:3000` (Better Auth, `/api/*`, `/health`) when using host Bun, or through **edge** on `:3000` in Docker. The **dashboard** is a **Vite SPA**: in a **third** terminal run `bun run dev:vite` and open **`http://localhost:5173`**. Vite proxies `/api`, `/d`, and `/preview` to the Bun server (default `http://127.0.0.1:3000`; override with **`VITE_DEV_API_URL`** if needed). Optional: **`bun run dev:marketing`** for the Astro landing site (default **4321**).

6. Stop host app/worker (and Vite) with Ctrl+C. Infra (Postgres, Redis, Garage) keeps running.

7. Stop infra:

```bash
deployher stop
```

8. Full teardown (remove volumes, re-bootstrap infra):

```bash
deployher reset
```

`reset` runs migrate and seed inside Docker. Then start the host app and worker again:

```bash
# terminal 1
bun run dev
# terminal 2
bun run start:worker
```

If you use host Bun and prefer explicit migrate/seed after reset, you can still run `bun run migrate` and `bun run seed`, or `deployher migrate` / `deployher seed`.

> [!TIP]
> For day-to-day dev, keep infra running and use either Docker (`app` + `deployment-worker`) or host processes (`bun run dev` + `bun run start:worker`) consistently for a session.

## Deployher CLI reference

All commands run from the repository root and use `docker-compose.yml`. Prefer **`bun run deployher <command>`** or **`./dist/deployher-cli <command>`** after **`bun run build:cli`** (implementation lives in **`cli/`**).

In the command table, **`deployher`** means **`bun run deployher`**, **`./dist/deployher-cli`**, or a **`deployher`** command on your `PATH` (`bun link --global`, **`bun run cli:link`**, or a global install).

| Command | Description |
|---------|-------------|
| `deployher start` | Start Postgres, Redis, Garage, Nexus; wait for healthy deps; ensure Garage layout/bucket/key; inject S3 vars into `.env`; run **`migrate.ts`** and **`seed.ts`** inside **`oven/bun`** (Docker); sync Nexus images when `NEXUS_*` are set; build and start **edge**, **app-api**, **marketing**, and deployment-worker; verify Docker access from deployment-worker. **No Bun on the host.** |
| `deployher stop` | Stop all compose services (including **edge**, **app-api**, **marketing**, and deployment-worker). |
| `deployher reset` | `docker compose down -v`, clear Garage data and secrets, then full `start` again (migrate + seed in Docker, then app + workers). Confirm unless `--yes` / `CI=1`. |
| `deployher migrate` | Ensure stack is up, then run `migrate.ts` in Docker (`oven/bun`). |
| `deployher grant-operator <githubLogin>` | Ensure core infra is up, run `migrate.ts` (unless `--skip-migrate`), then set `users.role` to `operator` for whoever signed in with that GitHub account (resolves login via the GitHub API, matches `accounts.account_id`). The user must have completed GitHub sign-in at least once. Optional **`GITHUB_TOKEN`** in `.env` raises GitHub API rate limits. |
| `deployher seed` | Ensure stack is up, then run `seed.ts` in Docker (`oven/bun`). |
| `deployher logs [services...]` | `docker compose logs -f` (optional service names). |
| `deployher nexus sync` | Repush base + builder images to Nexus (requires `NEXUS_*` in `.env`). |
| `deployher status` | `docker compose ps` for this project. |
| `deployher doctor` | Check Docker, Compose, compose file, and `.env` presence. |

Global flags (before the subcommand): **`--verbose`**, **`--quiet`**, **`--no-color`**, **`--yes`**.

> [!CAUTION]
> `deployher reset` destroys Postgres and Garage data. Use when you want a clean slate, not for routine restarts.

## Environment variables

Load order: **`.env`** is read first (dotenv does not replace variables already set by the shell or Docker). **`config/default.toml`** and **`config/local.toml`** then fill keys that are still unset or empty. Anything already in the process environment—including values from Compose `environment:` blocks—wins. The table below describes effective settings; see **`config/default.toml`** for the full default set.

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ENV` | Yes | `development` or `production` |
| `HOSTNAME` | Yes | Bind address (e.g. `0.0.0.0`) |
| `PORT` | No | Default `3001` in `config/default.toml` for host dev; Docker Compose sets `3000` in the app container. |
| `DATABASE_URL` | Yes | Postgres connection string. Use `localhost:5432` when app runs on host; use `postgres:5432` inside app container. |
| `REDIS_URL` | Yes | Redis URL. Use `localhost:6379` on host; `redis:6379` in container. If unset or unreachable, deployment-worker cannot process deployments. |
| `S3_ENDPOINT` | Yes | Garage/S3 endpoint. Use `http://127.0.0.1:3900` on host; `http://garage:3900` in container. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Yes for storage | Injected by `deployher start` or set manually. Aliases: `AWS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. |
| `S3_REGION`, `AWS_REGION` | No | Default `garage`. |
| `BETTER_AUTH_URL` | Optional | App base URL if your Better Auth config expects it. Auth client URL is derived from `DEV_*`/`PROD_*` and `PORT` in development (and `PROD_*` in production). |
| `BETTER_AUTH_SECRET` | **Strongly recommended** (required in prod) | Secret for session/signing (e.g. `openssl rand -base64 32`). Set in dev to avoid flaky auth; changing it signs everyone out. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | **Yes (app startup)** | OAuth app credentials; **required** or the app exits on boot. Callback URL must match your app URL + `/api/auth/callback/github`. |
| `DEV_DOMAIN`, `PROD_DOMAIN`, `DEV_PROTOCOL`, `PROD_PROTOCOL` | No | Used for auth callback URL and preview URLs. Defaults in `config/default.toml`. Subdomain previews match `Host` against `<id>.<DEV_DOMAIN>` or `<id>.<PROD_DOMAIN>`. |
| `BUILD_WORKERS` | No | In-process worker count for app-thread workers. Keep `0` when using the standalone `deployment-worker` service. |
| `BUILD_COMMAND_INACTIVITY_TIMEOUT_MS` | No | Generic no-output timeout for build/install/runtime-image commands that stream logs regularly. Default `30000`. |
| `PREVIEW_RUNTIME_PUSH_INACTIVITY_TIMEOUT_MS` | No | No-output timeout specifically for preview runtime `docker push` / digest resolution steps. Default `300000` so large registry pushes are not killed after a quiet 30s window. |
| `NEXUS_REGISTRY`, `NEXUS_USER`, `NEXUS_PASSWORD` | **All three required** for Nexus image sync | If any is empty, `deployher start` skips pushing base images to the local registry, but Dockerfiles may still default to `localhost:8082`, causing confusing build failures. Set `NEXUS_PASSWORD` to **≥8 characters** for Nexus admin bootstrap. On Linux you may need Docker [`insecure-registries`](https://docs.docker.com/engine/daemon/insecure-registries/) for `localhost:8082` if pulls use HTTP. These credentials are also **required for pushing and pulling preview runtime images** (`PREVIEW_RUNTIME_REGISTRY` defaults to `NEXUS_REGISTRY` when unset). |
| `PREVIEW_RUNTIME_REGISTRY`, `PREVIEW_RUNTIME_DOCKER_REPO`, `PREVIEW_RUNTIME_IMAGE_NAME` | No (defaults) | Target Docker registry for preview runtime images. Empty registry falls back to **`NEXUS_REGISTRY`**. **`PREVIEW_RUNTIME_DOCKER_DAEMON_REGISTRY`** (Compose) defaults to **`127.0.0.1:8082`**: `docker push` / `docker pull` run in the **Docker daemon**, which uses **host DNS** and cannot resolve Compose-only names like **`nexus`**. Use **`host.docker.internal:8082`** on Docker Desktop if loopback from the daemon fails. |
| `PREVIEW_RUNNER_IMAGE_GC_INTERVAL_MS`, `PREVIEW_RUNNER_IMAGE_MAX_AGE_MS` | No | Preview-runner periodic cleanup of unused preview images (default 15m interval, 7d max age). |
| `RUNTIME_STATIC_BASE_IMAGE` | No | Base image for standardized OCI runtime artifact generation from static build output. Default `nginx:alpine`. |
| `SKIP_CLIENT_BUILD` | No | Set to `1` in Docker/prod so the app uses prebuilt client assets. |
| `RUN_MIGRATIONS` | No | Set to `1` to run migrations on app startup (default in Docker). |
| `BUN_IMAGE` | No | Image for `deployher` migrate/seed and Nexus EULA helpers (default `oven/bun:1.3.5`). Set for air-gapped mirrors or version pinning. |

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

### Site icon and Open Graph (dashboard)

After a successful deployment, the build worker fetches the live preview HTML and stores **favicon / touch icon** and **`og:image`** URLs on the project for the sidebar and project switcher. You can re-run the fetch from **Project settings → General → Refresh from live preview**.

For **`*.localhost`** preview URLs, the app **automatically** retries the metadata fetch against **`127.0.0.1`**, the **`app-api`** hostname (Docker Compose), and **`host.docker.internal`**, each with the public preview URL in the **`Host`** header, so you usually do not need **`SITE_META_FETCH_ORIGIN`**. Override it only when your network needs a different gateway (for example a custom internal URL). Optional tunables: **`SITE_META_FETCH_TIMEOUT_MS`**, **`SITE_META_MAX_HTML_BYTES`**.

### Server previews (isolated preview runner)

For `serve_strategy=server`, the app proxies to **`RUNNER_URL`** at path **`/preview/<deploymentUuid>/…`**. The **`preview-runner`** service **`docker pull`s** the image referenced by **`runtime_image_pull_ref`** (digest under **`PREVIEW_RUNTIME_*`** + Nexus), or **legacy** **`runtime_image_artifact_key`** via S3 + `docker load`. Containers run with memory/CPU limits on **`RUNNER_DOCKER_NETWORK`** (Compose uses **`deployher_default`**).

The app adds headers the runner consumes:

| Header | Purpose |
|--------|---------|
| `x-deployher-runtime-image-pull-ref` | Registry image ref with digest (`host/repo/image@sha256:…`) |
| `x-deployher-runtime-image-key` | Legacy: S3 object key for `runtime-image.tar` |
| `x-deployher-runtime-config` | JSON: `port`, `command`, `workingDir`, etc. |
| `x-deployher-runner-secret` | Optional; must match `RUNNER_SHARED_SECRET` on the runner |

**Runtime logs:** the runner also serves **`GET /internal/runtime-logs/<deploymentUuid>`** with **`follow=1`** for a live body stream or **`follow=0`** for a snapshot (optional **`tail`**, default 500 lines). Use the same **`x-deployher-runner-secret`** when `RUNNER_SHARED_SECRET` is set. The app exposes **`/deployments/:id/runtime-log`** and **`/deployments/:id/runtime-log/stream`** (session cookie) for successful **server** deployments when **`RUNNER_URL`** is set; set **`RUNNER_PREVIEW_ENABLED=0`** to disable without clearing the URL. Logs are **live only**: Docker holds them while the preview container exists; after TTL expiry (**`PREVIEW_TTL_MS`**) or when the container is removed, there is no retained history in the app.

Workers need **`NEXUS_USER` / `NEXUS_PASSWORD`** and registry reachability to **push**; the runner needs the same to **pull**. Compose sets **`PREVIEW_RUNTIME_REGISTRY`** from **`PREVIEW_RUNTIME_DOCKER_DAEMON_REGISTRY`** (default **`127.0.0.1:8082`**) so the **daemon** can reach Nexus’s published port. The runner uses **`REDIS_URL`** for **`deployher:preview:prewarm`** fan-out and **`PREVIEW_RUNNER_IMAGE_*`** for image GC.

Set **`RUNNER_URL`** on the app (Compose default: `http://preview-runner:8787`); server previews are on whenever the URL is set unless **`RUNNER_PREVIEW_ENABLED=0`**. Run **`bun run start:preview-runner`** on the host when the app/worker run outside Compose but you still need a runner (use e.g. `http://127.0.0.1:8787` in **`.env`**).

Build cancellation: the app publishes **`deployher:build-cancel`** on Redis; workers subscribe and remove containers labeled **`io.deployher.deployment=<deploymentId>`**.

## Example deployment repos

Sample repositories for local development are in `examples/`:

- `examples/node-npm-static`
- `examples/node-pnpm-static`
- `examples/node-bun-static`
- `examples/bun-server-api`
- `examples/bun-server-client`
- `examples/node-yarn-static`
- `examples/python-mkdocs-pip`
- `examples/python-deployher-pip`

Use one of these as a starting point, push it to GitHub, then create a Deployher project pointing at that repo.

## Build pipeline and workers

Deployments are queued in Redis and processed by a standalone worker process (`src/workers/runBuildWorker.ts`), usually via the `deployment-worker` Compose service. The app process does not start Bun `Worker` threads in this architecture.

Each worker process: dequeues a job, clones the repo from GitHub (zipball), detects build strategy (Node or Python), installs dependencies via the relevant package manager, runs build, locates output artifacts, uploads them to S3 under the deployment's `artifactPrefix`, and updates deployment status and preview URL. Logs are streamed to Redis pub/sub and persisted to S3; the UI streams from the same channel.

The worker builds a preview runtime image and **pushes** it to the configured Docker registry (see **`PREVIEW_RUNTIME_*`**), then stores **`runtime_image_pull_ref`** on the deployment. Older rows may still reference **`runtime_image_artifact_key`** (S3 tarball) until redeployed.

## Database and migrations

Schema lives in `src/db/schema.ts`: Better Auth tables (`users`, `sessions`, `accounts`, `verification`) plus `projects` and `deployments`. Migrations live in `drizzle/`. Apply them by:

- **`deployher migrate`** — runs `migrate.ts` inside **`oven/bun`** via Docker (no Bun on the host; needs Docker + stack up).
- **`bun run migrate`** / **`bun migrate.ts`** — when you have Bun on the host and `DATABASE_URL` in `.env`.
- **App container** — `migrate.ts` on startup when `RUN_MIGRATIONS=1`.

- **Generate a new migration**: `bun run db:generate`. Requires `DATABASE_URL` in `.env`. Writes to `drizzle/`.
- **Open Drizzle Studio**: `bun run db:studio`. Connects to the DB from `.env` for browsing and editing data.

## npm scripts

| Script | Description |
|--------|-------------|
| `bun run deployher <cmd>` | Run the **deployher** CLI via Bun (`start`, `migrate`, `doctor`, …). |
| `bun run build:cli` | Compile the infra CLI to **`dist/deployher-cli`** (standalone; no Bun needed to execute it). Does not overwrite **`dist/deployher`** from **`build:exe`**. |
| `bun run cli:link` | Symlink **`dist/deployher-cli`** → **`~/.local/bin/deployher`**. If **`~/.local/bin`** is missing from `PATH`, asks before appending an export to **`~/.zshrc`**. Non-interactive: **`bun run cli:link -- --yes`** (append) or **`CLI_LINK_NO_ZSHRC=1`** (symlink only). |
| `./dist/deployher-cli <cmd>` | Run the compiled infra CLI (after **`build:cli`**). |
| `bun run test` | Run CLI unit tests (`bun test cli`). |
| `bun run dev` | Start app with hot reload (`bun --hot src/index.ts`). |
| `bun run dev:vite` | Vite dev server for the dashboard SPA (port **5173**); proxies `/api`, `/d`, `/preview` to Bun. Pair with `bun run dev`. |
| `bun run dev:marketing` | Astro dev server for the marketing site (default port **4321**). |
| `bun run check:server-ui` | Ensures Bun API/control-plane `.ts` files do not import React / `react-dom` / streaming SSR APIs (Vite client under `src/spa/**` is excluded). |
| `bun run start` | Start app without hot reload. |
| `bun run start:worker` | Start the standalone build worker process. |
| `bun run start:preview-runner` | Start the isolated preview runner (Docker socket + S3 env required). |
| `bun run migrate` | Run `migrate.ts` (apply migrations). |
| `bun run seed` | Run `seed.ts` (insert demo project/deployment). Optional; skip in production. |
| `bun run build:web` | Vite production build of the dashboard SPA to `dist/client`. |
| `bun run build:marketing` | Static Astro build to `apps/marketing/dist` (nginx **marketing** image). |
| `bun run build:client` | Alias for `bun run build:web` for older scripts. |
| `bun run build:exe` | Experimental; Docker + Bun runtime is the supported production path. |
| `bun run build:exe:linux-x64` / `build:exe:linux-arm64` | Cross-compile Linux executable. |
| `bun run db:generate` | Generate Drizzle migration (requires `DATABASE_URL`). |
| `bun run db:studio` | Open Drizzle Studio. |
| `bun run garage` | Run `docker exec -ti garage /garage` to use the Garage CLI inside the container. |

**Infra (Docker only, no Bun on host):** `deployher migrate`, `deployher seed`, and `deployher grant-operator` run scripts in **`oven/bun`** with the repo bind-mounted (same pattern as migrate). Override image with **`BUN_IMAGE`**. See [Deployher CLI reference](#deployher-cli-reference).

## Troubleshooting

### Postgres: “failed to start in time”

On a slow disk or first-time DB init, Postgres can take longer than the wait loop in `deployher`. Check `docker logs postgres`. Wait until you see the database ready, then run `deployher start` again or `deployher migrate` once the DB is up.

### Missing `.env`

Copy **`cp .env.example .env`** before bootstrap. A missing or empty `.env` causes confusing failures (including Postgres wait issues).

### Nexus / `localhost:8082` build errors

Set **`NEXUS_REGISTRY`**, **`NEXUS_USER`**, and **`NEXUS_PASSWORD`** in `.env`. If any is empty, **`deployher start`** skips syncing images to Nexus while builds still reference `localhost:8082`. On Linux, if Docker tries **HTTPS** against an **HTTP** registry, add `"insecure-registries": ["localhost:8082"]` to `/etc/docker/daemon.json` and restart Docker.

### No space left on device (during `docker build`)

Free space with `docker builder prune -af` and `docker system prune -af` (destructive to unused images/volumes). Enlarge the VM or Docker disk if usage stays high. The Bun builder image installs many `-dev` packages; full stack + Nexus needs a **generous** disk allocation.

### App container `Restarting` — `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`

The app throws on load if GitHub OAuth vars are missing. Set both in `.env` and ensure **`DEV_*` / `PORT`** produce a valid client URL. Restart: `docker compose up -d edge app-api marketing` or `docker compose restart edge app-api marketing`.

### Better Auth secret

Set **`BETTER_AUTH_SECRET`** (e.g. `openssl rand -base64 32`). Omitting or rotating it affects sessions and login behavior.

### Browser: VM / Multipass / remote host

From your **PC**, open **`http://<vm-ip>:3000`**, not `http://localhost:3000` (that points at the machine running the browser). Find the IP with `multipass list` or your cloud panel. Register the **same origin** in the GitHub OAuth app callback (e.g. `http://192.168.x.x:3000/api/auth/callback/github`). Optional: SSH port-forward `3000` to use `localhost` in the browser.

## Production deployment

- Use the same `Dockerfile`, `docker/build-worker.Dockerfile`, and `docker-compose.yml` (or equivalent). Deploy **`edge`**, **`app-api`**, **`marketing`**, and **`deployment-worker`** with production `.env` (or injected secrets).
- **`edge`** publishes port **3000** by default. Put TLS and public DNS in front of **`edge`**, or configure host-based routing via **`docker/edge-entry.sh`** and env (see **`.env.example`**).
- Migrations run on startup when `RUN_MIGRATIONS=1`. For zero-downtime deploys, consider running migrations in a separate step before rolling new app containers.
- Docker + Bun runtime is the supported production path. Single-file executable builds are optional and must be revalidated before relying on them.

### Hetzner Ubuntu VPS with Nginx

Full split-domain steps (DNS, env, OAuth callback URL, rebuild with **`VITE_PUBLIC_*`**, proxy headers): **[docs/SPLIT_DOMAIN.md](./SPLIT_DOMAIN.md)**.

Run Docker Compose on the VPS and proxy public DNS (`deployher.com`, `dash.deployher.com`, `api.deployher.com`, preview `*.deployher.com`) to **`deployher-edge`** on port **3000**, or terminate TLS on the proxy and forward HTTP to **`edge`**. Use **`DEPLOYHER_EDGE_USE_PATH_ROUTING=0`** and the **`DEPLOYHER_*`** host env vars when routing by **Host** (see **`docs/DEPLOYMENT.md`**).

- `deployher.com` → landing / marketing (static **Astro** via **`marketing`**).
- `dash.deployher.com` → authenticated app (SSR). Client `fetch` calls go to **`api.`** when **`VITE_PUBLIC_API_ORIGIN`** is set at build time.
- `api.deployher.com` → **`app-api`** (Better Auth + API). Set **`BETTER_AUTH_URL=https://api…`**.
- `*.deployher.com` → deployment previews; edge must match preview subdomains to **`app-api`** before any catch-all to SSR.

Nginx must preserve the incoming `Host` header because Bun uses it to distinguish dashboard/API hosts from deployment preview hosts. Also forward `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`.

Disable buffering and use long timeouts for long-lived paths:

- `/d/*`
- `/preview/*`
- `/deployments/*/log/stream`
- `/deployments/*/runtime-log/stream`
- server preview traffic proxied through the preview runner

> [!IMPORTANT]
> In production, set `PROD_PROTOCOL` and `PROD_DOMAIN` (and optionally `BETTER_AUTH_URL`) to your public app URL (HTTPS). GitHub OAuth callback URL must be `https://<your-domain>/api/auth/callback/github`. Do not rely on default or dev values for auth or OAuth redirects.
