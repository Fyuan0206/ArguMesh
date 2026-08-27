import { findProvider, type AiProviderConfig } from "./ai";
import type { AppBindings } from "../types";

interface StepFunMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface StepFunResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

export function inferAiApiFormat(baseUrl: string): "openai" | "anthropic" {
  try {
    return /(^|\/)anthropic$/i.test(new URL(baseUrl).pathname.replace(/\/+$/, "")) ? "anthropic" : "openai";
  } catch {
    return "openai";
  }
}

export async function createStepFunCompletion(
  env: AppBindings,
  messages: StepFunMessage[],
  options: { maxTokens?: number; timeoutMs?: number; thinkingMode?: boolean; model?: string; provider?: string; providerConfig?: AiProviderConfig } = {},
): Promise<string> {
  // 账户级自定义配置(设置页保存)优先;否则按 provider 从环境变量厂商里选(未指定时用第一个可用 provider)。
  const provider = options.providerConfig ?? findProvider(env, options.provider);
  if (!provider) throw new Error("No AI provider configured");
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const apiFormat = inferAiApiFormat(baseUrl);
  if (apiFormat === "anthropic") {
    return createAnthropicCompletion(baseUrl, provider.apiKey, messages, options);
  }

  const endpoint = `${baseUrl}/chat/completions`;
  // MiniMax(api.minimaxi.com)不识别 reasoning_effort,且默认带 <think> 思考块会污染 JSON 输出;
  // 通过 thinking_mode: false 关掉思考(MiniMax 兼容参数)。StepFun 忽略未知字段。
  const body: Record<string, unknown> = {
    model: options.model ?? provider.models[0] ?? env.STEPFUN_MODEL,
    messages,
    temperature: 0.2,
    max_tokens: options.maxTokens ?? 1200,
  };
  if (options.thinkingMode !== false) {
    body.reasoning_effort = "low";
  } else {
    body.thinking_mode = false;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 55_000),
  });

  const payload = (await response.json().catch(() => null)) as StepFunResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `AI request failed (${response.status})`);
  }

  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI returned an empty response");
  }
  // 剥除模型残留的 <think> 思考块(MiniMax 部分模型即使 thinking_mode: false 也可能输出)。
  return stripThinkBlock(content);
}

async function createAnthropicCompletion(
  baseUrl: string,
  apiKey: string,
  messages: StepFunMessage[],
  options: { maxTokens?: number; timeoutMs?: number; model?: string },
): Promise<string> {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens ?? 1200,
      ...(system ? { system } : {}),
      messages: messages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: message.role, content: message.content })),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 55_000),
  });

  const payload = (await response.json().catch(() => null)) as AnthropicResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `AI request failed (${response.status})`);
  }
  const content = payload?.content
    ?.filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!content) throw new Error("AI returned an empty response");
  return stripThinkBlock(content);
}

/** 移除 <think>…</think> 思考块(及其中的前后缀),保留正文。 */
export function stripThinkBlock(content: string): string {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return cleaned || content;
}

export function createExtractionPlan(
  env: AppBindings,
  messages: StepFunMessage[],
  options: Parameters<typeof createStepFunCompletion>[2] = {},
) {
  return createStepFunCompletion(env, messages, options);
}
