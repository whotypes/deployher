import react from "@astrojs/react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "..", "..");

export default defineConfig({
  root: dir,
  outDir: "dist",
  output: "static",
  srcDir: "src",
  integrations: [react()],
  vite: {
    envDir: repoRoot,
    resolve: {
      alias: [
        {
          find: "@/spa/routerCompat",
          replacement: path.join(dir, "src", "marketingRouterCompat.tsx"),
        },
        { find: "@", replacement: path.join(repoRoot, "src") },
      ],
    },
  },
});
