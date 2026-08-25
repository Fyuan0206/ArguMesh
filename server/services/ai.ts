/**
 * AI 多厂商(provider)配置。
 * 优先读取 AI_PROVIDERS(JSON 数组),否则回退到旧的单套 STEPFUN_* 配置。
 * JSON 格式(每项):
 * { "id": "minimax", "label": "MiniMax", "baseUrl": "https://api.minimaxi.com/v1", "apiKey": "sk-...", "models": ["MiniMax-M3", "MiniMax-Text-01"] }
 */
import { eq } from "drizzle-orm";
import { createDatabase } from "../db/client";
import { aiSettings } from "../db/schema";
import type { AppBindings } from "../types";

export interface AiProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}

/** 全局 AI 配置行的固定主键(单用户本地版,无账号概念)。 */
export const LOCAL_AI_ACCOUNT_ID = "local";

export function parseProviders(raw: string | undefined, fallback: AiProviderConfig): AiProviderConfig[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Array<Partial<AiProviderConfig>>;
      const providers = parsed
        .filter((item) => item && typeof item.id === "string" && typeof item.baseUrl === "string" && typeof item.apiKey === "string")
        .map((item) => ({
          id: item.id as string,
          label: typeof item.label === "string" && item.label ? item.label : (item.id as string),
          baseUrl: (item.baseUrl as string).replace(/\/+$/, ""),
          apiKey: item.apiKey as string,
          models: Array.isArray(item.models) && item.models.length ? item.models.map((m) => String(m)).filter(Boolean) : [],
        }));
      if (providers.length) return providers;
    } catch {
      // 解析失败回退到单套配置
    }
  }
  return [fallback];
}

export function getAiProviders(env: AppBindings): AiProviderConfig[] {
  const fallback: AiProviderConfig = {
    id: "stepfun",
    label: "StepFun",
    baseUrl: env.STEPFUN_BASE_URL ?? "",
    apiKey: env.STEPFUN_API_KEY ?? "",
    models: (env.AI_MODELS ?? env.STEPFUN_MODEL ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  };
  if (!fallback.baseUrl || !fallback.apiKey) return [];
  const providers = parseProviders(env.AI_PROVIDERS, fallback);
  // 只暴露可调用的 provider(占位/空 key 过滤掉),避免前端列表与默认选中落到不可用项。
  return providers.filter(isUsable);
}

/** 判断 provider 是否可调用(占位/空 key 视为不可用,如未配置完成的 StepFun)。 */
function isUsable(provider: AiProviderConfig): boolean {
  return Boolean(provider.apiKey && !provider.apiKey.startsWith("__TODO__") && !provider.apiKey.startsWith("__"));
}

export function findProvider(env: AppBindings, providerId: string | undefined): AiProviderConfig | null {
  const providers = getAiProviders(env);
  if (!providers.length) return null;
  if (providerId) {
    const exact = providers.find((p) => p.id === providerId);
    if (exact) return isUsable(exact) ? exact : null;
  }
  // 未指定或指定了不可用的 provider 时,默认选第一个可用的。
  return providers.find(isUsable) ?? null;
}

/**
 * 全局 AI 配置(单用户本地版):设置页保存的自定义配置(ai_settings 表,固定 account_id="local"),
 * 存在则完全优先于环境变量厂商配置。客户端传来的 provider/model 在自定义配置存在时被忽略。
 */
export async function getAccountAiProvider(env: AppBindings, requestedProviderId?: string): Promise<AiProviderConfig | null> {
  const db = createDatabase(env);
  const row = await db.select().from(aiSettings).where(eq(aiSettings.accountId, LOCAL_AI_ACCOUNT_ID)).get();
  if (row && row.baseUrl.trim() && row.apiKey.trim()) {
    return {
      id: "account",
      label: "自定义配置",
      baseUrl: row.baseUrl.trim().replace(/\/+$/, ""),
      apiKey: row.apiKey,
      models: row.model.trim() ? [row.model.trim()] : [],
    };
  }
  return findProvider(env, requestedProviderId);
}

/**
 * AI 端点统一解析入口:返回本次请求实际使用的 provider + 模型,或明确的配置错误。
 * 全局配置(设置页)优先;客户端传的 provider/model 只在环境变量厂商模式下生效,
 * 且必须是该厂商已声明的模型之一,否则回落到第一个可用模型。
 */
export async function resolveAiForRequest(
  env: AppBindings,
  requested: { provider?: string; model?: string },
): Promise<{ provider: AiProviderConfig; model: string } | { error: { code: string; message: string } }> {
  const provider = await getAccountAiProvider(env, requested.provider);
  if (!provider) {
    return { error: { code: "AI_NOT_CONFIGURED", message: "未配置 AI:请在设置页填写 Base URL、API Key 与模型名称" } };
  }
  const model = requested.model && provider.models.includes(requested.model) ? requested.model : provider.models[0];
  if (!model) {
    return { error: { code: "AI_NOT_CONFIGURED", message: "AI 配置不完整:请在设置页填写模型名称" } };
  }
  return { provider, model };
}
