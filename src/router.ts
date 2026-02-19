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
import { auth } from "../auth";
import { guessContentType } from "./utils/contentType";

type PublicRoute = {
  pattern: string;
  methods: Partial<Record<string, PublicRouteHandler>>;
};

type ProtectedRoute = {
  pattern: string;
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
  { pattern: "/login", methods: { GET: pages.loginPage } },
  { pattern: "/health", methods: { GET: pages.health, POST: pages.health } },
  { pattern: "/preview/*", methods: { GET: servePreview } }
];

const protectedRoutes: ProtectedRoute[] = [
  { pattern: "/home", methods: { GET: pages.dashboardPage } },
  { pattern: "/dashboard", methods: { GET: pages.dashboardPage } },
  { pattern: "/projects", methods: { GET: pages.projectsPage, POST: projects.createProject } },
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
    pattern: "/projects/:id/deployments",
    methods: {
      GET: deployments.listDeployments,
      POST: deployments.createDeployment
    }
  },
  { pattern: "/admin", methods: { GET: pages.adminExamplesPage } },
  {
    pattern: "/deployments/:id",
    methods: { GET: pages.handleDeploymentRoute }
  },
  {
    pattern: "/deployments/:id/log",
    methods: { GET: deployments.getDeploymentLog }
  },
  {
    pattern: "/deployments/:id/log/stream",
    methods: { GET: deployments.streamDeploymentLog }
  },
  { pattern: "/account", methods: { GET: account.accountPage } },
  { pattern: "/account/delete", methods: { POST: account.deleteAccount } },
  { pattern: "/api/github/repos", methods: { GET: github.listRepos } },
  { pattern: "/api/github/branches", methods: { GET: github.listBranches } },
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
  { pattern: "/api/admin/examples", methods: { GET: admin.listExamples } },
  {
    pattern: "/api/admin/examples/:name/deploy",
    methods: { POST: admin.createExampleDeployment }
  },
  { pattern: "/api/admin/build-settings", methods: { GET: admin.getBuildSettings, PATCH: admin.updateBuildSettings } },
  { pattern: "/api/deployments/:id", methods: { GET: deployments.getDeployment } },
  {
    pattern: "/api/deployments/:id/log",
    methods: { GET: deployments.getDeploymentLog }
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

  if (pathname.startsWith("/api/auth")) {
    if (method !== "GET" && method !== "POST") {
      return json({ error: "Method Not Allowed" }, { status: 405 });
    }
    return auth.handler(req);
  }

  if (pathname.startsWith("/d/")) {
    const pathParts = pathname.slice(3).split("/");
    const pathId = pathParts[0] ?? "";
    const assetPath = pathParts.slice(1).join("/") || "index.html";
    if (SHORT_ID_REGEX.test(pathId)) {
      return servePathBasedPreview(req, { id: pathId, isShortId: true }, assetPath);
    }
    if (UUID_REGEX.test(pathId)) {
      return servePathBasedPreview(req, { id: pathId, isShortId: false }, assetPath);
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
        const reqWithSession = Object.assign(req, { params, session: result.session });
        return handler(reqWithSession);
      }
    }
  }

  if (pages.wantsHtml(req)) {
    return pages.notFoundPage();
  }
  return json({ error: "Not Found" }, { status: 404 });
};
