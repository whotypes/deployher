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

# Pdploy

Pdploy is a self-hosted deployment platform for web applications. It uses [bun], [drizzle], [postgres], [redis], [garage], and [docker]. On pdploy, you can connect GitHub repos, trigger builds, and serve web applications via subdomain or path.

## How

Deployments are processed by a dedicated deployment worker service (`deployment-worker`), not by the app process. The worker has Docker socket access and the full build toolchain, while the app container stays focused on API + web traffic.
The worker talks to the host Docker daemon through `dockerode` over `/var/run/docker.sock`.
The queue uses Redis Streams consumer groups, so multiple worker replicas can process deployments concurrently.

> [!WARNING]
> The socket-mounted worker path is a trusted-local development model. Keep `TRUSTED_LOCAL_DOCKER=1` for your own machine or an explicitly trusted lab. For untrusted tenants, put previews behind an isolated runner/supervisor and leave `RUNNER_PREVIEW_ENABLED=0` until that runner is available.

The Compose stack includes:

- `app`: HTTP API/web server
- `deployment-worker`: Redis consumer that runs builds via Docker
- `pdploy-node-build-image:latest`: Node build image with `pnpm` pre-activated via Corepack
- `pdploy-bun-build-image:latest`: Bun build image with Python and native build deps for packages like `canvas`

Scale workers:

```bash
docker compose up -d --scale deployment-worker=4
```

## Runtime image artifacts

Each deployment emits a container image tarball (`runtime-image.tar`, Docker save format) under the deployment artifact prefix in object storage. Static deployments also emit a `preview-manifest.json` so previews can resolve assets without repeated object-store existence checks. The image tarball is compatible with `docker load`, containerd, and other runtimes.

## Quick start

1. Install [Docker][docker-get] (and [Docker Compose][compose-install] if not bundled).
2. Clone, copy env, bootstrap infra, then either run the app in Docker or on the host with Bun.

Full steps, env vars, and two workflows (with and without Bun) are in **[docs/SETUP.md](docs/SETUP.md)**.

> [!TIP]
> You do not need Bun if you run the full stack in Docker. Use the "Full stack in Docker" workflow in the setup doc.

**Without Bun (full stack in Docker):**

```bash
cp .env.example .env
./infra/dev.sh start
docker compose up -d --build
```

**With Bun (infra in Docker, app on host with hot reload):**

```bash
cp .env.example .env
./infra/dev.sh start
docker compose stop app deployment-worker
# terminal 1
bun run dev
# terminal 2
bun run start:worker
```

Docker app: `http://localhost:3000`. Host Bun dev: `http://localhost:3001`. If OrbStack or another service already owns `3000`, `docker compose stop app deployment-worker` only frees the Compose app ports; it does not stop unrelated listeners already bound on the host. Health: `GET /health` (JSON or HTML). Deployment previews: subdomain `<id>.<DEV_DOMAIN>:<PORT>` or path `/d/<id>/...`. See [docs/SETUP.md](docs/SETUP.md) for details.

Static preview assets are redirected to object storage or a configured CDN base URL when possible. Server previews remain feature-gated behind `RUNNER_PREVIEW_ENABLED=1` plus a configured `RUNNER_URL`.

## Example projects

Ready-to-use sample repos live in `/examples`:

- `examples/node-npm-static`
- `examples/node-pnpm-static`
- `examples/node-bun-static`
- `examples/node-yarn-static`
- `examples/python-mkdocs-pip`
- `examples/python-pdploy-pip`

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
| `infra/dev.sh` | Dev infra script (start/stop/reset Postgres, Redis, Garage) |
| `docker-compose.yml` | App, deployment-worker, Postgres, Redis, Garage |
| `Dockerfile` | Multi-stage build for the app image |
| `docker/build-worker.Dockerfile` | Docker image for the standalone deployment worker |

## Build a single-file executable

Bun can compile the server into one binary. Client assets must be built first and are embedded.

**Current platform:**

```bash
bun run build:exe
```

Output: `dist/pdploy`

**Linux (e.g. for a server):**

```bash
bun run build:exe:linux-x64
bun run build:exe:linux-arm64
```

**Run the binary:**

```bash
chmod +x dist/pdploy
SKIP_CLIENT_BUILD=1 ./dist/pdploy
```

> [!NOTE]
> Build workers run via `bun run start:worker` (or the `deployment-worker` Compose service). `src/workers/buildWorker.ts` contains the shared worker loop used by that entrypoint.

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)**: Prerequisites, bootstrap, both dev workflows (Docker-only and Bun on host), env vars, ports, infra script reference, health endpoint, preview URL formats, build pipeline and workers, database and migrations, npm scripts, production deployment.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: Monorepo workspace/app roots, runtime image modes, Dockerfile-first server deploys, Nexus-aware Docker build args, and security notes.
