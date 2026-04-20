import { describe, expect, test } from "bun:test";
import {
  buildAgentProjectConfigJson,
  sanitizeAgentProjectConfigComponents
} from "./agentProjectConfig";

describe("sanitizeAgentProjectConfigComponents", () => {
  test("normalizes model_list api_keys to arrays", () => {
    const result = sanitizeAgentProjectConfigComponents({
      model_list: [
        {
          model_name: "gpt-5.4",
          model: "openai/gpt-5.4",
          api_keys: "sk-test"
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.model_list?.[0]?.api_keys).toEqual(["sk-test"]);
  });

  test("rejects unsupported sections", () => {
    const result = sanitizeAgentProjectConfigComponents({
      unsupported: {}
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Unsupported agent config section");
  });

  test("requires a non-empty model_list when requested", () => {
    const result = sanitizeAgentProjectConfigComponents(
      {
        gateway: { log_level: "warn" }
      },
      { requireModelList: true }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("model_list");
  });
});

describe("buildAgentProjectConfigJson", () => {
  test("forces workspace and gateway defaults while preserving extra gateway flags", () => {
    const payload = buildAgentProjectConfigJson({
      agents: {
        defaults: {
          workspace: "/tmp/override",
          restrict_to_workspace: false
        }
      },
      gateway: {
        log_level: "debug",
        hot_reload: true
      },
      model_list: [
        {
          model_name: "gpt-5.4",
          model: "openai/gpt-5.4",
          api_keys: ["sk-test"]
        }
      ]
    });

    expect(payload.workspace).toEqual({ root: "/root/.picoclaw/workspace" });
    expect(payload.gateway).toMatchObject({
      host: "0.0.0.0",
      port: 18790,
      log_level: "debug",
      hot_reload: true
    });
    expect(payload.agents).toMatchObject({
      defaults: {
        workspace: "/root/.picoclaw/workspace",
        restrict_to_workspace: true,
        allow_read_outside_workspace: false
      }
    });
  });
});
