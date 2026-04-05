import "./src/env/bootstrap";
import { db } from "./src/db/db";
import * as schema from "./src/db/schema";
import { and, eq } from "drizzle-orm";

const loginRaw = process.env.DEPLOYHER_GITHUB_LOGIN?.trim() ?? Bun.argv[2]?.trim() ?? "";
if (!loginRaw) {
  console.error(
    "Missing GitHub login. Use: DEPLOYHER_GITHUB_LOGIN=<login> bun grant-operator.ts  or  bun grant-operator.ts <login>"
  );
  process.exit(1);
}

type GitHubUserResponse = {
  id?: unknown;
  login?: unknown;
};

const resolveGithubLogin = async (
  login: string
): Promise<{ accountId: string; canonicalLogin: string }> => {
  const url = `https://api.github.com/users/${encodeURIComponent(login)}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "deployher-grant-operator/1.0"
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (res.status === 404) {
    throw new Error(`GitHub user not found: ${login}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as GitHubUserResponse;
  if (typeof body.id !== "number" || !Number.isFinite(body.id)) {
    throw new Error("GitHub API returned an unexpected payload (missing numeric id).");
  }
  const canonicalLogin = typeof body.login === "string" && body.login.length > 0 ? body.login : login;
  return { accountId: String(body.id), canonicalLogin };
};

const main = async (): Promise<void> => {
  const { accountId, canonicalLogin } = await resolveGithubLogin(loginRaw);
  const rows = await db
    .select({ userId: schema.accounts.userId, email: schema.users.email, role: schema.users.role })
    .from(schema.accounts)
    .innerJoin(schema.users, eq(schema.accounts.userId, schema.users.id))
    .where(and(eq(schema.accounts.providerId, "github"), eq(schema.accounts.accountId, accountId)))
    .limit(2);

  if (rows.length === 0) {
    throw new Error(
      `No Deployher user linked to GitHub @${canonicalLogin} (id ${accountId}). They must sign in with GitHub once before granting operator.`
    );
  }
  if (rows.length > 1) {
    throw new Error("Multiple accounts matched the same GitHub id; database may be inconsistent.");
  }

  const row = rows[0];
  if (!row) {
    throw new Error("No matching user row after query.");
  }
  if (row.role === "operator") {
    console.log(`Already operator: ${row.email} (GitHub @${canonicalLogin}).`);
    return;
  }
  await db
    .update(schema.users)
    .set({ role: "operator", updatedAt: new Date() })
    .where(eq(schema.users.id, row.userId));

  console.log(`Granted operator to ${row.email} (GitHub @${canonicalLogin}).`);
};

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
