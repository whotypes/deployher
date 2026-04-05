import path from "node:path";

export const getRepoRoot = (): string => path.resolve(import.meta.dir, "../..");

export const getInfraDir = (repoRoot: string): string => path.join(repoRoot, "infra");

export const getComposeFile = (repoRoot: string): string =>
  path.join(repoRoot, "docker-compose.yml");

export const defaultGarageEnvFile = (infraDir: string): string =>
  path.join(infraDir, ".garage.env");

export const defaultBackendEnvFile = (repoRoot: string): string =>
  path.join(repoRoot, ".env");
