import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromEnv = Number(process.env.PORT);
const previewPort = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 4173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    host: true
  },
  preview: {
    port: previewPort,
    strictPort: true,
    host: "0.0.0.0"
  }
});
