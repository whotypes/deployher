import { config } from "./config";
import { getRedisClient } from "./redis";

const REPO_CREDENTIAL_KEY_PREFIX = "deployments:repo-credential:";

type RepoCredentialPayload = {
  deploymentId: string;
  accessToken: string;
  createdAt: string;
};

const credentialKey = (id: string) => `${REPO_CREDENTIAL_KEY_PREFIX}${id}`;

export const storeRepoCredential = async (
  deploymentId: string,
  accessToken: string
): Promise<string> => {
  const client = await getRedisClient();
  if (!client) {
    throw new Error("Redis is not configured");
  }

  const id = crypto.randomUUID();
  const payload: RepoCredentialPayload = {
    deploymentId,
    accessToken,
    createdAt: new Date().toISOString()
  };

  await client.send("SETEX", [
    credentialKey(id),
    String(config.build.repoCredentialTtlSeconds),
    JSON.stringify(payload)
  ]);

  return id;
};

export const consumeRepoCredential = async (id: string): Promise<string | null> => {
  const client = await getRedisClient();
  if (!client) {
    throw new Error("Redis is not configured");
  }

  const raw = await client.send("GETDEL", [credentialKey(id)]);
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as Partial<RepoCredentialPayload>;
    return typeof payload.accessToken === "string" && payload.accessToken.trim()
      ? payload.accessToken
      : null;
  } catch {
    return null;
  }
};
