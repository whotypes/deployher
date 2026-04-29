import path from "node:path";

import type { Command } from "commander";
import { select, text } from "@clack/prompts";
import pc from "picocolors";

import { normalizeGitHubRepoUrl } from "../../src/github";
import type { ManagedCliConfig } from "../lib/api-config";
import { readManagedCliConfig } from "../lib/api-config";
import { apiFetchJson } from "../lib/api-client";
import { getGitBranch, getGitOriginUrl } from "../lib/git-remote";
import { githubHttpsRepoUrlFromRemote, repoFullNameFromUrl } from "../lib/parse-git-remote";
import {
  PROJECT_LINK_VERSION,
  writeProjectLinkFile,
  type ProjectLinkFile
} from "../lib/project-link";

type GitHubRepoRow = {
  id: number;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
};

type ProjectRow = {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
};

const requireCliConfig = async (): Promise<ManagedCliConfig> => {
  const loaded = await readManagedCliConfig();
  if (!loaded) {
    throw new Error('Not logged in. Run `deployher login`.');
  }
  return loaded.config;
};

export const registerLink = (program: Command): void => {
  program
    .command("link")
    .description("Associate this git repo with a Deployher project (writes .deployher/project.json)")
    .argument("[dir]", "repository root (default: cwd)", ".")
    .action(async (dirArg?: string) => {
      const config = await requireCliConfig();
      const cwd = path.resolve(process.cwd(), dirArg ?? ".");
      const origin = await getGitOriginUrl(cwd);
      if (!origin) {
        throw new Error("Could not read git remote origin. Run inside a git checkout.");
      }
      const httpsUrl = githubHttpsRepoUrlFromRemote(origin);
      if (!httpsUrl) {
        throw new Error(`Remote ${origin} is not a supported GitHub HTTPS or git@github.com URL.`);
      }
      const repoUrl = normalizeGitHubRepoUrl(httpsUrl);
      if (!repoUrl) {
        throw new Error("Could not normalize GitHub repository URL.");
      }
      const fullName = repoFullNameFromUrl(repoUrl);
      if (!fullName) {
        throw new Error("Could not parse owner/repo from URL.");
      }

      const reposRes = await apiFetchJson<{ repos: GitHubRepoRow[] }>(config, "/api/github/repos");
      if (!reposRes.ok) {
        throw new Error(pc.red(reposRes.message));
      }
      const match = reposRes.data.repos.find((r) => r.fullName === fullName);
      if (!match) {
        throw new Error(
          pc.red(
            `No GitHub access to ${fullName}. Grant repo access in the app, or clone with an account that can see this repo.`
          )
        );
      }

      const projectsRes = await apiFetchJson<ProjectRow[]>(config, "/api/projects");
      if (!projectsRes.ok) {
        throw new Error(pc.red(projectsRes.message));
      }
      const normalized = repoUrl.replace(/\/+$/, "");
      let candidates = projectsRes.data.filter((p) => p.repoUrl.replace(/\/+$/, "") === normalized);

      let projectId: string;
      let branch: string;

      if (candidates.length === 0) {
        const suggested =
          (await getGitBranch(cwd))?.trim() || match.defaultBranch?.trim() || "main";
        const branchRaw = await text({
          message: "Default git branch for this project",
          initialValue: suggested,
          validate: (v: string | undefined) => ((v?.trim() ?? "").length > 0 ? undefined : "Required")
        });
        if (typeof branchRaw !== "string") {
          process.exit(0);
        }
        branch = branchRaw.trim();

        const nameRaw = await text({
          message: "New Deployher project name",
          initialValue: match.fullName.split("/")[1] ?? match.fullName,
          validate: (v: string | undefined) => ((v?.trim() ?? "").length > 0 ? undefined : "Required")
        });
        if (typeof nameRaw !== "string") {
          process.exit(0);
        }
        const name = nameRaw.trim();

        const created = await apiFetchJson<ProjectRow>(
          config,
          "/api/projects",
          {
            method: "POST",
            body: JSON.stringify({
              name,
              repoUrl: normalized,
              branch,
              frameworkHint: "auto",
              previewMode: "auto",
              serverPreviewTarget: "isolated-runner",
              runtimeImageMode: "auto"
            }),
            okStatuses: [201, 200]
          }
        );
        if (!created.ok) {
          throw new Error(pc.red(created.message));
        }
        projectId = created.data.id;
      } else if (candidates.length === 1) {
        projectId = candidates[0]?.id ?? "";
        branch = candidates[0]?.branch ?? "main";
        if (!projectId) throw new Error("Project id missing.");
      } else {
        const choice = await select({
          message: "Choose a Deployher project for this repo",
          options: candidates.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.branch})`
          }))
        });
        if (typeof choice !== "string") {
          process.exit(0);
        }
        projectId = choice;
        const picked = candidates.find((c) => c.id === projectId);
        branch = picked?.branch ?? "main";
      }

      const linkPayload: ProjectLinkFile = {
        version: PROJECT_LINK_VERSION,
        projectId,
        apiBaseUrl: config.apiBaseUrl
      };
      await writeProjectLinkFile(cwd, linkPayload);
      console.log(pc.green(`Linked project ${projectId} (branch ${branch}) -> .deployher/project.json`));
    });
};
