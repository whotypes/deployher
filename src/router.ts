import path from "path";
import {
  type ProtectedRouteHandler,
  type PublicRouteHandler,
  requireSession
} from "./auth/session";
import { clientOutDir } from "./client/build";
import { getEmbeddedClientAsset } from "./client/embeddedAssets";
import { json } from "./http/helpers";
import {
  extractDeploymentIdFromHost,
  servePathBasedPreview,
  serveSubdomainPreview,
  servePreview,
  SHORT_ID_REGEX,
  UUID_REGEX
} from "./routes/preview";
import * as admin from "./routes/admin";
import * as account from "./routes/account";
import * as deployments from "./routes/deployments";
import * as github from "./routes/github";
import * as pages from "./routes/pages";
import * as projects from "./routes/projects";
import * as projectObservability from "./routes/projectObservability";
import * as runnerInternal from "./routes/runnerInternal";
import { auth } from "../auth";
import { guessContentType } from "./utils/contentType";
import { attachCsrfCookie, ensureCsrfToken, validateMutationRequest } from "./security/csrf";

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

const publicRoutes: PublicRoute[] = [
  { pattern: "/", methods: { GET: pages.landingPage } },
  { pattern: "/why", methods: { GET: pages.whyPage } },
  { pattern: "/login", methods: { GET: pages.loginPage } },
  { pattern: "/health", methods: { GET: pages.health } },
  { pattern: "/preview/*", methods: { GET: servePreview } }
];

const protectedRoutes: ProtectedRoute[] = [
  { pattern: "/home", methods: { GET: pages.dashboardPage } },
  { pattern: "/dashboard", methods: { GET: pages.dashboardPage } },
  { pattern: "/projects", methods: { GET: pages.projectsPage, POST: projects.createProject } },
  { pattern: "/projects/new", methods: { GET: pages.newProjectPage } },
  {
    pattern: "/projects/:id",
    methods: {
      GET: pages.handleProjectRoute,
      PATCH: projects.updateProject,
      PUT: projects.updateProject,
      DELETE: projects.deleteProject
    }
  },
  {
    pattern: "/projects/:id/settings",
    methods: { GET: pages.projectSettingsPage }
  },
  {
    pattern: "/projects/:id/settings/env",
    methods: { GET: pages.projectSettingsEnvPage }
  },
  {
    pattern: "/projects/:id/settings/danger",
    methods: { GET: pages.projectSettingsDangerPage }
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
    methods: { GET: pages.projectObservabilityPage }
  },
  { pattern: "/admin", operatorOnly: true, methods: { GET: pages.adminExamplesPage } },
  {
    pattern: "/deployments/:id",
    methods: { GET: pages.handleDeploymentRoute }
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
  { pattern: "/account", methods: { GET: account.accountPage } },
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
  { pattern: "/api/admin/examples", operatorOnly: true, methods: { GET: admin.listExamples } },
  {
    pattern: "/api/admin/examples/:name/deploy",
    operatorOnly: true,
    methods: { POST: admin.createExampleDeployment }
  },
  { pattern: "/api/admin/build-settings", operatorOnly: true, methods: { GET: admin.getBuildSettings, PATCH: admin.updateBuildSettings } },
  { pattern: "/api/deployments/:id", methods: { GET: deployments.getDeployment } },
  { pattern: "/api/deployments/:id/cancel", methods: { POST: deployments.cancelDeployment } },
  {
    pattern: "/api/deployments/:id/log",
    methods: { GET: deployments.getDeploymentLog }
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

export const router = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const method = req.method;
  const pathname = url.pathname;

  const host = req.headers.get("host") ?? "";
  const deploymentIdInfo = extractDeploymentIdFromHost(host);
  if (deploymentIdInfo) {
    return serveSubdomainPreview(req, deploymentIdInfo);
  }

  if (pathname.startsWith("/assets/") && method === "GET") {
    const subPath = pathname.slice("/assets".length).replace(/^\/+/, "") || "";
    const resolved = path.resolve(clientOutDir, subPath);
    if (!resolved.startsWith(clientOutDir)) {
      return json({ error: "Not Found" }, { status: 404 });
    }
    const file = Bun.file(resolved);
    if (!(await file.exists())) {
      const embeddedAsset = getEmbeddedClientAsset(subPath);
      if (embeddedAsset) {
        return new Response(embeddedAsset.blob, {
          headers: { "Content-Type": embeddedAsset.contentType }
        });
      }
      return json({ error: "Not Found" }, { status: 404 });
    }
    return new Response(file, {
      headers: { "Content-Type": guessContentType(resolved) }
    });
  }

  if (pathname === "/internal/trigger-preview-rehydrate" && method === "POST") {
    return runnerInternal.postTriggerPreviewRehydrate(req);
  }

  if (pathname.startsWith("/api/auth")) {
    if (method !== "GET" && method !== "POST") {
      return json({ error: "Method Not Allowed" }, { status: 405 });
    }
    return auth.handler(req);
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
        if (appOwnedMutation) {
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

  if (pages.wantsHtml(req)) {
    return pages.notFoundPage();
  }
  return json({ error: "Not Found" }, { status: 404 });
};
