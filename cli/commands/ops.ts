import type { Command } from "commander";
import fs from "node:fs/promises";
import pc from "picocolors";
import type { CliContext } from "../types";
import { assertBackendEnvExists, runBunScript } from "../lib/bun-docker";
import { ensureGarageBucketByName, ensureGarageKey, grantGarageKeyToBucket } from "../lib/garage";
import { applyEnvPatchFile, applyEnvPatchToContent, parseEnvKeys, type EnvPatchOperation } from "../lib/env-file";
import { ensureInfraStack, restartServices } from "../lib/stack";
import {
  defaultServicesForEnvKeys,
  inferOpsEnvironment,
  operationKeys,
  parseOpsEnvironment,
  parseServiceList,
  summarizeEnvDiffs,
  type OpsEnvironment,
} from "../lib/ops-plan";
import { createListr } from "../ui";

type OpsOptions = {
  env?: string;
  dryRun?: boolean;
  yes?: boolean;
  skipMigrate?: boolean;
  services?: string;
};

type OpsPlan = {
  environment: OpsEnvironment;
  envOps: EnvPatchOperation[];
  buckets: string[];
  runMigrations: boolean;
  services: string[];
};

const cancelIfNeeded = (value: unknown): void => {
  // Importing the type is not useful here because Clack returns symbols.
  if (typeof value === "symbol") process.exit(1);
};

const readEnvContent = async (ctx: CliContext): Promise<string> => {
  try {
    return await fs.readFile(ctx.backendEnvFile, "utf8");
  } catch {
    return "";
  }
};

const inferEnvironmentFromFile = (content: string): OpsEnvironment | null => {
  const parsed = parseEnvKeys(content);
  return inferOpsEnvironment(parsed.APP_ENV);
};

const printPlan = (plan: OpsPlan, diffLines: string[]): void => {
  console.log(pc.cyan("Planned deployher ops run"));
  console.log(`Environment: ${plan.environment}`);
  console.log(`Buckets: ${plan.buckets.length ? plan.buckets.join(", ") : "(none)"}`);
  console.log(`Env changes: ${diffLines.length ? "" : "(none)"}`);
  for (const line of diffLines) console.log(`  ${line}`);
  console.log(`Migrations: ${plan.runMigrations ? "yes" : "no"}`);
  console.log(`Services: ${plan.services.length ? plan.services.join(", ") : "(none)"}`);
};

const defaultStoragePlan = async (
  ctx: CliContext,
  opts: OpsOptions,
): Promise<OpsPlan> => {
  const content = await readEnvContent(ctx);
  const parsed = parseEnvKeys(content);
  const environment = parseOpsEnvironment(opts.env) ?? inferEnvironmentFromFile(content) ?? "local";
  const artifactBucket = (parsed.S3_BUCKET ?? ctx.garageBucketName).trim();
  const avatarBucket = (parsed.S3_AVATAR_BUCKET ?? ctx.garageAvatarBucketName).trim();
  const envOps: EnvPatchOperation[] = [];

  if (!parsed.S3_BUCKET && artifactBucket) envOps.push({ type: "set", key: "S3_BUCKET", value: artifactBucket });
  if (!parsed.S3_AVATAR_BUCKET && avatarBucket) {
    envOps.push({ type: "set", key: "S3_AVATAR_BUCKET", value: avatarBucket });
  }

  const changedKeys = operationKeys(envOps);
  const services = parseServiceList(opts.services);
  return {
    environment,
    envOps,
    buckets: [...new Set([artifactBucket, avatarBucket].filter(Boolean))],
    runMigrations: !opts.skipMigrate,
    services: services.length > 0 ? services : defaultServicesForEnvKeys(changedKeys),
  };
};

const promptEnvironment = async (
  initial: OpsEnvironment,
): Promise<OpsEnvironment> => {
  const { select, isCancel } = await import("@clack/prompts");
  const answer = await select<OpsEnvironment>({
    message: "Where is this operation running?",
    options: [
      { value: "local", label: "Local Docker" },
      { value: "production", label: "Production VPS/server" },
    ],
    initialValue: initial,
  });
  if (isCancel(answer)) process.exit(1);
  return answer;
};

const promptEnvOps = async (): Promise<EnvPatchOperation[]> => {
  const { select, text, isCancel } = await import("@clack/prompts");
  const ops: EnvPatchOperation[] = [];
  while (true) {
    const action = await select<"set" | "append" | "remove" | "done">({
      message: "Environment changes",
      options: [
        { value: "set", label: "Set or modify a key" },
        { value: "append", label: "Append to a key" },
        { value: "remove", label: "Remove a key" },
        { value: "done", label: ops.length ? "Done" : "No env changes" },
      ],
      initialValue: "done",
    });
    if (isCancel(action)) process.exit(1);
    if (action === "done") break;

    const key = await text({ message: "Env key", placeholder: "S3_AVATAR_BUCKET" });
    if (isCancel(key) || typeof key !== "string") process.exit(1);
    const cleanKey = key.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleanKey)) {
      throw new Error(`Invalid env key: ${cleanKey}`);
    }

    if (action === "remove") {
      ops.push({ type: "remove", key: cleanKey });
      continue;
    }

    const value = await text({ message: "Value" });
    if (isCancel(value) || typeof value !== "string") process.exit(1);
    if (action === "append") {
      const separator = await text({ message: "Separator", initialValue: " " });
      if (isCancel(separator) || typeof separator !== "string") process.exit(1);
      ops.push({ type: "append", key: cleanKey, value, separator });
    } else {
      ops.push({ type: "set", key: cleanKey, value });
    }
  }
  return ops;
};

const promptStoragePlan = async (ctx: CliContext, opts: OpsOptions): Promise<OpsPlan> => {
  const { text, multiselect, confirm, isCancel } = await import("@clack/prompts");
  const content = await readEnvContent(ctx);
  const parsed = parseEnvKeys(content);
  const environment = await promptEnvironment(parseOpsEnvironment(opts.env) ?? inferEnvironmentFromFile(content) ?? "local");
  const artifactBucket = await text({
    message: "Artifact bucket",
    initialValue: parsed.S3_BUCKET ?? ctx.garageBucketName,
  });
  if (isCancel(artifactBucket) || typeof artifactBucket !== "string") process.exit(1);
  const avatarBucket = await text({
    message: "Avatar bucket",
    initialValue: parsed.S3_AVATAR_BUCKET ?? ctx.garageAvatarBucketName,
  });
  if (isCancel(avatarBucket) || typeof avatarBucket !== "string") process.exit(1);

  const envOps = await promptEnvOps();
  if ((parsed.S3_BUCKET ?? "") !== artifactBucket.trim()) {
    envOps.unshift({ type: "set", key: "S3_BUCKET", value: artifactBucket.trim() });
  }
  if ((parsed.S3_AVATAR_BUCKET ?? "") !== avatarBucket.trim()) {
    envOps.unshift({ type: "set", key: "S3_AVATAR_BUCKET", value: avatarBucket.trim() });
  }

  const runMigrations = opts.skipMigrate
    ? false
    : await confirm({ message: "Run migrations before redeploy?", initialValue: true });
  cancelIfNeeded(runMigrations);

  const defaults = parseServiceList(opts.services);
  const serviceDefaults = defaults.length > 0 ? defaults : defaultServicesForEnvKeys(operationKeys(envOps));
  const services = await multiselect<string>({
    message: "Services to rebuild/restart",
    options: [
      { value: "node-build-image", label: "node-build-image" },
      { value: "bun-build-image", label: "bun-build-image" },
      { value: "app-api", label: "app-api" },
      { value: "marketing", label: "marketing" },
      { value: "edge", label: "edge" },
      { value: "deployment-worker", label: "deployment-worker" },
    ],
    initialValues: serviceDefaults,
    required: false,
  });
  if (isCancel(services)) process.exit(1);

  return {
    environment,
    envOps,
    buckets: [...new Set([artifactBucket.trim(), avatarBucket.trim()].filter(Boolean))],
    runMigrations: Boolean(runMigrations),
    services,
  };
};

const confirmPlan = async (plan: OpsPlan, dryRun: boolean, skipConfirm: boolean): Promise<void> => {
  if (dryRun) return;
  if (plan.environment !== "production" && skipConfirm) return;
  const { confirm, isCancel } = await import("@clack/prompts");
  const ok = await confirm({
    message:
      plan.environment === "production"
        ? "Apply this production plan on this server?"
        : "Apply this plan?",
    initialValue: plan.environment !== "production",
  });
  if (isCancel(ok) || !ok) process.exit(1);
};

const runStorageEnvDeploy = async (
  ctx: CliContext,
  opts: OpsOptions,
  interactive: boolean,
): Promise<void> => {
  const plan = interactive ? await promptStoragePlan(ctx, opts) : await defaultStoragePlan(ctx, opts);
  const currentEnv = await readEnvContent(ctx);
  const plannedPatch = applyEnvPatchToContent(currentEnv, plan.envOps);
  const diffLines = summarizeEnvDiffs(plannedPatch.diffs);
  printPlan(plan, diffLines);

  if (opts.dryRun) return;
  await assertBackendEnvExists(ctx.backendEnvFile);
  await confirmPlan(plan, false, Boolean(opts.yes) || ctx.yes || ctx.ci);

  const listr = createListr(ctx, [
    {
      title: "Infra stack",
      task: async (_, task) => {
        await ensureInfraStack(ctx, (m) => {
          task.output = m;
        });
      },
    },
    {
      title: "Garage buckets and grants",
      task: async (_, task) => {
        for (const bucket of plan.buckets) {
          await ensureGarageBucketByName(ctx, bucket, (m) => {
            task.output = m;
          });
        }
        await ensureGarageKey(ctx, (m) => {
          task.output = m;
        });
        for (const bucket of plan.buckets) {
          await grantGarageKeyToBucket(ctx, bucket, ctx.garageKeyName, (m) => {
            task.output = m;
          });
        }
      },
    },
    {
      title: "Update .env",
      skip: () => plan.envOps.length === 0,
      task: async (_, task) => {
        const diffs = await applyEnvPatchFile(ctx.backendEnvFile, plan.envOps);
        task.output = `${diffs.length} change(s) written`;
      },
    },
    {
      title: "Database migrations",
      skip: () => !plan.runMigrations,
      task: async () => {
        await runBunScript(ctx, "migrate.ts", {
          inheritStdio: ctx.logLevel === "verbose",
        });
      },
    },
    {
      title: "Rebuild/restart services",
      skip: () => plan.services.length === 0,
      task: async (_, task) => {
        await restartServices(ctx, plan.services, (m) => {
          task.output = m;
        });
      },
    },
  ]);
  await listr.run();

  if (ctx.logLevel !== "quiet") {
    console.log(pc.green("deployher ops complete."));
  }
};

const addSharedOptions = (cmd: Command): Command =>
  cmd
    .option("--env <local|production>", "operation environment")
    .option("--dry-run", "print the plan without writing files or running Docker")
    .option("--yes", "skip non-production confirmation prompts")
    .option("--skip-migrate", "do not run migrations before redeploy")
    .option("--services <list>", "comma-separated services to rebuild/restart");

const collectOpsOpts = (cmd: Command): OpsOptions => {
  const merged: Record<string, unknown> = {};
  let current: Command | null = cmd;
  while (current) {
    Object.assign(merged, current.opts());
    current = current.parent;
  }
  return merged as OpsOptions;
};

export const registerOps = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  const ops = program.command("ops").description("Guided DX operations for env, buckets, migrations, and redeploys");
  addSharedOptions(ops).action(async function (this: Command) {
    const { select, isCancel } = await import("@clack/prompts");
    const recipe = await select<"storage-env-deploy">({
      message: "Deployher operation",
      options: [{ value: "storage-env-deploy", label: "Storage, env, migrate, redeploy" }],
      initialValue: "storage-env-deploy",
    });
    if (isCancel(recipe)) process.exit(1);
    const ctx = getCtx(this);
    await runStorageEnvDeploy(ctx, collectOpsOpts(this), true);
  });

  addSharedOptions(
    ops
      .command("storage-env-deploy")
      .description("Ensure storage buckets/env, optionally migrate, then redeploy affected services"),
  ).action(async function (this: Command) {
    const ctx = getCtx(this);
    const opts = collectOpsOpts(this);
    const interactive = !opts.dryRun && !ctx.ci;
    await runStorageEnvDeploy(ctx, opts, interactive);
  });
};

