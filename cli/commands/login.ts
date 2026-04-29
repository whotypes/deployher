import type { Command } from "commander";
import pc from "picocolors";

import { DEPLOYHER_CLI_CLIENT_ID } from "../../src/lib/cliAuthConstants";
import { writeManagedCliConfig, type ManagedCliConfig } from "../lib/api-config";
import { apiFetchJson } from "../lib/api-client";
import { openUrlInBrowser } from "../lib/open-url";

const normalizeApiBaseUrl = (raw: string): string => {
  const trimmed = raw.trim();
  const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
  return url.origin.replace(/\/+$/, "");
};

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

type DeviceTokenError = {
  error: string;
  error_description?: string;
};

type DeviceTokenSuccess = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const registerLogin = (program: Command): void => {
  program
    .command("login")
    .description("Sign in via browser (device flow) and store an API token for remote commands")
    .argument("[apiBaseUrl]", "Deployher origin (e.g. https://app.example.com or http://localhost:3000)")
    .option("--no-open", "do not open a browser automatically")
    .action(async function (this: Command, apiBaseArg?: string) {
      const opts = this.opts<{ noOpen?: boolean }>();
      const envUrl = (process.env.DEPLOYHER_API_URL ?? "").trim();
      const fromArg = apiBaseArg?.trim() ?? "";
      const rawBase = fromArg.length > 0 ? fromArg : envUrl;
      if (!rawBase) {
        throw new Error(
          "API base URL required. Pass it as an argument or set DEPLOYHER_API_URL in the environment."
        );
      }
      const apiBaseUrl = normalizeApiBaseUrl(rawBase);
      const deviceCodeUrl = new URL("/api/auth/device/code", `${apiBaseUrl}/`);
      const deviceTokenUrl = new URL("/api/auth/device/token", `${apiBaseUrl}/`);

      const codeRes = await fetch(deviceCodeUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: DEPLOYHER_CLI_CLIENT_ID })
      });
      const codeText = await codeRes.text();
      if (!codeRes.ok) {
        throw new Error(
          pc.red(`device/code failed (${String(codeRes.status)}): ${codeText.slice(0, 400)}`)
        );
      }
      let devicePayload: DeviceCodeResponse;
      try {
        devicePayload = JSON.parse(codeText) as DeviceCodeResponse;
      } catch {
        throw new Error(pc.red("device/code returned invalid JSON"));
      }

      console.log(pc.dim("Open this URL if the browser did not open:"));
      console.log(pc.cyan(devicePayload.verification_uri_complete));
      console.log(pc.dim(`User code: ${devicePayload.user_code}`));
      if (!opts.noOpen) {
        openUrlInBrowser(devicePayload.verification_uri_complete);
      }

      const intervalMs = Math.max(1000, Math.floor(devicePayload.interval * 1000));
      const deadline = Date.now() + devicePayload.expires_in * 1000;
      let pollInterval = intervalMs;

      while (Date.now() < deadline) {
        await sleep(pollInterval);
        const tokenRes = await fetch(deviceTokenUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: devicePayload.device_code,
            client_id: DEPLOYHER_CLI_CLIENT_ID
          })
        });
        const tokenText = await tokenRes.text();

        if (tokenRes.ok) {
          let success: DeviceTokenSuccess;
          try {
            success = JSON.parse(tokenText) as DeviceTokenSuccess;
          } catch {
            throw new Error(pc.red("device/token returned invalid JSON"));
          }
          if (!success.access_token?.trim()) {
            throw new Error(pc.red("device/token missing access_token"));
          }
          const stored: ManagedCliConfig = {
            version: 1,
            apiBaseUrl,
            accessToken: success.access_token.trim()
          };
          const pathWritten = await writeManagedCliConfig(stored);
          console.log(pc.green(`Logged in. Wrote ${pathWritten}`));

          const whoami = await apiFetchJson<{ user: { id: string; email: string; role: string } }>(
            stored,
            "/api/cli/whoami"
          );
          if (whoami.ok) {
            console.log(
              pc.dim(`Session OK: ${whoami.data.user.email} (${whoami.data.user.role})`)
            );
          } else {
            console.log(pc.yellow(`Warning: /api/cli/whoami failed: ${whoami.message}`));
          }
          return;
        }

        let err: DeviceTokenError;
        try {
          err = JSON.parse(tokenText) as DeviceTokenError;
        } catch {
          throw new Error(pc.red(`device/token failed (${String(tokenRes.status)}): ${tokenText.slice(0, 400)}`));
        }
        if (err.error === "authorization_pending") continue;
        if (err.error === "slow_down") {
          pollInterval += 5000;
          continue;
        }
        throw new Error(
          pc.red(`${err.error}: ${err.error_description ?? tokenText.slice(0,200)}`)
        );
      }

      throw new Error(pc.red("Device authorization timed out."));
    });
};
