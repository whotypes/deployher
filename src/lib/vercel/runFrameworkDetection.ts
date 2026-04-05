import { detectFrameworkRecord } from "@vercel/fs-detectors";
import { frameworkList } from "@vercel/frameworks";
import { MemoryDetectorFilesystem } from "./memoryDetectorFilesystem";
import type { VersionedFrameworkRecord } from "./mapFrameworkToDeployher";

export const detectFrameworkFromFileContents = async (
  files: Record<string, string | Buffer>
): Promise<VersionedFrameworkRecord | null> => {
  const fs = new MemoryDetectorFilesystem(files);
  const record = await detectFrameworkRecord({
    fs,
    frameworkList,
    useExperimentalFrameworks: true
  });
  return record;
};
