import type { CliContext } from "../types";
import type { NexusEnv } from "./env-file";
import { readNexusEnvFromFile } from "./env-file";
import { runCommand } from "./run";

const NEXUS_BASE = "http://127.0.0.1:8081";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const nexusFetch = async (
  method: string,
  apiPath: string,
  user: string,
  password: string,
  body?: string,
  contentType = "application/json",
): Promise<Response> => {
  const headers: Record<string, string> = {
    Authorization: "Basic " + Buffer.from(`${user}:${password}`).toString("base64"),
  };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = contentType;
  }
  return fetch(`${NEXUS_BASE}${apiPath}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
};

export const waitForNexus = async (
  ctx: CliContext,
  onLog: (m: string) => void,
): Promise<void> => {
  onLog("Waiting for Nexus...");
  for (let i = 0; i < 180; i++) {
    try {
      const res = await fetch(`${NEXUS_BASE}/service/rest/v1/status`);
      if (res.ok) {
        onLog("Nexus ready.");
        return;
      }
    } catch {
      /* not ready */
    }
    await sleep(2000);
  }
  onLog("Nexus failed to become healthy in time.");
  await runCommand(
    ["docker", "compose", "-f", ctx.composeFile, "--env-file", ctx.garageEnvFile, "logs", "--no-color", "--tail", "200", "nexus"],
    { cwd: ctx.repoRoot },
  );
  throw new Error("Nexus failed to become healthy in time.");
};

const bunEulaDisclaimerScript =
  'const input = await new Response(Bun.stdin.stream()).text(); const parsed = JSON.parse(input); process.stdout.write(typeof parsed.disclaimer === "string" ? parsed.disclaimer : "");';

const bunEulaPayloadScript =
  'const disclaimer = await new Response(Bun.stdin.stream()).text(); process.stdout.write(JSON.stringify({ accepted: true, disclaimer }));';

const pipeThroughBun = async (ctx: CliContext, script: string, input: string): Promise<string> => {
  const r = await runCommand(["docker", "run", "--rm", "-i", ctx.bunImage, "bun", "-e", script], {
    cwd: ctx.repoRoot,
    input,
  });
  if (!r.ok) {
    throw new Error(r.stderr.trim() || "bun eula helper failed");
  }
  return r.stdout;
};

export const loadNexusEnvOrSkip = async (ctx: CliContext): Promise<NexusEnv | null> =>
  readNexusEnvFromFile(ctx.backendEnvFile);

export const ensureNexusAdminPassword = async (
  ctx: CliContext,
  nexus: NexusEnv,
  onLog: (m: string) => void,
): Promise<void> => {
  if (nexus.password.length < 8) {
    throw new Error("NEXUS_PASSWORD must be at least 8 characters for Nexus bootstrap.");
  }

  const statusTry = await nexusFetch("GET", "/service/rest/v1/status", nexus.user, nexus.password);
  if (statusTry.ok) {
    onLog("Nexus admin credentials already valid.");
    return;
  }

  let initialPassword = "";
  for (let i = 0; i < 30; i++) {
    const r = await runCommand(
      ["docker", "exec", "nexus", "sh", "-lc", "cat /nexus-data/admin.password 2>/dev/null"],
      { cwd: ctx.repoRoot },
    );
    initialPassword = r.stdout.trim().replace(/\r/g, "");
    if (initialPassword) break;
    await sleep(2000);
  }

  if (!initialPassword) {
    throw new Error("Could not read Nexus initial admin password from /nexus-data/admin.password.");
  }

  onLog("Setting Nexus admin password from initial bootstrap password...");
  const changeRes = await fetch(
    `${NEXUS_BASE}/service/rest/v1/security/users/admin/change-password`,
    {
      method: "PUT",
      headers: {
        Authorization: "Basic " + Buffer.from(`admin:${initialPassword}`).toString("base64"),
        "Content-Type": "text/plain",
      },
      body: nexus.password,
    },
  );
  if (!changeRes.ok) {
    throw new Error("Failed to set Nexus admin password.");
  }
  onLog("Nexus admin password configured.");
};

export const ensureNexusEula = async (
  ctx: CliContext,
  nexus: NexusEnv,
  onLog: (m: string) => void,
): Promise<void> => {
  const eulaRes = await nexusFetch("GET", "/service/rest/v1/system/eula", nexus.user, nexus.password);
  const eulaText = await eulaRes.text();
  if (/\"accepted\"\s*:\s*true/.test(eulaText)) {
    onLog("Nexus EULA already accepted.");
    return;
  }

  const disclaimer = await pipeThroughBun(ctx, bunEulaDisclaimerScript, eulaText);
  if (!disclaimer) {
    throw new Error("Failed to read Nexus EULA disclaimer.");
  }

  onLog("Accepting Nexus Community Edition EULA...");
  const payload = await pipeThroughBun(ctx, bunEulaPayloadScript, disclaimer);
  const post = await nexusFetch("POST", "/service/rest/v1/system/eula", nexus.user, nexus.password, payload);
  if (!post.ok) {
    throw new Error(`Nexus EULA accept failed: ${post.status}`);
  }
  onLog("Nexus EULA accepted.");
};

export const ensureNexusDockerRealm = async (
  nexus: NexusEnv,
  onLog: (m: string) => void,
): Promise<void> => {
  const activeRes = await nexusFetch(
    "GET",
    "/service/rest/v1/security/realms/active",
    nexus.user,
    nexus.password,
  );
  const activeText = await activeRes.text();
  if (activeText.includes('"DockerToken"')) {
    onLog("Nexus Docker Bearer Token Realm already active.");
    return;
  }
  onLog("Activating Nexus Docker Bearer Token Realm...");
  const put = await nexusFetch(
    "PUT",
    "/service/rest/v1/security/realms/active",
    nexus.user,
    nexus.password,
    '["NexusAuthenticatingRealm","DockerToken"]',
  );
  if (!put.ok) {
    throw new Error("Failed to activate Docker realm");
  }
  onLog("Nexus Docker Bearer Token Realm activated.");
};

export const ensureNexusDockerRepo = async (
  nexus: NexusEnv,
  onLog: (m: string) => void,
): Promise<void> => {
  const reposRes = await nexusFetch("GET", "/service/rest/v1/repositories", nexus.user, nexus.password);
  const reposText = await reposRes.text();
  if (/\"name\"\s*:\s*\"docker-hosted\"/.test(reposText)) {
    onLog("Nexus docker-hosted repository already exists.");
    return;
  }
  onLog("Creating Nexus docker-hosted repository on port 8082...");
  const payload =
    '{"name":"docker-hosted","online":true,"storage":{"blobStoreName":"default","strictContentTypeValidation":true,"writePolicy":"ALLOW"},"docker":{"v1Enabled":false,"forceBasicAuth":true,"httpPort":8082}}';
  const post = await nexusFetch(
    "POST",
    "/service/rest/v1/repositories/docker/hosted",
    nexus.user,
    nexus.password,
    payload,
  );
  if (!post.ok) {
    throw new Error("Failed to create Nexus docker-hosted repository.");
  }
  onLog("Nexus docker-hosted repository created.");
};

export const ensureNexusReady = async (
  ctx: CliContext,
  onLog: (m: string) => void,
): Promise<void> => {
  const nexus = await loadNexusEnvOrSkip(ctx);
  if (!nexus) return;

  await waitForNexus(ctx, onLog);
  await ensureNexusAdminPassword(ctx, nexus, onLog);
  await ensureNexusEula(ctx, nexus, onLog);
  await ensureNexusDockerRealm(nexus, onLog);
  await ensureNexusDockerRepo(nexus, onLog);
};

export const ensureNexusLogin = async (
  ctx: CliContext,
  nexus: NexusEnv,
  onLog: (m: string) => void,
): Promise<void> => {
  onLog(`Logging in to Nexus registry ${nexus.registry}...`);
  const r = await runCommand(
    ["docker", "login", nexus.registry, "-u", nexus.user, "--password-stdin"],
    {
      cwd: ctx.repoRoot,
      input: nexus.password,
    },
  );
  if (r.ok) {
    onLog("Nexus login OK.");
  } else {
    onLog(
      `Nexus login failed. Deployment worker may not be able to pull images from ${nexus.registry}.`,
    );
  }
};

const SYNC_IMAGES = [
  "node:22-bookworm",
  "oven/bun:1",
  "python:3.12-bookworm",
  "nginx:alpine",
] as const;

export const syncNexusImages = async (
  ctx: CliContext,
  nexus: NexusEnv,
  onLog: (m: string) => void,
  options?: { strictPull?: boolean },
): Promise<void> => {
  onLog(`Syncing build images to Nexus ${nexus.registry}...`);

  for (const img of SYNC_IMAGES) {
    onLog(`Pushing ${img}...`);
    if (options?.strictPull) {
      const pull = await runCommand(["docker", "pull", img], { cwd: ctx.repoRoot });
      if (!pull.ok) {
        throw new Error(`docker pull ${img} failed: ${pull.stderr}`);
      }
    } else {
      await runCommand(["docker", "pull", img], { cwd: ctx.repoRoot });
    }
    const tag = await runCommand(["docker", "tag", img, `${nexus.registry}/${img}`], {
      cwd: ctx.repoRoot,
    });
    if (!tag.ok) {
      throw new Error(tag.stderr);
    }
    const push = await runCommand(["docker", "push", `${nexus.registry}/${img}`], {
      cwd: ctx.repoRoot,
    });
    if (!push.ok) {
      throw new Error(push.stderr);
    }
  }

  const nodeDf = `${ctx.repoRoot}/docker/node-builder.Dockerfile`;
  const bunDf = `${ctx.repoRoot}/docker/bun-builder.Dockerfile`;

  onLog("Building deployher-node-build-image...");
  const buildNode = await runCommand(
    [
      "docker",
      "build",
      "-f",
      nodeDf,
      "--build-arg",
      `NEXUS_REGISTRY=${nexus.registry}`,
      "-t",
      `${nexus.registry}/deployher-node-build-image:latest`,
      ctx.repoRoot,
    ],
    { cwd: ctx.repoRoot },
  );
  if (!buildNode.ok) {
    throw new Error(buildNode.stderr);
  }
  onLog("Pushing deployher-node-build-image...");
  const pushNode = await runCommand(
    ["docker", "push", `${nexus.registry}/deployher-node-build-image:latest`],
    { cwd: ctx.repoRoot },
  );
  if (!pushNode.ok) {
    throw new Error(pushNode.stderr);
  }

  onLog("Building deployher-bun-build-image...");
  const buildBun = await runCommand(
    [
      "docker",
      "build",
      "-f",
      bunDf,
      "--build-arg",
      `NEXUS_REGISTRY=${nexus.registry}`,
      "-t",
      `${nexus.registry}/deployher-bun-build-image:latest`,
      ctx.repoRoot,
    ],
    { cwd: ctx.repoRoot },
  );
  if (!buildBun.ok) {
    throw new Error(buildBun.stderr);
  }
  onLog("Pushing deployher-bun-build-image...");
  const pushBun = await runCommand(
    ["docker", "push", `${nexus.registry}/deployher-bun-build-image:latest`],
    { cwd: ctx.repoRoot },
  );
  if (!pushBun.ok) {
    throw new Error(pushBun.stderr);
  }

  onLog("Nexus images synced.");
};

export const ensureNexusLoginAndImages = async (
  ctx: CliContext,
  onLog: (m: string) => void,
): Promise<void> => {
  const nexus = await loadNexusEnvOrSkip(ctx);
  if (!nexus) return;
  await ensureNexusReady(ctx, onLog);
  await ensureNexusLogin(ctx, nexus, onLog);
  await syncNexusImages(ctx, nexus, onLog, { strictPull: false });
};
