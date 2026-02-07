import { readdir, stat } from "fs/promises";
import path from "path";

export const examplesRootDir = path.resolve(import.meta.dir, "..", "examples");
const EXAMPLE_REPO_SCHEME = "example://";
const EXAMPLE_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export type LocalExample = {
  name: string;
  path: string;
};

const isWithinRoot = (candidatePath: string): boolean => {
  const relative = path.relative(examplesRootDir, candidatePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

export const isValidExampleName = (name: string): boolean => EXAMPLE_NAME_REGEX.test(name);

export const parseExampleRepoUrl = (repoUrl: string): string | null => {
  if (!repoUrl.startsWith(EXAMPLE_REPO_SCHEME)) {
    return null;
  }
  const name = repoUrl.slice(EXAMPLE_REPO_SCHEME.length).trim();
  if (!isValidExampleName(name)) {
    return null;
  }
  return name;
};

export const toExampleRepoUrl = (exampleName: string): string => `${EXAMPLE_REPO_SCHEME}${exampleName}`;

export const listLocalExamples = async (): Promise<LocalExample[]> => {
  try {
    const entries = await readdir(examplesRootDir, { withFileTypes: true, encoding: "utf8" });
    const names = entries
      .filter((entry) => entry.isDirectory() && isValidExampleName(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    return names.map((name) => ({
      name,
      path: path.join(examplesRootDir, name)
    }));
  } catch {
    return [];
  }
};

export const resolveLocalExample = async (exampleName: string): Promise<LocalExample | null> => {
  if (!isValidExampleName(exampleName)) {
    return null;
  }
  const candidatePath = path.resolve(examplesRootDir, exampleName);
  if (!isWithinRoot(candidatePath)) {
    return null;
  }
  try {
    const s = await stat(candidatePath);
    if (!s.isDirectory()) {
      return null;
    }
    return { name: exampleName, path: candidatePath };
  } catch {
    return null;
  }
};
