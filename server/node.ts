import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { loadBindings } from "./env";
import app from "./index";

const bindings = loadBindings();
const port = Number(process.env.PORT ?? 8787);

// 本地入口:非 /api 请求走静态资源(dist/)+ SPA 回退,API 全部交给 Hono 主应用。
// 开发模式前端由 Vite 提供(pnpm dev,5173 端口,代理 /api 到本端口);
// 生产模式先 pnpm run build 再 pnpm start,由本服务同时提供前端与 API。
const root = new Hono();
root.use("/api/*", async (c) => app.fetch(c.req.raw, bindings));
root.use("*", serveStatic({ root: "./dist" }));
root.use("*", serveStatic({ path: "./dist/index.html" }));

serve({ fetch: root.fetch, port }, (info) => {
  console.log(`ArguMesh API 服务已启动: http://127.0.0.1:${info.port}`);
});
