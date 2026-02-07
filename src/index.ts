import { config } from "./config";
import { setServer, setStartedAt } from "./appContext";
import { buildClient } from "./client/build";
import { json } from "./http/helpers";
import { router } from "./router";
import { checkStorageConnectivity, isStorageConfigured } from "./storage";
import { startBuildWorkers } from "./workers";

setStartedAt(Date.now());

const start = async () => {
  const buildResult = await buildClient();
  if (buildResult.skipped) {
    console.log("Skipping client asset build at startup (SKIP_CLIENT_BUILD enabled).");
  } else if (!buildResult.success) {
    console.warn("Client assets may be missing; /assets/* will 404 until build succeeds.");
  }
  const server = Bun.serve({
    port: config.port,
    hostname: config.hostname,
    development: config.env !== "production",
    fetch: router,
    error(error) {
      console.error(error);
      return json({ error: "Internal Server Error" }, { status: 500 });
    }
  });
  setServer(server);
  console.log(
    `API server running in ${config.env} mode at http://${server.hostname}:${server.port}`,
  );
  startBuildWorkers().catch((err) => {
    console.error("Failed to start build workers:", err);
  });
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
