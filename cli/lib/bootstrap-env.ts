import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isCancel, select, text } from "@clack/prompts";
import { readEnvValue, upsertEnvValue } from "./env-file";

export type BootstrapProfile = "production" | "development";

export type RoutingMode = "path" | "host";

export const routingModeFromPathRoutingEnv = (value: string | undefined): RoutingMode | null => {
  const t = (value ?? "").trim().toLowerCase();
  if (t === "0" || t === "false") return "host";
  if (t === "1" || t === "true") return "path";
  return null;
};

export type PrepareBootstrapEnvOptions = {
  backendEnvFile: string;
  envExamplePath: string;
  profile: BootstrapProfile;
  dryRun: boolean;
  interactive: boolean;
};

export type PrepareBootstrapEnvResult = {
  keysUpdated: string[];
  nextSteps: string[];
};

const SECRET_KEY_RE =
  /(SECRET|PASSWORD|TOKEN|KEY|CLIENT_SECRET|ACCESS_KEY|SIGNING)/i;

export const normalizeDomainForBootstrap = (raw: string): string => {
  const t = raw.trim();
  if (!t) return "";
  const noProto = t.replace(/^https?:\/\//i, "");
  const host = noProto.split("/")[0] ?? "";
  return host.replace(/:\d+$/, "").trim();
};

export const envKeyLooksSensitive = (key: string): boolean => {
  if (key === "GITHUB_CLIENT_ID") return false;
  return SECRET_KEY_RE.test(key);
};

export const maskEnvValueForDisplay = (key: string, value: string): string => {
  if (!value) return value;
  if (envKeyLooksSensitive(key)) return "(set)";
  return value;
};

const readFileUtf8 = async (p: string): Promise<string | null> => {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
};

export const ensureEnvFileFromExample = async (
  backendEnvFile: string,
  envExamplePath: string,
): Promise<void> => {
  try {
    await fs.access(backendEnvFile);
    return;
  } catch {
    /* missing */
  }
  const example = await readFileUtf8(envExamplePath);
  if (!example) {
    throw new Error(`Missing ${backendEnvFile} and could not read ${envExamplePath}`);
  }
  await fs.writeFile(backendEnvFile, example, "utf8");
};

const genBase64 = (bytes: number): string => randomBytes(bytes).toString("base64");

const genPassword = (): string => {
  const raw = randomBytes(18).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
  const s = raw.length >= 12 ? raw.slice(0, 24) : `${raw}${randomBytes(8).toString("hex")}`;
  return s.slice(0, 32);
};

const requireNonInteractive = (envKey: string, v: string | undefined): string => {
  const t = (v ?? "").trim();
  if (!t) {
    throw new Error(
      `${envKey} is required for non-interactive bootstrap (set in .env or drop -y/--yes).`,
    );
  }
  return t;
};

const promptText = async (opts: {
  envKey: string;
  message: string;
  placeholder?: string;
  initialValue?: string;
  interactive: boolean;
}): Promise<string> => {
  if (!opts.interactive) {
    return requireNonInteractive(opts.envKey, opts.initialValue);
  }
  const v = await text({
    message: opts.message,
    placeholder: opts.placeholder,
    initialValue: opts.initialValue,
  });
  if (isCancel(v) || typeof v !== "string") {
    process.exit(1);
  }
  return v.trim();
};

const promptRouting = async (interactive: boolean): Promise<RoutingMode> => {
  if (!interactive) {
    return "path";
  }
  const v = await select<RoutingMode>({
    message: "How should the edge route traffic?",
    options: [
      {
        value: "path",
        label: "Path routing (single public host:port, default for Docker)",
        hint: "DEPLOYHER_EDGE_USE_PATH_ROUTING=1",
      },
      {
        value: "host",
        label: "Host routing (apex, dash., api. — production DNS split)",
        hint: "DEPLOYHER_EDGE_USE_PATH_ROUTING=0",
      },
    ],
    initialValue: "path",
  });
  if (isCancel(v)) process.exit(1);
  return v;
};

const applyPatches = async (
  backendEnvFile: string,
  patches: Record<string, string>,
  dryRun: boolean,
): Promise<string[]> => {
  const keys = Object.keys(patches);
  if (dryRun) return keys;
  for (const [k, v] of Object.entries(patches)) {
    await upsertEnvValue(backendEnvFile, k, v);
  }
  return keys;
};

export const prepareBootstrapEnv = async (
  opts: PrepareBootstrapEnvOptions,
): Promise<PrepareBootstrapEnvResult> => {
  let raw: string;
  if (opts.dryRun) {
    raw =
      (await readFileUtf8(opts.backendEnvFile)) ??
      (await readFileUtf8(opts.envExamplePath)) ??
      "";
    if (!raw) {
      throw new Error(
        "Dry run needs an existing .env or readable .env.example to simulate changes.",
      );
    }
  } else {
    await ensureEnvFileFromExample(opts.backendEnvFile, opts.envExamplePath);
    raw = (await readFileUtf8(opts.backendEnvFile)) ?? "";
  }
  const patches: Record<string, string> = {};
  const nextSteps: string[] = [];

  const get = (key: string): string | undefined => readEnvValue(raw, key);
  const queue = (key: string, value: string): void => {
    const cur = (get(key) ?? "").trim();
    if (!cur) patches[key] = value;
  };

  if (!get("BETTER_AUTH_SECRET")) {
    queue("BETTER_AUTH_SECRET", genBase64(32));
  }

  if (!get("NEXUS_USER")) {
    queue("NEXUS_USER", "admin");
  }
  if (!get("NEXUS_REGISTRY")) {
    queue("NEXUS_REGISTRY", "127.0.0.1:8082");
  }
  if (!get("NEXUS_PASSWORD")) {
    queue("NEXUS_PASSWORD", genPassword());
  }

  if (!get("RUNNER_SHARED_SECRET")) {
    queue("RUNNER_SHARED_SECRET", genBase64(24));
  }

  if (!get("GITHUB_CLIENT_ID")?.trim()) {
    const id = await promptText({
      envKey: "GITHUB_CLIENT_ID",
      message: "GitHub OAuth App Client ID",
      interactive: opts.interactive,
    });
    patches.GITHUB_CLIENT_ID = id;
  }
  if (!get("GITHUB_CLIENT_SECRET")?.trim()) {
    const secret = await promptText({
      envKey: "GITHUB_CLIENT_SECRET",
      message: "GitHub OAuth App Client Secret",
      interactive: opts.interactive,
    });
    patches.GITHUB_CLIENT_SECRET = secret;
  }

  if (opts.profile === "production") {
    if (!get("PROD_PROTOCOL")) {
      queue("PROD_PROTOCOL", "https");
    }

    let domain = (get("PROD_DOMAIN") ?? "").trim();
    if (!domain) {
      const answered = await promptText({
        envKey: "PROD_DOMAIN",
        message: "Public apex domain (preview URLs use <id>.<domain>)",
        placeholder: "example.com",
        interactive: opts.interactive,
      });
      domain = normalizeDomainForBootstrap(answered);
      if (!domain) {
        throw new Error("PROD_DOMAIN is required for production bootstrap.");
      }
      patches.PROD_DOMAIN = domain;
    } else {
      domain = normalizeDomainForBootstrap(get("PROD_DOMAIN") ?? "");
    }

    const rawRouting = (get("DEPLOYHER_EDGE_USE_PATH_ROUTING") ?? "").trim();
    const fromEnv = routingModeFromPathRoutingEnv(rawRouting);
    const routing: RoutingMode = fromEnv ?? (await promptRouting(opts.interactive));
    if (!get("DEPLOYHER_EDGE_USE_PATH_ROUTING")) {
      patches.DEPLOYHER_EDGE_USE_PATH_ROUTING = routing === "host" ? "0" : "1";
    }

    if (routing === "host") {
      queue("DEPLOYHER_PRIMARY_DOMAIN", domain);
      queue("DEPLOYHER_DASH_HOSTNAME", `dash.${domain}`);
      queue("DEPLOYHER_API_HOSTNAME", `api.${domain}`);
      queue("DEPLOYHER_LANDING_HOSTNAMES", `${domain} www.${domain}`);
      queue("DEPLOYHER_COOKIE_DOMAIN", `.${domain}`);
      if (!get("BETTER_AUTH_URL")) {
        queue("BETTER_AUTH_URL", `https://api.${domain}`);
      }
      nextSteps.push(
        `Register GitHub OAuth callback: https://api.${domain}/api/auth/callback/github`,
      );
      nextSteps.push(
        "Rebuild app and marketing after setting VITE_PUBLIC_API_ORIGIN / VITE_PUBLIC_DASH_ORIGIN: docker compose build --no-cache app-api marketing",
      );
      nextSteps.push("See docs/SPLIT_DOMAIN.md for DNS (e.g. Spaceship), TLS proxy headers, and smoke tests.");
    } else {
      if (!get("BETTER_AUTH_URL")) {
        const suggested = `https://${domain}`;
        const authUrl = opts.interactive
          ? await text({
              message: "Public origin for Better Auth (where /api/auth is reachable)",
              initialValue: suggested,
            })
          : suggested;
        if (isCancel(authUrl) || typeof authUrl !== "string") {
          process.exit(1);
        }
        const trimmed = authUrl.trim();
        if (!trimmed) {
          throw new Error("BETTER_AUTH_URL is required for production bootstrap.");
        }
        patches.BETTER_AUTH_URL = trimmed;
      }
      nextSteps.push(
        `Register GitHub OAuth callback: ${(patches.BETTER_AUTH_URL ?? get("BETTER_AUTH_URL") ?? "").replace(/\/+$/, "")}/api/auth/callback/github`,
      );
    }

    if (!get("DEPLOYHER_PRIMARY_DOMAIN") && routing === "path") {
      queue("DEPLOYHER_PRIMARY_DOMAIN", domain);
    }
  }

  const keysUpdated = await applyPatches(opts.backendEnvFile, patches, opts.dryRun);

  if (opts.dryRun) {
    nextSteps.unshift("Dry run: no files written. Planned keys:");
    for (const k of keysUpdated) {
      const v = patches[k];
      if (v === undefined) continue;
      nextSteps.push(`  ${k}=${maskEnvValueForDisplay(k, v)}`);
    }
    return { keysUpdated, nextSteps };
  }

  if (opts.profile === "production") {
    nextSteps.push("Point DNS and TLS termination at this host (edge listens on port 3000 by default).");
    nextSteps.push("After DNS is live, confirm BETTER_AUTH_URL matches the URL users use to reach the API.");
  }

  return { keysUpdated, nextSteps };
};

export const envExamplePathForRepo = (repoRoot: string): string =>
  path.join(repoRoot, ".env.example");
