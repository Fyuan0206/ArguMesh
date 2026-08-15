import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { aiSettings } from "../db/schema";
import { getAiProviders } from "../services/ai";
import type { AppBindings, AppEnv } from "../types";

/**
 * 账户级 AI 配置:设置页表单(Base URL / API Key / 模型名称)。
 * 按账户存 SQLite,优先于环境变量里的厂商配置;GET 永不回传完整密钥,只给掩码。
 */

const saveSchema = z.object({
  baseUrl: z.string().trim().min(1).max(500).refine((value) => /^https?:\/\//i.test(value), { message: "Base URL 需以 http(s):// 开头" }),
  // 留空 = 保留已保存的密钥(表单回显只显示掩码,避免每次保存都要重输密钥)。
  apiKey: z.string().trim().max(500).optional(),
  model: z.string().trim().max(200).optional(),
});

/** 密钥掩码:保留前 3 位 + 后 4 位,如 sk-…a1b2。短密钥只显示占位符。 */
function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

function configPayload(env: AppBindings, row: typeof aiSettings.$inferSelect | null) {
  return {
    configured: Boolean(row?.apiKey),
    baseUrl: row?.baseUrl ?? "",
    model: row?.model ?? "",
    apiKeyMasked: row ? maskApiKey(row.apiKey) : null,
    // 环境变量里的厂商列表只作信息展示(未配置账户级配置时生效),不含密钥。
    envProviders: getAiProviders(env).map((p) => ({ id: p.id, label: p.label, models: p.models })),
  };
}

export const aiRoutes = new Hono<AppEnv>();

aiRoutes.get("/ai/config", async (c) => {
  const db = createDatabase(c.env);
  const row = await db.select().from(aiSettings).where(eq(aiSettings.accountId, c.get("accountId"))).get();
  return c.json(configPayload(c.env, row ?? null));
});

aiRoutes.put("/ai/config", async (c) => {
  const parsed = saveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_AI_CONFIG", message: "AI 配置不完整:Base URL 需为 http(s) 地址", issues: parsed.error.issues }, 400);
  }
  const db = createDatabase(c.env);
  const accountId = c.get("accountId");
  const existing = await db.select().from(aiSettings).where(eq(aiSettings.accountId, accountId)).get();
  const apiKey = parsed.data.apiKey || existing?.apiKey || "";
  if (!apiKey) {
    return c.json({ error: "INVALID_AI_CONFIG", message: "请输入 API Key" }, 400);
  }
  const baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
  const model = parsed.data.model?.trim() || existing?.model || "";
  const now = new Date().toISOString();
  if (existing) {
    await db.update(aiSettings).set({ baseUrl, apiKey, model, updatedAt: now }).where(eq(aiSettings.accountId, accountId));
  } else {
    await db.insert(aiSettings).values({ accountId, baseUrl, apiKey, model, updatedAt: now });
  }
  const saved = await db.select().from(aiSettings).where(eq(aiSettings.accountId, accountId)).get();
  return c.json(configPayload(c.env, saved ?? null));
});

aiRoutes.delete("/ai/config", async (c) => {
  const db = createDatabase(c.env);
  await db.delete(aiSettings).where(eq(aiSettings.accountId, c.get("accountId")));
  return c.json({ cleared: true });
});
