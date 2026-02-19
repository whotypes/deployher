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
  buildSpec: (pythonCommand: string) => PythonPackageManager;
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
    buildSpec: (pythonCommand) => ({
      name: "pip",
      install: [pythonCommand, "-m", "pip", "install", "-r", "requirements.txt"]
    })
  }
];

export const resolvePythonCommand = (runtime: BuildRuntime): string => {
  const python = runtime.which("python");
  if (python) return "python";

  const python3 = runtime.which("python3");
  if (python3) return "python3";

  // Containerized builds default to python3 even if host-side command probing is unavailable.
  return "python3";
};

export const detectPythonPackageManager = async (
  repoDir: string,
  runtime: BuildRuntime,
  pythonCommand: string
): Promise<PythonPackageManager> => {
  for (const detector of PYTHON_PACKAGE_MANAGER_DETECTORS) {
    for (const lockfile of detector.lockfiles) {
      if (await runtime.exists(path.join(repoDir, lockfile))) {
        return detector.buildSpec(pythonCommand);
      }
    }
  }

  throw new Error(
    "Python project detected but no supported dependency manifest found. Expected one of: uv.lock, poetry.lock, requirements.txt"
  );
};
