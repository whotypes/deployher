import { getSession, type RequestWithParamsAndSession } from "../auth/session";
import { json, notFound } from "../http/helpers";
import type { HealthData } from "../health/HealthPage";
import * as pageData from "../lib/pageData";
import { listSidebarProjectSummariesForUser } from "./projects";
import { attachCsrfCookie, ensureCsrfToken } from "../security/csrf";

const sessionUser = (req: RequestWithParamsAndSession): pageData.SessionUserForPage => ({
  id: req.session.user.id,
  name: req.session.user.name ?? null,
  email: req.session.user.email,
  image: req.session.user.image ?? null,
  role: req.session.user.role
});

export const getCsrfApi = (req: Request) => {
  const csrf = ensureCsrfToken(req);
  return attachCsrfCookie(json({ csrfToken: csrf.token }), csrf);
};

export const getSessionApi = async (req: Request) => {
  const session = await getSession(req);
  if (!session) {
    return json({ user: null as null });
  }
  return json({
    user: {
      id: session.user.id,
      name: session.user.name ?? null,
      email: session.user.email,
      image: session.user.image ?? null,
      role: session.user.role
    }
  });
};

export const getHealthApi = () => {
  const core = pageData.buildHealthCore();
  return json(core as Omit<HealthData, "pathname" | "user" | "sidebarProjects">);
};

export const getLandingSessionApi = async (req: Request) => {
  const session = await getSession(req);
  return json({ authenticated: Boolean(session) });
};

export const getWorkspaceDashboardApi = async (req: RequestWithParamsAndSession) => {
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildDashboardData(sessionUser(req), pathname);
  return json(data);
};

export const getUiProjectsPageApi = async (req: RequestWithParamsAndSession) => {
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildProjectsPageData(sessionUser(req), pathname, req.csrfToken ?? "");
  return json(data);
};

export const getUiNewProjectApi = async (req: RequestWithParamsAndSession) => {
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildNewProjectPageData(sessionUser(req), pathname, req.csrfToken ?? "");
  return json(data);
};

export const getUiProjectDetailApi = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) return notFound("Project not found");
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildProjectDetailData(sessionUser(req), pathname, req.csrfToken ?? "", id);
  if (!data) return notFound("Project not found");
  return json(data);
};

export const getUiProjectObservabilityApi = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) return notFound("Project not found");
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildProjectObservabilityData(
    sessionUser(req),
    pathname,
    req.csrfToken ?? "",
    id
  );
  if (!data) return notFound("Project not found");
  return json(data);
};

export const getUiProjectSettingsApi = async (
  req: RequestWithParamsAndSession,
  section: "general" | "env" | "danger"
) => {
  const id = req.params["id"];
  if (!id) return notFound("Project not found");
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildProjectSettingsData(
    sessionUser(req),
    pathname,
    req.csrfToken ?? "",
    id,
    section
  );
  if (!data) return notFound("Project not found");
  return json(data);
};

export const getUiDeploymentDetailApi = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) return notFound("Deployment not found");
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildDeploymentDetailData(sessionUser(req), pathname, req.csrfToken ?? "", id);
  if (!data) return notFound("Deployment not found");
  return json(data);
};

export const getUiAdminExamplesApi = async (req: RequestWithParamsAndSession) => {
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildAdminExamplesData(sessionUser(req), pathname, req.csrfToken ?? "");
  return json(data);
};

export const getUiAccountApi = async (req: RequestWithParamsAndSession) => {
  const pathname = new URL(req.url).pathname;
  const data = await pageData.buildAccountPageData(sessionUser(req), pathname, req.csrfToken ?? "");
  return json(data);
};

export const getUiHealthPageApi = async (req: RequestWithParamsAndSession) => {
  const pathname = new URL(req.url).pathname;
  const core = pageData.buildHealthCore();
  const sidebarProjects = await listSidebarProjectSummariesForUser(req.session.user.id);
  const payload: HealthData = {
    pathname,
    ...core,
    user: pageData.toLayoutUser(sessionUser(req)),
    sidebarProjects
  };
  return json(payload);
};
