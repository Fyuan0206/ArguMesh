import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { analyzeExperimentResult, designExperiment, experimentDesignSchema, resultAnalysisSchema } from "../ai/capabilities";
import { createDatabase } from "../db/client";
import { projectExists } from "../db/projects";
import { experimentResults, experiments, ideas, knowledgeItems, researchQuestions } from "../db/schema";
import { resolveAiForRequest } from "../services/ai";
import { analysisReferencesExist, persistResultAnalysisDraft } from "../services/result-analysis";
import type { AppEnv } from "../types";

/** 只设计实验、设计消融、导入真实结果和分析结果。旧运行字段与接口保留兼容。 */
const EXP_STATUSES = ["planned", "running", "done", "failed"] as const;
type ExpStatus = (typeof EXP_STATUSES)[number];
const EXP_TRANSITIONS: Record<ExpStatus, ExpStatus[]> = {
  planned: ["running", "failed"], running: ["done", "failed", "planned"], done: [], failed: ["planned", "running"],
};

interface ExpRow {
  id: string; projectId: string; ideaId: string | null; rqId: string | null; title: string; hypothesis: string;
  configJson: string; repoUrl: string; commitHash: string; checkpointPath: string; status: ExpStatus; conclusion: string;
  source: "human" | "ai"; model: string | null; generatedAt: string | null; createdAt: string; updatedAt: string;
}
interface ResultRow {
  id: string; experimentId: string; runNo: number; metricsJson: string; figuresJson: string; notes: string;
  sourceType: "manual" | "csv" | "json" | "pasted"; sourceName: string; rawDataJson: string; normalizedDataJson: string;
  mappingJson: string; analysisJson: string; analysisStatus: "pending" | "draft" | "confirmed";
  model: string | null; generatedAt: string | null; createdAt: string;
}

const EXP_SELECT = {
  id: experiments.id, projectId: experiments.projectId, ideaId: experiments.ideaId, rqId: experiments.rqId,
  title: experiments.title, hypothesis: experiments.hypothesis, configJson: experiments.configJson,
  repoUrl: experiments.repoUrl, commitHash: experiments.commitHash, checkpointPath: experiments.checkpointPath,
  status: experiments.status, conclusion: experiments.conclusion, source: experiments.source, model: experiments.model,
  generatedAt: experiments.generatedAt, createdAt: experiments.createdAt, updatedAt: experiments.updatedAt,
};
const RESULT_SELECT = {
  id: experimentResults.id, experimentId: experimentResults.experimentId, runNo: experimentResults.runNo,
  metricsJson: experimentResults.metricsJson, figuresJson: experimentResults.figuresJson, notes: experimentResults.notes,
  sourceType: experimentResults.sourceType, sourceName: experimentResults.sourceName, rawDataJson: experimentResults.rawDataJson,
  normalizedDataJson: experimentResults.normalizedDataJson, mappingJson: experimentResults.mappingJson,
  analysisJson: experimentResults.analysisJson, analysisStatus: experimentResults.analysisStatus, model: experimentResults.model,
  generatedAt: experimentResults.generatedAt, createdAt: experimentResults.createdAt,
};

function parseJsonSafe<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function toResult(row: ResultRow) {
  return {
    id: row.id, experimentId: row.experimentId, runNo: row.runNo,
    metrics: parseJsonSafe<Record<string, unknown>>(row.metricsJson, {}), figures: parseJsonSafe<unknown[]>(row.figuresJson, []), notes: row.notes,
    sourceType: row.sourceType, sourceName: row.sourceName, rawData: parseJsonSafe<unknown>(row.rawDataJson, {}),
    normalizedData: parseJsonSafe<Array<Record<string, unknown>>>(row.normalizedDataJson, []),
    mapping: parseJsonSafe<Record<string, string>>(row.mappingJson, {}),
    analysis: row.analysisJson ? parseJsonSafe<z.infer<typeof resultAnalysisSchema> | null>(row.analysisJson, null) : null,
    analysisStatus: row.analysisStatus, model: row.model, generatedAt: row.generatedAt, createdAt: row.createdAt,
  };
}
function toExp(row: ExpRow, results: ResultRow[] = []) {
  return {
    id: row.id, projectId: row.projectId, ideaId: row.ideaId, rqId: row.rqId, title: row.title, hypothesis: row.hypothesis,
    config: parseJsonSafe<Record<string, unknown>>(row.configJson, {}), repoUrl: row.repoUrl, commitHash: row.commitHash,
    checkpointPath: row.checkpointPath, status: row.status, conclusion: row.conclusion, source: row.source, model: row.model,
    generatedAt: row.generatedAt, createdAt: row.createdAt, updatedAt: row.updatedAt, results: results.map(toResult),
  };
}

const configSchema = z.record(z.string().max(200), z.unknown()).default({});
const createSchema = z.object({
  ideaId: z.string().max(160).optional(), rqId: z.string().max(160).optional(), title: z.string().min(1).max(200),
  hypothesis: z.string().max(4_000).default(""), config: configSchema.optional(), repoUrl: z.string().max(500).default(""),
  commitHash: z.string().max(100).default(""), checkpointPath: z.string().max(500).default(""),
});
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(), hypothesis: z.string().max(4_000).optional(), config: configSchema.optional(),
  repoUrl: z.string().max(500).optional(), commitHash: z.string().max(100).optional(), checkpointPath: z.string().max(500).optional(),
  status: z.enum(EXP_STATUSES).optional(), conclusion: z.string().max(8_000).optional(),
});
const designInputSchema = z.object({
  title: z.string().min(1).max(200), rqId: z.string().max(160).optional(), ideaId: z.string().max(160).optional(), design: experimentDesignSchema,
});
const aiRequestSchema = z.object({ provider: z.string().max(100).optional(), model: z.string().max(200).optional() });
const aiDesignCreateSchema = aiRequestSchema.extend({
  rqId: z.string().min(1).max(160),
  title: z.string().trim().max(200).default(""),
  constraints: z.string().trim().max(4_000).default(""),
});
const primitiveSchema = z.union([z.string().max(20_000), z.number(), z.boolean(), z.null()]);
const rowSchema = z.record(z.string().min(1).max(200), primitiveSchema);
const importSchema = z.object({
  sourceType: z.enum(["manual", "csv", "json", "pasted"]), sourceName: z.string().max(500).default(""),
  data: z.union([z.string().max(2_000_000), z.array(rowSchema).max(500), rowSchema]),
  mapping: z.record(z.string().max(200), z.string().max(200)).default({}), notes: z.string().max(8_000).default(""),
});

function parseCsv(text: string): Array<Record<string, unknown>> {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error("CSV 需要表头和至少一行数据");
  const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
  if (new Set(headers).size !== headers.length) throw new Error("CSV 表头不能重复");
  return rows.slice(1, 501).map((values) => Object.fromEntries(headers.map((header, index) => {
    const value = values[index] ?? "";
    return [header, value !== "" && Number.isFinite(Number(value)) ? Number(value) : value];
  })));
}
function normalizeImported(input: z.infer<typeof importSchema>): Array<Record<string, unknown>> {
  let value: unknown = input.data;
  if ((input.sourceType === "csv" || input.sourceType === "pasted") && typeof value === "string") return parseCsv(value);
  if (input.sourceType === "json" && typeof value === "string") value = JSON.parse(value);
  const parsed = z.array(rowSchema).min(1).max(500).safeParse(Array.isArray(value) ? value : [value]);
  if (!parsed.success) throw new Error("数据必须是由简单字段组成的对象数组");
  if (parsed.data.some((item) => Object.keys(item).length > 100)) throw new Error("单行字段不能超过 100 个");
  return parsed.data;
}
async function ownedRefsInProject(env: AppEnv["Bindings"], projectId: string, ideaId?: string | null, rqId?: string | null) {
  const db = createDatabase(env);
  if (ideaId && !(await db.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.projectId, projectId))).get())) return false;
  if (rqId && !(await db.select({ id: researchQuestions.id }).from(researchQuestions).where(and(eq(researchQuestions.id, rqId), eq(researchQuestions.projectId, projectId))).get())) return false;
  return true;
}
async function loadExperiment(env: AppEnv["Bindings"], projectId: string, experimentId: string) {
  return createDatabase(env).select(EXP_SELECT).from(experiments).where(and(eq(experiments.id, experimentId), eq(experiments.projectId, projectId))).get();
}
async function loadResults(env: AppEnv["Bindings"], experimentId: string): Promise<ResultRow[]> {
  return createDatabase(env).select(RESULT_SELECT).from(experimentResults).where(eq(experimentResults.experimentId, experimentId)).orderBy(experimentResults.runNo);
}

export const experimentRoutes = new Hono<AppEnv>();

experimentRoutes.post("/projects/:projectId/experiments", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EXPERIMENT", issues: parsed.error.issues }, 400);
  if (!(await ownedRefsInProject(c.env, projectId, parsed.data.ideaId, parsed.data.rqId))) return c.json({ error: "REF_NOT_IN_PROJECT" }, 404);
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  const row: ExpRow = {
    id, projectId, ideaId: parsed.data.ideaId ?? null, rqId: parsed.data.rqId ?? null, title: parsed.data.title,
    hypothesis: parsed.data.hypothesis, configJson: JSON.stringify(parsed.data.config ?? {}), repoUrl: parsed.data.repoUrl,
    commitHash: parsed.data.commitHash, checkpointPath: parsed.data.checkpointPath, status: "planned", conclusion: "",
    source: "human", model: null, generatedAt: null, createdAt: now, updatedAt: now,
  };
  await createDatabase(c.env).insert(experiments).values(row);
  return c.json({ experiment: toExp(row) }, 201);
});

experimentRoutes.post("/projects/:projectId/experiments/design", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = designInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EXPERIMENT_DESIGN", issues: parsed.error.issues }, 400);
  if (!(await ownedRefsInProject(c.env, projectId, parsed.data.ideaId, parsed.data.rqId))) return c.json({ error: "REF_NOT_IN_PROJECT" }, 404);
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  const row: ExpRow = {
    id, projectId, ideaId: parsed.data.ideaId ?? null, rqId: parsed.data.rqId ?? null, title: parsed.data.title,
    hypothesis: parsed.data.design.hypothesis, configJson: JSON.stringify(parsed.data.design), repoUrl: "", commitHash: "",
    checkpointPath: "", status: "planned", conclusion: "", source: "human", model: null, generatedAt: null,
    createdAt: now, updatedAt: now,
  };
  await createDatabase(c.env).insert(experiments).values(row);
  return c.json({ experiment: toExp(row) }, 201);
});

/** 从研究问题直接生成并保存 AI 实验设计草稿；不要求用户先填写人工设计。 */
experimentRoutes.post("/projects/:projectId/experiments/design-with-ai", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = aiDesignCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_AI_EXPERIMENT_DESIGN", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const rq = await db.select({ question: researchQuestions.question, goal: researchQuestions.goal })
    .from(researchQuestions)
    .where(and(eq(researchQuestions.id, parsed.data.rqId), eq(researchQuestions.projectId, projectId)))
    .get();
  if (!rq) return c.json({ error: "RESEARCH_QUESTION_NOT_FOUND" }, 404);
  const evidence = await db.select({ title: knowledgeItems.title, content: knowledgeItems.content, source: knowledgeItems.source })
    .from(knowledgeItems).where(eq(knowledgeItems.projectId, projectId)).limit(30);
  const resolution = await resolveAiForRequest(c.env, parsed.data);
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  try {
    const generated = await designExperiment(c.env, {
      researchQuestion: rq, evidence, constraints: parsed.data.constraints,
      providerConfig: resolution.provider, model: resolution.model,
    });
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    const title = parsed.data.title || `实验：${rq.question.slice(0, 80)}`;
    const row: ExpRow = {
      id, projectId, ideaId: null, rqId: parsed.data.rqId, title,
      hypothesis: generated.data.hypothesis, configJson: JSON.stringify(generated.data), repoUrl: "", commitHash: "",
      checkpointPath: "", status: "planned", conclusion: "", source: "ai", model: generated.model,
      generatedAt: generated.generatedAt, createdAt: now, updatedAt: now,
    };
    await db.insert(experiments).values(row);
    return c.json({ experiment: toExp(row) }, 201);
  } catch (error) {
    return c.json({ error: "AI_EXPERIMENT_DESIGN_FAILED", message: error instanceof Error ? error.message : "实验设计生成失败" }, 502);
  }
});

experimentRoutes.get("/projects/:projectId/experiments", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const rows = await db.select(EXP_SELECT).from(experiments).where(eq(experiments.projectId, projectId)).orderBy(desc(experiments.createdAt));
  const grouped = new Map<string, ResultRow[]>();
  if (rows.length) {
    const resultRows = await db.select(RESULT_SELECT).from(experimentResults).where(inArray(experimentResults.experimentId, rows.map((row) => row.id))).orderBy(experimentResults.runNo);
    for (const result of resultRows) grouped.set(result.experimentId, [...(grouped.get(result.experimentId) ?? []), result]);
  }
  return c.json({ experiments: rows.map((row) => toExp(row, grouped.get(row.id) ?? [])) });
});

experimentRoutes.get("/projects/:projectId/experiments/:experimentId", async (c) => {
  const row = await loadExperiment(c.env, c.req.param("projectId"), c.req.param("experimentId"));
  if (!row) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  return c.json({ experiment: toExp(row, await loadResults(c.env, row.id)) });
});

experimentRoutes.patch("/projects/:projectId/experiments/:experimentId", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId");
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EXPERIMENT_PATCH", issues: parsed.error.issues }, 400);
  if (!Object.keys(parsed.data).length) return c.json({ error: "EMPTY_PATCH" }, 400);
  const existing = await loadExperiment(c.env, projectId, experimentId);
  if (!existing) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  if (parsed.data.status && parsed.data.status !== existing.status && !EXP_TRANSITIONS[existing.status].includes(parsed.data.status)) return c.json({ error: "INVALID_EXPERIMENT_TRANSITION" }, 400);
  const now = new Date().toISOString(); const set: Record<string, unknown> = { ...parsed.data, updatedAt: now };
  if (parsed.data.config !== undefined) set.configJson = JSON.stringify(parsed.data.config); delete set.config;
  await createDatabase(c.env).update(experiments).set(set).where(eq(experiments.id, experimentId));
  const updated: ExpRow = { ...existing, ...parsed.data, configJson: parsed.data.config !== undefined ? JSON.stringify(parsed.data.config) : existing.configJson, updatedAt: now };
  return c.json({ experiment: toExp(updated, await loadResults(c.env, experimentId)) });
});

experimentRoutes.patch("/projects/:projectId/experiments/:experimentId/design", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId");
  const parsed = experimentDesignSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EXPERIMENT_DESIGN", issues: parsed.error.issues }, 400);
  const existing = await loadExperiment(c.env, projectId, experimentId);
  if (!existing) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  const now = new Date().toISOString();
  await createDatabase(c.env).update(experiments).set({ hypothesis: parsed.data.hypothesis, configJson: JSON.stringify(parsed.data), source: "human", model: null, generatedAt: null, updatedAt: now }).where(eq(experiments.id, experimentId));
  return c.json({ experiment: toExp({ ...existing, hypothesis: parsed.data.hypothesis, configJson: JSON.stringify(parsed.data), source: "human", model: null, generatedAt: null, updatedAt: now }, await loadResults(c.env, experimentId)) });
});

experimentRoutes.post("/projects/:projectId/experiments/:experimentId/design-with-ai", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId");
  const parsed = aiRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "INVALID_AI_REQUEST", issues: parsed.error.issues }, 400);
  const existing = await loadExperiment(c.env, projectId, experimentId);
  if (!existing) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  if (!existing.rqId) return c.json({ error: "RESEARCH_QUESTION_REQUIRED", message: "请先关联研究问题" }, 400);
  const db = createDatabase(c.env);
  const rq = await db.select({ question: researchQuestions.question, goal: researchQuestions.goal }).from(researchQuestions).where(and(eq(researchQuestions.id, existing.rqId), eq(researchQuestions.projectId, projectId))).get();
  if (!rq) return c.json({ error: "RESEARCH_QUESTION_NOT_FOUND" }, 404);
  const evidence = await db.select({ title: knowledgeItems.title, content: knowledgeItems.content, source: knowledgeItems.source }).from(knowledgeItems).where(eq(knowledgeItems.projectId, projectId)).limit(30);
  const resolution = await resolveAiForRequest(c.env, parsed.data);
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  try {
    const generated = await designExperiment(c.env, { researchQuestion: rq, evidence, providerConfig: resolution.provider, model: resolution.model });
    const now = new Date().toISOString();
    await db.update(experiments).set({ hypothesis: generated.data.hypothesis, configJson: JSON.stringify(generated.data), source: "ai", model: generated.model, generatedAt: generated.generatedAt, updatedAt: now }).where(eq(experiments.id, experimentId));
    return c.json({ experiment: toExp({ ...existing, hypothesis: generated.data.hypothesis, configJson: JSON.stringify(generated.data), source: "ai", model: generated.model, generatedAt: generated.generatedAt, updatedAt: now }, await loadResults(c.env, experimentId)) });
  } catch (error) { return c.json({ error: "AI_EXPERIMENT_DESIGN_FAILED", message: error instanceof Error ? error.message : "实验设计生成失败" }, 502); }
});

experimentRoutes.delete("/projects/:projectId/experiments/:experimentId", async (c) => {
  const row = await loadExperiment(c.env, c.req.param("projectId"), c.req.param("experimentId"));
  if (!row) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  await createDatabase(c.env).delete(experiments).where(eq(experiments.id, row.id));
  return c.json({ id: row.id, deleted: true });
});

experimentRoutes.post("/projects/:projectId/experiments/:experimentId/results", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId");
  const parsed = z.object({ metrics: rowSchema.default({}), figures: z.array(z.unknown()).max(100).default([]), notes: z.string().max(8_000).default("") }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RESULT", issues: parsed.error.issues }, 400);
  if (!(await loadExperiment(c.env, projectId, experimentId))) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env); const existing = await db.select({ runNo: experimentResults.runNo }).from(experimentResults).where(eq(experimentResults.experimentId, experimentId));
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.insert(experimentResults).values({
    id, experimentId, runNo: existing.length + 1, metricsJson: JSON.stringify(parsed.data.metrics), figuresJson: JSON.stringify(parsed.data.figures), notes: parsed.data.notes,
    sourceType: "manual", sourceName: "", rawDataJson: JSON.stringify(parsed.data.metrics), normalizedDataJson: JSON.stringify([parsed.data.metrics]), mappingJson: "{}",
    analysisJson: "", analysisStatus: "pending", model: null, generatedAt: null, createdAt: now,
  });
  const row = await db.select(RESULT_SELECT).from(experimentResults).where(eq(experimentResults.id, id)).get();
  return c.json({ result: toResult(row as ResultRow) }, 201);
});

experimentRoutes.post("/projects/:projectId/experiments/:experimentId/results/import", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId");
  const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_RESULT_IMPORT", issues: parsed.error.issues }, 400);
  if (!(await loadExperiment(c.env, projectId, experimentId))) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  let rows: Array<Record<string, unknown>>;
  try { rows = normalizeImported(parsed.data); } catch (error) { return c.json({ error: "INVALID_RESULT_DATA", message: error instanceof Error ? error.message : "结果数据无法解析" }, 400); }
  const db = createDatabase(c.env); const existing = await db.select({ runNo: experimentResults.runNo }).from(experimentResults).where(eq(experimentResults.experimentId, experimentId));
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.insert(experimentResults).values({
    id, experimentId, runNo: existing.length + 1, metricsJson: JSON.stringify(rows[0] ?? {}), figuresJson: "[]", notes: parsed.data.notes,
    sourceType: parsed.data.sourceType, sourceName: parsed.data.sourceName, rawDataJson: JSON.stringify(parsed.data.data),
    normalizedDataJson: JSON.stringify(rows), mappingJson: JSON.stringify(parsed.data.mapping), analysisJson: "", analysisStatus: "pending", model: null, generatedAt: null, createdAt: now,
  });
  const row = await db.select(RESULT_SELECT).from(experimentResults).where(eq(experimentResults.id, id)).get();
  return c.json({ result: toResult(row as ResultRow) }, 201);
});

experimentRoutes.get("/projects/:projectId/experiments/:experimentId/results/:resultId", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId");
  if (!(await loadExperiment(c.env, projectId, experimentId))) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  const row = await createDatabase(c.env).select(RESULT_SELECT).from(experimentResults)
    .where(and(eq(experimentResults.id, c.req.param("resultId")), eq(experimentResults.experimentId, experimentId))).get();
  if (!row) return c.json({ error: "RESULT_NOT_FOUND" }, 404);
  return c.json({ result: toResult(row) });
});

experimentRoutes.post("/projects/:projectId/experiments/:experimentId/results/:resultId/analyze", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId");
  const parsed = aiRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "INVALID_AI_REQUEST", issues: parsed.error.issues }, 400);
  const experiment = await loadExperiment(c.env, projectId, experimentId);
  if (!experiment) return c.json({ error: "EXPERIMENT_NOT_FOUND" }, 404);
  const db = createDatabase(c.env);
  const row = await db.select(RESULT_SELECT).from(experimentResults).where(and(eq(experimentResults.id, c.req.param("resultId")), eq(experimentResults.experimentId, experimentId))).get();
  if (!row) return c.json({ error: "RESULT_NOT_FOUND" }, 404);
  const rows = parseJsonSafe<Array<Record<string, unknown>>>(row.normalizedDataJson, []);
  if (!rows.length) return c.json({ error: "RESULT_DATA_REQUIRED", message: "请先导入真实结果数据" }, 400);
  const design = experimentDesignSchema.safeParse(parseJsonSafe(experiment.configJson, {}));
  if (!design.success) return c.json({ error: "EXPERIMENT_DESIGN_REQUIRED", message: "请先完善结构化实验设计" }, 400);
  const resolution = await resolveAiForRequest(c.env, parsed.data);
  if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
  try {
    const generated = await analyzeExperimentResult(c.env, { design: design.data, rows, providerConfig: resolution.provider, model: resolution.model });
    if (!analysisReferencesExist(generated.data, rows)) return c.json({ error: "AI_ANALYSIS_INVALID_REFERENCES", message: "AI 返回了不存在的行或字段引用，未保存分析" }, 502);
    await persistResultAnalysisDraft(c.env, {
      projectId, experimentId, rqId: experiment.rqId, resultId: row.id,
      analysis: generated.data, model: generated.model, generatedAt: generated.generatedAt,
    });
    return c.json({ result: toResult({ ...row, analysisJson: JSON.stringify(generated.data), analysisStatus: "draft", model: generated.model, generatedAt: generated.generatedAt }) });
  } catch (error) { return c.json({ error: "AI_RESULT_ANALYSIS_FAILED", message: error instanceof Error ? error.message : "结果分析失败" }, 502); }
});

experimentRoutes.delete("/projects/:projectId/experiments/:experimentId/results/:resultId", async (c) => {
  const projectId = c.req.param("projectId"); const experimentId = c.req.param("experimentId"); const resultId = c.req.param("resultId");
  const db = createDatabase(c.env);
  const existing = await db.select({ id: experimentResults.id }).from(experimentResults).innerJoin(experiments, eq(experimentResults.experimentId, experiments.id))
    .where(and(eq(experimentResults.id, resultId), eq(experimentResults.experimentId, experimentId), eq(experiments.projectId, projectId))).get();
  if (!existing) return c.json({ error: "RESULT_NOT_FOUND" }, 404);
  await db.delete(experimentResults).where(eq(experimentResults.id, resultId));
  return c.json({ id: resultId, deleted: true });
});
