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
        // Matrix extract can take several minutes for a small paper batch.
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
});
