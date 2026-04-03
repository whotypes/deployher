# Deployment Recipes

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
- `platform`: always use pdploy's generated runtime image and stored `runtimeConfig`
- `dockerfile`: always build from the repo Dockerfile and fail if it is missing

`runtimeConfig.command` only controls the final image when `runtimeImageMode="platform"`. If the final image comes from your Dockerfile, that image's `CMD` wins.

## Dockerfile-first server builds

Set `skipHostStrategyBuild=true` when you want Railway-style image builds straight from your repository Dockerfile.

- pdploy skips host strategy detection and host build steps
- pdploy still prepares build env files before `docker build`
- `runtimeContainerPort` tells previews which port to probe
- `dockerfilePath` is relative to the repo root
- `dockerBuildTarget` maps to `docker build --target`

## Nexus and private base images

Runtime `docker build` forwards a small allowlist of build args from the worker environment.

- `NEXUS_REGISTRY`

If your Dockerfile depends on private base images, make sure the worker host has already run `docker login` for that registry.

## Security

User-controlled Dockerfiles execute arbitrary `RUN` steps on the worker host's Docker daemon. Treat Dockerfile builds as untrusted code execution and isolate workers accordingly.
