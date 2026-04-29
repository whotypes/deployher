[bun]: https://bun.sh/
[bun-docs]: https://bun.sh/docs
[bun-install]: https://bun.sh/docs/installation
[drizzle]: https://orm.drizzle.team/
[postgres]: https://www.postgresql.org/
[redis]: https://redis.io/
[garage]: https://garagehq.deuxfleurs.fr/
[docker]: https://www.docker.com/
[docker-get]: https://docs.docker.com/get-docker/
[docker-compose]: https://docs.docker.com/compose/
[compose-install]: https://docs.docker.com/compose/install/
[docker-desktop]: https://docs.docker.com/desktop/
[better-auth]: https://www.better-auth.com/
[github-oauth]: https://github.com/settings/developers

# Deployher

Deployher ([deployher.com](https://deployher.com)) is a self-hosted deployment platform for web applications. It uses [bun], [drizzle], [postgres], [redis], [garage], and [docker]. With Deployher, you can connect GitHub repos, trigger builds, and serve web applications via subdomain or path.

## How

Deployments are processed by a dedicated deployment worker service (`deployment-worker`), not by the app process. The worker has Docker socket access and the full build toolchain, while the app container stays focused on API + web traffic.
The worker talks to the host Docker daemon through `dockerode` over `/var/run/docker.sock`.
The queue uses Redis Streams consumer groups, so multiple worker replicas can process deployments concurrently.

> [!NOTE]
> Only the **deployment worker** and **preview-runner** mount the Docker socket. The app never talks to Docker; build cancellation is signaled over Redis and workers remove labeled build containers.

The Compose stack includes:

- `app`: HTTP API/web server
- `preview-runner`: loads `runtime-image.tar` from S3, runs bounded preview containers, proxies `RUNNER_URL` `/preview/<deploymentId>/…`
- `deployment-worker`: Redis consumer that runs builds via Docker
- `deployher-node-build-image:latest`: Node build image with `pnpm` pre-activated via Corepack
- `deployher-bun-build-image:latest`: Bun build image with Python and native build deps for packages like `canvas`

Scale workers:

```bash
docker compose up -d --scale deployment-worker=4
```

## Runtime image artifacts

Each deployment emits a container image tarball (`runtime-image.tar`, Docker save format) under the deployment artifact prefix in object storage. Static deployments also emit a `preview-manifest.json` so previews can resolve assets without repeated object-store existence checks. The image tarball is compatible with `docker load`, containerd, and other runtimes.

## Quick start

1. Install [Docker][docker-get] (and [Docker Compose][compose-install] if not bundled).
2. Clone, **`cp .env.example .env`**, and fill **GitHub OAuth**, **`BETTER_AUTH_SECRET`**, and **Nexus** (`NEXUS_*`). Defaults and most tunables live in **`config/default.toml`**; optional overrides in **`config/local.toml`** — see **[docs/SETUP.md](docs/SETUP.md)**.
3. Run **`bun run deployher start`** once (bootstrap: infra, migrations + seed via **`oven/bun` in Docker**, app + workers). That needs [Bun][bun-install] for the CLI process. For a **standalone** infra CLI with no Bun at runtime, run **`bun run build:cli`** then **`./dist/deployher-cli start`**. Put **`deployher`** on `PATH` with **`bun link --global`** (runs [`cli/`](cli/) via Bun) or **`bun run cli:link`** after a compile (symlinks **`dist/deployher-cli`** to **`~/.local/bin/deployher`**).
4. After that, choose how you run day-to-day:

**Full stack in Docker only (no Bun on the host for day-to-day):**

```bash
docker compose up -d --build
```

App: `http://localhost:3000`. Migrations run in the app container; **seed** is not re-run by Compose — use **`deployher seed`** (Docker) or `bun run seed` on the host when using hot-reload dev below.

**Infra in Docker, app + worker on the host (hot reload, requires Bun):**

```bash
docker compose stop app deployment-worker
# terminal 1
bun run dev
# terminal 2
bun run start:worker
# terminal 3 (server previews): bun run start:preview-runner — needs Docker + same S3 env as the app; set RUNNER_DOCKER_NETWORK to your compose default network (e.g. deployher_default) if the runner runs in a container
```

Docker app: `http://localhost:3000`. Host Bun API (default from `config/default.toml`): `http://localhost:3001`. For the **Vite SPA** in dev, run **`bun run dev:vite`** (default `http://localhost:5173`); it proxies `/api` and `/assets` to the Bun server (`VITE_DEV_API_URL` overrides the proxy target if needed). If OrbStack or another service already owns `3000`, `docker compose stop app deployment-worker` only frees the Compose app ports; it does not stop unrelated listeners already bound on the host. Health: `GET /health` (JSON or HTML). Deployment previews: subdomain `<id>.<DEV_DOMAIN>:<PORT>` or path `/d/<id>/...`. Full workflows, env reference, and troubleshooting: **[docs/SETUP.md](docs/SETUP.md)**.

Server previews are enabled when **`RUNNER_URL`** points at the preview-runner. Set **`RUNNER_PREVIEW_ENABLED=0`** to turn them off without removing `RUNNER_URL`. Match S3 (and optional registry) credentials on the runner. Optional **`RUNNER_SHARED_SECRET`** is sent as **`x-deployher-runner-secret`**.

## Example projects

Ready-to-use sample repos live in `/examples`:

- `examples/node-npm-static`
- `examples/node-pnpm-static`
- `examples/node-bun-static`
- `examples/bun-server-api`
- `examples/bun-server-client`
- `examples/node-yarn-static`
- `examples/python-mkdocs-pip`
- `examples/python-deployher-pip`

See `examples/README.md` for usage.

## Stack

| Layer | Technology |
|-------|-------------|
| Runtime | [bun][bun-docs] |
| HTTP / SSR | Bun.serve, React server-rendered pages |
| Auth | [Better Auth][better-auth] (session, GitHub OAuth) |
| Database | [postgres] with [drizzle] |
| Queue | [redis] (Streams + consumer groups) |
| Storage | [garage] (S3-compatible); build artifacts and preview assets |
| Infra | [docker] and [docker-compose] |

## Repository layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | HTTP server entrypoint |
| `src/router.ts` | Route table and request handling |
| `src/routes/` | API and page handlers (projects, deployments, GitHub, account) |
| `src/workers/buildWorker.ts` | Core build-job processor (clone, install, build, upload) |
| `src/workers/runBuildWorker.ts` | Standalone build worker entrypoint |
| `src/ui/` | React pages and client-side entrypoints |
| `src/db/` | Drizzle schema and DB client |
| `auth.ts` | Better Auth config |
| `drizzle/` | Migrations |
| [`cli/`](cli/) | Dev infra: Postgres, Redis, Garage, Nexus; migrate/seed via **`oven/bun` in Docker**; app + workers. Run with **`bun run deployher`**, **`./dist/deployher-cli`** after **`bun run build:cli`**, or **`deployher`** on `PATH`. |
| `config/default.toml` | Committed app defaults (Compose handles in-network service wiring separately) |
| `docker-compose.yml` | App, deployment-worker, builder images, Postgres, Redis, Garage, Nexus |
| `Dockerfile` | Multi-stage build for the app image |
| `docker/build-worker.Dockerfile` | Docker image for the standalone deployment worker |

## Build a single-file executable

Bun can compile the server into one binary. Client assets must be built first and are embedded.

**Current platform:**

```bash
bun run build:exe
```

Output: `dist/deployher`

**Linux (e.g. for a server):**

```bash
bun run build:exe:linux-x64
bun run build:exe:linux-arm64
```

**Run the binary:**

```bash
chmod +x dist/deployher
SKIP_CLIENT_BUILD=1 ./dist/deployher
```

**Infra-only CLI (Compose / migrate / seed helpers, no full app bundle):** **`bun run build:cli`** writes **`dist/deployher-cli`** (separate from **`build:exe`**, which produces **`dist/deployher`** for the full server). Use **`bun run cli:link`** to symlink **`dist/deployher-cli`** into **`~/.local/bin/deployher`**; it **prompts** before editing **`~/.zshrc`** to add **`PATH`**. **`bun run cli:link -- --yes`** skips the prompt (e.g. CI); **`CLI_LINK_NO_ZSHRC=1`** only creates the symlink.

> [!NOTE]
> Build workers run via `bun run start:worker` (or the `deployment-worker` Compose service). `src/workers/buildWorker.ts` contains the shared worker loop used by that entrypoint.

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)**: Prerequisites, bootstrap, **`deployher`** CLI (migrate/seed via **`oven/bun` in Docker**, no Bun on host), both dev workflows, env vars, ports, CLI reference, health endpoint, preview URL formats, build pipeline and workers, database and migrations, npm scripts, production deployment, **troubleshooting**.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: Monorepo workspace/app roots, runtime image modes, Dockerfile-first server deploys, Nexus-aware Docker build args, and security notes.
