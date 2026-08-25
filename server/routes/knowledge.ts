import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { knowledgeItems, knowledgeRelations, papers, projectPapers, projects } from "../db/schema";
import { projectExists } from "../db/projects";
import { resolveAiForRequest } from "../services/ai";
import { analyzeKnowledge, extractKnowledge } from "../ai/capabilities";

import type { AppEnv } from "../types";

/**
 * Knowledge 一等对象(迁移 0007):把前端 localStorage 的 notes/claims/evidence 持久化,
 * 并承载 AI 提炼。provenance 是硬约束:quote(原文)与 content(提炼)分离,带 page/source/model/generatedAt。
 * - AI 提炼由后端直接插 draft,前端无法伪造来源(C4)。
 * - 后端不读 PDF 全文,只收 quote+page+paperId(最小暴露 C10,与 reader/card 一致)。
 * - paperId 需属于本项目(单用户本地版,无账号归属)。
 */

/** 数据库行 → 前端 KnowledgeItem 形状。 */
interface KnowledgeRow {
  id: string;
  projectId: string;
  paperId: string;
  kind: "note" | "claim" | "evidence";
  title: string;
  content: string;
  quote: string;
  note: string;
  page: number;
  location: string | null;
  source: "human" | "ai";
  status: "draft" | "confirmed";
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
}

function toKnowledgeItem(row: KnowledgeRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    paperId: row.paperId,
    kind: row.kind,
    title: row.title,
    content: row.content,
    quote: row.quote,
    note: row.note,
    page: row.page,
    location: row.location,
    source: row.source,
    status: row.status,
    model: row.model,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
  };
}

const SELECT_COLUMNS = {
  id: knowledgeItems.id,
  projectId: knowledgeItems.projectId,
  paperId: knowledgeItems.paperId,
  kind: knowledgeItems.kind,
  title: knowledgeItems.title,
  content: knowledgeItems.content,
  quote: knowledgeItems.quote,
  note: knowledgeItems.note,
  page: knowledgeItems.page,
  location: knowledgeItems.location,
  source: knowledgeItems.source,
  status: knowledgeItems.status,
  model: knowledgeItems.model,
  generatedAt: knowledgeItems.generatedAt,
  createdAt: knowledgeItems.createdAt,
};

const extractSchema = z.object({
  paperId: z.string().min(1).max(160),
  quote: z.string().min(10).max(8_000),
  page: z.number().int().min(1).max(100_000),
});

// 输出 schema 已集中到 server/ai/capabilities.ts(extractOutputSchema)。
// prompt 单一真源在 server/ai/prompts.ts;原测试 import 此常量,此处 re-export 保持 import 路径不变。
export { EXTRACT_SYSTEM_PROMPT } from "../ai/prompts";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(4_000).optional(),
  note: z.string().max(1_000).optional(),
  kind: z.enum(["note", "claim", "evidence"]).optional(),
  status: z.enum(["draft", "confirmed"]).optional(),
});

export const knowledgeRoutes = new Hono<AppEnv>();

/** 校验 paperId 属于本项目,返回论文标题(用于 AI 上下文)或 null。 */
async function findProjectPaper(env: AppEnv["Bindings"], projectId: string, paperId: string) {
  const db = createDatabase(env);
  const row = await db
    .select({ title: papers.title })
    .from(projectPapers)
    .innerJoin(papers, eq(projectPapers.paperId, papers.id))
    .where(and(eq(projectPapers.projectId, projectId), eq(projectPapers.paperId, paperId)))
    .get();
  return row ?? null;
}

const createSchema = z.object({
  paperId: z.string().min(1).max(160),
  kind: z.enum(["note", "claim", "evidence"]).default("note"),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(4_000),
  quote: z.string().max(8_000).default(""),
  note: z.string().max(1_000).default(""),
  page: z.number().int().min(1).max(100_000).default(1),
  status: z.enum(["draft", "confirmed"]).default("draft"),
});

/** POST /projects/:projectId/knowledge — 人工创建一条知识对象(权威源,source:human)。 */
knowledgeRoutes.post("/projects/:projectId/knowledge", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_KNOWLEDGE_REQUEST", issues: parsed.error.issues }, 400);
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  if (!(await findProjectPaper(c.env, projectId, parsed.data.paperId))) {
    return c.json({ error: "PAPER_NOT_IN_PROJECT", message: "论文不在当前项目中" }, 404);
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = createDatabase(c.env);
  await db.insert(knowledgeItems).values({
    id, projectId, paperId: parsed.data.paperId,
    kind: parsed.data.kind, title: parsed.data.title, content: parsed.data.content,
    quote: parsed.data.quote, note: parsed.data.note, page: parsed.data.page, location: null,
    source: "human", status: parsed.data.status, model: null, generatedAt: null, createdAt: now, updatedAt: now,
  });
  const row: KnowledgeRow = {
    id, projectId, paperId: parsed.data.paperId, kind: parsed.data.kind, title: parsed.data.title,
    content: parsed.data.content, quote: parsed.data.quote, note: parsed.data.note, page: parsed.data.page,
    location: null, source: "human", status: parsed.data.status, model: null, generatedAt: null, createdAt: now,
  };
  return c.json({ item: toKnowledgeItem(row) }, 201);
});

/** POST /projects/:projectId/knowledge/extract — AI 提炼并直接存 draft,返回 KnowledgeItem。 */
knowledgeRoutes.post("/projects/:projectId/knowledge/extract", async (c) => {
  const parsed = extractSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_EXTRACT_REQUEST", message: "请先选择至少 10 个字符的原文", issues: parsed.error.issues }, 400);
  }
  const projectId = c.req.param("projectId");
  const project = await projectExists(c.env, projectId);
  if (!project) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const paper = await findProjectPaper(c.env, projectId, parsed.data.paperId);
  if (!paper) return c.json({ error: "PAPER_NOT_IN_PROJECT", message: "论文不在当前项目中" }, 404);

  const resolution = await resolveAiForRequest(c.env, {});
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);

  const db = createDatabase(c.env);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    // AI 能力已收敛到 extractKnowledge(capability);route 只构 context + 落库,provenance 由 capability 返回。
    const { data: out, model, generatedAt } = await extractKnowledge(c.env, {
      providerConfig: resolution.provider,
      model: resolution.model,
      paperTitle: paper.title,
      quote: parsed.data.quote,
      page: parsed.data.page,
    });

    const row: KnowledgeRow = {
      id,
      projectId,
      paperId: parsed.data.paperId,
      kind: out.kind,
      title: out.title,
      content: out.content,
      quote: parsed.data.quote,
      note: out.note ?? "",
      page: parsed.data.page,
      location: null,
      source: "ai",
      status: "draft",
      model,
      generatedAt,
      createdAt: now,
    };
    await db.insert(knowledgeItems).values({
      id: row.id,
      projectId: row.projectId,
      paperId: row.paperId,
      kind: row.kind,
      title: row.title,
      content: row.content,
      quote: row.quote,
      note: row.note,
      page: row.page,
      location: row.location,
      source: row.source,
      status: row.status,
      model: row.model,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
      updatedAt: now,
    });
    return c.json({ item: toKnowledgeItem(row) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge extraction failed";
    console.error("Knowledge extraction failed", { projectId, paperId: parsed.data.paperId, message });
    return c.json({ error: "KNOWLEDGE_EXTRACT_FAILED", message: "AI 提炼失败,请稍后重试", detail: message.slice(0, 500) }, 502);
  }
});

/** GET /projects/:projectId/knowledge — 列出本项目的知识对象。 */


/** POST /projects/:projectId/knowledge/analyze — P6 Knowledge Intelligence:AI 情报分析(冲突/重复/综合/缺失证据)。无新表,纯分析。
 *  prompt/schema 已收敛到 analyzeKnowledge(capability);validIds 幻觉过滤留 route(capability 不碰 DB)。 */
knowledgeRoutes.post("/projects/:projectId/knowledge/analyze", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const resolution = await resolveAiForRequest(c.env, {});
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  const db = createDatabase(c.env);
  // 构 context:本项目全部知识对象(C9),只读 id/title/content/kind,不读 PDF(C10)。
  const items = await db.select({ id: knowledgeItems.id, kind: knowledgeItems.kind, title: knowledgeItems.title, content: knowledgeItems.content })
    .from(knowledgeItems).where(and(eq(knowledgeItems.projectId, projectId)))
    .orderBy(desc(knowledgeItems.createdAt)).limit(120);
  if (items.length === 0) return c.json({ error: "NO_KNOWLEDGE", message: "本项目还没有知识对象,无法做情报分析。先在阅读器 AI 提炼几条知识。" }, 400);
  // AI 能力已收敛到 analyzeKnowledge(capability);返回原始 out,validIds 幻觉过滤留 route(capability 不碰 DB)。
  let out: z.infer<typeof import("../ai/capabilities").intelligenceOutputSchema>;
  try {
    ({ data: out } = await analyzeKnowledge(c.env, {
      providerConfig: resolution.provider,
      model: resolution.model,
      items,
    }));
    // 过滤:conflicts/duplicates 的 id 必须是本项目存在的知识对象(防幻觉 id)。
    const validIds = new Set(items.map((it) => it.id));
    const cleanPair = (p: { aId: string; bId: string; reason?: string }) => ({
      ...p,
      aId: validIds.has(p.aId) ? p.aId : "",
      bId: validIds.has(p.bId) ? p.bId : "",
    });
    const conflicts = out.conflicts.map(cleanPair).filter((p) => p.aId && p.bId && p.aId !== p.bId);
    const duplicates = out.duplicates.map(cleanPair).filter((p) => p.aId && p.bId && p.aId !== p.bId);
    return c.json({ analysis: { synthesis: out.synthesis, conflicts, duplicates, missingEvidence: out.missingEvidence }, model: resolution.model }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge intelligence failed";
    console.error("Knowledge intelligence failed", { projectId, message });
    return c.json({ error: "KNOWLEDGE_INTELLIGENCE_FAILED", message: "AI 情报分析失败,请稍后重试", detail: message.slice(0, 500) }, 502);
  }
});


knowledgeRoutes.get("/projects/:projectId/knowledge", async (c) => {
  const projectId = c.req.param("projectId");
  const project = await projectExists(c.env, projectId);
  if (!project) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const db = createDatabase(c.env);
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.projectId, projectId)))
    .orderBy(desc(knowledgeItems.createdAt));
  return c.json({ items: rows.map(toKnowledgeItem) });
});

/** PATCH /projects/:projectId/knowledge/:knowledgeId — 人工修改 + 确认(draft→confirmed)。 */
knowledgeRoutes.patch("/projects/:projectId/knowledge/:knowledgeId", async (c) => {
  const projectId = c.req.param("projectId");
  const knowledgeId = c.req.param("knowledgeId");
  const project = await projectExists(c.env, projectId);
  if (!project) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_KNOWLEDGE_PATCH", issues: parsed.error.issues }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "EMPTY_PATCH", message: "没有要修改的内容" }, 400);

  const db = createDatabase(c.env);
  const existing = await db
    .select(SELECT_COLUMNS)
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.id, knowledgeId), eq(knowledgeItems.projectId, projectId)))
    .get();
  if (!existing) return c.json({ error: "KNOWLEDGE_NOT_FOUND", message: "知识对象不存在" }, 404);

  const now = new Date().toISOString();
  await db
    .update(knowledgeItems)
    .set({ ...parsed.data, updatedAt: now })
    .where(eq(knowledgeItems.id, knowledgeId));
  const updated = { ...existing, ...parsed.data };
  return c.json({ item: toKnowledgeItem(updated as KnowledgeRow) });
});

/** DELETE /projects/:projectId/knowledge/:knowledgeId — 删除。 */
knowledgeRoutes.delete("/projects/:projectId/knowledge/:knowledgeId", async (c) => {
  const projectId = c.req.param("projectId");
  const knowledgeId = c.req.param("knowledgeId");
  const project = await projectExists(c.env, projectId);
  if (!project) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const db = createDatabase(c.env);
  const existing = await db
    .select({ id: knowledgeItems.id })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.id, knowledgeId), eq(knowledgeItems.projectId, projectId)))
    .get();
  if (!existing) return c.json({ error: "KNOWLEDGE_NOT_FOUND", message: "知识对象不存在" }, 404);
  await db.delete(knowledgeItems).where(eq(knowledgeItems.id, knowledgeId));
  return c.json({ id: knowledgeId, deleted: true });
});

// ─── Knowledge Relations(迁移 0008):supports / contradicts / duplicates ───

const relationTypeSchema = z.enum(["supports", "contradicts", "duplicates"]);

const relationBodySchema = z.object({
  itemIdA: z.string().min(1),
  itemIdB: z.string().min(1),
  type: relationTypeSchema,
  note: z.string().max(500).optional(),
});

/** 对称关系规范化:强制 sourceId<targetId,去重索引在任一方向都命中同一条。 */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

interface RelationRow {
  id: string;
  sourceId: string;
  targetId: string;
  type: "supports" | "contradicts" | "duplicates";
  note: string;
  createdAt: string;
}

/** 数据库行 → 前端 camelCase 契约(sourceId/targetId → itemIdA/itemIdB)。 */
function toRelation(r: RelationRow) {
  return { id: r.id, itemIdA: r.sourceId, itemIdB: r.targetId, type: r.type, note: r.note, createdAt: r.createdAt };
}

/** 校验两端知识对象都归属本项目;返回 true 通过。 */
async function bothItemsOwned(
  env: AppEnv["Bindings"],
  projectId: string,
  a: string,
  b: string,
): Promise<boolean> {
  const db = createDatabase(env);
  const rows = await db
    .select({ id: knowledgeItems.id })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.projectId, projectId), inArray(knowledgeItems.id, [a, b])));
  return rows.length === 2;
}

/** POST /projects/:projectId/knowledge/relations — 创建或复得一条关系(幂等)。 */
knowledgeRoutes.post("/projects/:projectId/knowledge/relations", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = relationBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RELATION", issues: parsed.error.issues }, 400);
  const { itemIdA, itemIdB, type } = parsed.data;
  if (itemIdA === itemIdB) return c.json({ error: "SELF_RELATION", message: "不能与自身建立关系" }, 400);
  if (!(await bothItemsOwned(c.env, projectId, itemIdA, itemIdB))) {
    return c.json({ error: "KNOWLEDGE_NOT_FOUND", message: "知识对象不在当前项目中" }, 404);
  }
  const [sourceId, targetId] = canonicalPair(itemIdA, itemIdB);
  const db = createDatabase(c.env);
  const existing = await db
    .select()
    .from(knowledgeRelations)
    .where(and(
      eq(knowledgeRelations.projectId, projectId),
      eq(knowledgeRelations.sourceId, sourceId),
      eq(knowledgeRelations.targetId, targetId),
      eq(knowledgeRelations.type, type),
    ))
    .get();
  if (existing) return c.json({ relation: toRelation(existing as RelationRow) }, 200);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const row: RelationRow = {
    id, sourceId, targetId, type,
    note: parsed.data.note ?? "",
    createdAt: now,
  };
  await db.insert(knowledgeRelations).values({ id, projectId, sourceId, targetId, type, note: row.note, createdAt: now });
  return c.json({ relation: toRelation(row) }, 201);
});

/** GET /projects/:projectId/knowledge/relations — 列出本项目的关系(含两端标题,后端 enrichment)。 */
knowledgeRoutes.get("/projects/:projectId/knowledge/relations", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const relations = await db
    .select()
    .from(knowledgeRelations)
    .where(and(eq(knowledgeRelations.projectId, projectId)))
    .orderBy(desc(knowledgeRelations.createdAt));
  const ids = Array.from(new Set(relations.flatMap((r) => [r.sourceId, r.targetId])));
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await db.select({ id: knowledgeItems.id, title: knowledgeItems.title }).from(knowledgeItems).where(inArray(knowledgeItems.id, ids));
    rows.forEach((row) => titles.set(row.id, row.title));
  }
  const enriched = relations.map((r) => ({
    id: r.id,
    itemIdA: r.sourceId,
    itemIdB: r.targetId,
    type: r.type,
    note: r.note,
    createdAt: r.createdAt,
    titleA: titles.get(r.sourceId) ?? "",
    titleB: titles.get(r.targetId) ?? "",
  }));
  return c.json({ relations: enriched });
});

/** DELETE /projects/:projectId/knowledge/relations/:relationId — 删除一条关系。 */
knowledgeRoutes.delete("/projects/:projectId/knowledge/relations/:relationId", async (c) => {
  const projectId = c.req.param("projectId");
  const relationId = c.req.param("relationId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db
    .select({ id: knowledgeRelations.id })
    .from(knowledgeRelations)
    .where(and(eq(knowledgeRelations.id, relationId), eq(knowledgeRelations.projectId, projectId)))
    .get();
  if (!existing) return c.json({ error: "RELATION_NOT_FOUND" }, 404);
  await db.delete(knowledgeRelations).where(eq(knowledgeRelations.id, relationId));
  return c.json({ id: relationId, deleted: true });
});
