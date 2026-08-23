import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { findOwnedProject } from "../auth/ownership";
import { createDatabase } from "../db/client";
import { gapEvidence, gaps, knowledgeItems, projectPapers } from "../db/schema";
import { resolveAiForRequest } from "../services/ai";
import { discoverGap } from "../ai/capabilities";
import type { AppEnv } from "../types";

/**
 * Gap 一等对象(迁移 0009):研究缺口,带状态机。P2 打通 Evidence → Gap → Idea 主链第一环。
 * - AI Gap Discovery 由后端直接插 draft(同 C4),provenance 由后端写入,前端不可伪造。
 * - 后端构 AI context 只读本项目知识(C9),不读 PDF 全文(C10)。
 * - 权限复用 findOwnedProject;gap_evidence 的知识对象须属本项目。
 */

const GAP_STATUSES = ["candidate", "searching", "evidenced", "converted", "rejected"] as const;
type GapStatus = (typeof GAP_STATUSES)[number];

/**
 * Gap 状态机合法流转:
 *   candidate → searching | evidenced | rejected
 *   searching → candidate | evidenced | rejected
 *   evidenced → converted | rejected
 *   converted / rejected 为终态,不可再转。
 */
const GAP_TRANSITIONS: Record<GapStatus, GapStatus[]> = {
  candidate: ["searching", "evidenced", "rejected"],
  searching: ["candidate", "evidenced", "rejected"],
  evidenced: ["converted", "rejected"],
  converted: [],
  rejected: [],
};

function canTransition(from: GapStatus, to: GapStatus): boolean {
  return GAP_TRANSITIONS[from].includes(to);
}

interface GapRow {
  id: string;
  projectId: string;
  paperId: string | null;
  title: string;
  description: string;
  rationale: string;
  status: GapStatus;
  source: "human" | "ai";
  model: string | null;
  generatedAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

const GAP_SELECT = {
  id: gaps.id,
  projectId: gaps.projectId,
  paperId: gaps.paperId,
  title: gaps.title,
  description: gaps.description,
  rationale: gaps.rationale,
  status: gaps.status,
  source: gaps.source,
  model: gaps.model,
  generatedAt: gaps.generatedAt,
  note: gaps.note,
  createdAt: gaps.createdAt,
  updatedAt: gaps.updatedAt,
};

function toGap(row: GapRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    paperId: row.paperId,
    title: row.title,
    description: row.description,
    rationale: row.rationale,
    status: row.status,
    source: row.source,
    model: row.model,
    generatedAt: row.generatedAt,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const createSchema = z.object({
  paperId: z.string().max(160).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(4_000).default(""),
  rationale: z.string().max(4_000).default(""),
  note: z.string().max(1_000).default(""),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4_000).optional(),
  rationale: z.string().max(4_000).optional(),
  note: z.string().max(1_000).optional(),
  status: z.enum(GAP_STATUSES).optional(),
  // 转换目标:仅 status→converted 时记录(Idea 一等对象在 P3 落地;本字段先占位留接口)。
  convertedIdeaId: z.string().max(160).optional(),
});

// prompt/schema 单一真源在 server/ai/{prompts,capabilities}.ts(GAP_DISCOVERY_SYSTEM_PROMPT / discoverOutputSchema)。

/** 校验 paperId 属于本项目且当前账号可访问(可选字段)。 */
async function projectPaperInProject(env: AppEnv["Bindings"], projectId: string, paperId: string): Promise<boolean> {
  const db = createDatabase(env);
  const row = await db
    .select({ paperId: projectPapers.paperId })
    .from(projectPapers)
    .where(and(eq(projectPapers.projectId, projectId), eq(projectPapers.paperId, paperId)))
    .get();
  return Boolean(row);
}

export const gapRoutes = new Hono<AppEnv>();

/** POST /projects/:projectId/gaps — 人工创建一条缺口(candidate)。 */
gapRoutes.post("/projects/:projectId/gaps", async (c) => {
  const projectId = c.req.param("projectId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_GAP", issues: parsed.error.issues }, 400);
  if (parsed.data.paperId && !(await projectPaperInProject(c.env, projectId, parsed.data.paperId))) {
    return c.json({ error: "PAPER_NOT_IN_PROJECT", message: "论文不在当前项目中" }, 404);
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = createDatabase(c.env);
  await db.insert(gaps).values({
    id, ownerId: accountId, projectId,
    paperId: parsed.data.paperId ?? null,
    title: parsed.data.title, description: parsed.data.description,
    rationale: parsed.data.rationale, note: parsed.data.note,
    status: "candidate", source: "human", model: null, generatedAt: null,
    createdAt: now, updatedAt: now,
  });
  const body = toGap({
    id, projectId, paperId: parsed.data.paperId ?? null, title: parsed.data.title,
    description: parsed.data.description, rationale: parsed.data.rationale, note: parsed.data.note,
    status: "candidate", source: "human", model: null, generatedAt: null, createdAt: now, updatedAt: now,
  });
  return c.json({ gap: body }, 201);
});

/** GET /projects/:projectId/gaps — 列出本项目缺口(每条附挂载的证据 id 列表)。 */
gapRoutes.get("/projects/:projectId/gaps", async (c) => {
  const projectId = c.req.param("projectId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const rows = await db
    .select(GAP_SELECT)
    .from(gaps)
    .where(and(eq(gaps.projectId, projectId), eq(gaps.ownerId, accountId)))
    .orderBy(desc(gaps.createdAt));
  const gapIds = rows.map((r) => r.id);
  const evidenceByGap = new Map<string, Array<{ id: string; knowledgeItemId: string; stance: string }>>();
  if (gapIds.length > 0) {
    const evRows = await db
      .select({ id: gapEvidence.id, gapId: gapEvidence.gapId, knowledgeItemId: gapEvidence.knowledgeItemId, stance: gapEvidence.stance })
      .from(gapEvidence)
      .where(inArray(gapEvidence.gapId, gapIds));
    evRows.forEach((e) => {
      const list = evidenceByGap.get(e.gapId) ?? [];
      list.push({ id: e.id, knowledgeItemId: e.knowledgeItemId, stance: e.stance });
      evidenceByGap.set(e.gapId, list);
    });
  }
  return c.json({ gaps: rows.map((r) => ({ ...toGap(r), evidence: evidenceByGap.get(r.id) ?? [] })) });
});

/** PATCH /projects/:projectId/gaps/:gapId — 人工修改(含状态流转校验)。 */
gapRoutes.patch("/projects/:projectId/gaps/:gapId", async (c) => {
  const projectId = c.req.param("projectId");
  const gapId = c.req.param("gapId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_GAP_PATCH", issues: parsed.error.issues }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "EMPTY_PATCH", message: "没有要修改的内容" }, 400);

  const db = createDatabase(c.env);
  const existing = await db
    .select(GAP_SELECT)
    .from(gaps)
    .where(and(eq(gaps.id, gapId), eq(gaps.projectId, projectId), eq(gaps.ownerId, accountId)))
    .get();
  if (!existing) return c.json({ error: "GAP_NOT_FOUND", message: "缺口不存在" }, 404);

  // 状态流转校验:非法跃迁直接拒绝,保护状态机语义。
  if (parsed.data.status && parsed.data.status !== existing.status && !canTransition(existing.status, parsed.data.status)) {
    return c.json({ error: "INVALID_GAP_TRANSITION", message: `不允许从 ${existing.status} 转到 ${parsed.data.status}` }, 400);
  }

  const { convertedIdeaId, ...rest } = parsed.data;
  const now = new Date().toISOString();
  // 转 Idea 时把目标 idea id 记进 note(占位,P3 真正落地 ideas 表前先留痕)。
  const noteUpdate = parsed.data.status === "converted" && convertedIdeaId
    ? { note: `${existing.note}${existing.note ? "\n" : ""}[转 Idea] ${convertedIdeaId}`.slice(0, 1_000) }
    : {};
  await db.update(gaps).set({ ...rest, ...noteUpdate, updatedAt: now }).where(eq(gaps.id, gapId));
  const updated = { ...existing, ...rest, ...noteUpdate, updatedAt: now };
  return c.json({ gap: toGap(updated as GapRow) });
});

/** DELETE /projects/:projectId/gaps/:gapId — 删除缺口(级联清 gap_evidence)。 */
gapRoutes.delete("/projects/:projectId/gaps/:gapId", async (c) => {
  const projectId = c.req.param("projectId");
  const gapId = c.req.param("gapId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: gaps.id }).from(gaps)
    .where(and(eq(gaps.id, gapId), eq(gaps.projectId, projectId), eq(gaps.ownerId, accountId))).get();
  if (!existing) return c.json({ error: "GAP_NOT_FOUND" }, 404);
  await db.delete(gaps).where(eq(gaps.id, gapId));
  return c.json({ id: gapId, deleted: true });
});

/** POST /projects/:projectId/gaps/:gapId/evidence — 给缺口挂一条知识证据。 */
gapRoutes.post("/projects/:projectId/gaps/:gapId/evidence", async (c) => {
  const projectId = c.req.param("projectId");
  const gapId = c.req.param("gapId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = z.object({
    knowledgeItemId: z.string().min(1),
    stance: z.enum(["supports", "contradicts", "context"]).default("supports"),
    note: z.string().max(1_000).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EVIDENCE", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const gap = await db.select({ id: gaps.id }).from(gaps)
    .where(and(eq(gaps.id, gapId), eq(gaps.projectId, projectId), eq(gaps.ownerId, accountId))).get();
  if (!gap) return c.json({ error: "GAP_NOT_FOUND" }, 404);
  // 证据必须是本项目+本账号的知识对象。
  const item = await db.select({ id: knowledgeItems.id }).from(knowledgeItems)
    .where(and(eq(knowledgeItems.id, parsed.data.knowledgeItemId), eq(knowledgeItems.projectId, projectId), eq(knowledgeItems.ownerId, accountId))).get();
  if (!item) return c.json({ error: "KNOWLEDGE_NOT_FOUND", message: "知识对象不在当前项目中" }, 404);
  // 幂等:已挂则更新 stance/note。
  const existing = await db.select().from(gapEvidence)
    .where(and(eq(gapEvidence.gapId, gapId), eq(gapEvidence.knowledgeItemId, parsed.data.knowledgeItemId))).get();
  const now = new Date().toISOString();
  if (existing) {
    await db.update(gapEvidence).set({ stance: parsed.data.stance, note: parsed.data.note ?? existing.note }).where(eq(gapEvidence.id, existing.id));
    return c.json({ evidence: { id: existing.id, gapId, knowledgeItemId: parsed.data.knowledgeItemId, stance: parsed.data.stance } }, 200);
  }
  const id = crypto.randomUUID();
  await db.insert(gapEvidence).values({ id, gapId, knowledgeItemId: parsed.data.knowledgeItemId, stance: parsed.data.stance, note: parsed.data.note ?? "", createdAt: now });
  return c.json({ evidence: { id, gapId, knowledgeItemId: parsed.data.knowledgeItemId, stance: parsed.data.stance } }, 201);
});

/** DELETE /projects/:projectId/gaps/:gapId/evidence/:evidenceId — 摘掉一条证据。 */
gapRoutes.delete("/projects/:projectId/gaps/:gapId/evidence/:evidenceId", async (c) => {
  const projectId = c.req.param("projectId");
  const gapId = c.req.param("gapId");
  const evidenceId = c.req.param("evidenceId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: gapEvidence.id }).from(gapEvidence)
    .innerJoin(gaps, eq(gapEvidence.gapId, gaps.id))
    .where(and(eq(gapEvidence.id, evidenceId), eq(gapEvidence.gapId, gapId), eq(gaps.projectId, projectId), eq(gaps.ownerId, accountId))).get();
  if (!existing) return c.json({ error: "EVIDENCE_NOT_FOUND" }, 404);
  await db.delete(gapEvidence).where(eq(gapEvidence.id, evidenceId));
  return c.json({ id: evidenceId, deleted: true });
});

/** POST /projects/:projectId/gaps/discover — AI 从本项目知识发现缺口,直接存 draft(candidate)。 */
gapRoutes.post("/projects/:projectId/gaps/discover", async (c) => {
  const projectId = c.req.param("projectId");
  const accountId = c.get("accountId");
  if (!(await findOwnedProject(c.env, accountId, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);

  const resolution = await resolveAiForRequest(c.env, accountId, {});
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);

  const db = createDatabase(c.env);
  // 构 context:本项目同账号的知识对象(C9),只读标题+整理后内容,不读 PDF(C10)。
  const knowledge = await db
    .select({ id: knowledgeItems.id, kind: knowledgeItems.kind, title: knowledgeItems.title, content: knowledgeItems.content })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.projectId, projectId), eq(knowledgeItems.ownerId, accountId)))
    .orderBy(desc(knowledgeItems.createdAt))
    .limit(60);
  if (knowledge.length === 0) {
    return c.json({ error: "NO_KNOWLEDGE", message: "本项目还没有知识对象,无法发现缺口。先在阅读器 AI 提炼几条知识。" }, 400);
  }

  const now = new Date().toISOString();
  // AI 能力已收敛到 discoverGap(capability);route 只传已读出的 knowledge,回 data + provenance。
  let out: { gaps: Array<{ title: string; description: string; rationale: string }> };
  try {
    ({ data: out } = await discoverGap(c.env, {
      providerConfig: resolution.provider,
      model: resolution.model,
      knowledge,
    }));

    const inserted: GapRow[] = [];
    for (const g of out.gaps) {
      const id = crypto.randomUUID();
      const row: GapRow = {
        id, projectId, paperId: null, title: g.title, description: g.description,
        rationale: g.rationale, status: "candidate", source: "ai",
        model: resolution.model, generatedAt: now, note: "", createdAt: now, updatedAt: now,
      };
      await db.insert(gaps).values({
        id, ownerId: accountId, projectId, paperId: null, title: g.title, description: g.description,
        rationale: g.rationale, status: "candidate", source: "ai", model: resolution.model,
        generatedAt: now, note: "", createdAt: now, updatedAt: now,
      });
      inserted.push(row);
    }
    return c.json({ gaps: inserted.map(toGap), model: resolution.model }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gap discovery failed";
    console.error("Gap discovery failed", { projectId, message });
    return c.json({ error: "GAP_DISCOVERY_FAILED", message: "AI 缺口发现失败,请稍后重试", detail: message.slice(0, 500) }, 502);
  }
});
