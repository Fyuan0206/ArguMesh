import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { projectExists } from "../db/projects";
import { createDatabase } from "../db/client";
import { ideaReviews, ideaVersions, ideas, knowledgeItems, ideaEvidence } from "../db/schema";
import { resolveAiForRequest } from "../services/ai";
import { reviseIdea, reviewIdea } from "../ai/capabilities";
import type { AppEnv } from "../types";

/**
 * Idea 评审(迁移 0012,方案 KNOWLEDGE-IDEA-AI-PLAN.md P5):Reviewer → 选建议 → Revise → 新版本。
 * - AI 评审:读当前画布 + 本项目知识证据,产出 verdict / strengths / weaknesses / risks / 结构化建议。
 * - 采纳建议:选若干建议 → 后端据此重新修订画布,落一条 human 新版本(C7),评审标 applied。
 * - provenance:source(human/ai)、model、generatedAt;reviewedVersionId / revisedVersionId 串起评审与版本。
 * - 评审与版本都校验属本项目(单用户本地版,无账号归属)。
 */

interface ReviewRow {
  id: string;
  ideaId: string;
  reviewer: string;
  verdict: "strong" | "viable" | "weak" | "reject";
  strengths: string;
  weaknesses: string;
  risks: string;
  suggestionsJson: string;
  source: "human" | "ai";
  model: string | null;
  generatedAt: string | null;
  reviewedVersionId: string | null;
  revisedVersionId: string | null;
  status: "open" | "applied" | "dismissed";
  createdAt: string;
}

const REVIEW_SELECT = {
  id: ideaReviews.id,
  ideaId: ideaReviews.ideaId,
  reviewer: ideaReviews.reviewer,
  verdict: ideaReviews.verdict,
  strengths: ideaReviews.strengths,
  weaknesses: ideaReviews.weaknesses,
  risks: ideaReviews.risks,
  suggestionsJson: ideaReviews.suggestionsJson,
  source: ideaReviews.source,
  model: ideaReviews.model,
  generatedAt: ideaReviews.generatedAt,
  reviewedVersionId: ideaReviews.reviewedVersionId,
  revisedVersionId: ideaReviews.revisedVersionId,
  status: ideaReviews.status,
  createdAt: ideaReviews.createdAt,
};

interface Suggestion {
  id: string;
  target: string;
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

function parseSuggestions(json: string): Suggestion[] {
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x, i) => ({
        id: typeof x.id === "string" ? x.id : `s${i + 1}`,
        target: typeof x.target === "string" ? x.target : "",
        issue: typeof x.issue === "string" ? x.issue : "",
        suggestion: typeof x.suggestion === "string" ? x.suggestion : "",
        priority: x.priority === "high" || x.priority === "medium" || x.priority === "low" ? x.priority : "medium",
      }));
  } catch {
    return [];
  }
}

function toReview(row: ReviewRow) {
  return {
    id: row.id,
    ideaId: row.ideaId,
    reviewer: row.reviewer,
    verdict: row.verdict,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    risks: row.risks,
    suggestions: parseSuggestions(row.suggestionsJson),
    source: row.source,
    model: row.model,
    generatedAt: row.generatedAt,
    reviewedVersionId: row.reviewedVersionId,
    revisedVersionId: row.revisedVersionId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** 取 idea 当前版本的 title/summary/canvasJson(供评审/修订构 context)。 */
async function loadCurrentVersion(db: ReturnType<typeof createDatabase>, ideaId: string, currentVersionId: string | null) {
  if (!currentVersionId) return null;
  return db.select().from(ideaVersions)
    .where(and(eq(ideaVersions.ideaId, ideaId), eq(ideaVersions.id, currentVersionId))).get();
}

/** 取 idea 关联的证据(只读标题+内容,供评审 context)。 */
async function loadEvidence(db: ReturnType<typeof createDatabase>, ideaId: string) {
  return db.select({ title: knowledgeItems.title, kind: knowledgeItems.kind, content: knowledgeItems.content })
    .from(ideaEvidence).innerJoin(knowledgeItems, eq(ideaEvidence.knowledgeItemId, knowledgeItems.id))
    .where(eq(ideaEvidence.ideaId, ideaId));
}

// prompt/schema 单一真源在 server/ai/{prompts,capabilities}.ts（route 已改用 capability 版本）。

const canvasSchema = z.object({
  problem: z.string().max(4_000).default(""),
  gap: z.string().max(4_000).default(""),
  hypothesis: z.string().max(4_000).default(""),
  method: z.string().max(4_000).default(""),
  experiment: z.string().max(4_000).default(""),
  risks: z.string().max(4_000).default(""),
});

/** 取某 idea 下一个版本号。 */
async function nextVersionNo(db: ReturnType<typeof createDatabase>, ideaId: string): Promise<number> {
  const rows = await db.select({ v: ideaVersions.versionNo }).from(ideaVersions)
    .where(eq(ideaVersions.ideaId, ideaId)).orderBy(desc(ideaVersions.versionNo)).limit(1);
  return (rows[0]?.v ?? 0) + 1;
}

/** 插入一条新版本并设为当前,返回新版本 id。 */
async function insertVersion(
  db: ReturnType<typeof createDatabase>,
  input: { ideaId: string; title: string; summary: string; canvas: z.infer<typeof canvasSchema>; rationale: string; createdBy: "human" | "ai"; model: string | null; generatedAt: string | null; now: string },
) {
  const versionNo = await nextVersionNo(db, input.ideaId);
  const id = crypto.randomUUID();
  await db.insert(ideaVersions).values({
    id, ideaId: input.ideaId, versionNo, title: input.title, summary: input.summary,
    canvasJson: JSON.stringify(input.canvas), rationale: input.rationale,
    createdBy: input.createdBy, model: input.model, generatedAt: input.generatedAt, createdAt: input.now,
  });
  await db.update(ideas).set({ currentVersionId: id, updatedAt: input.now }).where(eq(ideas.id, input.ideaId));
  return id;
}

export const reviewRoutes = new Hono<AppEnv>();

/** POST /projects/:projectId/ideas/:ideaId/reviews/ai — AI 评审当前版本。 */
reviewRoutes.post("/projects/:projectId/ideas/:ideaId/reviews/ai", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const resolution = await resolveAiForRequest(c.env, {});
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  const db = createDatabase(c.env);
  const idea = await db.select().from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  const version = await loadCurrentVersion(db, ideaId, idea.currentVersionId);
  const evidence = await loadEvidence(db, ideaId);
  const now = new Date().toISOString();
  let canvas: z.infer<typeof canvasSchema> = { problem: "", gap: "", hypothesis: "", method: "", experiment: "", risks: "" };
  if (version?.canvasJson) {
    try { canvas = { ...canvas, ...(JSON.parse(version.canvasJson) as object) }; } catch { /* keep empty */ }
  }
  try {
    // AI 能力已收敛到 reviewIdea(capability):画布+证据 → verdict + 意见 + 结构化建议。
    let out: z.infer<typeof import("../ai/capabilities").reviewOutputSchema>;
    let genAt = now;
    ({ data: out, generatedAt: genAt } = await reviewIdea(c.env, {
      providerConfig: resolution.provider,
      model: resolution.model,
      title: idea.title,
      summary: idea.summary,
      canvas: { ...canvas },
      evidence,
    }));
    const id = crypto.randomUUID();
    await db.insert(ideaReviews).values({
      id, ideaId, reviewer: "local",
      verdict: out.verdict, strengths: out.strengths, weaknesses: out.weaknesses, risks: out.risks,
      suggestionsJson: JSON.stringify(out.suggestions),
      source: "ai", model: resolution.model, generatedAt: genAt,
      reviewedVersionId: version?.id ?? null, revisedVersionId: null,
      status: "open", createdAt: now,
    });
    const row = await db.select(REVIEW_SELECT).from(ideaReviews).where(eq(ideaReviews.id, id)).get();
    return c.json({ review: toReview(row as ReviewRow), model: resolution.model }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Idea review failed";
    console.error("Idea review failed", { projectId, ideaId, message });
    return c.json({ error: "IDEA_REVIEW_FAILED", message: "AI 评审失败,请稍后重试", detail: message.slice(0, 500) }, 502);
  }
});

/** GET /projects/:projectId/ideas/:ideaId/reviews — 列出该 Idea 的全部评审(最新在前)。 */
reviewRoutes.get("/projects/:projectId/ideas/:ideaId/reviews", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const idea = await db.select({ id: ideas.id }).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  const rows = await db.select(REVIEW_SELECT).from(ideaReviews)
    .where(eq(ideaReviews.ideaId, ideaId)).orderBy(desc(ideaReviews.createdAt));
  return c.json({ reviews: rows.map((r) => toReview(r as ReviewRow)) });
});

/** DELETE /projects/:projectId/ideas/:ideaId/reviews/:reviewId — 删除一条评审。 */
reviewRoutes.delete("/projects/:projectId/ideas/:ideaId/reviews/:reviewId", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  const reviewId = c.req.param("reviewId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: ideaReviews.id }).from(ideaReviews)
    .innerJoin(ideas, eq(ideaReviews.ideaId, ideas.id))
    .where(and(eq(ideaReviews.id, reviewId), eq(ideaReviews.ideaId, ideaId), eq(ideas.projectId, projectId))).get();
  if (!existing) return c.json({ error: "REVIEW_NOT_FOUND" }, 404);
  await db.delete(ideaReviews).where(eq(ideaReviews.id, reviewId));
  return c.json({ id: reviewId, deleted: true });
});

const applySchema = z.object({
  // 选中的建议 id 列表(来自该评审的 suggestions[].id);为空则退回「按 weaknesses 整体修订」。
  suggestionIds: z.array(z.string().max(40)).max(12).default([]),
});

/** POST /projects/:projectId/ideas/:ideaId/reviews/:reviewId/apply — 采纳建议 → 修订出新版本(C7)。 */
reviewRoutes.post("/projects/:projectId/ideas/:ideaId/reviews/:reviewId/apply", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  const reviewId = c.req.param("reviewId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = applySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "INVALID_APPLY", issues: parsed.error.issues }, 400);
  const resolution = await resolveAiForRequest(c.env, {});
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  const db = createDatabase(c.env);
  const idea = await db.select().from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  const review = await db.select(REVIEW_SELECT).from(ideaReviews)
    .where(and(eq(ideaReviews.id, reviewId), eq(ideaReviews.ideaId, ideaId))).get();
  if (!review) return c.json({ error: "REVIEW_NOT_FOUND" }, 404);
  const version = await loadCurrentVersion(db, ideaId, idea.currentVersionId);
  const allSuggestions = parseSuggestions(review.suggestionsJson);
  const picked = parsed.data.suggestionIds.length > 0
    ? allSuggestions.filter((s) => parsed.data.suggestionIds.includes(s.id))
    : [];
  // 没选中任何建议时,用 weaknesses + risks 作为整体修订依据。
  const fallbackNote = picked.length === 0
    ? [{ id: "overall", target: "overall", issue: review.weaknesses, suggestion: `针对以上不足整体修订;并注意风险:${review.risks}`, priority: "medium" as const }]
    : [];
  const chosen = picked.length > 0 ? picked : fallbackNote;

  const now = new Date().toISOString();
  let canvas: z.infer<typeof canvasSchema> = { problem: "", gap: "", hypothesis: "", method: "", experiment: "", risks: "" };
  if (version?.canvasJson) {
    try { canvas = { ...canvas, ...(JSON.parse(version.canvasJson) as object) }; } catch { /* keep empty */ }
  }
  try {
    // AI 能力已收敛到 reviseIdea(capability):当前画布+被采纳建议 → 修订版 6 段画布。
    let out: z.infer<typeof import("../ai/capabilities").reviseOutputSchema>;
    let genAt = now;
    ({ data: out, generatedAt: genAt } = await reviseIdea(c.env, {
      providerConfig: resolution.provider,
      model: resolution.model,
      title: idea.title,
      canvas: { ...canvas },
      chosen,
    }));
    const revisedCanvas: z.infer<typeof canvasSchema> = { ...canvas, ...out };
    const newId = await insertVersion(db, {
      ideaId, title: idea.title, summary: idea.summary, canvas: revisedCanvas,
      rationale: `按评审修订(采纳 ${chosen.length} 条建议)`,
      createdBy: "ai", model: resolution.model, generatedAt: now, now,
    });
    // 评审标 applied,并记 revisedVersionId;采纳「weak/reject 后的修订」把状态推到 Revise。
    await db.update(ideaReviews).set({ status: "applied", revisedVersionId: newId }).where(eq(ideaReviews.id, reviewId));
    if (idea.status === "Inbox" || idea.status === "Draft" || idea.status === "Reviewing") {
      await db.update(ideas).set({ status: "Revise", updatedAt: now }).where(eq(ideas.id, ideaId));
    }
    const fresh = await db.select().from(ideas).where(eq(ideas.id, ideaId)).get();
    return c.json({
      idea: { ...fresh, currentVersionId: newId } as typeof idea,
      review: toReview({ ...(review as ReviewRow), status: "applied", revisedVersionId: newId }),
      versionId: newId,
      model: resolution.model,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Idea revise failed";
    console.error("Idea revise failed", { projectId, ideaId, message });
    return c.json({ error: "IDEA_REVISE_FAILED", message: "AI 修订失败,请稍后重试", detail: message.slice(0, 500) }, 502);
  }
});
