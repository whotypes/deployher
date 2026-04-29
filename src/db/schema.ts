import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex
} from "drizzle-orm/pg-core";

/**
 * Better Auth core schema (user, session, account, verification).
 * Table names are plural for drizzle adapter with usePlural: true.
 * See: https://www.better-auth.com/docs/adapters/drizzle
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user").$type<"user" | "operator">(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const deviceCodes = pgTable(
  "device_codes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope")
  },
  (table) => [
    index("device_codes_device_code_idx").on(table.deviceCode),
    uniqueIndex("device_codes_user_code_idx").on(table.userCode)
  ]
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch").notNull(),
  workspaceRootDir: text("workspace_root_dir").notNull().default("."),
  projectRootDir: text("project_root_dir").notNull().default("."),
  frameworkHint: text("framework_hint")
    .notNull()
    .default("auto")
    .$type<"auto" | "nextjs" | "node" | "python" | "static">(),
  previewMode: text("preview_mode")
    .notNull()
    .default("auto")
    .$type<"auto" | "static" | "server">(),
  serverPreviewTarget: text("server_preview_target")
    .notNull()
    .default("isolated-runner")
    .$type<"isolated-runner">(),
  runtimeImageMode: text("runtime_image_mode")
    .notNull()
    .default("auto")
    .$type<"auto" | "platform" | "dockerfile">(),
  dockerfilePath: text("dockerfile_path"),
  dockerBuildTarget: text("docker_build_target"),
  skipHostStrategyBuild: boolean("skip_host_strategy_build").notNull().default(false),
  runtimeContainerPort: integer("runtime_container_port").notNull().default(3000),
  installCommand: text("install_command"),
  buildCommand: text("build_command"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  currentDeploymentId: uuid("current_deployment_id"),
  siteIconUrl: text("site_icon_url"),
  siteOgImageUrl: text("site_og_image_url"),
  siteMetaFetchedAt: timestamp("site_meta_fetched_at", { withTimezone: true }),
  siteMetaError: text("site_meta_error")
});

/** Tenant isolation: API checks project ownership before reading/writing rows (no DB-level RLS in this app). */
export const projectEnvs = pgTable(
  "project_envs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("project_envs_project_id_idx").on(table.projectId),
    uniqueIndex("project_envs_project_id_key_idx").on(table.projectId, table.key)
  ]
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  shortId: text("short_id").notNull().unique(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  artifactPrefix: text("artifact_prefix").notNull(),
  buildStrategy: text("build_strategy")
    .notNull()
    .default("unknown")
    .$type<"node" | "python" | "static" | "unknown">(),
  serveStrategy: text("serve_strategy")
    .notNull()
    .default("static")
    .$type<"static" | "server">(),
  status: text("status").notNull().default("queued").$type<"queued" | "building" | "success" | "failed">(),
  buildLogKey: text("build_log_key"),
  runtimeImageRef: text("runtime_image_ref"),
  runtimeImagePullRef: text("runtime_image_pull_ref"),
  runtimeImageArtifactKey: text("runtime_image_artifact_key"),
  runtimeConfig: jsonb("runtime_config").$type<{
    workingDir?: string;
    port?: number;
    command?: string[];
    framework?: "nextjs" | "node";
  } | null>(),
  previewResolution: jsonb("preview_resolution").$type<{
    code:
      | "project_forced_static"
      | "project_forced_server"
      | "next_dot_next"
      | "static_index_html"
      | "python_static_output"
      | "dockerfile_only_server";
    detail?: string;
  } | null>(),
  buildPreviewMode: text("build_preview_mode").$type<"auto" | "static" | "server" | null>(),
  buildServerPreviewTarget: text("build_server_preview_target").$type<"isolated-runner" | null>(),
  previewManifestKey: text("preview_manifest_key"),
  previewUrl: text("preview_url"),
  workerId: text("worker_id"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  runAttempt: integer("run_attempt").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
});

export const deploymentEvents = pgTable(
  "deployment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status"),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("deployment_events_deployment_id_created_at_idx").on(table.deploymentId, table.createdAt)
  ]
);

export const previewTrafficEvents = pgTable(
  "preview_traffic_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    clientIp: text("client_ip").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code").notNull(),
    pathBucket: text("path_bucket"),
    path: text("path"),
    durationMs: integer("duration_ms")
  },
  (table) => [
    index("preview_traffic_events_project_id_occurred_at_idx").on(table.projectId, table.occurredAt),
    index("preview_traffic_events_deployment_id_occurred_at_idx").on(table.deploymentId, table.occurredAt)
  ]
);

export const projectAlertDestinations = pgTable(
  "project_alert_destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    webhookUrl: text("webhook_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("project_alert_destinations_project_id_idx").on(table.projectId)]
);

export const projectAlertRules = pgTable(
  "project_alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => projectAlertDestinations.id, { onDelete: "cascade" }),
    ruleType: text("rule_type")
      .notNull()
      .$type<"consecutive_failures" | "queue_stall">(),
    threshold: integer("threshold").notNull(),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(3600),
    enabled: boolean("enabled").notNull().default(true),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("project_alert_rules_project_id_idx").on(table.projectId)]
);

export const projectAlertDeliveries = pgTable(
  "project_alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => projectAlertRules.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    httpStatus: integer("http_status"),
    errorMessage: text("error_message")
  },
  (table) => [index("project_alert_deliveries_rule_id_idx").on(table.ruleId)]
);
