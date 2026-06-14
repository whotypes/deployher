import { mkdir, readdir, rm } from "fs/promises";
import path from "path";
import {
  buildPreviewManifestKey,
  cachePreviewManifest,
  createPreviewManifest,
  type PreviewManifest
} from "./previewServe";
import { upload } from "../storage";
import { guessContentType } from "../utils/contentType";

export const collectFilesRecursive = async (rootDir: string): Promise<string[]> => {
  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files;
};

export type PublishStaticArtifactsResult = {
  previewManifestKey: string;
  manifest: PreviewManifest;
  fileCount: number;
};

export const publishStaticDirectoryAsDeploymentArtifacts = async (
  deploymentId: string,
  artifactPrefix: string,
  rootDir: string
): Promise<PublishStaticArtifactsResult> => {
  const files = await collectFilesRecursive(rootDir);
  if (files.length === 0) {
    throw new Error("No files in bundle");
  }

  const previewManifest = createPreviewManifest(artifactPrefix, rootDir, files);
  if (!previewManifest.entries["index.html"]) {
    throw new Error("Bundle must include index.html at the site root (after folder names like dist/ are stripped)");
  }

  for (const filePath of files) {
    const relative = path.relative(rootDir, filePath).replace(/\\/g, "/");
    const key = `${artifactPrefix}/${relative}`;
    await upload(key, Bun.file(filePath), {
      contentType: guessContentType(filePath)
    });
  }

  const previewManifestKey = buildPreviewManifestKey(artifactPrefix);
  await upload(previewManifestKey, JSON.stringify(previewManifest), {
    contentType: "application/json; charset=utf-8"
  });
  await cachePreviewManifest(deploymentId, previewManifest);

  return {
    previewManifestKey,
    manifest: previewManifest,
    fileCount: files.length
  };
};

export const writeFilesToTempRoot = async (
  rootDir: string,
  files: readonly { relativePath: string; data: Uint8Array }[]
): Promise<void> => {
  for (const f of files) {
    const dest = path.join(rootDir, f.relativePath);
    await mkdir(path.dirname(dest), { recursive: true });
    await Bun.write(dest, f.data);
  }
};

export const safeRemoveDir = async (dir: string): Promise<void> => {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
};
