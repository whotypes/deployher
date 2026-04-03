import { and, eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { deleteObjectsByPrefix } from "../storage";
import { listSidebarProjectSummariesForUser } from "./projects";
import { renderAccountPage } from "../ui/AccountPage";

export const accountPage = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const rows = await db
    .select({ providerId: schema.accounts.providerId })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
  const [githubAccount] = await db
    .select({ scope: schema.accounts.scope })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "github")))
    .limit(1);
  const githubScopes = githubAccount?.scope
    ? githubAccount.scope
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean)
    : [];
  const hasRepoAccess = githubScopes.includes("repo") || githubScopes.includes("public_repo");
  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);

  const data = {
    pathname: new URL(req.url).pathname,
    sidebarProjects,
    user: {
      name: req.session.user.name ?? null,
      email: req.session.user.email,
      image: req.session.user.image ?? null,
      role: req.session.user.role
    },
    linkedAccounts: rows.map((r) => ({ providerId: r.providerId })),
    hasRepoAccess,
    csrfToken: req.csrfToken ?? ""
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
