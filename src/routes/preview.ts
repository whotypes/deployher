import { eq } from "drizzle-orm";
import { buildPublicPreviewUrl, config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { badRequest, json, notFound, type RequestWithParams } from "../http/helpers";
import {
  loadPreviewManifest,
  maybeLogPreviewTraffic,
  resolvePreviewManifestEntry
} from "../lib/previewServe";
import { sanitizeProxyResponseHeaders } from "../lib/proxyHeaders";
import { getStream, exists as storageExists, isStorageConfigured } from "../storage";
import { guessContentType } from "../utils/contentType";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SHORT_ID_REGEX = /^[0-9a-z]{9,10}$/;

export const resolvePreviewAssetPathForStrategy = (
  pathAfterLeadingSlashStrip: string,
  serveStrategy: "static" | "server" | null | undefined
): string => {
  if (pathAfterLeadingSlashStrip) return pathAfterLeadingSlashStrip;
  return (serveStrategy ?? "static") === "server" ? "" : "index.html";
};

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

const isSafeAssetPath = (assetPath: string): boolean => {
  if (assetPath.includes("\0")) return false;
  if (assetPath.startsWith("/")) return false;
  return !assetPath.split("/").some((segment) => segment === "..");
};

export const serveDeploymentAsset = async (
  deployment: typeof schema.deployments.$inferSelect,
  assetPath: string,
  req?: Request
): Promise<Response> => {
  if (!isSafeAssetPath(assetPath)) {
    return badRequest("Invalid asset path");
  }

  const serveFile = async (filePath: string, options?: { key?: string; cacheControl?: string }) => {
    const key = options?.key ?? `${deployment.artifactPrefix}/${filePath}`;
    const contentType = guessContentType(filePath);
    const stream = getStream(key);
    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          options?.cacheControl ??
          (contentType.includes("text/html")
            ? "no-cache"
            : /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot)$/i.test(filePath)
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600")
      }
    });
  };

  const manifest = await loadPreviewManifest(
    deployment.id ?? deployment.shortId ?? deployment.artifactPrefix,
    deployment.previewManifestKey
  );
  if (manifest) {
    const manifestEntry = resolvePreviewManifestEntry(manifest, assetPath);
    if (!manifestEntry) {
      return notFound(`File not found: ${assetPath}`);
    }
    if (manifestEntry.cacheClass !== "document") {
      const assetBaseUrl = config.preview.assetBaseUrl?.trim();
      if (assetBaseUrl) {
        const base = assetBaseUrl.endsWith("/") ? assetBaseUrl : `${assetBaseUrl}/`;
        return Response.redirect(
          new URL(manifestEntry.key.replace(/^\/+/, ""), base).toString(),
          302
        );
      }
    }
    return serveFile(manifestEntry.path, {
      key: manifestEntry.key,
      cacheControl: manifestEntry.cacheControl
    });
  }

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

const PREVIEW_RUNNER_FETCH_TIMEOUT_MS = 20 * 60 * 1000;

const serveDeploymentByStrategy = async (
  req: Request,
  deployment: typeof schema.deployments.$inferSelect,
  assetPath: string
): Promise<Response> => {
  const serveHandlers: Record<
    "static" | "server",
    (request: Request, d: typeof schema.deployments.$inferSelect, p: string) => Promise<Response>
  > = {
    static: (request, d, p) => serveDeploymentAsset(d, p, request),
    server: async (request, d, p) => {
      const previewTarget = d.buildServerPreviewTarget ?? "isolated-runner";
      if (!config.runner.previewEnabled) {
        return json(
          { error: "Server previews are disabled until an isolated runner is configured" },
          { status: 503 }
        );
      }
      if (!config.runner.url) {
        return json(
          { error: "Server preview runner URL is not configured" },
          { status: 503 }
        );
      }
      const pullRef = d.runtimeImagePullRef?.trim() ?? "";
      const artifactKey = d.runtimeImageArtifactKey?.trim() ?? "";
      if (!pullRef && !artifactKey) {
        return json(
          { error: "No runtime image is available for this deployment" },
          { status: 503 }
        );
      }

      const runnerBase = config.runner.url.endsWith("/")
        ? config.runner.url.slice(0, -1)
        : config.runner.url;
      const upstreamUrl = new URL(
        `/preview/${d.id}/${p.replace(/^\/+/, "")}`,
        `${runnerBase}/`
      );

      const runtimeConfigPayload = d.runtimeConfig ?? {
        port: 3000,
        command: [] as string[]
      };

      const headers = new Headers(request.headers);
      headers.delete("host");
      const clientHost = request.headers.get("host")?.trim();
      if (clientHost && !headers.has("x-forwarded-host")) {
        headers.set("x-forwarded-host", clientHost);
      }
      const incomingUrl = new URL(request.url);
      if (!headers.has("x-forwarded-proto")) {
        headers.set("x-forwarded-proto", incomingUrl.protocol === "https:" ? "https" : "http");
      }
      headers.set("x-deployher-deployment-id", d.id);
      headers.set("x-deployher-project-id", d.projectId);
      headers.set("x-deployher-preview-path", p);
      headers.set("x-deployher-preview-target", previewTarget);
      if (pullRef) {
        headers.set("x-deployher-runtime-image-pull-ref", pullRef);
      } else {
        headers.set("x-deployher-runtime-image-key", artifactKey);
      }
      headers.set("x-deployher-runtime-config", JSON.stringify(runtimeConfigPayload));
      if (config.runner.sharedSecret) {
        headers.set("x-deployher-runner-secret", config.runner.sharedSecret);
      }

      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(upstreamUrl.toString(), {
          method: request.method,
          headers,
          signal: AbortSignal.timeout(PREVIEW_RUNNER_FETCH_TIMEOUT_MS),
          ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: request.body }),
          redirect: "manual"
        });
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        const message = e instanceof Error ? e.message : String(e);
        if (name === "TimeoutError" || name === "AbortError") {
          return json(
            {
              error:
                "Preview runner took too long to respond (cold start: docker pull + container boot). Retry in a moment."
            },
            { status: 504 }
          );
        }
        throw e;
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: sanitizeProxyResponseHeaders(upstreamResponse.headers)
      });
    }
  };

  const strategy = deployment.serveStrategy ?? "static";
  const handler = serveHandlers[strategy] ?? serveHandlers.static;
  return handler(req, deployment, assetPath);
};

const getDeploymentByIdInfo = async (idInfo: { id: string; isShortId: boolean }) => {
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(
      idInfo.isShortId
        ? eq(schema.deployments.shortId, idInfo.id)
        : eq(schema.deployments.id, idInfo.id)
    )
    .limit(1);

  return deployment ?? null;
};

export const serveSubdomainPreview = async (
  req: Request,
  idInfo: { id: string; isShortId: boolean }
): Promise<Response> => {
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const deployment = await getDeploymentByIdInfo(idInfo);
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
  let assetPath = url.pathname.replace(/^\/+/, "");

  const stripPrefixes = [
    `preview/${deployment.id}/`,
    `preview/${deployment.shortId}/`,
    `d/${deployment.id}/`,
    `d/${deployment.shortId}/`
  ];
  for (const prefix of stripPrefixes) {
    if (assetPath.startsWith(prefix)) {
      assetPath = assetPath.slice(prefix.length);
      break;
    }
  }

  assetPath = resolvePreviewAssetPathForStrategy(assetPath, deployment.serveStrategy);

  try {
    const started = Date.now();
    const response = await serveDeploymentByStrategy(req, deployment, assetPath);
    maybeLogPreviewTraffic(req, deployment, assetPath, response.status, {
      durationMs: Date.now() - started
    });
    return response;
  } catch (err) {
    console.error("Subdomain preview error:", err);
    return json({ error: "Failed to serve file" }, { status: 500 });
  }
};

export const servePathBasedPreview = async (
  req: Request,
  idInfo: { id: string; isShortId: boolean },
  rawPath: string
): Promise<Response> => {
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const deployment = await getDeploymentByIdInfo(idInfo);
  if (!deployment) {
    return notFound("Deployment not found");
  }

  if (deployment.status !== "success") {
    return json(
      { error: `Deployment is not ready (status: ${deployment.status})` },
      { status: 400 }
    );
  }

  const assetPath = resolvePreviewAssetPathForStrategy(
    rawPath.replace(/^\/+/, ""),
    deployment.serveStrategy
  );

  try {
    const started = Date.now();
    const response = await serveDeploymentByStrategy(req, deployment, assetPath);
    maybeLogPreviewTraffic(req, deployment, assetPath, response.status, {
      durationMs: Date.now() - started
    });
    return response;
  } catch (err) {
    console.error("Path-based preview error:", err);
    return json({ error: "Failed to serve file" }, { status: 500 });
  }
};

export const buildSubdomainPreviewUrl = (deploymentId: string) => buildPublicPreviewUrl(deploymentId);

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
