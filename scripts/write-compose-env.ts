#!/usr/bin/env bun
/**
 * Prints a minimal .env template: Docker Compose ${VAR} substitutions only.
 * Secrets and app overrides: use .env (see .env.example) or config/local.toml.
 */
import { COMPOSE_INTERPOLATION_KEYS } from "../src/env/composeInterpolationKeys";

const lines = [
  "# Generated list of variables referenced as ${VAR} in docker-compose.yml.",
  "# Copy to .env and set values to override compose defaults, or leave unset to use ${VAR:-defaults} in YAML.",
  ""
];

for (const key of [...COMPOSE_INTERPOLATION_KEYS].sort()) {
  lines.push(`${key}=`);
}

process.stdout.write(`${lines.join("\n")}\n`);
