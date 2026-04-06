import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, "");
  const devApiTarget =
    env.VITE_DEV_API_URL ?? `http://127.0.0.1:${env.PORT ?? "3001"}`;

  return {
    plugins: [react()],
    root: ".",
    publicDir: "public",
    build: {
      outDir: "dist/client",
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: path.resolve(configDir, "index.html")
      }
    },
    resolve: {
      alias: {
        "@": path.resolve(configDir, "src")
      }
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: devApiTarget, changeOrigin: true },
        "/assets": { target: devApiTarget, changeOrigin: true },
        "/d": { target: devApiTarget, changeOrigin: true },
        "/preview": { target: devApiTarget, changeOrigin: true }
      }
    }
  };
});
