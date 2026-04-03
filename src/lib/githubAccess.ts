import { and, eq } from "drizzle-orm";
import { auth } from "../../auth";
import { db } from "../db/db";
import * as schema from "../db/schema";
import type { RequestWithParamsAndSession } from "../auth/session";

export const hasRepoScope = (scope: string | null | undefined): boolean => {
  if (!scope) return false;
  const scopes = scope
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return scopes.includes("repo") || scopes.includes("public_repo");
};

type GitHubAccessTokenResult = {
  accountId: string | null;
  accessToken: string | null;
  linked: boolean;
  hasRepoScope: boolean;
  requiresReauth: boolean;
};

export const getGitHubAccessToken = async (
  req: Pick<RequestWithParamsAndSession, "headers" | "session">
): Promise<GitHubAccessTokenResult> => {
  const userId = req.session.user.id;
  const [account] = await db
    .select({ id: schema.accounts.id, scope: schema.accounts.scope })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "github")))
    .limit(1);

  if (!account) {
    return {
      accountId: null,
      accessToken: null,
      linked: false,
      hasRepoScope: false,
      requiresReauth: false
    };
  }

  const repoScopeGranted = hasRepoScope(account.scope);
  if (!repoScopeGranted) {
    return {
      accountId: account.id,
      accessToken: null,
      linked: true,
      hasRepoScope: false,
      requiresReauth: false
    };
  }

  try {
    const tokenResponse = await auth.api.getAccessToken({
      headers: req.headers,
      body: {
        providerId: "github",
        accountId: account.id
      }
    });

    return {
      accountId: account.id,
      accessToken: tokenResponse.accessToken ?? null,
      linked: true,
      hasRepoScope: true,
      requiresReauth: !tokenResponse.accessToken
    };
  } catch {
    return {
      accountId: account.id,
      accessToken: null,
      linked: true,
      hasRepoScope: true,
      requiresReauth: true
    };
  }
};
