/**
 * Headless E2E: enqueue a deployment (no UI).
 *
 * Built-in example (creates a throwaway project):
 *   bun run e2e:queue-example
 *   bun queue-example-deployment.ts node-npm-static
 *
 * Existing project (same DB row as the UI project):
 *   bun queue-example-deployment.ts --project 391abd85-486c-412f-8bdb-2da41b8efc27
 *
 * Requires the same env as the app/worker (see .env). From the host while Compose is up, ensure
 * DATABASE_URL / REDIS_URL reach postgres and redis (often localhost URLs on the host).
 */
import "./src/env/bootstrap";
import { eq } from "drizzle-orm";
import { db } from "./src/db/db";
import * as schema from "./src/db/schema";
import { resolveLocalExample, toExampleRepoUrl } from "./src/examples";
import { enqueueDeployment } from "./src/queue";
import { generateShortId } from "./src/utils/shortId";

const POLL_MS = 2000;
const MAX_WAIT_MS = 15 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parsed =
  | { mode: "example"; name: string }
  | { mode: "project"; projectId: string };

const parseArgs = (argv: string[]): Parsed => {
  const rest = argv.slice(2).filter((a) => a.length > 0);
  if (rest[0] === "--project" || rest[0] === "-p") {
    const id = rest[1]?.trim() ?? "";
    if (!UUID_RE.test(id)) {
      console.error(`Invalid --project UUID: ${id || "(missing)"}`);
      process.exit(1);
    }
    return { mode: "project", projectId: id };
  }
  const first = rest[0]?.trim() ?? "";
  if (UUID_RE.test(first)) {
    return { mode: "project", projectId: first };
  }
  return { mode: "example", name: first.length > 0 ? first : "node-npm-static" };
};

const waitForTerminal = async (deploymentId: string): Promise<"success" | "failed" | "timeout"> => {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const [row] = await db
      .select({ status: schema.deployments.status })
      .from(schema.deployments)
      .where(eq(schema.deployments.id, deploymentId))
      .limit(1);

    const status = row?.status;
    if (status === "success") return "success";
    if (status === "failed") return "failed";

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return "timeout";
};

const parsed = parseArgs(process.argv);

let projectId: string;
let deploymentId: string;
let meta: Record<string, string> = {};

if (parsed.mode === "project") {
  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      repoUrl: schema.projects.repoUrl,
      previewMode: schema.projects.previewMode,
      serverPreviewTarget: schema.projects.serverPreviewTarget
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, parsed.projectId))
    .limit(1);

  if (!project) {
    console.error(`Project not found: ${parsed.projectId}`);
    process.exit(1);
  }

  projectId = project.id;
  const shortId = generateShortId();
  const artifactPrefix = `artifacts/${project.id}/${Date.now()}`;

  const [deployment] = await db
    .insert(schema.deployments)
    .values({
      projectId: project.id,
      shortId,
      artifactPrefix,
      status: "queued",
      buildPreviewMode: project.previewMode,
      buildServerPreviewTarget: project.serverPreviewTarget
    })
    .returning({ id: schema.deployments.id });

  if (!deployment) {
    console.error("Failed to create deployment");
    process.exit(1);
  }

  deploymentId = deployment.id;

  await db
    .update(schema.projects)
    .set({ currentDeploymentId: deployment.id, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  await enqueueDeployment(deployment.id, {});

  meta = {
    projectName: project.name,
    repoUrl: project.repoUrl
  };
} else {
  const resolved = await resolveLocalExample(parsed.name);
  if (!resolved) {
    console.error(`Unknown or invalid example: ${parsed.name}`);
    process.exit(1);
  }

  const [project] = await db
    .insert(schema.projects)
    .values({
      name: `e2e ${parsed.name}`,
      repoUrl: toExampleRepoUrl(parsed.name),
      branch: "main",
      projectRootDir: ".",
      previewMode: "auto",
      frameworkHint: "auto"
    })
    .returning({ id: schema.projects.id });

  if (!project) {
    console.error("Failed to create project");
    process.exit(1);
  }

  projectId = project.id;
  const shortId = generateShortId();
  const artifactPrefix = `artifacts/${project.id}/${Date.now()}`;

  const [deployment] = await db
    .insert(schema.deployments)
    .values({
      projectId: project.id,
      shortId,
      artifactPrefix,
      status: "queued",
      buildPreviewMode: "auto",
      buildServerPreviewTarget: "isolated-runner"
    })
    .returning({ id: schema.deployments.id });

  if (!deployment) {
    console.error("Failed to create deployment");
    process.exit(1);
  }

  deploymentId = deployment.id;

  await db
    .update(schema.projects)
    .set({ currentDeploymentId: deployment.id, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  await enqueueDeployment(deployment.id, {});

  meta = { example: parsed.name };
}

console.log(
  JSON.stringify(
    {
      ...meta,
      projectId,
      deploymentId,
      pollNote: "waiting for worker…"
    },
    null,
    2
  )
);

const outcome = await waitForTerminal(deploymentId);
if (outcome === "success") {
  console.log("result: success");
  process.exit(0);
}
if (outcome === "failed") {
  console.error("result: failed (see build log in app / storage)");
  process.exit(1);
}
console.error("Timed out waiting for deployment to finish");
process.exit(124);
