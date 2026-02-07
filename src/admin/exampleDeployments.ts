import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { listLocalExamples, parseExampleRepoUrl, toExampleRepoUrl } from "../examples";

export type ExampleDeploymentSummary = {
  id: string;
  shortId: string;
  status: "queued" | "building" | "success" | "failed";
  createdAt: string;
  finishedAt: string | null;
  previewUrl: string | null;
};

export type ExampleRow = {
  name: string;
  projectId: string | null;
  latestDeployment: ExampleDeploymentSummary | null;
};

const toDeploymentSummary = (
  deployment: typeof schema.deployments.$inferSelect
): ExampleDeploymentSummary => ({
  id: deployment.id,
  shortId: deployment.shortId,
  status: deployment.status,
  createdAt: deployment.createdAt.toISOString(),
  finishedAt: deployment.finishedAt?.toISOString() ?? null,
  previewUrl: deployment.previewUrl
});

export const buildExampleRowsForUser = async (userId: string): Promise<ExampleRow[]> => {
  const examples = await listLocalExamples();
  if (examples.length === 0) {
    return [];
  }

  const repoUrls = examples.map((example) => toExampleRepoUrl(example.name));
  const projects = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.userId, userId), inArray(schema.projects.repoUrl, repoUrls)));

  const projectByExample = new Map<string, typeof schema.projects.$inferSelect>();
  for (const project of projects) {
    const exampleName = parseExampleRepoUrl(project.repoUrl);
    if (exampleName) {
      projectByExample.set(exampleName, project);
    }
  }

  const projectIds = projects.map((project) => project.id);
  const deployments =
    projectIds.length > 0
      ? await db
          .select()
          .from(schema.deployments)
          .where(inArray(schema.deployments.projectId, projectIds))
          .orderBy(desc(schema.deployments.createdAt))
      : [];

  const latestDeploymentByProject = new Map<string, typeof schema.deployments.$inferSelect>();
  for (const deployment of deployments) {
    if (!latestDeploymentByProject.has(deployment.projectId)) {
      latestDeploymentByProject.set(deployment.projectId, deployment);
    }
  }

  return examples.map((example) => {
    const project = projectByExample.get(example.name) ?? null;
    const deployment = project ? latestDeploymentByProject.get(project.id) ?? null : null;
    return {
      name: example.name,
      projectId: project?.id ?? null,
      latestDeployment: deployment ? toDeploymentSummary(deployment) : null
    };
  });
};

