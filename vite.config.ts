import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Bun API origin for dev; default matches config/default.toml PORT=3001. Override: VITE_DEV_API_URL=http://127.0.0.1:3000 */
const devApiTarget = process.env.VITE_DEV_API_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html")
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
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
});
