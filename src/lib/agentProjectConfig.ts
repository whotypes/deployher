type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AgentProjectSourceType = "github" | "agent";

export type AgentModelConfig = {
  model_name: string;
  model: string;
  api_keys: string[];
  [key: string]: JsonValue | undefined;
};

export type AgentProjectConfigComponents = {
  agents?: Record<string, JsonValue> | null;
  channels?: Record<string, JsonValue> | null;
  gateway?: Record<string, JsonValue> | null;
  hooks?: Record<string, JsonValue> | null;
  model_list?: AgentModelConfig[] | null;
  tools?: Record<string, JsonValue> | null;
};

const CONTAINER_WORKSPACE_ROOT = "/root/.picoclaw/workspace";
const FORCED_GATEWAY_HOST = "0.0.0.0";
const FORCED_GATEWAY_PORT = 18790;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeJsonValue = (value: unknown): JsonValue | null => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const item of value) {
      const sanitized = sanitizeJsonValue(item);
      if (sanitized === null && item !== null) return null;
      items.push(sanitized);
    }
    return items;
  }
  if (isPlainObject(value)) {
    const output: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeJsonValue(entry);
      if (sanitized === null && entry !== null) return null;
      output[key] = sanitized;
    }
    return output;
  }
  return null;
};

const sanitizeSectionObject = (
  value: unknown,
  fieldName: string
): { ok: true; value: Record<string, JsonValue> } | { ok: false; error: string } => {
  if (!isPlainObject(value)) {
    return { ok: false, error: `${fieldName} must be a JSON object` };
  }
  const sanitized = sanitizeJsonValue(value);
  if (!sanitized || Array.isArray(sanitized) || !isPlainObject(sanitized)) {
    return { ok: false, error: `${fieldName} contains unsupported values` };
  }
  return { ok: true, value: sanitized };
};

const sanitizeModelList = (
  value: unknown,
  requireNonEmpty: boolean
): { ok: true; value: AgentModelConfig[] } | { ok: false; error: string } => {
  if (!Array.isArray(value)) {
    return { ok: false, error: "model_list must be a JSON array" };
  }

  const sanitized: AgentModelConfig[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) {
      return { ok: false, error: "model_list entries must be objects" };
    }
    const modelName = typeof item["model_name"] === "string" ? item["model_name"].trim() : "";
    const model = typeof item["model"] === "string" ? item["model"].trim() : "";
    if (!modelName || !model) {
      return { ok: false, error: "model_list entries require non-empty model_name and model" };
    }

    const rawApiKeys = item["api_keys"];
    let apiKeys: string[] = [];
    if (typeof rawApiKeys === "string") {
      const trimmed = rawApiKeys.trim();
      apiKeys = trimmed ? [trimmed] : [];
    } else if (Array.isArray(rawApiKeys)) {
      apiKeys = rawApiKeys
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
    } else if (rawApiKeys !== undefined) {
      return { ok: false, error: "model_list api_keys must be a string or string array" };
    }

    const rest: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(item)) {
      if (key === "model_name" || key === "model" || key === "api_keys") continue;
      const sanitizedEntry = sanitizeJsonValue(entry);
      if (sanitizedEntry === null && entry !== null) {
        return { ok: false, error: `model_list.${key} contains unsupported values` };
      }
      rest[key] = sanitizedEntry;
    }

    sanitized.push({
      ...rest,
      model_name: modelName,
      model,
      api_keys: apiKeys
    });
  }

  if (requireNonEmpty && sanitized.length === 0) {
    return { ok: false, error: "model_list must contain at least one model entry" };
  }

  return { ok: true, value: sanitized };
};

export const defaultAgentProjectConfigComponents = (): AgentProjectConfigComponents => ({
  agents: {
    defaults: {
      workspace: CONTAINER_WORKSPACE_ROOT,
      restrict_to_workspace: true,
      allow_read_outside_workspace: false,
      provider: "",
      model_name: "gpt-5.4",
      max_tokens: 32768,
      max_tool_iterations: 50
    }
  },
  model_list: [
    {
      model_name: "gpt-5.4",
      model: "openai/gpt-5.4",
      api_keys: ["sk-your-openai-key"]
    }
  ],
  gateway: {
    hot_reload: false,
    log_level: "warn"
  },
  hooks: {
    enabled: true,
    defaults: {
      observer_timeout_ms: 500,
      interceptor_timeout_ms: 5000,
      approval_timeout_ms: 60000
    }
  },
  tools: {
    filter_sensitive_data: true,
    filter_min_length: 8,
    web: {
      enabled: true,
      duckduckgo: {
        enabled: true,
        max_results: 5
      },
      prefer_native: true,
      fetch_limit_bytes: 10485760,
      format: "plaintext"
    },
    exec: {
      enabled: true,
      enable_deny_patterns: true,
      allow_remote: true,
      timeout_seconds: 60
    }
  }
});

export const sanitizeAgentProjectConfigComponents = (
  input: unknown,
  options: { requireModelList?: boolean } = {}
):
  | { ok: true; value: AgentProjectConfigComponents }
  | { ok: false; error: string } => {
  if (input == null) {
    return { ok: true, value: {} };
  }
  if (!isPlainObject(input)) {
    return { ok: false, error: "agentConfigComponents must be a JSON object" };
  }

  const allowedKeys = new Set([
    "agents",
    "channels",
    "gateway",
    "hooks",
    "model_list",
    "tools"
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unsupported agent config section: ${key}` };
    }
  }

  const output: AgentProjectConfigComponents = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    if (key === "model_list") {
      const parsed = sanitizeModelList(value, options.requireModelList ?? false);
      if (!parsed.ok) return parsed;
      output.model_list = parsed.value;
      continue;
    }

    const parsed = sanitizeSectionObject(value, key);
    if (!parsed.ok) return parsed;
    output[key as Exclude<keyof AgentProjectConfigComponents, "model_list">] = parsed.value;
  }

  if ((options.requireModelList ?? false) && (!output.model_list || output.model_list.length === 0)) {
    return { ok: false, error: "model_list must contain at least one model entry" };
  }

  return { ok: true, value: output };
};

const deepMerge = (base: JsonValue, override: JsonValue): JsonValue => {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const merged: Record<string, JsonValue> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    merged[key] =
      existing !== undefined ? deepMerge(existing, value) : value;
  }
  return merged;
};

export const buildAgentProjectConfigJson = (
  components: AgentProjectConfigComponents
): Record<string, JsonValue> => {
  const baseAgents = {
    defaults: {
      workspace: CONTAINER_WORKSPACE_ROOT,
      restrict_to_workspace: true,
      allow_read_outside_workspace: false,
      provider: "",
      model_name: "gpt-5.4",
      max_tokens: 32768,
      max_tool_iterations: 50
    }
  };

  const mergedAgents = isPlainObject(components.agents)
    ? (deepMerge(baseAgents as JsonValue, components.agents as JsonValue) as Record<string, JsonValue>)
    : baseAgents;
  const mergedAgentDefaults = isPlainObject(mergedAgents["defaults"]) ? mergedAgents["defaults"] : {};
  mergedAgents["defaults"] = {
    ...mergedAgentDefaults,
    workspace: CONTAINER_WORKSPACE_ROOT,
    restrict_to_workspace: true,
    allow_read_outside_workspace: false
  };

  const mergedGateway = isPlainObject(components.gateway)
    ? ({
        ...components.gateway,
        host: FORCED_GATEWAY_HOST,
        port: FORCED_GATEWAY_PORT
      } as Record<string, JsonValue>)
    : {
        host: FORCED_GATEWAY_HOST,
        port: FORCED_GATEWAY_PORT
      };

  const output: Record<string, JsonValue> = {
    version: 2,
    agents: mergedAgents,
    gateway: mergedGateway,
    model_list: (components.model_list ?? []) as unknown as JsonValue,
    workspace: {
      root: CONTAINER_WORKSPACE_ROOT
    }
  };

  if (components.channels) {
    output["channels"] = components.channels;
  }
  if (components.hooks) {
    output["hooks"] = components.hooks;
  }
  if (components.tools) {
    output["tools"] = components.tools;
  }

  return output;
};

export const stringifyAgentProjectConfig = (
  components: AgentProjectConfigComponents
): string => `${JSON.stringify(buildAgentProjectConfigJson(components), null, 2)}\n`;
