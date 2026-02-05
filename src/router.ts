import {
  extractDeploymentIdFromHost,
  servePathBasedPreview,
  serveSubdomainPreview,
  servePreview,
  SHORT_ID_REGEX,
  UUID_REGEX
} from "./routes/preview";
import * as deployments from "./routes/deployments";
import * as files from "./routes/files";
import * as pages from "./routes/pages";
import * as projects from "./routes/projects";
import { json, type AnyHandler, type RequestWithParams } from "./http/helpers";
import { auth } from "../auth";

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

const routeTable: Array<{
  pattern: string;
  methods: Partial<Record<string, AnyHandler>>;
}> = [
  { pattern: "/", methods: { GET: pages.dashboardPage } },
  { pattern: "/dashboard", methods: { GET: pages.dashboardPage } },
  { pattern: "/projects", methods: { GET: pages.projectsPage, POST: projects.createProject } },
  {
    pattern: "/projects/:id",
    methods: {
      GET: pages.handleProjectRoute as AnyHandler,
      PATCH: projects.updateProject as AnyHandler,
      PUT: projects.updateProject as AnyHandler,
      DELETE: projects.deleteProject as AnyHandler
    }
  },
  {
    pattern: "/projects/:id/deployments",
    methods: {
      GET: deployments.listDeployments as AnyHandler,
      POST: deployments.createDeployment as AnyHandler
    }
  },
  {
    pattern: "/deployments/:id",
    methods: { GET: pages.handleDeploymentRoute as AnyHandler }
  },
  {
    pattern: "/deployments/:id/log",
    methods: { GET: deployments.getDeploymentLog as AnyHandler }
  },
  {
    pattern: "/deployments/:id/log/stream",
    methods: { GET: deployments.streamDeploymentLog as AnyHandler }
  },
  { pattern: "/files", methods: { GET: files.filesPage } },
  { pattern: "/files/upload", methods: { POST: files.filesUpload } },
  { pattern: "/files/download", methods: { GET: files.filesDownload } },
  { pattern: "/health", methods: { GET: pages.health, POST: pages.health } },
  { pattern: "/api/projects", methods: { GET: projects.listProjects, POST: projects.createProject } },
  {
    pattern: "/api/projects/:id",
    methods: {
      GET: projects.getProject as AnyHandler,
      PATCH: projects.updateProject as AnyHandler,
      PUT: projects.updateProject as AnyHandler,
      DELETE: projects.deleteProject as AnyHandler
    }
  },
  {
    pattern: "/api/projects/:id/deployments",
    methods: {
      GET: deployments.listDeployments as AnyHandler,
      POST: deployments.createDeployment as AnyHandler
    }
  },
  { pattern: "/api/deployments/:id", methods: { GET: deployments.getDeployment as AnyHandler } },
  {
    pattern: "/api/deployments/:id/log",
    methods: { GET: deployments.getDeploymentLog as AnyHandler }
  },
  { pattern: "/preview/*", methods: { GET: servePreview } }
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

  for (const route of routeTable) {
    const { match, params } = matchRoute(route.pattern, pathname);
    if (match) {
      const handler = route.methods[method];
      if (handler) {
        const reqWithParams = req as RequestWithParams;
        reqWithParams.params = params;
        return handler(reqWithParams);
      }
    }
  }

  return json({ error: "Not Found" }, { status: 404 });
};
