import { eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { removeDockerResourcesForDeployment } from "../docker/buildContainerCleanup";
import { deleteObjectsByPrefix } from "../storage";

export const deleteAccount = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;

  const deployments = await db
    .select({
      id: schema.deployments.id,
      artifactPrefix: schema.deployments.artifactPrefix
    })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(eq(schema.projects.userId, userId));

  for (const d of deployments) {
    await deleteObjectsByPrefix(d.artifactPrefix);
  }

  await Promise.all(
    deployments.map((d) =>
      removeDockerResourcesForDeployment(d.id).catch((err: unknown) => {
        console.error(`Docker cleanup failed for deployment ${d.id}:`, err);
      })
    )
  );

  await db.delete(schema.users).where(eq(schema.users.id, userId));

  const url = new URL(req.url);
  return Response.redirect(new URL("/login", url.origin).toString(), 302);
};
