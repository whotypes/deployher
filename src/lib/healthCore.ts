import { getStartedAt, getServer } from "../appContext";
import { config, getDevProjectUrlPattern, getProdProjectUrlPattern } from "../config";
import type { HealthData } from "../health/HealthPage";

export const buildHealthCore = (): Omit<HealthData, "pathname" | "user" | "sidebarProjects"> => {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const server = getServer();
  const startedAt = getStartedAt();
  return {
    status: "ok",
    environment: config.env,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    now: new Date().toISOString(),
    bunVersion: Bun.version,
    hostname: server?.hostname ?? config.hostname,
    port: server?.port ?? config.port,
    pid: process.pid,
    pendingRequests: server?.pendingRequests ?? 0,
    pendingWebSockets: server?.pendingWebSockets ?? 0,
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external
    },
    cpu: {
      user: cpu.user,
      system: cpu.system
    },
    domains: {
      dev: getDevProjectUrlPattern(),
      prod: getProdProjectUrlPattern()
    }
  };
};
