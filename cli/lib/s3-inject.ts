import fs from "node:fs/promises";
import path from "node:path";

export const injectS3IntoEnvFile = async (
  backendEnvFile: string,
  envExamplePath: string,
  bucket: string,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<void> => {
  let content: string;
  try {
    content = await fs.readFile(backendEnvFile, "utf8");
  } catch {
    try {
      content = await fs.readFile(envExamplePath, "utf8");
    } catch {
      content = "";
    }
    await fs.writeFile(backendEnvFile, content, "utf8");
  }

  const lines = content.split(/\r?\n/);
  let hasBucket = false;
  let hasKeyId = false;
  let hasSecret = false;
  const out: string[] = [];

  for (const line of lines) {
    if (line.startsWith("S3_BUCKET=")) {
      out.push(`S3_BUCKET=${bucket}`);
      hasBucket = true;
    } else if (line.startsWith("S3_ACCESS_KEY_ID=")) {
      out.push(`S3_ACCESS_KEY_ID=${accessKeyId}`);
      hasKeyId = true;
    } else if (line.startsWith("S3_SECRET_ACCESS_KEY=")) {
      out.push(`S3_SECRET_ACCESS_KEY=${secretAccessKey}`);
      hasSecret = true;
    } else {
      out.push(line);
    }
  }

  if (!hasBucket) out.push(`S3_BUCKET=${bucket}`);
  if (!hasKeyId) out.push(`S3_ACCESS_KEY_ID=${accessKeyId}`);
  if (!hasSecret) out.push(`S3_SECRET_ACCESS_KEY=${secretAccessKey}`);

  await fs.writeFile(backendEnvFile, out.join("\n"), "utf8");
};

export const envExamplePath = (repoRoot: string): string =>
  path.join(repoRoot, ".env.example");
