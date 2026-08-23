import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { findOwnedProject } from "../auth/ownership";
import { createDatabase } from "../db/client";
import { papers, projectPapers, researchQuestions, rqPapers } from "../db/schema";
import type { AppEnv } from "../types";

/**
 * Research Question 一等对象(迁移 0013,v2.0 Research Core)。
 * - 状态机:open → investigating → evidenced → concluded,或任一阶段 → abandoned。
 *   converted(终态概念)这里不用;abandoned 为终态。流转由 PATCH status 校验。
 * - provenance:source(human/ai)、model、generatedAt。
 * - 权限复用 findOwnedProject;rq_papers 关联的论文须属本项目+本账号。
 * - 列表/单条都 enrich 出关联的 paperId 列表(附带基本元信息),便于前端渲染。
 */

const RQ_STATUSES = ["open", "investigating", "evidenced", "concluded", "abandoned"] as const;
type RqStatus = (typeof RQ_STATUSES)[number];

const RQ_TRANSITIONS: Record<RqStatus, RqStatus[]> = {
  open: ["investigating", "abandoned"],
  investigating: ["open", "evidenced", "abandoned"],
  evidenced: ["investigating", "concluded", "abandoned"],
  concluded: [],
  abandoned: [],
};

function canTransition(from: RqStatus, to: RqStatus): boolean {
  return RQ_TRANSITIONS[from].includes(to);
}

interface RqRow {
  id: string;
  projectId: string;
  question: string;
  goal: string;
  status: RqStatus;
  source: "human" | "ai";
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const RQ_SELECT = {
  id: researchQuestions.id,
  projectId: researchQuestions.projectId,
  question: researchQuestions.question,
  goal: researchQuestions.goal,
  status: researchQuestions.status,
  source: researchQuestions.source,
  model: researchQuestions.model,
  generatedAt: researchQuestions.generatedAt,
  createdAt: researchQuestions.createdAt,
  updatedAt: researchQuestions.updatedAt,
};

interface LinkedPaper {
  paperId: string;
  role: string;
  title: string;
  shortName: string;
  authors: string;
  year: number;
}

/** 查询某 RQ 关联的论文(只读本项目内)。空列表返回 []。 */
async function loadLinkedPapers(env: AppEnv["Bindings"], projectId: string, rqId: string): Promise<LinkedPaper[]> {
  const db = createDatabase(env);
  const rows = await db
    .select({
      paperId: rqPapers.paperId,
      role: rqPapers.role,
      title: papers.title,
      shortName: papers.shortName,
      authors: papers.authors,
      year: papers.year,
    })
    .from(rqPapers)
    .innerJoin(papers, eq(rqPapers.paperId, papers.id))
    .where(and(eq(rqPapers.rqId, rqId), eq(rqPapers.projectId, projectId)));
  return rows;
}

function toRq(row: RqRow, linked: LinkedPaper[] = []) {
  return {
    id: row.id,
    projectId: row.projectId,
    question: row.question,
    goal: row.goal,
    status: row.status,
    source: row.source,
    model: row.model,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    papers: linked,
  };
}

const createSchema = z.object({
  question: z.string().min(1).max(500),
  goal: z.string().max(4_000).default(""),
  paperIds: z.array(z.string().max(160)).max(200).optional(),
});

const patchSchema = z.object({
  question: z.string().min(1).max(500).optional(),
  goal: z.string().max(4_000).optional(),
  status: z.enum(RQ_STATUSES).optional(),
});

/** 校验 paperIds 都属于本项目(project_papers 内)。返回不存在的 id(空=全部合法)。 */
async function findPapersNotInProject(env: AppEnv["Bindings"], projectId: string, paperIds: string[]): Promise<string[]> {
  if (paperIds.length === 0) return [];
  const db = createDatabase(env);
  const rows = await db
    .select({ paperId: projectPapers.paperId })
    .from(projectPapers)
    .where(and(eq(projectPapers.projectId, projectId), inArray(projectPapers.paperId, paperIds)));
  const present = new Set(rows.map((r) => r.paperId));
  return paperIds.filter((id) => !present.has(id));
}

export const researchQuestionRoutes = new Hono<AppEnv>();

/** POST /projects/:projectId/research-questions — 人工创建一个研究问题(open)。 */
researchQuestionRoutes.post("/projects/:projectId/research-questions", async (c) => {
  const projectId = c.req.param("projectId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RQ", issues: parsed.error.issues }, 400);

  const paperIds = [...new Set(parsed.data.paperIds ?? [])];
  const missing = await findPapersNotInProject(c.env, projectId, paperIds);
  if (missing.length > 0) return c.json({ error: "PAPER_NOT_IN_PROJECT", message: "部分论文不在当前项目中", paperIds: missing }, 404);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = createDatabase(c.env);
  await db.insert(researchQuestions).values({
    id, ownerId: accountId, projectId,
    question: parsed.data.question, goal: parsed.data.goal,
    status: "open", source: "human", model: null, generatedAt: null,
    createdAt: now, updatedAt: now,
  });
  if (paperIds.length > 0) {
    await db.insert(rqPapers).values(paperIds.map((paperId) => ({ rqId: id, paperId, projectId, role: "related", createdAt: now })));
  }
  const linked = await loadLinkedPapers(c.env, projectId, id);
  return c.json({ researchQuestion: toRq({ id, projectId, question: parsed.data.question, goal: parsed.data.goal, status: "open", source: "human", model: null, generatedAt: null, createdAt: now, updatedAt: now }, linked) }, 201);
});

/** GET /projects/:projectId/research-questions — 列出本项目全部研究问题(每条附关联论文)。 */
researchQuestionRoutes.get("/projects/:projectId/research-questions", async (c) => {
  const projectId = c.req.param("projectId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const rows = await db
    .select(RQ_SELECT)
    .from(researchQuestions)
    .where(and(eq(researchQuestions.projectId, projectId), eq(researchQuestions.ownerId, accountId)))
    .orderBy(desc(researchQuestions.createdAt));
  const ids = rows.map((r) => r.id);
  const linkedByRq = new Map<string, LinkedPaper[]>();
  if (ids.length > 0) {
    const linkRows = await db
      .select({ rqId: rqPapers.rqId, paperId: rqPapers.paperId, role: rqPapers.role, title: papers.title, shortName: papers.shortName, authors: papers.authors, year: papers.year })
      .from(rqPapers)
      .innerJoin(papers, eq(rqPapers.paperId, papers.id))
      .where(inArray(rqPapers.rqId, ids));
    linkRows.forEach((l) => {
      const list = linkedByRq.get(l.rqId) ?? [];
      list.push(l);
      linkedByRq.set(l.rqId, list);
    });
  }
  return c.json({ researchQuestions: rows.map((r) => toRq(r, linkedByRq.get(r.id) ?? [])) });
});

/** GET /projects/:projectId/research-questions/:rqId — 单条研究问题(含关联论文)。 */
researchQuestionRoutes.get("/projects/:projectId/research-questions/:rqId", async (c) => {
  const projectId = c.req.param("projectId");
  const rqId = c.req.param("rqId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const row = await db.select(RQ_SELECT).from(researchQuestions)
    .where(and(eq(researchQuestions.id, rqId), eq(researchQuestions.projectId, projectId), eq(researchQuestions.ownerId, accountId))).get();
  if (!row) return c.json({ error: "RQ_NOT_FOUND", message: "研究问题不存在" }, 404);
  const linked = await loadLinkedPapers(c.env, projectId, rqId);
  return c.json({ researchQuestion: toRq(row, linked) });
});

/** PATCH /projects/:projectId/research-questions/:rqId — 修改问题/目标/状态(状态走后端状态机)。 */
researchQuestionRoutes.patch("/projects/:projectId/research-questions/:rqId", async (c) => {
  const projectId = c.req.param("projectId");
  const rqId = c.req.param("rqId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RQ_PATCH", issues: parsed.error.issues }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "EMPTY_PATCH", message: "没有要修改的内容" }, 400);

  const db = createDatabase(c.env);
  const existing = await db.select(RQ_SELECT).from(researchQuestions)
    .where(and(eq(researchQuestions.id, rqId), eq(researchQuestions.projectId, projectId), eq(researchQuestions.ownerId, accountId))).get();
  if (!existing) return c.json({ error: "RQ_NOT_FOUND", message: "研究问题不存在" }, 404);

  if (parsed.data.status && parsed.data.status !== existing.status && !canTransition(existing.status, parsed.data.status)) {
    return c.json({ error: "INVALID_RQ_TRANSITION", message: `不允许从 ${existing.status} 转到 ${parsed.data.status}` }, 400);
  }

  const now = new Date().toISOString();
  await db.update(researchQuestions).set({ ...parsed.data, updatedAt: now }).where(eq(researchQuestions.id, rqId));
  const updated: RqRow = { ...existing, ...parsed.data, updatedAt: now };
  const linked = await loadLinkedPapers(c.env, projectId, rqId);
  return c.json({ researchQuestion: toRq(updated, linked) });
});

/** DELETE /projects/:projectId/research-questions/:rqId — 删除研究问题(级联清 rq_papers;gaps/ideas 的 rqId set null)。 */
researchQuestionRoutes.delete("/projects/:projectId/research-questions/:rqId", async (c) => {
  const projectId = c.req.param("projectId");
  const rqId = c.req.param("rqId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: researchQuestions.id }).from(researchQuestions)
    .where(and(eq(researchQuestions.id, rqId), eq(researchQuestions.projectId, projectId), eq(researchQuestions.ownerId, accountId))).get();
  if (!existing) return c.json({ error: "RQ_NOT_FOUND", message: "研究问题不存在" }, 404);
  await db.delete(researchQuestions).where(eq(researchQuestions.id, rqId));
  return c.json({ id: rqId, deleted: true });
});

/** POST /projects/:projectId/research-questions/:rqId/papers — 给研究问题关联一篇论文(幂等)。 */
researchQuestionRoutes.post("/projects/:projectId/research-questions/:rqId/papers", async (c) => {
  const projectId = c.req.param("projectId");
  const rqId = c.req.param("rqId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = z.object({ paperId: z.string().min(1).max(160), role: z.string().max(100).default("related") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_LINK", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const rq = await db.select({ id: researchQuestions.id }).from(researchQuestions)
    .where(and(eq(researchQuestions.id, rqId), eq(researchQuestions.projectId, projectId), eq(researchQuestions.ownerId, accountId))).get();
  if (!rq) return c.json({ error: "RQ_NOT_FOUND", message: "研究问题不存在" }, 404);
  const missing = await findPapersNotInProject(c.env, projectId, [parsed.data.paperId]);
  if (missing.length > 0) return c.json({ error: "PAPER_NOT_IN_PROJECT", message: "论文不在当前项目中" }, 404);
  const now = new Date().toISOString();
  const existing = await db.select().from(rqPapers).where(and(eq(rqPapers.rqId, rqId), eq(rqPapers.paperId, parsed.data.paperId))).get();
  if (existing) {
    await db.update(rqPapers).set({ role: parsed.data.role }).where(and(eq(rqPapers.rqId, rqId), eq(rqPapers.paperId, parsed.data.paperId)));
    return c.json({ link: { rqId, paperId: parsed.data.paperId, role: parsed.data.role } }, 200);
  }
  await db.insert(rqPapers).values({ rqId, paperId: parsed.data.paperId, projectId, role: parsed.data.role, createdAt: now });
  return c.json({ link: { rqId, paperId: parsed.data.paperId, role: parsed.data.role } }, 201);
});

/** DELETE /projects/:projectId/research-questions/:rqId/papers/:paperId — 摘掉一篇论文关联。 */
researchQuestionRoutes.delete("/projects/:projectId/research-questions/:rqId/papers/:paperId", async (c) => {
  const projectId = c.req.param("projectId");
  const rqId = c.req.param("rqId");
  const paperId = c.req.param("paperId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ rqId: rqPapers.rqId }).from(rqPapers)
    .innerJoin(researchQuestions, eq(rqPapers.rqId, researchQuestions.id))
    .where(and(eq(rqPapers.rqId, rqId), eq(rqPapers.paperId, paperId), eq(researchQuestions.projectId, projectId), eq(researchQuestions.ownerId, accountId))).get();
  if (!existing) return c.json({ error: "LINK_NOT_FOUND", message: "关联不存在" }, 404);
  await db.delete(rqPapers).where(and(eq(rqPapers.rqId, rqId), eq(rqPapers.paperId, paperId)));
  return c.json({ rqId, paperId, deleted: true });
});
