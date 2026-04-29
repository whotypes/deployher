import path from "node:path";

import type { Command } from "commander";
import pc from "picocolors";

import { readManagedCliConfig } from "../lib/api-config";
import { apiFetchJson } from "../lib/api-client";
import { readProjectLinkFile, writeProjectLinkFile } from "../lib/project-link";

type DeploymentRow = {
  id: string;
  shortId: string;
  status: string;
};

export const registerRemoteDeploy = (program: Command): void => {
  program
    .command("deploy")
    .description("Queue a deployment for the linked project (requires deployher login + link)")
    .argument("[dir]", "repository root (default: cwd)", ".")
    .option("--no-wait", "do not poll deployment status")
    .action(async function (this: Command, dirArg?: string) {
      const opts = this.opts<{ noWait?: boolean }>();
      const cwd = path.resolve(process.cwd(), dirArg ?? ".");
      const loaded = await readManagedCliConfig();
      if (!loaded) {
        throw new Error('Not logged in. Run `deployher login`.');
      }
      const link = await readProjectLinkFile(cwd);
      if (!link) {
        throw new Error("No linked project in this repo. Run `deployher link` first.");
      }
      if (link.apiBaseUrl.replace(/\/+$/, "") !== loaded.config.apiBaseUrl.replace(/\/+$/, "")) {
        throw new Error(
          "Linked project API base URL does not match your CLI login. Run `deployher login` and `deployher link` again."
        );
      }

      const created = await apiFetchJson<DeploymentRow>(loaded.config, `/api/projects/${link.projectId}/deployments`, {
        method: "POST",
        body: JSON.stringify({}),
        okStatuses: [201]
      });
      if (!created.ok) {
        throw new Error(pc.red(created.message));
      }
      const deployment = created.data;
      console.log(pc.green(`Queued deployment ${deployment.shortId} (${deployment.id})`));

      await writeProjectLinkFile(cwd, {
        ...link,
        lastDeploymentId: deployment.id
      });

      if (opts.noWait) {
        return;
      }

      const deadline = Date.now() + 20 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await apiFetchJson<DeploymentRow>(loaded.config, `/api/deployments/${deployment.id}`);
        if (!st.ok) {
          console.log(pc.yellow(`status poll failed: ${st.message}`));
          continue;
        }
        console.log(pc.dim(`status: ${st.data.status}`));
        if (st.data.status === "success" || st.data.status === "failed") {
          break;
        }
      }
    });
};
