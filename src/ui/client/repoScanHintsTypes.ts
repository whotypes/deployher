export type RepoScanPrimaryFramework = {
  slug: string;
  name: string;
  logo: string;
  darkModeLogo?: string;
  detectedVersion?: string;
};

export type RepoScanHintsPayload = {
  projectRoot: string;
  packageJsonFound: boolean;
  labels: string[];
  suggestedFrameworkHint: "auto" | "nextjs" | "node" | "python" | "static";
  suggestedPreviewMode: "auto" | "static" | "server";
  warnings: string[];
  confidence: "high" | "medium" | "low";
  primaryFramework: RepoScanPrimaryFramework | null;
};
