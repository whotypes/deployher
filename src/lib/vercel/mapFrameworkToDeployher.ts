import type { Framework } from "@vercel/frameworks";
import type { FrameworkHintOption, PreviewModeOption, RepoFrameworkHints } from "../repoFrameworkHints";

export type VersionedFrameworkRecord = Framework & { detectedVersion?: string };

export type PrimaryFrameworkPayload = {
  slug: string;
  name: string;
  logo: string;
  darkModeLogo?: string;
  detectedVersion?: string;
};

const PREVIEW_STATIC_SLUGS = new Set<string>([
  "gatsby",
  "gridsome",
  "hexo",
  "eleventy",
  "docusaurus",
  "docusaurus-2",
  "ember",
  "vuepress",
  "vuepress-v2",
  "preact-cli",
  "ionic-react",
  "hugo",
  "jekyll",
  "middleman",
  "sphinx",
  "brunch",
  "sapper",
  "scully",
  "ionic-angular",
  "polymer",
  "riot",
  "stencil",
]);

const PREVIEW_SERVER_SLUGS = new Set<string>([
  "solidstart",
  "solidstart-1",
  "remix",
  "nuxtjs",
  "sveltekit",
  "redwoodjs",
  "hydrogen",
  "blitzjs",
  "analog",
  "react-router",
  "tanstack-start",
  "xmcp"
]);

const hasBuildScript = (pkg: unknown): boolean => {
  if (pkg === null || typeof pkg !== "object") return false;
  const scripts = (pkg as { scripts?: Record<string, string> }).scripts;
  return Boolean(scripts?.build?.trim());
};

export const vercelRecordToPrimaryPayload = (
  record: VersionedFrameworkRecord | null
): PrimaryFrameworkPayload | null => {
  if (!record?.slug) {
    return null;
  }
  return {
    slug: record.slug,
    name: record.name,
    logo: record.logo,
    ...(record.darkModeLogo ? { darkModeLogo: record.darkModeLogo } : {}),
    ...(record.detectedVersion ? { detectedVersion: record.detectedVersion } : {})
  };
};

export const mapVercelFrameworkToDeployher = (
  record: VersionedFrameworkRecord | null,
  packageJson: unknown
): Omit<RepoFrameworkHints, never> & { primaryFramework: PrimaryFrameworkPayload | null } => {
  const primaryFramework = vercelRecordToPrimaryPayload(record);
  const buildOk = hasBuildScript(packageJson);

  if (!record?.slug) {
    return {
      labels: [],
      suggestedFrameworkHint: "auto",
      suggestedPreviewMode: "auto",
      warnings: [],
      confidence: "low",
      primaryFramework: null
    };
  }

  const slug = record.slug;
  const labels = [record.name];
  const warnings: string[] = [];

  if (slug === "nextjs") {
    if (!buildOk) {
      warnings.push(
        "package.json has no `scripts.build`. Next.js previews need `next build` (or a custom build command) so `.next` exists."
      );
    }
    return {
      labels,
      suggestedFrameworkHint: "nextjs",
      suggestedPreviewMode: buildOk ? "auto" : "server",
      warnings,
      confidence: "high",
      primaryFramework
    };
  }

  if (slug === "python" || record.runtimeFramework === true) {
    if (slug === "python") {
      return {
        labels,
        suggestedFrameworkHint: "python",
        suggestedPreviewMode: "auto",
        warnings,
        confidence: "high",
        primaryFramework
      };
    }
    return {
      labels,
      suggestedFrameworkHint: "auto",
      suggestedPreviewMode: "server",
      warnings,
      confidence: "medium",
      primaryFramework
    };
  }

  if (PREVIEW_STATIC_SLUGS.has(slug)) {
    if (!buildOk && slug !== "hugo" && slug !== "jekyll") {
      warnings.push("No `scripts.build` in package.json; confirm how this project produces static output.");
    }
    return {
      labels,
      suggestedFrameworkHint: "node",
      suggestedPreviewMode: "static",
      warnings,
      confidence: "high",
      primaryFramework
    };
  }

  if (PREVIEW_SERVER_SLUGS.has(slug)) {
    if (!buildOk) {
      warnings.push("No `scripts.build` in package.json; server previews usually require a production build step.");
    }
    return {
      labels,
      suggestedFrameworkHint: "node",
      suggestedPreviewMode: "server",
      warnings,
      confidence: "high",
      primaryFramework
    };
  }

  if (slug === "astro") {
    return {
      labels,
      suggestedFrameworkHint: "node",
      suggestedPreviewMode: "auto",
      warnings,
      confidence: "high",
      primaryFramework
    };
  }

  if (slug === "vite") {
    if (!buildOk) {
      warnings.push("No `scripts.build` in package.json; Vite apps typically use `vite build`.");
    }
    return {
      labels,
      suggestedFrameworkHint: "node",
      suggestedPreviewMode: "auto",
      warnings,
      confidence: "medium",
      primaryFramework
    };
  }

  if (slug === "angular") {
    return {
      labels,
      suggestedFrameworkHint: "node",
      suggestedPreviewMode: "auto",
      warnings,
      confidence: "medium",
      primaryFramework
    };
  }

  return {
    labels,
    suggestedFrameworkHint: "node",
    suggestedPreviewMode: "auto",
    warnings,
    confidence: "medium",
    primaryFramework
  };
};

export type MergedRepoHints = RepoFrameworkHints & {
  primaryFramework: PrimaryFrameworkPayload | null;
  suggestedFrameworkHint: FrameworkHintOption;
  suggestedPreviewMode: PreviewModeOption;
};

export const mergeVercelAndLegacyHints = (
  vercel: ReturnType<typeof mapVercelFrameworkToDeployher>,
  legacy: RepoFrameworkHints,
  packageJsonFound: boolean
): MergedRepoHints => {
  const primaryFramework = vercel.primaryFramework;
  const vercelActive = primaryFramework !== null;

  let suggestedFrameworkHint: FrameworkHintOption;
  let suggestedPreviewMode: PreviewModeOption;
  let confidence: MergedRepoHints["confidence"];

  if (vercelActive) {
    suggestedFrameworkHint = vercel.suggestedFrameworkHint;
    suggestedPreviewMode =
      legacy.suggestedPreviewMode !== "auto"
        ? legacy.suggestedPreviewMode
        : vercel.suggestedPreviewMode;
    confidence = vercel.confidence;
  } else {
    suggestedFrameworkHint = legacy.suggestedFrameworkHint;
    suggestedPreviewMode = legacy.suggestedPreviewMode;
    confidence = legacy.confidence;
  }

  const labelSet = new Set<string>();
  for (const l of vercel.labels) {
    labelSet.add(l);
  }
  for (const l of legacy.labels) {
    labelSet.add(l);
  }
  if (!vercelActive && packageJsonFound && labelSet.size === 0) {
    labelSet.add("Node");
  }

  const warnSet = new Set<string>([...vercel.warnings, ...legacy.warnings]);

  return {
    labels: [...labelSet],
    suggestedFrameworkHint,
    suggestedPreviewMode,
    warnings: [...warnSet],
    confidence,
    primaryFramework
  };
};
