import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const PROJECT_LINK_VERSION = 1 as const;

export type ProjectLinkFile = {
  version: typeof PROJECT_LINK_VERSION;
  projectId: string;
  apiBaseUrl: string;
  lastDeploymentId?: string;
};

const LINK_RELATIVE = path.join(".deployher", "project.json");

export const projectLinkPath = (cwd: string) => path.join(path.resolve(cwd), LINK_RELATIVE);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseProjectLinkFile = (raw: string): ProjectLinkFile | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== PROJECT_LINK_VERSION) return null;
  if (typeof parsed.projectId !== "string" || !parsed.projectId.trim()) return null;
  if (typeof parsed.apiBaseUrl !== "string" || !parsed.apiBaseUrl.trim()) return null;
  const last =
    typeof parsed.lastDeploymentId === "string" && parsed.lastDeploymentId.trim()
      ? parsed.lastDeploymentId.trim()
      : undefined;
  try {
    const apiBaseUrl = new URL(parsed.apiBaseUrl.trim()).origin;
    return { version: PROJECT_LINK_VERSION, projectId: parsed.projectId.trim(), apiBaseUrl, lastDeploymentId: last };
  } catch {
    return null;
  }
};

export const readProjectLinkFile = async (cwd: string): Promise<ProjectLinkFile | null> => {
  const p = projectLinkPath(cwd);
  try {
    const text = await readFile(p, "utf8");
    return parseProjectLinkFile(text);
  } catch {
    return null;
  }
};

export const writeProjectLinkFile = async (cwd: string, payload: ProjectLinkFile): Promise<void> => {
  const p = projectLinkPath(cwd);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};
