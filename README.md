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

Pdploy is a self-hosted deployment platform for web applications. It uses [bun], [drizzle], [postgres], [redis], [garage] (S3-compatible storage), and [docker]. You connect GitHub repos, trigger builds, and serve previews via subdomain or path.

## Build toolchains in Docker

The app container includes the build tools required by the deployment worker:

- Bun
- Node.js + npm + pnpm + yarn
- Python 3 + pip
- uv
- Poetry
- `unzip`, `curl`, and `git`

This lets Node and Python deployment strategies run directly inside the app container.

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
bun run migrate && bun run seed && bun run dev
```

App: `http://localhost:3000`. Health: `GET /health` (JSON or HTML). Deployment previews: subdomain `<id>.<DEV_DOMAIN>:<PORT>` or path `/d/<id>/...`. See [docs/SETUP.md](docs/SETUP.md) for details.

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
| Queue | [redis] (BullMQ-style job dequeue) |
| Storage | [garage] (S3-compatible); build artifacts and preview assets |
| Infra | [docker] and [docker-compose] |

## Repository layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | HTTP server entrypoint |
| `src/router.ts` | Route table and request handling |
| `src/routes/` | API and page handlers (projects, deployments, GitHub, account) |
| `src/workers/buildWorker.ts` | Build job processor (clone, install, build, upload) |
| `src/ui/` | React pages and client-side entrypoints |
| `src/db/` | Drizzle schema and DB client |
| `auth.ts` | Better Auth config |
| `drizzle/` | Migrations |
| `infra/dev.sh` | Dev infra script (start/stop/reset Postgres, Redis, Garage) |
| `docker-compose.yml` | App, Postgres, Redis, Garage |
| `Dockerfile` | Multi-stage build; release target runs app + build worker |

## Build a single-file executable

Bun can compile the server and build worker into one binary. Client assets must be built first and are embedded.

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
> The executable embeds `src/index.ts`, `src/workers/buildWorker.ts`, and prebuilt client assets from `dist/client`, so `/assets/*` is served without extra files on disk.

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)**: Prerequisites, bootstrap, both dev workflows (Docker-only and Bun on host), env vars, ports, infra script reference, health endpoint, preview URL formats, build pipeline and workers, database and migrations, npm scripts, production deployment.
