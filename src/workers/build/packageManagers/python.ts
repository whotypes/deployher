import path from "path";
import type { BuildRuntime } from "../types";

export type PythonPackageManagerName = "uv" | "poetry" | "pip";

export type PythonPackageManager = {
  name: PythonPackageManagerName;
  install: string[];
};

type PythonPackageManagerDetector = {
  name: PythonPackageManagerName;
  lockfiles: string[];
  buildSpec: () => PythonPackageManager;
};

const PYTHON_PACKAGE_MANAGER_DETECTORS: PythonPackageManagerDetector[] = [
  {
    name: "uv",
    lockfiles: ["uv.lock"],
    buildSpec: () => ({
      name: "uv",
      install: ["uv", "sync", "--frozen"]
    })
  },
  {
    name: "poetry",
    lockfiles: ["poetry.lock"],
    buildSpec: () => ({
      name: "poetry",
      install: ["poetry", "install", "--no-interaction", "--sync", "--no-root"]
    })
  },
  {
    name: "pip",
    lockfiles: ["requirements.txt"],
    buildSpec: () => ({
      name: "pip",
      install: ["python", "-m", "pip", "install", "-r", "requirements.txt"]
    })
  }
];

export const detectPythonPackageManager = async (
  repoDir: string,
  runtime: BuildRuntime
): Promise<PythonPackageManager> => {
  for (const detector of PYTHON_PACKAGE_MANAGER_DETECTORS) {
    for (const lockfile of detector.lockfiles) {
      if (await runtime.exists(path.join(repoDir, lockfile))) {
        return detector.buildSpec();
      }
    }
  }

  throw new Error(
    "Python project detected but no supported dependency manifest found. Expected one of: uv.lock, poetry.lock, requirements.txt"
  );
};
