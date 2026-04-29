import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { setSpaNavigate } from "./spaNavigationBridge";
import { AppHomeRoute } from "./routes/AppHomeRoute";
import { DashboardRoute } from "./routes/DashboardRoute";
import { LoginRoute } from "./routes/LoginRoute";
import { ProjectsRoute } from "./routes/ProjectsRoute";
import { NewProjectRoute } from "./routes/NewProjectRoute";
import { ProjectDetailRoute } from "./routes/ProjectDetailRoute";
import { ProjectSettingsRoute } from "./routes/ProjectSettingsRoute";
import { ProjectObservabilityRoute } from "./routes/ProjectObservabilityRoute";
import { DeploymentDetailRoute } from "./routes/DeploymentDetailRoute";
import { AccountRoute } from "./routes/AccountRoute";
import { AdminRoute } from "./routes/AdminRoute";
import { DeviceAuthorizeRoute } from "./routes/DeviceAuthorizeRoute";
import { HealthRoute } from "./routes/HealthRoute";
import { NotFoundRoute } from "./routes/NotFoundRoute";

const SpaNavigationRegister = () => {
  const navigate = useNavigate();
  useEffect(() => {
    setSpaNavigate((to, opts) => {
      void navigate(to, { replace: Boolean(opts?.replace) });
    });
    return () => {
      setSpaNavigate(null);
    };
  }, [navigate]);
  return null;
};

export const App = () => (
  <AppErrorBoundary>
    <SpaNavigationRegister />
    <Routes>
      <Route path="/" element={<AppHomeRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/device" element={<DeviceAuthorizeRoute />} />
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardRoute />} />
      <Route path="/projects" element={<ProjectsRoute />} />
      <Route path="/projects/new" element={<NewProjectRoute />} />
      <Route path="/projects/:id" element={<ProjectDetailRoute />} />
      <Route path="/projects/:id/settings" element={<ProjectSettingsRoute section="general" />} />
      <Route path="/projects/:id/settings/env" element={<ProjectSettingsRoute section="env" />} />
      <Route path="/projects/:id/settings/danger" element={<ProjectSettingsRoute section="danger" />} />
      <Route path="/projects/:id/observability" element={<ProjectObservabilityRoute />} />
      <Route path="/deployments/:id" element={<DeploymentDetailRoute />} />
      <Route path="/account" element={<AccountRoute />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="/health" element={<HealthRoute />} />
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  </AppErrorBoundary>
);
