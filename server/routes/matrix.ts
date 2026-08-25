import { and, asc, eq, isNull, max } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { dimensions, evidenceCells, matrices, matrixPapers, papers, projectPapers, projects } from "../db/schema";
import type { AppEnv } from "../types";

const evidenceStatusSchema = z.object({
  status: z.enum(["draft", "confirmed", "conflict", "missing"]),
  locked: z.boolean().optional(),
});

const createMatrixSchema = z.object({
  id: z.string().trim().min(1).max(160),
  projectId: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1_000).default(""),
  // 论文/维度可缺省:缺省时自动继承项目数据(项目全部论文 / 项目已有维度),实现项目↔矩阵互通。
  paperIds: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  dimensions: z.array(z.object({ id: z.string().trim().min(1).max(160), label: z.string().trim().min(1).max(200) })).max(50).optional(),
});

export const matrixRoutes = new Hono<AppEnv>();

matrixRoutes.put("/matrices/:matrixId", async (c) => {
  const parsed = createMatrixSchema.safeParse({ ...await c.req.json().catch(() => null), id: c.req.param("matrixId") });
  if (!parsed.success) return c.json({ error: "INVALID_MATRIX", message: "矩阵信息不完整", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const input = parsed.data;
  if (!await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).get()) {
    return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  }
  const existingMatrix = await db.select({ projectId: matrices.projectId }).from(matrices).where(eq(matrices.id, input.id)).get();
  if (existingMatrix && existingMatrix.projectId !== input.projectId) return c.json({ error: "MATRIX_NOT_FOUND", message: "矩阵不存在" }, 404);
  const linkedPapers = await db.select({ id: projectPapers.paperId }).from(projectPapers).where(eq(projectPapers.projectId, input.projectId));
  const allowed = new Set(linkedPapers.map((item) => item.id));
  // 互通:未传论文 → 自动继承项目全部论文;未传维度 → 继承项目已有维度。
  const paperIds = input.paperIds ?? linkedPapers.map((item) => item.id);
  if (paperIds.some((id) => !allowed.has(id))) return c.json({ error: "PAPER_NOT_IN_PROJECT", message: "矩阵只能选择当前项目中的论文" }, 400);
  const resolvedDims = input.dimensions ?? (await db.select({ id: dimensions.id, label: dimensions.label })
    .from(dimensions)
    .where(and(eq(dimensions.projectId, input.projectId), isNull(dimensions.matrixId)))
    .all()).map((dimension) => ({ id: dimension.id, label: dimension.label }));
  if (!resolvedDims.length || !paperIds.length) {
    return c.json({ error: "INVALID_MATRIX", message: "矩阵至少需要 1 篇论文和 1 个维度" }, 400);
  }
  const now = new Date().toISOString();
  await db.insert(matrices).values({ id: input.id, projectId: input.projectId, name: input.name, description: input.description, createdAt: now }).onConflictDoUpdate({ target: matrices.id, set: { name: input.name, description: input.description } });
  await db.delete(matrixPapers).where(eq(matrixPapers.matrixId, input.id));
  await db.delete(dimensions).where(and(eq(dimensions.matrixId, input.id), eq(dimensions.projectId, input.projectId)));
  await db.insert(matrixPapers).values(paperIds.map((paperId, sortOrder) => ({ matrixId: input.id, paperId, sortOrder })));
  await db.insert(dimensions).values(resolvedDims.map((dimension, sortOrder) => ({ ...dimension, projectId: input.projectId, matrixId: input.id, groupKey: "custom", groupLabel: "自定义研究维度", sortOrder })));
  await db.insert(evidenceCells).values(resolvedDims.flatMap((dimension) => paperIds.map((paperId) => ({
    id: `${input.id}:${dimension.id}:${paperId}`, projectId: input.projectId, matrixId: input.id, paperId, dimensionId: dimension.id,
    value: "待提取", status: "draft" as const, confidence: 0, claim: "尚未从论文原文中提取该维度。", sourcePage: "—", sourceSection: "待提取", sourceExcerpt: "", locked: false, updatedAt: now,
  })))).onConflictDoNothing();
  return c.json({ id: input.id, projectId: input.projectId }, 201);
});

matrixRoutes.get("/matrices/:matrixId", async (c) => {
  const db = createDatabase(c.env);
  const matrixId = c.req.param("matrixId");
  const matrix = await db.select().from(matrices).where(eq(matrices.id, matrixId)).get();
  if (!matrix) return c.json({ error: "MATRIX_NOT_FOUND", message: "矩阵不存在" }, 404);
  const dimensionRows = await db.select().from(dimensions).where(eq(dimensions.matrixId, matrixId)).orderBy(asc(dimensions.sortOrder));

  // 互通:打开矩阵时自动把项目论文纳入矩阵(补 matrix_papers + 占位证据单元格)。
  const projectPaperRows = await db.select({ id: papers.id, sortOrder: projectPapers.sortOrder }).from(projectPapers)
    .innerJoin(papers, eq(projectPapers.paperId, papers.id))
    .where(eq(projectPapers.projectId, matrix.projectId)).orderBy(asc(projectPapers.sortOrder));
  const existingMatrixPapers = await db.select({ paperId: matrixPapers.paperId }).from(matrixPapers).where(eq(matrixPapers.matrixId, matrixId));
  const inMatrix = new Set(existingMatrixPapers.map((row) => row.paperId));
  const missing = projectPaperRows.filter((row) => !inMatrix.has(row.id));
  if (missing.length && dimensionRows.length) {
    const now = new Date().toISOString();
    const maxSort = await db.select({ max: max(matrixPapers.sortOrder) }).from(matrixPapers).where(eq(matrixPapers.matrixId, matrixId)).get();
    const base = (maxSort?.max ?? 0) + 1;
    await db.insert(matrixPapers).values(missing.map((row, index) => ({ matrixId, paperId: row.id, sortOrder: base + index })));
    await db.insert(evidenceCells).values(missing.flatMap((paper) => dimensionRows.map((dimension) => ({
      id: `${matrixId}:${dimension.id}:${paper.id}`, projectId: matrix.projectId, matrixId, paperId: paper.id, dimensionId: dimension.id,
      value: "待提取", status: "draft" as const, confidence: 0, claim: "尚未从论文原文中提取该维度。", sourcePage: "—", sourceSection: "待提取", sourceExcerpt: "", locked: false, updatedAt: now,
    })))).onConflictDoNothing();
  }

  const paperRows = await db.select({ id: papers.id, name: papers.shortName, title: papers.title, venue: papers.venue, year: papers.year, hasFile: papers.r2Key, sortOrder: matrixPapers.sortOrder })
    .from(matrixPapers).innerJoin(papers, eq(matrixPapers.paperId, papers.id)).where(eq(matrixPapers.matrixId, matrixId)).orderBy(asc(matrixPapers.sortOrder));
  const cellRows = await db.select().from(evidenceCells).where(eq(evidenceCells.matrixId, matrixId));
  return c.json(matrixResponse({ id: matrix.id, name: matrix.name, description: matrix.description, extractionProgress: matrix.extractionProgress }, paperRows, dimensionRows, cellRows, matrix.projectId));
});

function matrixResponse(project: { id: string; name: string; description: string | null; extractionProgress: number }, paperRows: Array<{ id: string; name: string; title: string; venue: string; year: number; hasFile: string | null; sortOrder: number }>, dimensionRows: Array<typeof dimensions.$inferSelect>, cellRows: Array<typeof evidenceCells.$inferSelect>, projectId = project.id) {
  const cells = Object.fromEntries(cellRows.map((cell) => [`${cell.dimensionId}:${cell.paperId}`, { id: cell.id, value: cell.value, status: cell.status, confidence: cell.confidence / 100, claim: cell.claim, sourcePage: cell.sourcePage, sourceSection: cell.sourceSection, sourceExcerpt: cell.sourceExcerpt, locked: cell.locked }]));
  const groupMap = new Map<string, { id: string; label: string; rows: Array<{ id: string; label: string }> }>();
  for (const dimension of dimensionRows) {
    const group = groupMap.get(dimension.groupKey) ?? { id: dimension.groupKey, label: dimension.groupLabel, rows: [] };
    group.rows.push({ id: dimension.id, label: dimension.label }); groupMap.set(dimension.groupKey, group);
  }
  return { project: { id: projectId, name: project.name, description: project.description, extractionProgress: project.extractionProgress }, papers: paperRows.map(({ hasFile, sortOrder: _sortOrder, ...paper }) => ({ ...paper, hasFile: Boolean(hasFile) })), groups: [...groupMap.values()], cells };
}

matrixRoutes.get("/projects/:projectId/matrix", async (c) => {
  const db = createDatabase(c.env);
  const projectId = c.req.param("projectId");
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) {
    return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  }

  const projectPaperRows = await db
    .select({
      id: papers.id,
      name: papers.shortName,
      title: papers.title,
      venue: papers.venue,
      year: papers.year,
      hasFile: papers.r2Key,
      sortOrder: projectPapers.sortOrder,
    })
    .from(projectPapers)
    .innerJoin(papers, eq(projectPapers.paperId, papers.id))
    .where(eq(projectPapers.projectId, projectId))
    .orderBy(asc(projectPapers.sortOrder));

  const dimensionRows = await db
    .select()
    .from(dimensions)
    .where(eq(dimensions.projectId, projectId))
    .orderBy(asc(dimensions.sortOrder));

  const cellRows = await db
    .select()
    .from(evidenceCells)
    .where(eq(evidenceCells.projectId, projectId));

  const cells = Object.fromEntries(
    cellRows.map((cell) => [
      `${cell.dimensionId}:${cell.paperId}`,
      {
        id: cell.id,
        value: cell.value,
        status: cell.status,
        confidence: cell.confidence / 100,
        claim: cell.claim,
        sourcePage: cell.sourcePage,
        sourceSection: cell.sourceSection,
        sourceExcerpt: cell.sourceExcerpt,
        locked: cell.locked,
      },
    ]),
  );

  const groupMap = new Map<string, { id: string; label: string; rows: Array<{ id: string; label: string }> }>();
  for (const dimension of dimensionRows) {
    const group = groupMap.get(dimension.groupKey) ?? {
      id: dimension.groupKey,
      label: dimension.groupLabel,
      rows: [],
    };
    group.rows.push({ id: dimension.id, label: dimension.label });
    groupMap.set(dimension.groupKey, group);
  }

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      extractionProgress: project.extractionProgress,
    },
    papers: projectPaperRows.map(({ hasFile, sortOrder: _sortOrder, ...paper }) => ({
      ...paper,
      hasFile: Boolean(hasFile),
    })),
    groups: [...groupMap.values()],
    cells,
  });
});

matrixRoutes.patch("/evidence/:evidenceId", async (c) => {
  const parsed = evidenceStatusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_EVIDENCE_STATUS", issues: parsed.error.issues }, 400);
  }

  const db = createDatabase(c.env);
  const evidenceId = c.req.param("evidenceId");
  const existing = await db.select().from(evidenceCells).where(eq(evidenceCells.id, evidenceId)).get();

  if (!existing) {
    return c.json({ error: "EVIDENCE_NOT_FOUND", message: "证据不存在" }, 404);
  }

  if (existing.locked && parsed.data.status === "draft" && parsed.data.locked !== false) {
    return c.json({ error: "EVIDENCE_LOCKED", message: "已锁定证据不能退回 AI 草稿" }, 409);
  }

  const locked = parsed.data.locked ?? parsed.data.status === "confirmed";
  await db
    .update(evidenceCells)
    .set({ status: parsed.data.status, locked, updatedAt: new Date().toISOString() })
    .where(and(eq(evidenceCells.id, evidenceId), eq(evidenceCells.projectId, existing.projectId)));

  return c.json({ id: evidenceId, status: parsed.data.status, locked });
});

const evidenceContentSchema = z.object({
  value: z.string().trim().min(1).max(2_000),
  status: z.enum(["draft", "confirmed", "conflict", "missing"]),
  confidence: z.number().min(0).max(1),
  claim: z.string().trim().min(1).max(4_000),
  sourcePage: z.string().trim().min(1).max(100),
  sourceSection: z.string().trim().min(1).max(500),
  sourceExcerpt: z.string().trim().max(6_000),
});

matrixRoutes.put("/evidence/:evidenceId/content", async (c) => {
  const parsed = evidenceContentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_EVIDENCE", message: "AI 证据格式不正确", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const evidenceId = c.req.param("evidenceId");
  const existing = await db.select().from(evidenceCells).where(eq(evidenceCells.id, evidenceId)).get();
  if (!existing) return c.json({ error: "EVIDENCE_NOT_FOUND", message: "证据不存在" }, 404);
  if (existing.locked) return c.json({ error: "EVIDENCE_LOCKED", message: "已锁定证据不会被 AI 覆盖" }, 409);
  await db.update(evidenceCells).set({ ...parsed.data, confidence: Math.round(parsed.data.confidence * 100), locked: false, updatedAt: new Date().toISOString() }).where(eq(evidenceCells.id, evidenceId));
  return c.json({ id: evidenceId, ...parsed.data, locked: false });
});
