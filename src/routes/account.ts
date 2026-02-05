import { eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { deleteObjectsByPrefix } from "../storage";
import { renderAccountPage } from "../ui/AccountPage";

export const accountPage = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const rows = await db
    .select({ providerId: schema.accounts.providerId })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));

  const data = {
    user: {
      name: req.session.user.name ?? null,
      email: req.session.user.email,
      image: req.session.user.image ?? null
    },
    linkedAccounts: rows.map((r) => ({ providerId: r.providerId }))
  };

  const stream = await renderAccountPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

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
