/**
 * Variable names referenced as ${VAR} or ${VAR:-default} in docker-compose.yml.
 * Keep in sync with docker-compose.yml — src/env/composeInterpolationKeys.test.ts enforces that.
 */
export const COMPOSE_INTERPOLATION_KEYS = [
  "BUILD_WORKERS",
  "NEXUS_REGISTRY",
  "PREVIEW_MEMORY_BYTES",
  "PREVIEW_NANO_CPUS",
  "PREVIEW_RUNTIME_DOCKER_DAEMON_REGISTRY",
  "PREVIEW_RUNTIME_DOCKER_REPO",
  "PREVIEW_RUNTIME_IMAGE_NAME",
  "PREVIEW_RUNNER_IMAGE_GC_INTERVAL_MS",
  "PREVIEW_RUNNER_IMAGE_MAX_AGE_MS",
  "PREVIEW_TTL_MS",
  "RUNNER_SHARED_SECRET"
] as const;

export type ComposeInterpolationKey = (typeof COMPOSE_INTERPOLATION_KEYS)[number];
