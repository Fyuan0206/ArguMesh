import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { aiRoutes } from "./routes/ai";
import { cardRoutes } from "./routes/card";
import { extractionRoutes } from "./routes/extraction";
import { fileRoutes } from "./routes/files";
import { matrixRoutes } from "./routes/matrix";
import { libraryRoutes } from "./routes/library";
import { paperRoutes } from "./routes/papers";
import { projectRoutes } from "./routes/projects";
import { readerRoutes } from "./routes/reader";
import { knowledgeRoutes } from "./routes/knowledge";
import { gapRoutes } from "./routes/gaps";
import { ideaRoutes } from "./routes/ideas";
import { reviewRoutes } from "./routes/reviews";
import { researchQuestionRoutes } from "./routes/researchQuestions";
import { experimentRoutes } from "./routes/experiments";
import { evidenceLayerRoutes } from "./routes/evidenceLayers";
import { systemRoutes } from "./routes/system";
import { getAiProviders } from "./services/ai";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("/api/*", logger());

// 单用户本地版:无账号、无鉴权。所有 /api/* 直接可达(无需 Bearer)。
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "argumesh",
    database: c.env.DATABASE_URL.startsWith("file:") ? "sqlite" : "libsql",
    storage: "database",
    model: c.env.STEPFUN_MODEL,
    models: (c.env.AI_MODELS ?? c.env.STEPFUN_MODEL ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    providers: getAiProviders(c.env).map((p) => ({ id: p.id, label: p.label, models: p.models })),
  }),
);

app.route("/api", aiRoutes);
app.route("/api", matrixRoutes);
app.route("/api", libraryRoutes);
app.route("/api", projectRoutes);
app.route("/api", paperRoutes);
app.route("/api", cardRoutes);
app.route("/api", fileRoutes);
app.route("/api", extractionRoutes);
app.route("/api", readerRoutes);
app.route("/api", knowledgeRoutes);
app.route("/api", gapRoutes);
app.route("/api", ideaRoutes);
app.route("/api", reviewRoutes);
app.route("/api", researchQuestionRoutes);
app.route("/api", experimentRoutes);
app.route("/api", evidenceLayerRoutes);
app.route("/api", systemRoutes);

app.notFound((c) => c.json({ error: "NOT_FOUND", message: "接口不存在" }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) {
    // 始终以 JSON 形式回传 HTTPException 消息,前端 parseResponse 期望 JSON。
    const status = error.status;
    const message = error.message || "请求处理失败";
    return c.json({ error: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED", message }, status);
  }
  console.error("Unhandled request error", error);
  return c.json({ error: "INTERNAL_ERROR", message: "服务器处理请求失败" }, 500);
});

export default app;
