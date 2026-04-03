/**
 * Live metrics on /health via JSON. Loaded from HealthPage layout scriptSrc.
 */

import { formatBytes, formatDuration } from "../../utils/format";

type HealthJson = {
  status: string;
  uptimeSeconds: number;
  pendingRequests: number;
  bunVersion: string;
  hostname: string;
  port: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
};

const setText = (id: string, text: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

const applyPayload = (payload: HealthJson) => {
  const { memory } = payload;

  setText("health-uptime", formatDuration(payload.uptimeSeconds));
  setText("health-rss", formatBytes(memory.rss));
  setText("health-pending-req", String(payload.pendingRequests));
  setText("health-bun", payload.bunVersion);
  setText("health-listen", `${payload.hostname}:${payload.port}`);
  setText("health-mem-rss", formatBytes(memory.rss));
  setText("health-mem-heap-total", formatBytes(memory.heapTotal));
  setText("health-mem-heap-used", formatBytes(memory.heapUsed));
  setText("health-mem-external", formatBytes(memory.external));

  const badge = document.getElementById("health-status-badge");
  if (badge) {
    badge.textContent = payload.status.toUpperCase();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const path = "/health";
  const poll = () => {
    fetch(path, { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body && typeof body === "object" && "memory" in body) {
          applyPayload(body as HealthJson);
        }
      })
      .catch(() => {});
  };
  poll();
  window.setInterval(poll, 5000);
});
