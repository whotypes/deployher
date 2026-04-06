import { eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { deleteObjectsByPrefix } from "../storage";

export const deleteAccount = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;

  const deployments = await db
    .select({ artifactPrefix: schema.deployments.artifactPrefix })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(eq(schema.projects.userId, userId));

  for (const d of deployments) {
    await deleteObjectsByPrefix(d.artifactPrefix);
  }

  await db.delete(schema.users).where(eq(schema.users.id, userId));

  const url = new URL(req.url);
  return Response.redirect(new URL("/login", url.origin).toString(), 302);
};
