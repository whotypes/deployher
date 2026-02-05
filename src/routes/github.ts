import { and, eq } from "drizzle-orm";
import { auth } from "../../auth";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { json } from "../http/helpers";

type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  updatedAt: string | null;
};

const hasRepoScope = (scope: string | null | undefined): boolean => {
  if (!scope) return false;
  const scopes = scope
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return scopes.includes("repo") || scopes.includes("public_repo");
};

export const listRepos = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const [account] = await db
    .select({
      id: schema.accounts.id,
      scope: schema.accounts.scope
    })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "github")))
    .limit(1);

  if (!account) {
    return json(
      { error: "GitHub account not linked", requiresLink: true },
      { status: 401 }
    );
  }

  if (!hasRepoScope(account.scope)) {
    return json(
      { error: "GitHub repo access not granted", requiresLink: true },
      { status: 403 }
    );
  }

  let accessToken: string | undefined;
  try {
    const tokenResponse = await auth.api.getAccessToken({
      headers: req.headers,
      body: {
        providerId: "github",
        accountId: account.id
      }
    });
    accessToken = tokenResponse.accessToken;
  } catch (error) {
    return json(
      { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
      { status: 401 }
    );
  }

  if (!accessToken) {
    return json(
      { error: "GitHub access token not available", requiresReauth: true },
      { status: 401 }
    );
  }

  const response = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&direction=desc&visibility=all",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "deployher"
      }
    }
  );

  if (response.status === 401) {
    return json(
      { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
      { status: 401 }
    );
  }

  if (response.status === 403) {
    return json(
      { error: "GitHub API rate limit or permission issue.", requiresReauth: false },
      { status: 403 }
    );
  }

  if (!response.ok) {
    return json({ error: `GitHub API error (${response.status})` }, { status: 502 });
  }

  const payload = (await response.json()) as Array<{
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
    description: string | null;
    updated_at: string | null;
  }>;

  const repos: GitHubRepo[] = Array.isArray(payload)
    ? payload.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        private: repo.private,
        description: repo.description ?? null,
        updatedAt: repo.updated_at ?? null
      }))
    : [];

  return json({ repos });
};
