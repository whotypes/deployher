# Deployment Recipes

## Deployher control plane UI (Vite + Bun)

The dashboard is a **Vite-built SPA** (`bun run build:client` → `dist/client`). The Bun process serves `index.html`, `/assets/*`, and JSON APIs only—it does not render React on the server. Docker images run `build:client` in the builder stage and copy `dist/client` into the runtime image (`SKIP_CLIENT_BUILD=1` at runtime).

## Workspace vs app roots

Use `workspaceRootDir` for lockfiles and installs, and `projectRootDir` for strategy detection and app builds.

- Monorepo example: `workspaceRootDir="."`, `projectRootDir="apps/web"`
- Single app repo: `workspaceRootDir="."`, `projectRootDir="."`

The workspace root must be the same as or an ancestor of the project root.

## Static vs server

Static previews still depend on a host build that produces on-disk assets such as `dist/index.html`.

- Static deployments can use `runtimeImageMode="auto"` or `runtimeImageMode="platform"`
- Dockerfile-only server builds are server-only
- `skipHostStrategyBuild=true` requires `previewMode="server"`

## Runtime image modes

- `auto`: use the configured repo Dockerfile when present, otherwise synthesize a platform runtime image
- `platform`: always use Deployher's generated runtime image and stored `runtimeConfig`
- `dockerfile`: always build from the repo Dockerfile and fail if it is missing

`runtimeConfig.command` only controls the final image when `runtimeImageMode="platform"`. If the final image comes from your Dockerfile, that image's `CMD` wins.

## Dockerfile-first server builds

Set `skipHostStrategyBuild=true` when you want Railway-style image builds straight from your repository Dockerfile.

- Deployher skips host strategy detection and host build steps
- Deployher still prepares build env files before `docker build`
- `runtimeContainerPort` tells previews which port to probe
- `dockerfilePath` is relative to the repo root
- `dockerBuildTarget` maps to `docker build --target`

## Next.js on Deployher

Deployher can run Next.js apps in both supported modes:

- **Server mode**: the Node strategy detects a Next.js app from `package.json`, `next.config.*`, `app/`, `pages/`, and a built `.next/` directory, then starts it with `next start`
- **Static mode**: if your project produces a root `index.html` (for example `out/index.html`), Deployher can serve it as a static site instead

When a Next.js deployment does not behave the way you expect, the most common issue is that the selected **project root** or **preview type** does not match the actual build output. Server previews need `.next/`. Static previews need a root `index.html`.

### Recommended environment variables

For single-instance apps, normal Next.js environment variable rules apply. For multi-instance or rolling deployments, these are the most important settings to document for users:

- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`**: set this to the same base64-encoded AES key on every instance of the same Next.js deployment. Without it, Server Actions can fail across instances with "Failed to find Server Action"-style errors.
- **`NEXT_PUBLIC_*`** variables: these are embedded at build time, not read dynamically at runtime. Change them by rebuilding the app.
- **Server-only env vars**: values without the `NEXT_PUBLIC_` prefix stay on the server and can be read at runtime by dynamically rendered code. In Deployher, keep these scoped to **Runtime** so they are injected into the running server container instead of the build step.

If you want explicit version-skew protection during rolling deploys, configure `deploymentId` in `next.config.*` from a stable deployment-specific environment variable, for example:

```js
module.exports = {
  deploymentId: process.env.DEPLOYMENT_VERSION,
}
```

This is optional for single-instance deployments, but recommended when old and new builds may be live at the same time.

### Reverse proxy and streaming

Deployher previews and production deployments are typically reached through a reverse proxy or load balancer. That matters for modern Next.js features:

- App Router streaming and Suspense work best when proxy buffering is disabled end-to-end
- The proxy must pass chunked responses through without waiting for the full response body
- Rate limiting, request-size limits, and malformed-request handling are better done at the proxy layer than in the Next.js process itself

If a streamed page appears to "hang" and then flush all at once, check the proxy and load balancer before debugging the app itself.

### Multi-instance caching and ISR

Deployher can run multiple replicas of the same app, but Next.js cache consistency is still the app's responsibility.

- A plain `next start` deployment stores ISR and other cache state locally by default
- Multiple instances without a shared cache can serve stale or inconsistent content
- `revalidateTag()` on one instance does not automatically invalidate caches on other instances unless the app is configured for shared cache/tag coordination

For horizontally scaled Next.js apps, recommend a shared cache handler and durable backing store. For single-instance Deployher installs with persistent disk, the default Next.js cache behavior is often good enough.

### Quick checks when a Next.js deploy fails

- Server preview selected, but no `.next/` exists after build: verify the project root, monorepo app path, and build command
- Static preview selected, but there is no root `index.html`: switch to Server or Auto-detect
- Environment variable changed but the browser still sees the old value: check whether it is a `NEXT_PUBLIC_*` variable that needs a rebuild
- Server Actions fail only in multi-instance setups: set a shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
- ISR or tag revalidation looks inconsistent across replicas: configure shared cache storage instead of relying on per-instance local disk

## Nexus and private base images

Runtime `docker build` forwards a small allowlist of build args from the worker environment.

- `NEXUS_REGISTRY`

If your Dockerfile depends on private base images, make sure the worker host has already run `docker login` for that registry.

## Preview runtime images (registry)

Server preview runtimes are **pushed to your Docker registry** (Nexus `docker-hosted` by default) as **`PREVIEW_RUNTIME_REGISTRY` / `PREVIEW_RUNTIME_DOCKER_REPO` / `PREVIEW_RUNTIME_IMAGE_NAME`**, tagged per deployment, then recorded on the deployment as **`runtime_image_pull_ref`** (`…@sha256:…`). The preview runner **`docker pull`s** that digest (with **`NEXUS_USER` / `NEXUS_PASSWORD`** on the worker and runner). **Legacy** deployments that only have **`runtime_image_artifact_key`** still use the S3 tarball + `docker load` path until redeployed.

Long-running or quiet registry operations use **`PREVIEW_RUNTIME_PUSH_INACTIVITY_TIMEOUT_MS`** (default `300000`) instead of the generic **`BUILD_COMMAND_INACTIVITY_TIMEOUT_MS`** (default `30000`) so large `docker push` operations are not interrupted just because the registry stops printing progress briefly.

After a successful server build, workers **publish** `deployher:preview:prewarm` on Redis and **POST** `RUNNER_URL/internal/prewarm` so runners can pull before the first browser hit. The runner periodically **prunes** old preview images using **`PREVIEW_RUNNER_IMAGE_GC_INTERVAL_MS`** and **`PREVIEW_RUNNER_IMAGE_MAX_AGE_MS`**.

## Security

> [!WARNING]
> User-controlled Dockerfiles execute arbitrary `RUN` steps on the worker host's Docker daemon. Treat Dockerfile builds as untrusted code execution and isolate workers accordingly.

## Build log retention (S3 / Garage)

Build logs and artifacts are stored under each deployment `artifactPrefix` (for example `{artifactPrefix}/build.log`) in your configured object store.

- **Lifecycle expiration**: Configure bucket or prefix lifecycle rules in Garage, MinIO, or AWS S3 so old `artifacts/` objects are deleted after N days. That is the supported way to cap storage without changing application code.
- **Deployher env (observability sampling)**: Optional tuning for preview traffic logging (not log shipping): `PREVIEW_TRAFFIC_SAMPLE_RATE` (0–1, default `0.02`), `OBSERVABILITY_TRUST_PROXY` (set `true` when a trusted reverse proxy sets `X-Forwarded-For`), `QUEUE_STALL_CHECK_INTERVAL_MS` (minimum 30000, default 60000).
