import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    host: "127.0.0.1",
    port: 3175,
    strictPort: true,
    proxy: {
      "/mcp": "http://127.0.0.1:3174",
      "/health": "http://127.0.0.1:3174",
      "/fonts": "http://127.0.0.1:3174",
    },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
});
