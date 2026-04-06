import { Navigate, Route, Routes } from "react-router-dom";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { DashboardRoute } from "./routes/DashboardRoute";
import { LandingRoute } from "./routes/LandingRoute";
import { WhyRoute } from "./routes/WhyRoute";
import { LoginRoute } from "./routes/LoginRoute";
import { ProjectsRoute } from "./routes/ProjectsRoute";
import { NewProjectRoute } from "./routes/NewProjectRoute";
import { ProjectDetailRoute } from "./routes/ProjectDetailRoute";
import { ProjectSettingsRoute } from "./routes/ProjectSettingsRoute";
import { ProjectObservabilityRoute } from "./routes/ProjectObservabilityRoute";
import { DeploymentDetailRoute } from "./routes/DeploymentDetailRoute";
import { AccountRoute } from "./routes/AccountRoute";
import { AdminRoute } from "./routes/AdminRoute";
import { HealthRoute } from "./routes/HealthRoute";
import { NotFoundRoute } from "./routes/NotFoundRoute";

export const App = () => (
  <AppErrorBoundary>
  <Routes>
    <Route path="/" element={<LandingRoute />} />
    <Route path="/why" element={<WhyRoute />} />
    <Route path="/login" element={<LoginRoute />} />
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
