import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { projectExists } from "../db/projects";
import {
  gapEvidence,
  gaps,
  ideaEvidence,
  ideaVersions,
  ideas,
  knowledgeItems,
  knowledgeRelations,
  papers,
  researchQuestionConclusions,
  researchQuestionEvidence,
  researchQuestionOrigins,
  researchQuestions,
  rqPapers,
} from "../db/schema";
import type { AppEnv } from "../types";

type OriginType = "knowledge" | "gap" | "idea";

interface OriginSnapshot {
  title: string;
  summary: string;
  paperIds: string[];
}

const promoteSchema = z.object({
  question: z.string().trim().min(1).max(500),
  goal: z.string().trim().max(4_000).default(""),
});

async function loadOrigin(
  env: AppEnv["Bindings"],
  projectId: string,
  type: OriginType,
  id: string,
): Promise<OriginSnapshot | null> {
  const db = createDatabase(env);
  if (type === "knowledge") {
    const row = await db.select({ title: knowledgeItems.title, content: knowledgeItems.content, paperId: knowledgeItems.paperId })
      .from(knowledgeItems)
      .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.projectId, projectId)))
      .get();
    return row ? { title: row.title, summary: row.content, paperIds: [row.paperId] } : null;
  }
  if (type === "gap") {
    const row = await db.select({ title: gaps.title, description: gaps.description, rationale: gaps.rationale, paperId: gaps.paperId })
      .from(gaps)
      .where(and(eq(gaps.id, id), eq(gaps.projectId, projectId)))
      .get();
    if (!row) return null;
    const evidence = await db.select({ paperId: knowledgeItems.paperId })
      .from(gapEvidence)
      .innerJoin(knowledgeItems, eq(gapEvidence.knowledgeItemId, knowledgeItems.id))
      .where(eq(gapEvidence.gapId, id));
    return {
      title: row.title,
      summary: row.description || row.rationale,
      paperIds: [...new Set([row.paperId, ...evidence.map((item) => item.paperId)].filter((paperId): paperId is string => Boolean(paperId)))],
    };
  }
  const row = await db.select({ title: ideas.title, summary: ideas.summary })
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.projectId, projectId)))
    .get();
  if (!row) return null;
  const evidence = await db.select({ paperId: knowledgeItems.paperId })
    .from(ideaEvidence)
    .innerJoin(knowledgeItems, eq(ideaEvidence.knowledgeItemId, knowledgeItems.id))
    .where(eq(ideaEvidence.ideaId, id));
  return { title: row.title, summary: row.summary, paperIds: [...new Set(evidence.map((item) => item.paperId))] };
}

export const researchThreadRoutes = new Hono<AppEnv>();

/** 统一读取 Knowledge / Gap / Idea / RQ，前端只需要理解“洞见”和“研究问题”。 */
researchThreadRoutes.get("/projects/:projectId/research-thread", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);

  const [knowledge, relations, gapRows, gapLinks, ideaRows, ideaLinks, origins, questions, paperLinks, conclusions, questionEvidence] = await Promise.all([
    db.select().from(knowledgeItems).where(eq(knowledgeItems.projectId, projectId)).orderBy(desc(knowledgeItems.createdAt)),
    db.select().from(knowledgeRelations).where(eq(knowledgeRelations.projectId, projectId)),
    db.select().from(gaps).where(eq(gaps.projectId, projectId)).orderBy(desc(gaps.createdAt)),
    db.select({ gapId: gapEvidence.gapId, knowledgeItemId: gapEvidence.knowledgeItemId, paperId: knowledgeItems.paperId })
      .from(gapEvidence)
      .innerJoin(knowledgeItems, eq(gapEvidence.knowledgeItemId, knowledgeItems.id))
      .where(eq(knowledgeItems.projectId, projectId)),
    db.select({
      id: ideas.id,
      title: ideas.title,
      summary: ideas.summary,
      status: ideas.status,
      rqId: ideas.rqId,
      createdAt: ideas.createdAt,
      source: ideaVersions.createdBy,
      model: ideaVersions.model,
      generatedAt: ideaVersions.generatedAt,
    }).from(ideas)
      .leftJoin(ideaVersions, eq(ideas.currentVersionId, ideaVersions.id))
      .where(eq(ideas.projectId, projectId))
      .orderBy(desc(ideas.createdAt)),
    db.select({ ideaId: ideaEvidence.ideaId, knowledgeItemId: ideaEvidence.knowledgeItemId, paperId: knowledgeItems.paperId })
      .from(ideaEvidence)
      .innerJoin(knowledgeItems, eq(ideaEvidence.knowledgeItemId, knowledgeItems.id))
      .where(eq(knowledgeItems.projectId, projectId)),
    db.select().from(researchQuestionOrigins).where(eq(researchQuestionOrigins.projectId, projectId)),
    db.select().from(researchQuestions).where(eq(researchQuestions.projectId, projectId)).orderBy(desc(researchQuestions.createdAt)),
    db.select({ rqId: rqPapers.rqId, paperId: rqPapers.paperId, role: rqPapers.role, title: papers.title, shortName: papers.shortName, year: papers.year })
      .from(rqPapers)
      .innerJoin(papers, eq(rqPapers.paperId, papers.id))
      .where(eq(rqPapers.projectId, projectId)),
    db.select().from(researchQuestionConclusions).where(eq(researchQuestionConclusions.projectId, projectId)).orderBy(desc(researchQuestionConclusions.createdAt)),
    db.select({
      id: researchQuestionEvidence.id, rqId: researchQuestionEvidence.rqId, knowledgeItemId: researchQuestionEvidence.knowledgeItemId,
      stance: researchQuestionEvidence.stance, note: researchQuestionEvidence.note, title: knowledgeItems.title,
      paperId: knowledgeItems.paperId, createdAt: researchQuestionEvidence.createdAt,
    }).from(researchQuestionEvidence)
      .innerJoin(knowledgeItems, eq(researchQuestionEvidence.knowledgeItemId, knowledgeItems.id))
      .where(eq(researchQuestionEvidence.projectId, projectId)),
  ]);

  const contradictedIds = new Set<string>();
  for (const relation of relations) {
    if (relation.type === "contradicts") {
      contradictedIds.add(relation.sourceId);
      contradictedIds.add(relation.targetId);
    }
  }
  const originsByObject = new Map<string, string[]>();
  const originsByRq = new Map<string, typeof origins>();
  for (const origin of origins) {
    const objectKey = `${origin.originType}:${origin.originId}`;
    originsByObject.set(objectKey, [...(originsByObject.get(objectKey) ?? []), origin.rqId]);
    originsByRq.set(origin.rqId, [...(originsByRq.get(origin.rqId) ?? []), origin]);
  }
  const gapEvidenceById = new Map<string, typeof gapLinks>();
  for (const link of gapLinks) gapEvidenceById.set(link.gapId, [...(gapEvidenceById.get(link.gapId) ?? []), link]);
  const ideaEvidenceById = new Map<string, typeof ideaLinks>();
  for (const link of ideaLinks) ideaEvidenceById.set(link.ideaId, [...(ideaEvidenceById.get(link.ideaId) ?? []), link]);
  const papersByRq = new Map<string, typeof paperLinks>();
  for (const link of paperLinks) papersByRq.set(link.rqId, [...(papersByRq.get(link.rqId) ?? []), link]);
  const conclusionsByRq = new Map<string, typeof conclusions>();
  for (const conclusion of conclusions) conclusionsByRq.set(conclusion.rqId, [...(conclusionsByRq.get(conclusion.rqId) ?? []), conclusion]);
  const evidenceByRq = new Map<string, typeof questionEvidence>();
  for (const evidence of questionEvidence) evidenceByRq.set(evidence.rqId, [...(evidenceByRq.get(evidence.rqId) ?? []), evidence]);

  const insights = [
    ...knowledge.map((item) => ({
      id: item.id,
      originType: "knowledge" as const,
      type: contradictedIds.has(item.id) ? "contradiction" as const : "finding" as const,
      title: item.title,
      summary: item.content,
      status: item.status,
      source: item.source,
      model: item.model,
      generatedAt: item.generatedAt,
      createdAt: item.createdAt,
      evidenceCount: 1,
      paperIds: [item.paperId],
      researchQuestionIds: originsByObject.get(`knowledge:${item.id}`) ?? [],
    })),
    ...gapRows.map((item) => {
      const evidence = gapEvidenceById.get(item.id) ?? [];
      return {
        id: item.id,
        originType: "gap" as const,
        type: "gap" as const,
        title: item.title,
        summary: item.description || item.rationale,
        status: item.status,
        source: item.source,
        model: item.model,
        generatedAt: item.generatedAt,
        createdAt: item.createdAt,
        evidenceCount: evidence.length,
        paperIds: [...new Set([item.paperId, ...evidence.map((link) => link.paperId)].filter((paperId): paperId is string => Boolean(paperId)))],
        researchQuestionIds: [...new Set([item.rqId, ...(originsByObject.get(`gap:${item.id}`) ?? [])].filter((rqId): rqId is string => Boolean(rqId)))],
      };
    }),
    ...ideaRows.map((item) => {
      const evidence = ideaEvidenceById.get(item.id) ?? [];
      return {
        id: item.id,
        originType: "idea" as const,
        type: "concept" as const,
        title: item.title,
        summary: item.summary,
        status: item.status,
        source: item.source ?? "human" as const,
        model: item.model,
        generatedAt: item.generatedAt,
        createdAt: item.createdAt,
        evidenceCount: evidence.length,
        paperIds: [...new Set(evidence.map((link) => link.paperId))],
        researchQuestionIds: [...new Set([item.rqId, ...(originsByObject.get(`idea:${item.id}`) ?? [])].filter((rqId): rqId is string => Boolean(rqId)))],
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return c.json({
    insights,
    researchQuestions: questions.map((question) => ({
      ...question,
      papers: papersByRq.get(question.id) ?? [],
      origins: (originsByRq.get(question.id) ?? []).map((origin) => ({ type: origin.originType, id: origin.originId })),
      evidence: evidenceByRq.get(question.id) ?? [],
      conclusions: (conclusionsByRq.get(question.id) ?? []).map((conclusion) => ({
        ...conclusion,
        limitations: parseJson(conclusion.limitationsJson, []),
        limitationsJson: undefined,
      })),
    })),
    stats: {
      insights: insights.length,
      findings: insights.filter((item) => item.type === "finding").length,
      contradictions: insights.filter((item) => item.type === "contradiction").length,
      gaps: insights.filter((item) => item.type === "gap").length,
      concepts: insights.filter((item) => item.type === "concept").length,
      questions: questions.length,
      conclusions: conclusions.length,
      questionEvidence: questionEvidence.length,
    },
  });
});

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/** 将一个既有洞见提升为研究问题；重复请求返回已创建的问题。 */
researchThreadRoutes.post("/projects/:projectId/insights/:type/:insightId/promote", async (c) => {
  const projectId = c.req.param("projectId");
  const typeResult = z.enum(["knowledge", "gap", "idea"]).safeParse(c.req.param("type"));
  if (!typeResult.success) return c.json({ error: "INVALID_INSIGHT_TYPE" }, 400);
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = promoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RESEARCH_QUESTION", issues: parsed.error.issues }, 400);

  const insightId = c.req.param("insightId");
  const origin = await loadOrigin(c.env, projectId, typeResult.data, insightId);
  if (!origin) return c.json({ error: "INSIGHT_NOT_FOUND", message: "洞见不存在或不属于当前项目" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ rqId: researchQuestionOrigins.rqId })
    .from(researchQuestionOrigins)
    .where(and(
      eq(researchQuestionOrigins.projectId, projectId),
      eq(researchQuestionOrigins.originType, typeResult.data),
      eq(researchQuestionOrigins.originId, insightId),
    ))
    .get();
  if (existing) {
    const question = await db.select().from(researchQuestions).where(eq(researchQuestions.id, existing.rqId)).get();
    return c.json({ researchQuestion: question, origin: { type: typeResult.data, id: insightId }, created: false });
  }

  const now = new Date().toISOString();
  const rqId = crypto.randomUUID();
  await db.insert(researchQuestions).values({
    id: rqId,
    projectId,
    question: parsed.data.question,
    goal: parsed.data.goal || `验证来自洞见「${origin.title}」的研究判断。`,
    status: "open",
    source: "human",
    model: null,
    generatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(researchQuestionOrigins).values({
    id: crypto.randomUUID(), projectId, rqId, originType: typeResult.data, originId: insightId, createdAt: now,
  });
  if (origin.paperIds.length > 0) {
    await db.insert(rqPapers).values(origin.paperIds.map((paperId) => ({ rqId, paperId, projectId, role: "origin", createdAt: now })));
  }
  if (typeResult.data === "gap") await db.update(gaps).set({ rqId, updatedAt: now }).where(eq(gaps.id, insightId));
  if (typeResult.data === "idea") await db.update(ideas).set({ rqId, updatedAt: now }).where(eq(ideas.id, insightId));

  return c.json({
    researchQuestion: {
      id: rqId,
      projectId,
      question: parsed.data.question,
      goal: parsed.data.goal || `验证来自洞见「${origin.title}」的研究判断。`,
      status: "open",
      source: "human",
      model: null,
      generatedAt: null,
      createdAt: now,
      updatedAt: now,
      papers: origin.paperIds,
    },
    origin: { type: typeResult.data, id: insightId },
    created: true,
  }, 201);
});
