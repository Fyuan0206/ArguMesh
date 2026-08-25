import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { projectExists } from "../db/projects";
import { createDatabase } from "../db/client";
import { experimentResults, experiments, ideas, researchQuestions } from "../db/schema";
import type { AppEnv } from "../types";

/**
 * Experiment 一等对象(迁移 0014,v2.0 Research Core):把 Idea 落到可执行实验方案。
 * - 围绕 Result 设计(C7):每次跑动落一条 append-only experiment_results 行,从不覆盖旧结果。
 * - 状态机:planned → running → done | failed;done/failed 后写 conclusion。
 * - configJson / metricsJson / figuresJson 存 JSON 文本(结构化字段不建列)。
 * - provenance:source(human/ai)、model、generatedAt。
 * - ideaId/rqId 若传入须属本项目(可选挂载;单用户本地版,无账号归属)。
 */

const EXP_STATUSES = ["planned", "running", "done", "failed"] as const;
type ExpStatus = (typeof EXP_STATUSES)[number];

const EXP_TRANSITIONS: Record<ExpStatus, ExpStatus[]> = {
  planned: ["running", "failed"],
  running: ["done", "failed", "planned"],
  done: [],
  failed: ["planned", "running"],
};

function canTransition(from: ExpStatus, to: ExpStatus): boolean {
  return EXP_TRANSITIONS[from].includes(to);
}

interface ExpRow {
  id: string;
  projectId: string;
  ideaId: string | null;
  rqId: string | null;
  title: string;
  hypothesis: string;
  configJson: string;
  repoUrl: string;
  commitHash: string;
  checkpointPath: string;
  status: ExpStatus;
  conclusion: string;
  source: "human" | "ai";
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ResultRow {
  id: string;
  experimentId: string;
  runNo: number;
  metricsJson: string;
  figuresJson: string;
  notes: string;
  createdAt: string;
}

const EXP_SELECT = {
  id: experiments.id,
  projectId: experiments.projectId,
  ideaId: experiments.ideaId,
  rqId: experiments.rqId,
  title: experiments.title,
  hypothesis: experiments.hypothesis,
  configJson: experiments.configJson,
  repoUrl: experiments.repoUrl,
  commitHash: experiments.commitHash,
  checkpointPath: experiments.checkpointPath,
  status: experiments.status,
  conclusion: experiments.conclusion,
  source: experiments.source,
  model: experiments.model,
  generatedAt: experiments.generatedAt,
  createdAt: experiments.createdAt,
  updatedAt: experiments.updatedAt,
};

const RESULT_SELECT = {
  id: experimentResults.id,
  experimentId: experimentResults.experimentId,
  runNo: experimentResults.runNo,
  metricsJson: experimentResults.metricsJson,
  figuresJson: experimentResults.figuresJson,
  notes: experimentResults.notes,
  createdAt: experimentResults.createdAt,
};

function parseJsonSafe(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function toResult(row: ResultRow) {
  return {
    id: row.id,
    experimentId: row.experimentId,
    runNo: row.runNo,
    metrics: parseJsonSafe(row.metricsJson, {}),
    figures: parseJsonSafe(row.figuresJson, []),
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

function toExp(row: ExpRow, results: ResultRow[] = []) {
  return {
    id: row.id,
    projectId: row.projectId,
    ideaId: row.ideaId,
    rqId: row.rqId,
    title: row.title,
    hypothesis: row.hypothesis,
    config: parseJsonSafe(row.configJson, {}),
    repoUrl: row.repoUrl,
    commitHash: row.commitHash,
    checkpointPath: row.checkpointPath,
    status: row.status,
    conclusion: row.conclusion,
    source: row.source,
    model: row.model,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    results: results.map(toResult),
  };
}

const configSchema = z.record(z.string().max(200), z.unknown()).default({});

const createSchema = z.object({
  ideaId: z.string().max(160).optional(),
  rqId: z.string().max(160).optional(),
  title: z.string().min(1).max(200),
  hypothesis: z.string().max(4_000).default(""),
  config: configSchema.optional(),
  repoUrl: z.string().max(500).default(""),
  commitHash: z.string().max(100).default(""),
  checkpointPath: z.string().max(500).default(""),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  hypothesis: z.string().max(4_000).optional(),
  config: configSchema.optional(),
  repoUrl: z.string().max(500).optional(),
  commitHash: z.string().max(100).optional(),
  checkpointPath: z.string().max(500).optional(),
  status: z.enum(EXP_STATUSES).optional(),
  conclusion: z.string().max(8_000).optional(),
});

/** 若传入 ideaId/rqId,校验其属本项目。返回 false = 归属校验失败。 */
async function ownedRefsInProject(env: AppEnv["Bindings"], projectId: string, ideaId?: string | null, rqId?: string | null): Promise<boolean> {
  const db = createDatabase(env);
  if (ideaId) {
    const row = await db.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get();
    if (!row) return false;
  }
  if (rqId) {
    const row = await db.select({ id: researchQuestions.id }).from(researchQuestions).where(and(eq(researchQuestions.id, rqId), eq(researchQuestions.projectId, projectId))).get();
    if (!row) return false;
  }
  return true;
}

/** 拉取某实验的全部结果(按 runNo 升序)。 */
async function loadResults(env: AppEnv["Bindings"], experimentId: string): Promise<ResultRow[]> {
  const db = createDatabase(env);
  return db.select(RESULT_SELECT).from(experimentResults)
    .where(eq(experimentResults.experimentId, experimentId))
    .orderBy(experimentResults.runNo);
}

export const experimentRoutes = new Hono<AppEnv>();

/** POST /projects/:projectId/experiments — 创建一个实验(planned)。 */
experimentRoutes.post("/projects/:projectId/experiments", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EXPERIMENT", issues: parsed.error.issues }, 400);
  if (!(await ownedRefsInProject(c.env, projectId, parsed.data.ideaId, parsed.data.rqId))) {
    return c.json({ error: "REF_NOT_IN_PROJECT", message: "关联的 Idea 或研究问题不在当前项目中" }, 404);
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const db = createDatabase(c.env);
  await db.insert(experiments).values({
    id, projectId,
    ideaId: parsed.data.ideaId ?? null,
    rqId: parsed.data.rqId ?? null,
    title: parsed.data.title, hypothesis: parsed.data.hypothesis,
    configJson: JSON.stringify(parsed.data.config ?? {}),
    repoUrl: parsed.data.repoUrl, commitHash: parsed.data.commitHash, checkpointPath: parsed.data.checkpointPath,
    status: "planned", conclusion: "", source: "human", model: null, generatedAt: null,
    createdAt: now, updatedAt: now,
  });
  const row: ExpRow = {
    id, projectId, ideaId: parsed.data.ideaId ?? null, rqId: parsed.data.rqId ?? null,
    title: parsed.data.title, hypothesis: parsed.data.hypothesis, configJson: JSON.stringify(parsed.data.config ?? {}),
    repoUrl: parsed.data.repoUrl, commitHash: parsed.data.commitHash, checkpointPath: parsed.data.checkpointPath,
    status: "planned", conclusion: "", source: "human", model: null, generatedAt: null, createdAt: now, updatedAt: now,
  };
  return c.json({ experiment: toExp(row) }, 201);
});

/** GET /projects/:projectId/experiments — 列出本项目全部实验(每条附 append-only 结果)。 */
experimentRoutes.get("/projects/:projectId/experiments", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const rows = await db.select(EXP_SELECT).from(experiments)
    .where(and(eq(experiments.projectId, projectId)))
    .orderBy(desc(experiments.createdAt));
  const ids = rows.map((r) => r.id);
  const resultsByExp = new Map<string, ResultRow[]>();
  if (ids.length > 0) {
    const rRows = await db.select(RESULT_SELECT).from(experimentResults)
      .where(inArray(experimentResults.experimentId, ids))
      .orderBy(experimentResults.runNo);
    rRows.forEach((r) => {
      const list = resultsByExp.get(r.experimentId) ?? [];
      list.push(r);
      resultsByExp.set(r.experimentId, list);
    });
  }
  return c.json({ experiments: rows.map((r) => toExp(r, resultsByExp.get(r.id) ?? [])) });
});

/** GET /projects/:projectId/experiments/:experimentId — 单条实验(含结果)。 */
experimentRoutes.get("/projects/:projectId/experiments/:experimentId", async (c) => {
  const projectId = c.req.param("projectId");
  const experimentId = c.req.param("experimentId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const row = await db.select(EXP_SELECT).from(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.projectId, projectId))).get();
  if (!row) return c.json({ error: "EXPERIMENT_NOT_FOUND", message: "实验不存在" }, 404);
  const results = await loadResults(c.env, experimentId);
  return c.json({ experiment: toExp(row, results) });
});

/** PATCH /projects/:projectId/experiments/:experimentId — 修改实验(状态走后端状态机)。 */
experimentRoutes.patch("/projects/:projectId/experiments/:experimentId", async (c) => {
  const projectId = c.req.param("projectId");
  const experimentId = c.req.param("experimentId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EXPERIMENT_PATCH", issues: parsed.error.issues }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "EMPTY_PATCH", message: "没有要修改的内容" }, 400);

  const db = createDatabase(c.env);
  const existing = await db.select(EXP_SELECT).from(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.projectId, projectId))).get();
  if (!existing) return c.json({ error: "EXPERIMENT_NOT_FOUND", message: "实验不存在" }, 404);

  if (parsed.data.status && parsed.data.status !== existing.status && !canTransition(existing.status, parsed.data.status)) {
    return c.json({ error: "INVALID_EXPERIMENT_TRANSITION", message: `不允许从 ${existing.status} 转到 ${parsed.data.status}` }, 400);
  }

  const now = new Date().toISOString();
  const set: Record<string, unknown> = { ...parsed.data, updatedAt: now };
  if (parsed.data.config !== undefined) set.configJson = JSON.stringify(parsed.data.config);
  delete set.config;
  await db.update(experiments).set(set).where(eq(experiments.id, experimentId));
  const updated: ExpRow = {
    ...existing,
    ...parsed.data,
    configJson: parsed.data.config !== undefined ? JSON.stringify(parsed.data.config) : existing.configJson,
    updatedAt: now,
  };
  const results = await loadResults(c.env, experimentId);
  return c.json({ experiment: toExp(updated, results) });
});

/** DELETE /projects/:projectId/experiments/:experimentId — 删除实验(级联清 results)。 */
experimentRoutes.delete("/projects/:projectId/experiments/:experimentId", async (c) => {
  const projectId = c.req.param("projectId");
  const experimentId = c.req.param("experimentId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: experiments.id }).from(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.projectId, projectId))).get();
  if (!existing) return c.json({ error: "EXPERIMENT_NOT_FOUND", message: "实验不存在" }, 404);
  await db.delete(experiments).where(eq(experiments.id, experimentId));
  return c.json({ id: experimentId, deleted: true });
});

/** POST /projects/:projectId/experiments/:experimentId/results — 追加一次跑动结果(append-only)。 */
experimentRoutes.post("/projects/:projectId/experiments/:experimentId/results", async (c) => {
  const projectId = c.req.param("projectId");
  const experimentId = c.req.param("experimentId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = z.object({
    metrics: z.record(z.string().max(200), z.unknown()).default({}),
    figures: z.array(z.unknown()).max(100).default([]),
    notes: z.string().max(8_000).default(""),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RESULT", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const exp = await db.select({ id: experiments.id }).from(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.projectId, projectId))).get();
  if (!exp) return c.json({ error: "EXPERIMENT_NOT_FOUND", message: "实验不存在" }, 404);

  // runNo = 当前已有结果数 + 1(append-only,与唯一索引 (experimentId, runNo) 一致)。
  const existing = await db.select({ runNo: experimentResults.runNo }).from(experimentResults)
    .where(eq(experimentResults.experimentId, experimentId));
  const runNo = existing.length + 1;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(experimentResults).values({
    id, experimentId, runNo,
    metricsJson: JSON.stringify(parsed.data.metrics),
    figuresJson: JSON.stringify(parsed.data.figures),
    notes: parsed.data.notes, createdAt: now,
  });
  // 追加结果把实验推进到 running → 后续用户手动标 done/failed(状态机保护,不自动 concluded)。
  return c.json({ result: { id, experimentId, runNo, metrics: parsed.data.metrics, figures: parsed.data.figures, notes: parsed.data.notes, createdAt: now } }, 201);
});

/** DELETE /projects/:projectId/experiments/:experimentId/results/:resultId — 删除一条结果(谨慎,append-only 模型)。 */
experimentRoutes.delete("/projects/:projectId/experiments/:experimentId/results/:resultId", async (c) => {
  const projectId = c.req.param("projectId");
  const experimentId = c.req.param("experimentId");
  const resultId = c.req.param("resultId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const existing = await db.select({ id: experimentResults.id }).from(experimentResults)
    .innerJoin(experiments, eq(experimentResults.experimentId, experiments.id))
    .where(and(eq(experimentResults.id, resultId), eq(experimentResults.experimentId, experimentId), eq(experiments.projectId, projectId))).get();
  if (!existing) return c.json({ error: "RESULT_NOT_FOUND", message: "结果不存在" }, 404);
  await db.delete(experimentResults).where(eq(experimentResults.id, resultId));
  return c.json({ id: resultId, deleted: true });
});
