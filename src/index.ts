import path from "path";
import { config } from "./config";
import { setServer, setStartedAt } from "./appContext";
import { buildClient, clientOutDir } from "./client/build";
import { json } from "./http/helpers";
import { extractDeploymentIdFromHost } from "./routes/preview";
import { router } from "./router";
import { rehydratePreviewRunnerAfterAppStart } from "./lib/previewRunnerRehydrate";
import { startQueueStallAlertScheduler } from "./lib/projectAlerts";
import { checkStorageConnectivity, isStorageConfigured } from "./storage";

setStartedAt(Date.now());

const start = async () => {
  const buildResult = await buildClient();
  if (buildResult.skipped) {
    console.log("Skipping client asset build at startup (SKIP_CLIENT_BUILD enabled).");
  } else if (!buildResult.success) {
    console.warn("Client assets may be missing; /assets/* will 404 until build succeeds.");
  }
  const indexHtml = path.join(clientOutDir, "index.html");
  if (!(await Bun.file(indexHtml).exists())) {
    console.warn(
      `Missing ${indexHtml}: SPA shell missing. Run \`bun run build:client\` or unset SKIP_CLIENT_BUILD.`
    );
  }
  const server = Bun.serve({
    port: config.port,
    hostname: config.hostname,
    development: config.env !== "production",
    idleTimeout: 255,
    fetch: async (req, srv) => {
      const host = req.headers.get("host") ?? "";
      const pathname = new URL(req.url).pathname;
      if (
        extractDeploymentIdFromHost(host) ||
        pathname.startsWith("/d/") ||
        pathname.startsWith("/preview/")
      ) {
        srv.timeout(req, 0);
      }
      return await router(req);
    },
    error(error) {
      console.error(error);
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  });
  setServer(server);
  startQueueStallAlertScheduler();
  void rehydratePreviewRunnerAfterAppStart().catch((err) => {
    console.error("Preview runner rehydrate failed:", err);
  });
  console.log(
    `API server running in ${config.env} mode at http://${server.hostname}:${server.port}`,
  );
  if (isStorageConfigured()) {
    checkStorageConnectivity().then(({ ok, message }) => {
      if (!ok && message) console.error(message);
    });
  }
};

start().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
