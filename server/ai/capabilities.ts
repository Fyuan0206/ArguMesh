import { z } from "zod";
import type { AiProviderConfig } from "../services/ai";
import type { AppBindings } from "../types";
import { completeJson, completeText } from "./complete";
import {
  CARD_SYSTEM_PROMPT,
  DRAFT_SYSTEM_PROMPT,
  EXTRACT_SYSTEM_PROMPT,
  EXTRACTION_PLAN_SYSTEM_PROMPT,
  GAP_DISCOVERY_SYSTEM_PROMPT,
  INTELLIGENCE_SYSTEM_PROMPT,
  MATRIX_EXTRACT_SYSTEM_PROMPT,
  REGENERATE_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  REVISE_SYSTEM_PROMPT,
  readerAskSystem,
  readerSummarySystem,
  readerTranslateSystem,
} from "./prompts";

/**
 * AI Capability Layer（单一真源，Design Freeze D4）。
 *
 * 纪律：
 * - **只负责 AI capability，不访问数据库**（零 DB import）。落库/ownership 是 route 的关注点。
 * - 每个命名能力返回 {data, model, generatedAt}（provenance 由类型契约保证）。
 * - schema 集中在本文件（worker 测试不 import schema，搬移无副作用）。
 * - route 侧负责：resolveAiForRequest → 构 context（读 DB）→ 调 capability → 落库。
 */

// ───────────────────────── Output schemas（集中） ─────────────────────────

const cardField = z.string().min(1).max(500);
export const cardOutputSchema = z.object({
  problem: cardField,
  method: cardField,
  data: cardField,
  findings: cardField,
  limitations: cardField,
  // 摘录按 800 字兜底:实测模型偶会输出超长原文摘录(提示词要求 ≤200 字,上限留裕量)。
  sources: z.object({
    problem: z.string().max(800),
    method: z.string().max(800),
    data: z.string().max(800),
    findings: z.string().max(800),
    limitations: z.string().max(800),
  }),
});

export const extractOutputSchema = z.object({
  kind: z.enum(["note", "claim", "evidence"]),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2_000),
  note: z.string().max(500).default(""),
});

export const intelligenceOutputSchema = z.object({
  synthesis: z.string().min(1).max(4_000),
  conflicts: z.array(z.object({ aId: z.string().min(1), bId: z.string().min(1), reason: z.string().max(1_000).default("") })).max(50).default([]),
  duplicates: z.array(z.object({ aId: z.string().min(1), bId: z.string().min(1), reason: z.string().max(1_000).default("") })).max(50).default([]),
  missingEvidence: z.array(z.object({ topic: z.string().max(300).default(""), why: z.string().max(1_000).default("") })).max(50).default([]),
}).strict();

export const discoverOutputSchema = z.object({
  gaps: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(4_000).default(""),
    rationale: z.string().max(4_000).default(""),
  })).min(1).max(8),
});

export const draftOutputSchema = z.object({
  problem: z.string().max(4_000).default(""),
  gap: z.string().max(4_000).default(""),
  hypothesis: z.string().max(4_000).default(""),
  method: z.string().max(4_000).default(""),
  experiment: z.string().max(4_000).default(""),
  risks: z.string().max(4_000).default(""),
});

export const reviewOutputSchema = z.object({
  verdict: z.enum(["strong", "viable", "weak", "reject"]),
  strengths: z.string().max(4_000).default(""),
  weaknesses: z.string().max(4_000).default(""),
  risks: z.string().max(4_000).default(""),
  suggestions: z.array(z.object({
    id: z.string().max(40).default(""),
    target: z.string().max(100).default(""),
    issue: z.string().max(1_000).default(""),
    suggestion: z.string().max(1_000).default(""),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
  })).max(12).default([]),
});

export const reviseOutputSchema = z.object({
  problem: z.string().max(4_000).default(""),
  gap: z.string().max(4_000).default(""),
  hypothesis: z.string().max(4_000).default(""),
  method: z.string().max(4_000).default(""),
  experiment: z.string().max(4_000).default(""),
  risks: z.string().max(4_000).default(""),
});

// ───────────────────────── 纯文本预处理（无 DB，capability 内聚） ─────────────────────────

/** 发送给 LLM 的文本上限:保留开头 + 结尾,中段省略（card.ts 原实现，逐字搬移）。 */
const LLM_TEXT_LIMIT = 150_000;
const LLM_TEXT_TAIL = 5_000;
function trimTextForLlm(text: string): string {
  if (text.length <= LLM_TEXT_LIMIT) return text;
  const head = text.slice(0, LLM_TEXT_LIMIT - LLM_TEXT_TAIL);
  const tail = text.slice(-LLM_TEXT_TAIL);
  return `${head}\n\n[中段省略 ${text.length - LLM_TEXT_LIMIT} 字]\n\n${tail}`;
}

// ───────────────────────── 结构化能力（JSON + Zod + 重试） ─────────────────────────

interface AiOpts {
  providerConfig: AiProviderConfig;
  model: string;
}

/** 分析论文 → Paper Card（五段 + 每段原文摘录）。 */
export async function generatePaperCard(
  env: AppBindings,
  opts: AiOpts & { title: string; authors?: string; source?: string; text: string },
) {
  const userContent = JSON.stringify({
    论文信息: { 标题: opts.title, 作者: opts.authors ?? "", 来源: opts.source ?? "未知" },
    论文文本: trimTextForLlm(opts.text),
  });
  return completeJson(env, cardOutputSchema, {
    system: CARD_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 4_000, retryMaxTokens: 8_000, timeoutMs: 150_000, retryTimeoutMs: 180_000,
  });
}

/** 提炼知识 → Note/Claim/Evidence（论文摘录 quote + 页码）。 */
export async function extractKnowledge(
  env: AppBindings,
  opts: AiOpts & { paperTitle: string; quote: string; page: number },
) {
  const userContent = JSON.stringify({
    论文标题: opts.paperTitle,
    页码: opts.page,
    原文摘录: opts.quote,
  });
  return completeJson(env, extractOutputSchema, {
    system: EXTRACT_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 1_500, retryMaxTokens: 2_500, timeoutMs: 60_000, retryTimeoutMs: 90_000,
  });
}

/** 知识情报分析（冲突 / 重复 / 综合 / 缺失证据）。strict 输出。 */
export async function analyzeKnowledge(
  env: AppBindings,
  opts: AiOpts & { items: Array<{ id: string; kind: string; title: string; content: string }> },
) {
  const userContent = JSON.stringify({ 知识列表: opts.items });
  return completeJson(env, intelligenceOutputSchema, {
    system: INTELLIGENCE_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 2_500, retryMaxTokens: 3_500, timeoutMs: 90_000, retryTimeoutMs: 120_000,
  });
}

/** 发现研究 Gap（项目知识列表 → 2-5 个缺口）。 */
export async function discoverGap(
  env: AppBindings,
  opts: AiOpts & { knowledge: Array<{ kind: string; title: string; content: string }> },
) {
  const userContent = JSON.stringify({
    研究知识列表: opts.knowledge.map((k) => ({ 种类: k.kind, 标题: k.title, 内容: k.content })),
  });
  return completeJson(env, discoverOutputSchema, {
    system: GAP_DISCOVERY_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 2_000, retryMaxTokens: 3_000, timeoutMs: 90_000, retryTimeoutMs: 120_000,
  });
}

/** Idea 起草（想法 + 证据 → 6 段画布）。 */
export async function draftIdea(
  env: AppBindings,
  opts: AiOpts & { title: string; summary: string; evidence: Array<{ kind: string; title: string; content: string }> },
) {
  const userContent = JSON.stringify({
    idea标题: opts.title,
    idea描述: opts.summary,
    知识证据: opts.evidence.map((e) => ({ 种类: e.kind, 标题: e.title, 内容: e.content })),
  });
  return completeJson(env, draftOutputSchema, {
    system: DRAFT_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 2_500, retryMaxTokens: 3_500, timeoutMs: 90_000, retryTimeoutMs: 120_000,
  });
}

/** Idea 重新起草（当前画布 + 证据 + 修改指令 → 改进版 6 段画布）。 */
export async function regenerateIdea(
  env: AppBindings,
  opts: AiOpts & {
    title: string; summary: string; instruction: string;
    currentCanvas: Record<string, string>;
    evidence: Array<{ kind: string; title: string; content: string }>;
  },
) {
  const userContent = JSON.stringify({
    idea标题: opts.title,
    idea描述: opts.summary,
    修改指令: opts.instruction || "无,请整体改进与补全",
    当前画布: opts.currentCanvas,
    知识证据: opts.evidence.map((e) => ({ 种类: e.kind, 标题: e.title, 内容: e.content })),
  });
  return completeJson(env, draftOutputSchema, {
    system: REGENERATE_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 3_000, retryMaxTokens: 4_000, timeoutMs: 90_000, retryTimeoutMs: 120_000,
  });
}

/** Idea 评审（画布 + 证据 → verdict + strengths/weaknesses/risks + 结构化建议）。 */
export async function reviewIdea(
  env: AppBindings,
  opts: AiOpts & {
    title: string; summary: string;
    canvas: Record<string, string>;
    evidence: Array<{ kind: string; title: string; content: string }>;
  },
) {
  const userContent = JSON.stringify({
    idea标题: opts.title,
    idea描述: opts.summary,
    当前画布: opts.canvas,
    知识证据: opts.evidence.map((e) => ({ 种类: e.kind, 标题: e.title, 内容: e.content })),
  });
  return completeJson(env, reviewOutputSchema, {
    system: REVIEW_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 2_500, retryMaxTokens: 3_500, timeoutMs: 90_000, retryTimeoutMs: 120_000,
  });
}

/** Idea 修订（当前画布 + 被采纳建议 → 修订版 6 段画布）。 */
export async function reviseIdea(
  env: AppBindings,
  opts: AiOpts & {
    title: string;
    canvas: Record<string, string>;
    chosen: Array<{ target: string; issue: string; suggestion: string; priority: string }>;
  },
) {
  const userContent = JSON.stringify({
    idea标题: opts.title,
    当前画布: opts.canvas,
    被采纳的评审建议: opts.chosen.map((s) => ({ 目标段: s.target, 问题: s.issue, 建议: s.suggestion, 优先级: s.priority })),
  });
  return completeJson(env, reviseOutputSchema, {
    system: REVISE_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 3_000, retryMaxTokens: 4_000, timeoutMs: 90_000, retryTimeoutMs: 120_000,
  });
}

/** 矩阵证据抽取（单篇论文的 pages + dimensions → JSON 数组单元格）。
 *  extraction /extract 是「逐篇循环 + 路由内 job 管理」，此能力只负责单篇抽取原语。 */
export async function extractMatrixPaper(
  env: AppBindings,
  opts: AiOpts & {
    paper: { id: string; title: string };
    dimensions: Array<{ id: string; label: string }>;
    pages: Array<{ page: number; text: string }>;
  },
) {
  const userContent = JSON.stringify({ paper: opts.paper, dimensions: opts.dimensions, pages: opts.pages });
  const cellSchema = z.object({
    paperId: z.string(), dimensionId: z.string(), value: z.string().max(2_000), claim: z.string().max(4_000),
    confidence: z.union([z.number().min(0).max(1), z.number().min(0).max(100), z.string()]).transform((value) => {
      const number = typeof value === "string" ? Number(value) : value;
      return number > 1 ? number / 100 : number;
    }),
    sourcePage: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number), z.null()]).nullable(),
    sourceSection: z.union([z.string().max(500), z.number(), z.null()]).transform((value) => (typeof value === "number" ? String(value) : value ?? "")).default("原文"),
    sourceExcerpt: z.union([z.string().max(2_000), z.null()]).transform((value) => value ?? "").default(""),
  });
  return completeJson(env, z.array(cellSchema), {
    system: MATRIX_EXTRACT_SYSTEM_PROMPT, user: userContent,
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 4_000, retryMaxTokens: 8_000, timeoutMs: 150_000, retryTimeoutMs: 180_000,
  });
}

/** 证据核验规划（候选证据 → Markdown 计划，自由文本）。 */
export async function planExtraction(
  env: AppBindings,
  opts: AiOpts & { project: { id: string; name: string }; candidates: unknown },
) {
  const { text, model, generatedAt } = await completeText(env, {
    system: EXTRACTION_PLAN_SYSTEM_PROMPT,
    user: JSON.stringify({ project: opts.project, candidates: opts.candidates }),
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 1_200, timeoutMs: 55_000,
  });
  return { plan: text, model, generatedAt };
}

// ───────────────────────── 自由文本能力（Reader，无 Zod） ─────────────────────────

/** Reader 翻译。 */
export async function readerTranslate(
  env: AppBindings,
  opts: AiOpts & { text: string; targetLanguage: "中文" | "English"; paperTitle: string; page: number },
) {
  const { text, model, generatedAt } = await completeText(env, {
    system: readerTranslateSystem(opts.targetLanguage),
    user: JSON.stringify(opts),
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 2_000, timeoutMs: 45_000,
  });
  return { translation: text, model, generatedAt };
}

/** Reader 概括（selection → 一句话；fullText → 3-5 句）。 */
export async function readerSummarize(
  env: AppBindings,
  opts: AiOpts & {
    paper: { id: string; title: string; authors: string; year: number };
    page: number; selection: string; fullText?: string;
  },
) {
  const hasSelection = Boolean(opts.selection);
  const { text, model, generatedAt } = await completeText(env, {
    system: readerSummarySystem(hasSelection),
    user: JSON.stringify({
      source: { paperId: opts.paper.id, title: opts.paper.title, authors: opts.paper.authors, year: opts.paper.year, page: opts.page },
      ...(hasSelection ? { selectedText: opts.selection } : { fullText: opts.fullText ?? "" }),
    }),
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 500, timeoutMs: 45_000,
  });
  return { summary: text, model, generatedAt };
}

/** Reader 提问（基于选区或全文作答）。 */
export async function readerAsk(
  env: AppBindings,
  opts: AiOpts & {
    paper: { id: string; title: string; authors: string; year: number };
    page: number; selection: string; fullText?: string; question: string;
  },
) {
  const hasSelection = Boolean(opts.selection);
  const { text, model, generatedAt } = await completeText(env, {
    system: readerAskSystem(hasSelection),
    user: JSON.stringify({
      source: { paperId: opts.paper.id, title: opts.paper.title, authors: opts.paper.authors, year: opts.paper.year, page: opts.page },
      ...(hasSelection ? { selectedText: opts.selection } : { fullText: opts.fullText ?? "" }),
      question: opts.question,
    }),
    providerConfig: opts.providerConfig, model: opts.model,
    maxTokens: 900, timeoutMs: 45_000,
  });
  return { answer: text, model, generatedAt };
}
