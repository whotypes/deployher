import path from "path";
import { setServer, setStartedAt } from "./appContext";
import { buildClient, clientOutDir } from "./client/build";
import { config } from "./config";
import { json } from "./http/helpers";
import { shouldDisableRequestTimeout } from "./http/timeoutRoutes";
import { rehydratePreviewRunnerAfterAppStart } from "./lib/previewRunnerRehydrate";
import { startQueueStallAlertScheduler } from "./lib/projectAlerts";
import { router } from "./router";
import { checkStorageConnectivity, isStorageConfigured } from "./storage";

setStartedAt(Date.now());

const start = async () => {
  const isDevelopment = config.env === "development";
  if (!isDevelopment) {
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
  } else {
    console.log("Development mode detected: skipping startup client build; use Vite for UI HMR.");
  }
  const server = Bun.serve({
    port: config.port,
    hostname: config.hostname,
    development: config.env !== "production" ? { hmr: true } : false,
    idleTimeout: 255,
    fetch: async (req, srv) => {
      const host = req.headers.get("host") ?? "";
      const pathname = new URL(req.url).pathname;
      if (shouldDisableRequestTimeout(host, pathname)) {
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
