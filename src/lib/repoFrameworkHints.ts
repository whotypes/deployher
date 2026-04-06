import { emptyLockfilePresence, resolveJsToolchain, type LockfilePresence } from "./repoToolchainHints";
import { hasStaticHtmlEntryFromScan, type StaticSiteIndexScan } from "./staticSiteEntrypoints";

export type { LockfilePresence } from "./repoToolchainHints";

export type FrameworkHintOption = "auto" | "nextjs" | "node" | "python" | "static";
export type PreviewModeOption = "auto" | "static" | "server";

export type RepoFrameworkHints = {
  labels: string[];
  suggestedFrameworkHint: FrameworkHintOption;
  suggestedPreviewMode: PreviewModeOption;
  warnings: string[];
  confidence: "high" | "medium" | "low";
};

type PackageJsonLike = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  deployher?: { serveStrategy?: unknown };
  packageManager?: string;
};

const dep = (pkg: PackageJsonLike, name: string): boolean =>
  Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);

const anyDepPrefix = (pkg: PackageJsonLike, prefix: string): boolean => {
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(all).some((k) => k.startsWith(prefix));
};

const parsePackageJson = (raw: unknown): PackageJsonLike | null => {
  if (raw === null || typeof raw !== "object") return null;
  return raw as PackageJsonLike;
};

const inferPythonSignalsFromPyproject = (pyproject: string): boolean => {
  const t = pyproject.toLowerCase();
  return (
    t.includes("[tool.deployher]") ||
    t.includes("mkdocs") ||
    t.includes("[tool.poetry]") ||
    t.includes("[project]")
  );
};

const inferPythonProjectSignals = (opts?: {
  pyprojectToml?: string | null;
  requirementsTxt?: string | null;
  pipfile?: string | null;
}): boolean => {
  if (opts?.requirementsTxt?.trim()) {
    return true;
  }
  if (opts?.pipfile?.trim()) {
    return true;
  }
  const py = opts?.pyprojectToml;
  if (!py) {
    return false;
  }
  return inferPythonSignalsFromPyproject(py);
};

export const inferRepoFrameworkHints = (
  packageJson: unknown,
  opts?: {
    pyprojectToml?: string | null;
    requirementsTxt?: string | null;
    pipfile?: string | null;
    lockfiles?: LockfilePresence;
    staticHtmlScan?: StaticSiteIndexScan;
  }
): RepoFrameworkHints => {
  const pkg = parsePackageJson(packageJson);
  const labels: string[] = [];
  const warnings: string[] = [];
  let suggestedFrameworkHint: FrameworkHintOption = "auto";
  let suggestedPreviewMode: PreviewModeOption = "auto";
  let confidence: "high" | "medium" | "low" = "low";

  const pySignals = inferPythonProjectSignals(opts);
  const locks = opts?.lockfiles ?? emptyLockfilePresence();
  const staticHtmlEntry = opts?.staticHtmlScan ? hasStaticHtmlEntryFromScan(opts.staticHtmlScan) : false;

  if (!pkg) {
    if (pySignals) {
      return {
        labels: ["Python"],
        suggestedFrameworkHint: "python",
        suggestedPreviewMode: "auto",
        warnings: [],
        confidence: "medium"
      };
    }
    if (staticHtmlEntry) {
      return {
        labels: ["Static site"],
        suggestedFrameworkHint: "static",
        suggestedPreviewMode: "static",
        warnings: [],
        confidence: "medium"
      };
    }
    return {
      labels: [],
      suggestedFrameworkHint: "auto",
      suggestedPreviewMode: "auto",
      warnings: ["No package.json or static HTML entrypoint at this path."],
      confidence: "low"
    };
  }

  const deployherServe =
    pkg.deployher?.serveStrategy === "static" || pkg.deployher?.serveStrategy === "server"
      ? pkg.deployher.serveStrategy
      : null;

  const hasBuildScript = Boolean(pkg.scripts?.build?.trim());

  if (dep(pkg, "next")) {
    labels.push("Next.js");
    suggestedFrameworkHint = "nextjs";
    confidence = "high";
    if (!hasBuildScript) {
      warnings.push(
        "package.json has no `scripts.build`. Next.js previews need `next build` (or a custom build command) so `.next` exists."
      );
      suggestedPreviewMode = deployherServe ?? "server";
    } else {
      suggestedPreviewMode = deployherServe ?? "auto";
    }
  } else if (anyDepPrefix(pkg, "@remix-run/") || dep(pkg, "@remix-run/node")) {
    labels.push("Remix");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "server";
    confidence = "high";
    if (!hasBuildScript) {
      warnings.push("No `scripts.build` found; Remix usually needs a build step.");
    }
  } else if (dep(pkg, "@sveltejs/kit")) {
    labels.push("SvelteKit");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "server";
    confidence = "high";
  } else if (dep(pkg, "nuxt") || dep(pkg, "@nuxt/kit")) {
    labels.push("Nuxt");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "server";
    confidence = "high";
  } else if (dep(pkg, "astro")) {
    labels.push("Astro");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "auto";
    confidence = "medium";
  } else if (dep(pkg, "@angular/core")) {
    labels.push("Angular");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "auto";
    confidence = "medium";
  } else if (dep(pkg, "gatsby")) {
    labels.push("Gatsby");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "static";
    confidence = "medium";
  } else if (dep(pkg, "react-scripts")) {
    labels.push("Create React App");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "static";
    confidence = "medium";
    if (!hasBuildScript) {
      warnings.push("No `scripts.build` found.");
    }
  } else if (dep(pkg, "vite")) {
    labels.push("Vite");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "auto";
    confidence = "medium";
    if (!hasBuildScript) {
      warnings.push("No `scripts.build` found; Vite apps typically use `vite build`.");
    }
  } else if (
    dep(pkg, "express") ||
    dep(pkg, "fastify") ||
    dep(pkg, "hono") ||
    dep(pkg, "koa") ||
    dep(pkg, "polka")
  ) {
    labels.push("Node server");
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "server";
    confidence = "medium";
  } else if (dep(pkg, "serve") || dep(pkg, "http-server")) {
    labels.push("Static (dev tooling)");
    suggestedFrameworkHint = "static";
    suggestedPreviewMode = deployherServe ?? "static";
    confidence = "low";
  }

  const frameworkLabelCount = labels.length;
  const toolchain = resolveJsToolchain(pkg, locks);
  if (toolchain && !labels.includes(toolchain.label)) {
    labels.push(toolchain.label);
  }
  if (frameworkLabelCount === 0 && toolchain) {
    suggestedFrameworkHint = "node";
    suggestedPreviewMode = deployherServe ?? "auto";
    if (confidence === "low") {
      confidence = "medium";
    }
  }

  if (pySignals && !labels.includes("Python")) {
    labels.push("Python");
    if (suggestedFrameworkHint === "auto") {
      suggestedFrameworkHint = "python";
      confidence = confidence === "high" ? "high" : "medium";
    } else {
      warnings.push("Also found Python project files; confirm the correct project root.");
    }
  }

  if (labels.length === 0) {
    suggestedFrameworkHint = pySignals ? "python" : "auto";
    suggestedPreviewMode = "auto";
  }

  return {
    labels,
    suggestedFrameworkHint,
    suggestedPreviewMode,
    warnings,
    confidence
  };
};

export const joinRepoContentPath = (projectRootDir: string, fileName: string): string => {
  const root = projectRootDir.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return root ? `${root}/${fileName}` : fileName;
};

export const encodeGitHubContentPath = (relativePath: string): string =>
  relativePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
