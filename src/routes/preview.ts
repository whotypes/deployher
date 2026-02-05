import { eq } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { badRequest, json, notFound, type RequestWithParams } from "../http/helpers";
import { getStream, exists as storageExists, isStorageConfigured } from "../storage";
import { guessContentType } from "../utils/contentType";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SHORT_ID_REGEX = /^[0-9a-z]{9,10}$/;

export const extractDeploymentIdFromHost = (
  host: string
): { id: string; isShortId: boolean } | null => {
  const hostWithoutPort = host.split(":")[0] ?? "";
  if (!hostWithoutPort) return null;

  const devDomain = config.devDomain;
  const prodDomain = config.prodDomain;

  for (const domain of [devDomain, prodDomain]) {
    if (hostWithoutPort.endsWith(`.${domain}`)) {
      const subdomain = hostWithoutPort.slice(0, -(domain.length + 1));
      if (SHORT_ID_REGEX.test(subdomain)) {
        return { id: subdomain, isShortId: true };
      }
      if (UUID_REGEX.test(subdomain)) {
        return { id: subdomain, isShortId: false };
      }
    }
  }

  return null;
};

export const serveDeploymentAsset = async (
  deployment: typeof schema.deployments.$inferSelect,
  assetPath: string
): Promise<Response> => {
  const serveFile = async (filePath: string) => {
    const key = `${deployment.artifactPrefix}/${filePath}`;
    const contentType = guessContentType(filePath);
    const stream = getStream(key);

    const isHashedAsset = /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot)$/i.test(filePath);
    const cacheControl = contentType.includes("text/html")
      ? "no-cache"
      : isHashedAsset
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";

    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl
      }
    });
  };

  const exactKey = `${deployment.artifactPrefix}/${assetPath}`;
  if (await storageExists(exactKey)) {
    return serveFile(assetPath);
  }

  if (!assetPath.includes(".")) {
    const dirIndexPath = assetPath ? `${assetPath}/index.html` : "index.html";
    const dirIndexKey = `${deployment.artifactPrefix}/${dirIndexPath}`;
    if (await storageExists(dirIndexKey)) {
      return serveFile(dirIndexPath);
    }
  }

  const rootIndexKey = `${deployment.artifactPrefix}/index.html`;
  if (await storageExists(rootIndexKey)) {
    return serveFile("index.html");
  }

  return notFound(`File not found: ${assetPath}`);
};

export const serveSubdomainPreview = async (
  req: Request,
  idInfo: { id: string; isShortId: boolean }
): Promise<Response> => {
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(
      idInfo.isShortId
        ? eq(schema.deployments.shortId, idInfo.id)
        : eq(schema.deployments.id, idInfo.id)
    )
    .limit(1);

  if (!deployment) {
    return notFound("Deployment not found");
  }

  if (deployment.status !== "success") {
    return json(
      { error: `Deployment is not ready (status: ${deployment.status})` },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  let assetPath = url.pathname.replace(/^\/+/, "") || "index.html";

  const legacyPrefixes = [
    `preview/${deployment.id}/`,
    `preview/${deployment.shortId}/`,
    `d/${deployment.id}/`,
    `d/${deployment.shortId}/`
  ];
  for (const prefix of legacyPrefixes) {
    if (assetPath.startsWith(prefix)) {
      assetPath = assetPath.slice(prefix.length) || "index.html";
      break;
    }
  }

  try {
    return await serveDeploymentAsset(deployment, assetPath);
  } catch (err) {
    console.error("Subdomain preview error:", err);
    return json({ error: "Failed to serve file" }, { status: 500 });
  }
};

export const servePathBasedPreview = async (
  _req: Request,
  idInfo: { id: string; isShortId: boolean },
  assetPath: string
): Promise<Response> => {
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(
      idInfo.isShortId
        ? eq(schema.deployments.shortId, idInfo.id)
        : eq(schema.deployments.id, idInfo.id)
    )
    .limit(1);

  if (!deployment) {
    return notFound("Deployment not found");
  }

  if (deployment.status !== "success") {
    return json(
      { error: `Deployment is not ready (status: ${deployment.status})` },
      { status: 400 }
    );
  }

  try {
    return await serveDeploymentAsset(deployment, assetPath);
  } catch (err) {
    console.error("Path-based preview error:", err);
    return json({ error: "Failed to serve file" }, { status: 500 });
  }
};

export const buildSubdomainPreviewUrl = (deploymentId: string) =>
  `${config.devProtocol}://${deploymentId}.${config.devDomain}:${config.port}`;

export const servePreview = async (req: RequestWithParams) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/preview\//, "").split("/");
  const deploymentId = pathParts[0];
  const remainingPath = pathParts.slice(1).join("/");

  if (!deploymentId) {
    return badRequest("Missing deployment id");
  }

  const subdomainUrl = buildSubdomainPreviewUrl(deploymentId);
  const redirectUrl = remainingPath ? `${subdomainUrl}/${remainingPath}` : subdomainUrl;

  return Response.redirect(redirectUrl, 302);
};
