import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    // 开发模式:API 由 server/node.ts 提供(pnpm dev 同时启动两者)。
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        // Matrix extract / Research Agent SSE can run for several minutes.
        timeout: 600_000,
        proxyTimeout: 600_000,
        configure: (proxy) => {
          // Avoid buffering Research Agent SSE through the Vite proxy.
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            const contentType = proxyRes.headers["content-type"];
            if (typeof contentType === "string" && contentType.includes("text/event-stream")) {
              res.setHeader("Cache-Control", "no-cache, no-transform");
              res.setHeader("X-Accel-Buffering", "no");
              res.flushHeaders?.();
            }
          });
        },
      },
    },
  },
});
