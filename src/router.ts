import path from "path";
import { auth } from "../auth";
import {
    getSession,
    type ProtectedRouteHandler,
    type PublicRouteHandler,
    requireSession
} from "./auth/session";
import { clientOutDir } from "./client/build";
import { getEmbeddedClientAsset } from "./client/embeddedAssets";
import { buildSpaHtmlResponse, readSpaIndexHtml, spaHtmlUnavailable } from "./client/spaHtml";
import { json } from "./http/helpers";
import * as pageData from "./lib/pageData";
import * as account from "./routes/account";
import * as admin from "./routes/admin";
import * as deploymentObservability from "./routes/deploymentObservability";
import * as deployments from "./routes/deployments";
import * as github from "./routes/github";
import * as pages from "./routes/pages";
import {
    extractDeploymentIdFromHost,
    servePathBasedPreview,
    servePreview,
    serveSubdomainPreview,
    SHORT_ID_REGEX,
    UUID_REGEX
} from "./routes/preview";
import * as projectObservability from "./routes/projectObservability";
import * as projects from "./routes/projects";
import * as runnerInternal from "./routes/runnerInternal";
import * as uiApi from "./routes/uiApi";
import * as cliApi from "./routes/cliApi";
import { requestUsesCliBearerAuth } from "./security/cliAuth";
import { attachCsrfCookie, ensureCsrfToken, validateMutationRequest } from "./security/csrf";
import {
  canonicalWhyOnLandingUrl,
  isPdployApiPathOnTenantHost,
  requestHostIsDashApp
} from "./lib/deployherHosts";
import { guessContentType } from "./utils/contentType";
import { applyApiCorsHeaders, corsPreflightResponse } from "./http/cors";

type PublicRoute = {
  pattern: string;
  methods: Partial<Record<string, PublicRouteHandler>>;
};

type ProtectedRoute = {
  pattern: string;
  operatorOnly?: boolean;
  methods: Partial<Record<string, ProtectedRouteHandler>>;
};

const matchRoute = (
  pattern: string,
  pathname: string
): { match: boolean; params: Record<string, string> } => {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (pattern.endsWith("/*")) {
    const basePattern = pattern.slice(0, -2);
    if (pathname.startsWith(basePattern)) {
      return { match: true, params: {} };
    }
    return { match: false, params: {} };
  }

  if (patternParts.length !== pathParts.length) {
    return { match: false, params: {} };
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i] ?? "";
    const pathPart = pathParts[i] ?? "";
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      return { match: false, params: {} };
    }
  }
  return { match: true, params };
};

const serveSpa = async (req: Request, csrfToken: string) => {
  const html = await readSpaIndexHtml();
  if (!html) return spaHtmlUnavailable();
  return buildSpaHtmlResponse(html, csrfToken);
};

const servePublicSpa: PublicRouteHandler = async (req) => {
  const csrf = ensureCsrfToken(req);
  const res = await serveSpa(req, csrf.token);
  return attachCsrfCookie(res, csrf);
};

const whyPublicGet: PublicRouteHandler = async (req) => {
  if (requestHostIsDashApp(req)) {
    const canonical = canonicalWhyOnLandingUrl();
    if (canonical) {
      return Response.redirect(canonical, 302);
    }
  }
  return servePublicSpa(req);
};

const loginSpa: PublicRouteHandler = async (req) => {
  const url = new URL(req.url);
  const session = await getSession(req);
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  const hasOauthError = oauthError !== null || oauthErrorDescription !== null;
  if (session && !hasOauthError) {
    const redirectTo = url.searchParams.get("redirect") ?? "/dashboard";
    return Response.redirect(new URL(redirectTo, url.origin).toString(), 302);
  }
  const csrf = ensureCsrfToken(req);
  const res = await serveSpa(req, csrf.token);
  return attachCsrfCookie(res, csrf);
};

const healthSpa: PublicRouteHandler = async (req) => {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const csrf = ensureCsrfToken(req);
    const res = await serveSpa(req, csrf.token);
    return attachCsrfCookie(res, csrf);
  }
  return json(pageData.buildHealthCore());
};

const protectedSpa: ProtectedRouteHandler = async (req) => {
  const csrf = ensureCsrfToken(req);
  const res = await serveSpa(req, csrf.token);
  return attachCsrfCookie(res, csrf);
};

const projectDetailPageGet: ProtectedRouteHandler = async (req) => {
  if (pages.wantsHtml(req)) {
    const csrf = ensureCsrfToken(req);
    const res = await serveSpa(req, csrf.token);
    return attachCsrfCookie(res, csrf);
  }
  return projects.getProject(req);
};

const deploymentDetailPageGet: ProtectedRouteHandler = async (req) => {
  if (pages.wantsHtml(req)) {
    const csrf = ensureCsrfToken(req);
    const res = await serveSpa(req, csrf.token);
    return attachCsrfCookie(res, csrf);
  }
  return deployments.getDeployment(req);
};

const publicRoutes: PublicRoute[] = [
  { pattern: "/", methods: { GET: servePublicSpa } },
  { pattern: "/why", methods: { GET: whyPublicGet } },
  { pattern: "/login", methods: { GET: loginSpa } },
  { pattern: "/device", methods: { GET: servePublicSpa } },
  { pattern: "/health", methods: { GET: healthSpa } },
  { pattern: "/preview/*", methods: { GET: servePreview } },
  { pattern: "/api/csrf", methods: { GET: uiApi.getCsrfApi } },
  { pattern: "/api/session", methods: { GET: uiApi.getSessionApi } },
  { pattern: "/api/health", methods: { GET: uiApi.getHealthApi } },
  { pattern: "/api/ui/landing", methods: { GET: uiApi.getLandingSessionApi } }
];

const protectedRoutes: ProtectedRoute[] = [
  { pattern: "/api/cli/whoami", methods: { GET: cliApi.getCliWhoamiApi } },
  { pattern: "/api/workspace/dashboard", methods: { GET: uiApi.getWorkspaceDashboardApi } },
  { pattern: "/api/ui/projects-page", methods: { GET: uiApi.getUiProjectsPageApi } },
  { pattern: "/api/ui/new-project", methods: { GET: uiApi.getUiNewProjectApi } },
  { pattern: "/api/ui/projects/:id/detail", methods: { GET: uiApi.getUiProjectDetailApi } },
  { pattern: "/api/ui/projects/:id/observability", methods: { GET: uiApi.getUiProjectObservabilityApi } },
  {
    pattern: "/api/ui/projects/:id/settings/general",
    methods: { GET: (req) => uiApi.getUiProjectSettingsApi(req, "general") }
  },
  {
    pattern: "/api/ui/projects/:id/settings/env",
    methods: { GET: (req) => uiApi.getUiProjectSettingsApi(req, "env") }
  },
  {
    pattern: "/api/ui/projects/:id/settings/danger",
    methods: { GET: (req) => uiApi.getUiProjectSettingsApi(req, "danger") }
  },
  { pattern: "/api/ui/deployments/:id/detail", methods: { GET: uiApi.getUiDeploymentDetailApi } },
  { pattern: "/api/ui/health-page", methods: { GET: uiApi.getUiHealthPageApi } },
  { pattern: "/api/ui/account", methods: { GET: uiApi.getUiAccountApi } },
  {
    pattern: "/api/ui/admin/examples",
    operatorOnly: true,
    methods: { GET: uiApi.getUiAdminExamplesApi }
  },
  { pattern: "/home", methods: { GET: protectedSpa } },
  { pattern: "/dashboard", methods: { GET: protectedSpa } },
  { pattern: "/projects", methods: { GET: protectedSpa, POST: projects.createProject } },
  { pattern: "/projects/new", methods: { GET: protectedSpa } },
  {
    pattern: "/projects/:id",
    methods: {
      GET: projectDetailPageGet,
      PATCH: projects.updateProject,
      PUT: projects.updateProject,
      DELETE: projects.deleteProject
    }
  },
  {
    pattern: "/projects/:id/settings",
    methods: { GET: protectedSpa }
  },
  {
    pattern: "/projects/:id/settings/env",
    methods: { GET: protectedSpa }
  },
  {
    pattern: "/projects/:id/settings/danger",
    methods: { GET: protectedSpa }
  },
  {
    pattern: "/projects/:id/deployments",
    methods: {
      GET: deployments.listDeployments,
      POST: deployments.createDeployment
    }
  },
  {
    pattern: "/projects/:id/observability",
    methods: { GET: protectedSpa }
  },
  { pattern: "/admin", operatorOnly: true, methods: { GET: protectedSpa } },
  {
    pattern: "/deployments/:id",
    methods: { GET: deploymentDetailPageGet }
  },
  {
    pattern: "/deployments/:id/cancel",
    methods: { POST: deployments.cancelDeployment }
  },
  {
    pattern: "/deployments/:id/log",
    methods: { GET: deployments.getDeploymentLog }
  },
  {
    pattern: "/deployments/:id/log/stream",
    methods: { GET: deployments.streamDeploymentLog }
  },
  {
    pattern: "/deployments/:id/runtime-log/stream",
    methods: { GET: deployments.streamDeploymentRuntimeLog }
  },
  {
    pattern: "/deployments/:id/runtime-log",
    methods: { GET: deployments.getDeploymentRuntimeLog }
  },
  { pattern: "/account", methods: { GET: protectedSpa } },
  { pattern: "/account/delete", methods: { POST: account.deleteAccount } },
  { pattern: "/api/github/repos", methods: { GET: github.listRepos } },
  { pattern: "/api/github/branches", methods: { GET: github.listBranches } },
  { pattern: "/api/github/repo-hints", methods: { GET: github.repoHints } },
  { pattern: "/api/github/repo-locs", methods: { GET: github.repoLocs } },
  { pattern: "/api/github/repo-file", methods: { GET: github.repoFile } },
  { pattern: "/api/projects", methods: { GET: projects.listProjects, POST: projects.createProject } },
  {
    pattern: "/api/projects/:id",
    methods: {
      GET: projects.getProject,
      PATCH: projects.updateProject,
      PUT: projects.updateProject,
      DELETE: projects.deleteProject
    }
  },
  {
    pattern: "/api/projects/:id/deployments",
    methods: {
      GET: deployments.listDeployments,
      POST: deployments.createDeployment
    }
  },
  {
    pattern: "/api/projects/:id/env",
    methods: {
      GET: projects.listProjectEnvs,
      POST: projects.upsertProjectEnv
    }
  },
  {
    pattern: "/api/projects/:id/env/:envId",
    methods: {
      DELETE: projects.deleteProjectEnv
    }
  },
  {
    pattern: "/api/projects/:id/observability/metrics",
    methods: { GET: projectObservability.getObservabilityMetrics }
  },
  {
    pattern: "/api/projects/:id/observability/traffic",
    methods: { GET: projectObservability.getObservabilityTraffic }
  },
  {
    pattern: "/api/projects/:id/observability/alerts/destinations/:destId",
    methods: { DELETE: projectObservability.deleteAlertDestination }
  },
  {
    pattern: "/api/projects/:id/observability/alerts/destinations",
    methods: {
      GET: projectObservability.listAlertDestinations,
      POST: projectObservability.createAlertDestination
    }
  },
  {
    pattern: "/api/projects/:id/observability/alerts/rules/:ruleId",
    methods: {
      PATCH: projectObservability.patchAlertRule,
      DELETE: projectObservability.deleteAlertRule
    }
  },
  {
    pattern: "/api/projects/:id/observability/alerts/rules",
    methods: {
      GET: projectObservability.listAlertRules,
      POST: projectObservability.createAlertRule
    }
  },
  {
    pattern: "/api/projects/:id/observability/alerts/test",
    methods: { POST: projectObservability.postObservabilityTestWebhook }
  },
  {
    pattern: "/api/projects/:id/site-metadata/refresh",
    methods: { POST: projects.postRefreshProjectSiteMetadata }
  },
  {
    pattern: "/api/projects/:id/site-metadata/preview-image",
    methods: { GET: projects.getProjectSitePreviewImage }
  },
  { pattern: "/api/admin/examples", operatorOnly: true, methods: { GET: admin.listExamples } },
  {
    pattern: "/api/admin/examples/:name/deploy",
    operatorOnly: true,
    methods: { POST: admin.createExampleDeployment }
  },
  { pattern: "/api/admin/build-settings", operatorOnly: true, methods: { GET: admin.getBuildSettings, PATCH: admin.updateBuildSettings } },
  { pattern: "/api/deployments/:id", methods: { GET: deployments.getDeployment } },
  {
    pattern: "/api/deployments/:id/observability",
    methods: { GET: deploymentObservability.getDeploymentObservability }
  },
  { pattern: "/api/deployments/:id/cancel", methods: { POST: deployments.cancelDeployment } },
  {
    pattern: "/api/deployments/:id/ensure-preview",
    methods: { POST: deployments.ensureDeploymentPreview }
  },
  {
    pattern: "/api/deployments/:id/log",
    methods: { GET: deployments.getDeploymentLog }
  },
  {
    pattern: "/api/deployments/:id/log/stream",
    methods: { GET: deployments.streamDeploymentLog }
  },
  {
    pattern: "/api/deployments/:id/runtime-log/stream",
    methods: { GET: deployments.streamDeploymentRuntimeLog }
  },
  {
    pattern: "/api/deployments/:id/runtime-log",
    methods: { GET: deployments.getDeploymentRuntimeLog }
  }
];

const isInsideClientOutDir = (filePath: string): boolean =>
  filePath === clientOutDir || filePath.startsWith(`${clientOutDir}${path.sep}`);

const resolveClientFile = async (subPath: string): Promise<string | null> => {
  const normalizedPath = subPath.replace(/^\/+/, "");
  if (!normalizedPath || normalizedPath.includes("..") || normalizedPath.includes("\0")) {
    return null;
  }

  const direct = path.resolve(clientOutDir, normalizedPath);
  if (isInsideClientOutDir(direct) && path.extname(direct) && (await Bun.file(direct).exists())) {
    return direct;
  }

  const nested = path.resolve(clientOutDir, "assets", normalizedPath);
  if (isInsideClientOutDir(nested) && path.extname(nested) && (await Bun.file(nested).exists())) {
    return nested;
  }

  return null;
};

const serveClientFile = async (requestedPath: string): Promise<Response | null> => {
  const resolved = await resolveClientFile(requestedPath);
  if (resolved) {
    return new Response(Bun.file(resolved), {
      headers: { "Content-Type": guessContentType(resolved) }
    });
  }

  const embeddedAsset = getEmbeddedClientAsset(requestedPath);
  if (embeddedAsset) {
    return new Response(embeddedAsset.blob, {
      headers: { "Content-Type": embeddedAsset.contentType }
    });
  }

  return null;
};

const dispatchPublicAndProtectedRoutes = async (req: Request): Promise<Response | null> => {
  const method = req.method;
  const pathname = new URL(req.url).pathname;

  for (const route of publicRoutes) {
    const { match, params } = matchRoute(route.pattern, pathname);
    if (match) {
      const handler = route.methods[method];
      if (handler) {
        const reqWithParams = Object.assign(req, { params });
        return handler(reqWithParams);
      }
      return json({ error: "Method Not Allowed" }, { status: 405 });
    }
  }

  for (const route of protectedRoutes) {
    const { match, params } = matchRoute(route.pattern, pathname);
    if (match) {
      const handler = route.methods[method];
      if (handler) {
        const result = await requireSession(req, pathname);
        if ("response" in result) {
          return result.response;
        }
        const csrf = ensureCsrfToken(req);
        const appOwnedMutation = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
        if (appOwnedMutation && !requestUsesCliBearerAuth(req)) {
          const validation = await validateMutationRequest(req, csrf.token);
          if (!validation.ok) {
            return attachCsrfCookie(
              json({ error: validation.reason }, { status: 403 }),
              csrf
            );
          }
        }

        if (route.operatorOnly && result.session.user.role !== "operator") {
          return attachCsrfCookie(json({ error: "Forbidden" }, { status: 403 }), csrf);
        }

        const reqWithSession = Object.assign(req, { params, session: result.session, csrfToken: csrf.token });
        const response = await handler(reqWithSession);
        return attachCsrfCookie(response, csrf);
      }
      return json({ error: "Method Not Allowed" }, { status: 405 });
    }
  }

  return null;
};

const respondDashboardApiOr404 = async (req: Request): Promise<Response> => {
  const apiResponse = await dispatchPublicAndProtectedRoutes(req);
  if (apiResponse !== null) {
    return apiResponse;
  }
  return json({ error: "Not Found" }, { status: 404 });
};

export const router = async (req: Request): Promise<Response> => {
  const preflight = corsPreflightResponse(req);
  if (preflight) return preflight;
  const res = await dispatchRequest(req);
  return applyApiCorsHeaders(req, res);
};

const dispatchRequest = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const method = req.method;
  const pathname = url.pathname;

  if (pathname === "/internal/trigger-preview-rehydrate" && method === "POST") {
    return runnerInternal.postTriggerPreviewRehydrate(req);
  }

  if (pathname.startsWith("/api/auth")) {
    if (method !== "GET" && method !== "POST") {
      return json({ error: "Method Not Allowed" }, { status: 405 });
    }
    return auth.handler(req);
  }

  const host = req.headers.get("host") ?? "";
  const deploymentIdInfo = extractDeploymentIdFromHost(host);

  if (deploymentIdInfo) {
    if (isPdployApiPathOnTenantHost(pathname)) {
      return respondDashboardApiOr404(req);
    }
    return serveSubdomainPreview(req, deploymentIdInfo);
  }

  if (pathname.startsWith("/assets/") && method === "GET") {
    const subPath = pathname.slice("/assets".length).replace(/^\/+/, "") || "";
    const assetResponse = await serveClientFile(subPath);
    if (!assetResponse) {
      return json({ error: "Not Found" }, { status: 404 });
    }
    return assetResponse;
  }

  if (pathname.startsWith("/api/")) {
    return respondDashboardApiOr404(req);
  }

  if (pathname.startsWith("/d/")) {
    const pathParts = pathname.slice(3).split("/");
    const pathId = pathParts[0] ?? "";
    const rawPath = pathParts.slice(1).join("/");
    if (SHORT_ID_REGEX.test(pathId)) {
      return servePathBasedPreview(req, { id: pathId, isShortId: true }, rawPath);
    }
    if (UUID_REGEX.test(pathId)) {
      return servePathBasedPreview(req, { id: pathId, isShortId: false }, rawPath);
    }
  }

  const pageResponse = await dispatchPublicAndProtectedRoutes(req);
  if (pageResponse !== null) {
    return pageResponse;
  }

  if (method === "GET" && path.extname(pathname)) {
    const assetResponse = await serveClientFile(pathname);
    if (assetResponse) {
      return assetResponse;
    }
  }

  if (pages.wantsHtml(req)) {
    const csrf = ensureCsrfToken(req);
    const res = await serveSpa(req, csrf.token);
    return attachCsrfCookie(res, csrf);
  }
  return json({ error: "Not Found" }, { status: 404 });
};
