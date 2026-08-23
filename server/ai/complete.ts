import type { AiProviderConfig } from "../services/ai";
import type { AppBindings } from "../types";
import { createStepFunCompletion } from "../services/stepfun";
import { parseJsonObject } from "./json";

/**
 * AI completion + Zod 校验 + 纠错重试 原语（取代 route 内重复的 9× 块）。
 *
 * 设计（对齐 Design Freeze D4）：
 * - **不访问数据库**：provider/model 由 route 经 resolveAiForRequest 解析后传入；本原语只负责
 *   「构造 messages → 调 LLM → 解析+校验 → 失败带纠错重试一次」。
 * - **返回 provenance**：{data, model, generatedAt, source:"ai"}，route 把 model/generatedAt 落库，
 *   provenance 从"每处手写"变成"类型契约"。
 * - **统一重试结构**：首次失败 → 用真实错误构造纠正消息 → 带 [system,user,assistant(坏输出),user(纠正)] 重调
 *   （空输出时 assistant turn 省略，与 evidenceLayers.aiGenerateLayer 行为逐位等价）。
 */

interface CompleteOptions {
  system: string;
  user: string;
  /** 已解析的 provider + model（route 调 resolveAiForRequest 后传入；capability 不碰 DB）。 */
  providerConfig: AiProviderConfig;
  model: string;
  maxTokens: number;
  /** 首次输出预算耗尽时，重试加预算到此值（默认 1.5×）。 */
  retryMaxTokens?: number;
  timeoutMs?: number;
  retryTimeoutMs?: number;
}

/** 把 Zod 错误压成可读文案（截断防止污染提示）。 */
function describeIssue(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : "输出格式不正确";
}

/**
 * 结构化输出原语。schema 由 route 侧传入（避免 capability 与 route schema 强耦合）。
 * 返回已 Zod 校验的 data + provenance；两次都失败则抛出，由 route 转 502。
 */
export async function completeJson<T>(
  env: AppBindings,
  schema: { parse: (v: unknown) => T },
  opts: CompleteOptions,
): Promise<{ data: T; model: string; generatedAt: string }> {
  const callOpts = {
    maxTokens: opts.maxTokens,
    timeoutMs: opts.timeoutMs ?? 60_000,
    model: opts.model,
    providerConfig: opts.providerConfig,
    thinkingMode: false as const,
  };
  let content = "";
  try {
    content = await createStepFunCompletion(
      env,
      [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      callOpts,
    );
    return { data: schema.parse(parseJsonObject(content)), model: opts.model, generatedAt: new Date().toISOString() };
  } catch (firstError) {
    const issue = describeIssue(firstError);
    const correction = content.trim()
      ? `以上输出不是合法 JSON(错误:${issue})。请重新输出:只一个 JSON 对象,以 { 开头、以 } 结尾,严格符合要求的字段,不要任何其他文字或 Markdown。`
      : `上次输出为空。请直接输出:只一个 JSON 对象,以 { 开头、以 } 结尾,严格符合要求的字段,不要任何其他文字。`;
    const retried = await createStepFunCompletion(
      env,
      [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
        ...(content.trim()
          ? ([{ role: "assistant" as const, content }, { role: "user" as const, content: correction }] as const)
          : ([{ role: "user" as const, content: correction }] as const)),
      ],
      {
        ...callOpts,
        maxTokens: opts.retryMaxTokens ?? Math.round(opts.maxTokens * 1.5),
        timeoutMs: opts.retryTimeoutMs ?? 90_000,
      },
    );
    return { data: schema.parse(parseJsonObject(retried)), model: opts.model, generatedAt: new Date().toISOString() };
  }
}

/** 自由文本输出原语（reader ask/translate/summary 无 Zod，单次调用 + 熔断由 route 处理）。 */
export async function completeText(
  env: AppBindings,
  opts: Omit<CompleteOptions, "retryMaxTokens"> & { user: string; system: string },
): Promise<{ text: string; model: string; generatedAt: string }> {
  const text = await createStepFunCompletion(
    env,
    [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    {
      maxTokens: opts.maxTokens,
      timeoutMs: opts.timeoutMs ?? 60_000,
      model: opts.model,
      providerConfig: opts.providerConfig,
      thinkingMode: false,
    },
  );
  return { text, model: opts.model, generatedAt: new Date().toISOString() };
}
