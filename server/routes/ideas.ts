import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { projectExists } from "../db/projects";
import { createDatabase } from "../db/client";
import { gaps, ideaEvidence, ideaVersions, ideas, knowledgeItems } from "../db/schema";
import { resolveAiForRequest } from "../services/ai";
import { draftIdea, regenerateIdea } from "../ai/capabilities";
import type { AppEnv } from "../types";

/**
 * Idea 一等对象(迁移 0010,方案 KNOWLEDGE-IDEA-AI-PLAN.md P3)。
 * - **围绕 Version 设计(C7)**:每次人工编辑 / AI 重新生成 / review revise 都落成一条新 `idea_versions` 行,
 *   从不覆盖旧版。本表只保留指向「当前版本」的 currentVersionId,首次创建同时写入版本 1。
 * - **provenance**:sourceGapId 记录由哪个 Gap 转来(可空);版本行带 createdBy(human/ai)+ model + generatedAt。
 * - AI 后端直接存 draft(同 C4),前端无法伪造来源;后端构 AI context 只读本项目知识(C9),不读 PDF(C10)。
 * - evidence 挂载须校验知识对象属本项目(单用户本地版,无账号归属)。
 */

const IDEA_STATUSES = ["Inbox", "Draft", "Reviewing", "Revise", "Approved", "Experimenting", "Writing", "Archived"] as const;
type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** 6 段式研究画布(与前端 IdeaCanvas 一致)。 */
interface IdeaCanvas {
  problem: string;
  gap: string;
  hypothesis: string;
  method: string;
  experiment: string;
  risks: string;
}
const CANVAS_KEYS = ["problem", "gap", "hypothesis", "method", "experiment", "risks"] as const;
const EMPTY_CANVAS: IdeaCanvas = { problem: "", gap: "", hypothesis: "", method: "", experiment: "", risks: "" };

interface IdeaRow {
  id: string;
  projectId: string;
  sourceGapId: string | null;
  title: string;
  summary: string;
  status: IdeaStatus;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VersionRow {
  id: string;
  ideaId: string;
  versionNo: number;
  title: string;
  summary: string;
  canvasJson: string;
  rationale: string;
  createdBy: "human" | "ai";
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
}

const IDEA_SELECT = {
  id: ideas.id,
  projectId: ideas.projectId,
  sourceGapId: ideas.sourceGapId,
  title: ideas.title,
  summary: ideas.summary,
  status: ideas.status,
  currentVersionId: ideas.currentVersionId,
  createdAt: ideas.createdAt,
  updatedAt: ideas.updatedAt,
};

const VERSION_SELECT = {
  id: ideaVersions.id,
  ideaId: ideaVersions.ideaId,
  versionNo: ideaVersions.versionNo,
  title: ideaVersions.title,
  summary: ideaVersions.summary,
  canvasJson: ideaVersions.canvasJson,
  rationale: ideaVersions.rationale,
  createdBy: ideaVersions.createdBy,
  model: ideaVersions.model,
  generatedAt: ideaVersions.generatedAt,
  createdAt: ideaVersions.createdAt,
};

function toIdea(row: IdeaRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceGapId: row.sourceGapId,
    title: row.title,
    summary: row.summary,
    status: row.status,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseCanvas(json: string): IdeaCanvas {
  try {
    const obj = JSON.parse(json) as Partial<IdeaCanvas>;
    return { ...EMPTY_CANVAS, ...Object.fromEntries(CANVAS_KEYS.filter((k) => typeof obj[k] === "string").map((k) => [k, String(obj[k])])) };
  } catch {
    return { ...EMPTY_CANVAS };
  }
}

function toVersion(row: VersionRow) {
  return {
    id: row.id,
    ideaId: row.ideaId,
    versionNo: row.versionNo,
    title: row.title,
    summary: row.summary,
    canvas: parseCanvas(row.canvasJson),
    rationale: row.rationale,
    createdBy: row.createdBy,
    model: row.model,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
  };
}

const canvasSchema = z.object({
  problem: z.string().max(4_000).default(""),
  gap: z.string().max(4_000).default(""),
  hypothesis: z.string().max(4_000).default(""),
  method: z.string().max(4_000).default(""),
  experiment: z.string().max(4_000).default(""),
  risks: z.string().max(4_000).default(""),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(4_000).default(""),
  canvas: canvasSchema.partial().optional(),
  sourceGapId: z.string().max(160).optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(4_000).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  // 传入 canvas 则落一条新版本(C7);不传则只改 title/summary/status,不动版本链。
  canvas: canvasSchema.partial().optional(),
  rationale: z.string().max(2_000).optional(),
});

/** 读取某 idea 的最大版本号(用于生成下一个 versionNo)。 */
async function nextVersionNo(db: ReturnType<typeof createDatabase>, ideaId: string): Promise<number> {
  const rows = await db.select({ v: ideaVersions.versionNo }).from(ideaVersions)
    .where(eq(ideaVersions.ideaId, ideaId)).orderBy(desc(ideaVersions.versionNo)).limit(1);
  return (rows[0]?.v ?? 0) + 1;
}

/** 插入一条新版本并把它设为当前版本,返回新版本行。 */
async function insertVersion(
  db: ReturnType<typeof createDatabase>,
  input: { ideaId: string; title: string; summary: string; canvas: IdeaCanvas; rationale: string; createdBy: "human" | "ai"; model: string | null; generatedAt: string | null; now: string },
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

/** 读取某 idea 的当前版本(可能为空,如刚创建未写入版本)。 */
async function currentVersion(db: ReturnType<typeof createDatabase>, ideaId: string, currentVersionId: string | null) {
  if (!currentVersionId) return null;
  return db.select(VERSION_SELECT).from(ideaVersions)
    .where(and(eq(ideaVersions.ideaId, ideaId), eq(ideaVersions.id, currentVersionId))).get();
}

/** 读取某 idea 关联的证据 id 列表。 */
async function evidenceFor(db: ReturnType<typeof createDatabase>, ideaId: string) {
  const rows = await db.select({ id: ideaEvidence.id, knowledgeItemId: ideaEvidence.knowledgeItemId, role: ideaEvidence.role })
    .from(ideaEvidence).where(eq(ideaEvidence.ideaId, ideaId));
  return rows;
}

/** 组装返回体:idea + 当前版本 + 证据。 */
async function assembleIdea(db: ReturnType<typeof createDatabase>, idea: IdeaRow) {
  const [version, evidence] = await Promise.all([
    currentVersion(db, idea.id, idea.currentVersionId),
    evidenceFor(db, idea.id),
  ]);
  return {
    ...toIdea(idea),
    currentVersion: version ? toVersion(version) : null,
    evidence,
  };
}

/** 校验 sourceGapId 属于本项目+本账号(转换入口用)。 */
async function ownedGapInProject(db: ReturnType<typeof createDatabase>, projectId: string, gapId: string) {
  return db.select({ id: gaps.id }).from(gaps)
    .where(and(eq(gaps.id, gapId), eq(gaps.projectId, projectId))).get();
}

/** 校验 knowledgeItemId 属于本项目。 */
async function ownedKnowledgeInProject(db: ReturnType<typeof createDatabase>, projectId: string, itemId: string) {
  return db.select({ id: knowledgeItems.id, title: knowledgeItems.title, kind: knowledgeItems.kind, content: knowledgeItems.content }).from(knowledgeItems)
    .where(and(eq(knowledgeItems.id, itemId), eq(knowledgeItems.projectId, projectId))).get();
}

export const ideaRoutes = new Hono<AppEnv>();

/** POST /projects/:projectId/ideas — 人工新建一条 Idea(落初始版本 1,createdBy:human)。 */
ideaRoutes.post("/projects/:projectId/ideas", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_IDEA", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  // 转换入口:sourceGapId 须属本项目;转 Idea 后把该 Gap 标为 converted。
  if (parsed.data.sourceGapId && !(await ownedGapInProject(db, projectId, parsed.data.sourceGapId))) {
    return c.json({ error: "GAP_NOT_FOUND", message: "缺口不在当前项目中" }, 404);
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const canvas: IdeaCanvas = { ...EMPTY_CANVAS, ...(parsed.data.canvas ?? {}) };
  await db.insert(ideas).values({
    id, projectId, sourceGapId: parsed.data.sourceGapId ?? null,
    title: parsed.data.title, summary: parsed.data.summary, status: "Inbox",
    currentVersionId: null, createdAt: now, updatedAt: now,
  });
  // 首次即落版本 1(C7):即使只有标题,也有一条不可变基线。
  await insertVersion(db, {
    ideaId: id, title: parsed.data.title, summary: parsed.data.summary, canvas,
    rationale: parsed.data.sourceGapId ? "由研究缺口转换创建" : "人工记录",
    createdBy: "human", model: null, generatedAt: null, now,
  });
  // 把来源 Gap 推进到 converted(状态机:evidenced→converted);非终态前的失败不阻断 Idea 创建。
  if (parsed.data.sourceGapId) {
    await db.update(gaps).set({ status: "converted", updatedAt: now })
      .where(and(eq(gaps.id, parsed.data.sourceGapId), eq(gaps.projectId, projectId)));
  }
  const row: IdeaRow = {
    id, projectId, sourceGapId: parsed.data.sourceGapId ?? null,
    title: parsed.data.title, summary: parsed.data.summary, status: "Inbox",
    currentVersionId: null, createdAt: now, updatedAt: now,
  };
  // 重新读一次以拿到 insertVersion 写回的 currentVersionId。
  const fresh = await db.select(IDEA_SELECT).from(ideas).where(eq(ideas.id, id)).get();
  return c.json({ idea: await assembleIdea(db, (fresh ?? row) as IdeaRow) }, 201);
});

/** GET /projects/:projectId/ideas — 列出本项目 Idea(每条附当前版本 + 证据)。 */
ideaRoutes.get("/projects/:projectId/ideas", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const rows = await db.select(IDEA_SELECT).from(ideas)
    .where(and(eq(ideas.projectId, projectId)))
    .orderBy(desc(ideas.createdAt));
  const ideasOut = await Promise.all(rows.map((r) => assembleIdea(db, r as IdeaRow)));
  return c.json({ ideas: ideasOut });
});

/** GET /projects/:projectId/ideas/:ideaId — 单条 Idea(含当前版本 + 全部历史版本 + 证据)。 */
ideaRoutes.get("/projects/:projectId/ideas/:ideaId", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const idea = await db.select(IDEA_SELECT).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  const [assembled, versions] = await Promise.all([
    assembleIdea(db, idea as IdeaRow),
    db.select(VERSION_SELECT).from(ideaVersions).where(eq(ideaVersions.ideaId, ideaId)).orderBy(desc(ideaVersions.versionNo)),
  ]);
  return c.json({ idea: { ...assembled, versions: versions.map(toVersion) } });
});

/** PATCH /projects/:projectId/ideas/:ideaId — 人工修改。传 canvas 落新版本(C7),否则只改元信息。 */
ideaRoutes.patch("/projects/:projectId/ideas/:ideaId", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_IDEA_PATCH", issues: parsed.error.issues }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "EMPTY_PATCH", message: "没有要修改的内容" }, 400);
  const db = createDatabase(c.env);
  const existing = await db.select(IDEA_SELECT).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!existing) return c.json({ error: "IDEA_NOT_FOUND" }, 404);

  const now = new Date().toISOString();
  const meta: Partial<{ title: string; summary: string; status: IdeaStatus }> = {};
  if (parsed.data.title !== undefined) meta.title = parsed.data.title;
  if (parsed.data.summary !== undefined) meta.summary = parsed.data.summary;
  if (parsed.data.status !== undefined) meta.status = parsed.data.status;

  if (parsed.data.canvas) {
    // 人工编辑:以现有当前版本为底,合并传入画布字段,落一条 human 新版本。
    // canvasSchema 的每个字段带 default(""),partial() 后未传字段会是 "",这里只覆盖非空字段,
    // 避免把旧版本的已填内容清空(C7 合并语义)。
    const cur = await currentVersion(db, ideaId, existing.currentVersionId);
    const base = cur ? parseCanvas(cur.canvasJson) : { ...EMPTY_CANVAS };
    const patch = Object.fromEntries(
      CANVAS_KEYS.filter((k) => (parsed.data.canvas![k] ?? "").trim() !== "").map((k) => [k, parsed.data.canvas![k]]),
    ) as Partial<IdeaCanvas>;
    const merged: IdeaCanvas = { ...base, ...patch };
    const title = parsed.data.title ?? existing.title;
    const summary = parsed.data.summary ?? existing.summary;
    await insertVersion(db, {
      ideaId, title, summary, canvas: merged,
      rationale: parsed.data.rationale ?? "人工编辑",
      createdBy: "human", model: null, generatedAt: null, now,
    });
    meta.title = title;
    meta.summary = summary;
  }
  if (Object.keys(meta).length > 0) {
    await db.update(ideas).set({ ...meta, updatedAt: now }).where(eq(ideas.id, ideaId));
  }
  const fresh = await db.select(IDEA_SELECT).from(ideas).where(eq(ideas.id, ideaId)).get();
  return c.json({ idea: await assembleIdea(db, (fresh ?? existing) as IdeaRow) });
});

/** DELETE /projects/:projectId/ideas/:ideaId — 删除 Idea(级联清版本 + 证据)。 */
ideaRoutes.delete("/projects/:projectId/ideas/:ideaId", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: ideas.id }).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!existing) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  await db.delete(ideas).where(eq(ideas.id, ideaId));
  return c.json({ id: ideaId, deleted: true });
});

/** POST /projects/:projectId/ideas/:ideaId/evidence — 给 Idea 挂一条知识证据(幂等)。 */
ideaRoutes.post("/projects/:projectId/ideas/:ideaId/evidence", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = z.object({
    knowledgeItemId: z.string().min(1),
    role: z.enum(["supports", "contradicts", "context"]).default("supports"),
    note: z.string().max(1_000).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EVIDENCE", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const idea = await db.select({ id: ideas.id }).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  const item = await ownedKnowledgeInProject(db, projectId, parsed.data.knowledgeItemId);
  if (!item) return c.json({ error: "KNOWLEDGE_NOT_FOUND", message: "知识对象不在当前项目中" }, 404);
  const existing = await db.select().from(ideaEvidence)
    .where(and(eq(ideaEvidence.ideaId, ideaId), eq(ideaEvidence.knowledgeItemId, parsed.data.knowledgeItemId))).get();
  const now = new Date().toISOString();
  if (existing) {
    await db.update(ideaEvidence).set({ role: parsed.data.role, note: parsed.data.note ?? existing.note }).where(eq(ideaEvidence.id, existing.id));
    return c.json({ evidence: { id: existing.id, ideaId, knowledgeItemId: parsed.data.knowledgeItemId, role: parsed.data.role } }, 200);
  }
  const id = crypto.randomUUID();
  await db.insert(ideaEvidence).values({ id, ideaId, knowledgeItemId: parsed.data.knowledgeItemId, role: parsed.data.role, note: parsed.data.note ?? "", createdAt: now });
  return c.json({ evidence: { id, ideaId, knowledgeItemId: parsed.data.knowledgeItemId, role: parsed.data.role } }, 201);
});

/** DELETE /projects/:projectId/ideas/:ideaId/evidence/:evidenceId — 摘掉一条证据。 */
ideaRoutes.delete("/projects/:projectId/ideas/:ideaId/evidence/:evidenceId", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  const evidenceId = c.req.param("evidenceId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: ideaEvidence.id }).from(ideaEvidence)
    .innerJoin(ideas, eq(ideaEvidence.ideaId, ideas.id))
    .where(and(eq(ideaEvidence.id, evidenceId), eq(ideaEvidence.ideaId, ideaId), eq(ideas.projectId, projectId))).get();
  if (!existing) return c.json({ error: "EVIDENCE_NOT_FOUND" }, 404);
  await db.delete(ideaEvidence).where(eq(ideaEvidence.id, evidenceId));
  return c.json({ id: evidenceId, deleted: true });
});

/** POST /projects/:projectId/ideas/:ideaId/restore — 恢复到某历史版本。
 *  为遵守 C7(不覆盖旧版),恢复不是「把指针指回旧行」,而是把目标版本的画布复制成一条**新版本**再设为当前,
 *  这样历史链始终单调递增、可审计。 */
ideaRoutes.post("/projects/:projectId/ideas/:ideaId/restore", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = z.object({ versionId: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RESTORE", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const idea = await db.select(IDEA_SELECT).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  const target = await db.select(VERSION_SELECT).from(ideaVersions)
    .where(and(eq(ideaVersions.id, parsed.data.versionId), eq(ideaVersions.ideaId, ideaId))).get();
  if (!target) return c.json({ error: "VERSION_NOT_FOUND", message: "目标版本不存在" }, 404);
  const now = new Date().toISOString();
  // 复制目标版本画布成新版本(versionNo = max+1),不修改旧行。
  await insertVersion(db, {
    ideaId, title: target.title, summary: target.summary, canvas: parseCanvas(target.canvasJson),
    rationale: `恢复到版本 v${target.versionNo}`,
    createdBy: "human", model: null, generatedAt: null, now,
  });
  const fresh = await db.select(IDEA_SELECT).from(ideas).where(eq(ideas.id, ideaId)).get();
  return c.json({ idea: await assembleIdea(db, (fresh ?? idea) as IdeaRow) });
});

/** POST /projects/:projectId/ideas/:ideaId/draft — AI 起草 6 段画布,落一条 ai 新版本(C7),返回新版本。 */
ideaRoutes.post("/projects/:projectId/ideas/:ideaId/draft", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const resolution = await resolveAiForRequest(c.env, {});
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  const db = createDatabase(c.env);
  const idea = await db.select(IDEA_SELECT).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  // 构 context:本条 idea 已挂的证据(优先)+ 本项目近期知识兜底,只读标题+内容(C9/C10)。
  const linked = await db.select({ title: knowledgeItems.title, kind: knowledgeItems.kind, content: knowledgeItems.content })
    .from(ideaEvidence).innerJoin(knowledgeItems, eq(ideaEvidence.knowledgeItemId, knowledgeItems.id))
    .where(eq(ideaEvidence.ideaId, ideaId));
  const fallback = linked.length > 0 ? [] : await db.select({ title: knowledgeItems.title, kind: knowledgeItems.kind, content: knowledgeItems.content })
    .from(knowledgeItems).where(and(eq(knowledgeItems.projectId, projectId)))
    .orderBy(desc(knowledgeItems.createdAt)).limit(20);
  const evidence = linked.length > 0 ? linked : fallback;
  const now = new Date().toISOString();
  // AI 能力已收敛到 draftIdea(capability):想法+证据 → 6 段画布。
  let out: z.infer<typeof import("../ai/capabilities").draftOutputSchema>;
  let genAt = now;
  try {
    ({ data: out, generatedAt: genAt } = await draftIdea(c.env, {
      providerConfig: resolution.provider,
      model: resolution.model,
      title: idea.title,
      summary: idea.summary,
      evidence,
    }));
    const canvas: IdeaCanvas = { ...EMPTY_CANVAS, ...out };
    const newId = await insertVersion(db, {
      ideaId, title: idea.title, summary: idea.summary, canvas,
      rationale: "AI 起草研究画布",
      createdBy: "ai", model: resolution.model, generatedAt: genAt, now,
    });
    // AI 起草把状态从 Inbox 推进到 Draft(不强制,仅当仍为 Inbox 时)。
    if (idea.status === "Inbox") {
      await db.update(ideas).set({ status: "Draft", updatedAt: now }).where(eq(ideas.id, ideaId));
    }
    const fresh = await db.select(IDEA_SELECT).from(ideas).where(eq(ideas.id, ideaId)).get();
    const assembled = await assembleIdea(db, (fresh ?? idea) as IdeaRow);
    return c.json({ idea: assembled, versionId: newId, model: resolution.model }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Idea draft failed";
    console.error("Idea draft failed", { projectId, ideaId, message });
    return c.json({ error: "IDEA_DRAFT_FAILED", message: "AI 画布起草失败,请稍后重试", detail: message.slice(0, 500) }, 502);
  }
});

const regenerateSchema = z.object({
  // 可选修改指令:如「把假设写得更可证伪」「补充风险」。
  instruction: z.string().max(2_000).default(""),
});

/** POST /projects/:projectId/ideas/:ideaId/regenerate — AI 基于当前画布重新起草,落一条 ai 新版本(C7)。 */
ideaRoutes.post("/projects/:projectId/ideas/:ideaId/regenerate", async (c) => {
  const projectId = c.req.param("projectId");
  const ideaId = c.req.param("ideaId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  // POST 体可选:空/null 体统一按 {} 处理(instruction 有 default),避免 null 触发 INVALID。
  const raw = await c.req.json().catch(() => ({}));
  const parsed = regenerateSchema.safeParse(raw ?? {});
  if (!parsed.success) return c.json({ error: "INVALID_REGENERATE", issues: parsed.error.issues }, 400);
  const resolution = await resolveAiForRequest(c.env, {});
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  const db = createDatabase(c.env);
  const idea = await db.select(IDEA_SELECT).from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
  if (!idea) return c.json({ error: "IDEA_NOT_FOUND" }, 404);
  // 构 context:证据(同 draft,只读标题+内容 C9/C10)。
  const linked = await db.select({ title: knowledgeItems.title, kind: knowledgeItems.kind, content: knowledgeItems.content })
    .from(ideaEvidence).innerJoin(knowledgeItems, eq(ideaEvidence.knowledgeItemId, knowledgeItems.id))
    .where(eq(ideaEvidence.ideaId, ideaId));
  const fallback = linked.length > 0 ? [] : await db.select({ title: knowledgeItems.title, kind: knowledgeItems.kind, content: knowledgeItems.content })
    .from(knowledgeItems).where(and(eq(knowledgeItems.projectId, projectId)))
    .orderBy(desc(knowledgeItems.createdAt)).limit(20);
  const evidence = linked.length > 0 ? linked : fallback;
  const cur = await currentVersion(db, ideaId, idea.currentVersionId);
  const now = new Date().toISOString();
  // AI 能力已收敛到 regenerateIdea(capability):当前画布+证据+指令 → 改进版 6 段画布。
  let out: z.infer<typeof import("../ai/capabilities").draftOutputSchema>;
  let genAt = now;
  try {
    ({ data: out, generatedAt: genAt } = await regenerateIdea(c.env, {
      providerConfig: resolution.provider,
      model: resolution.model,
      title: idea.title,
      summary: idea.summary,
      instruction: parsed.data.instruction,
      currentCanvas: { ...(cur ? parseCanvas(cur.canvasJson) : EMPTY_CANVAS) },
      evidence,
    }));
    const canvas: IdeaCanvas = { ...EMPTY_CANVAS, ...out };
    const newId = await insertVersion(db, {
      ideaId, title: idea.title, summary: idea.summary, canvas,
      rationale: parsed.data.instruction ? `AI 重新起草:${parsed.data.instruction}` : "AI 重新起草研究画布",
      createdBy: "ai", model: resolution.model, generatedAt: genAt, now,
    });
    if (idea.status === "Inbox") {
      await db.update(ideas).set({ status: "Draft", updatedAt: now }).where(eq(ideas.id, ideaId));
    }
    const fresh = await db.select(IDEA_SELECT).from(ideas).where(eq(ideas.id, ideaId)).get();
    const assembled = await assembleIdea(db, (fresh ?? idea) as IdeaRow);
    return c.json({ idea: assembled, versionId: newId, model: resolution.model }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Idea regenerate failed";
    console.error("Idea regenerate failed", { projectId, ideaId, message });
    return c.json({ error: "IDEA_REGENERATE_FAILED", message: "AI 重新起草失败,请稍后重试", detail: message.slice(0, 500) }, 502);
  }
});