import { type SQL, and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { papers, projectPapers, projects } from "../db/schema";
import type { AppEnv } from "../types";

/**
 * 项目管理路由(单用户本地版:无账号/owner 概念)。
 * - library.ts 提供 PUT upsert(创建/全量替换)。
 * - 本文件提供 GET 列表/详情、PATCH 局部更新、archive 切换、DELETE。
 *
 * DELETE 语义:级联删除项目本身;project_papers 关联由外键 onDelete:cascade 自动清理;
 * 关联的 papers / matrices / evidence_cells / extraction_jobs 同样由各自的外键级联删除。
 * 若项目仍有关联文献且未传 ?force=true,返回 409 PROJECT_NOT_EMPTY 让前端先确认。
 */

const projectPatchSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2_000).optional(),
});

const archiveToggleSchema = z.object({
  archived: z.boolean(),
});

export const projectRoutes = new Hono<AppEnv>();

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  extractionProgress: number;
  createdAt: string;
  archivedAt: string | null;
  sortOrder: number;
  workspacePath: string | null;
}

function projectToDto(row: ProjectRow, paperCount: number) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    extractionProgress: row.extractionProgress,
    createdAt: row.createdAt,
    archived: Boolean(row.archivedAt),
    archivedAt: row.archivedAt,
    sortOrder: row.sortOrder,
    workspacePath: row.workspacePath ?? null,
    paperCount,
  };
}

projectRoutes.get("/projects", async (c) => {
  const db = createDatabase(c.env);
  const showArchived = c.req.query("includeArchived") === "true";
  const rows = await db
    .select()
    .from(projects)
    .where(showArchived ? undefined : isNull(projects.archivedAt))
    .orderBy(asc(projects.sortOrder), asc(projects.createdAt));

  const counts = new Map<string, number>();
  const linkRows = await db.select({ projectId: projectPapers.projectId }).from(projectPapers).innerJoin(papers, eq(projectPapers.paperId, papers.id)).where(isNull(papers.archivedAt));
  for (const row of linkRows) counts.set(row.projectId, (counts.get(row.projectId) ?? 0) + 1);

  return c.json({ projects: rows.map((row) => projectToDto(row as ProjectRow, counts.get(row.id) ?? 0)) });
});

projectRoutes.get("/projects/:projectId", async (c) => {
  const db = createDatabase(c.env);
  const row = await db.select().from(projects).where(eq(projects.id, c.req.param("projectId"))).get();
  if (!row) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const paperCount = await db.select({ id: projectPapers.paperId })
    .from(projectPapers)
    .innerJoin(papers, eq(projectPapers.paperId, papers.id))
    .where(and(eq(projectPapers.projectId, row.id), isNull(papers.archivedAt)))
    .all()
    .then((rows) => rows.length);
  return c.json({ project: projectToDto(row as ProjectRow, paperCount) });
});

projectRoutes.patch("/projects/:projectId", async (c) => {
  const parsed = projectPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_PROJECT", message: "项目字段不合法", issues: parsed.error.issues }, 400);
  if (parsed.data.name === undefined && parsed.data.description === undefined) {
    return c.json({ error: "NO_FIELDS_TO_UPDATE", message: "至少提供一个待更新字段" }, 400);
  }
  const db = createDatabase(c.env);
  const id = c.req.param("projectId");
  const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!existing) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  await db.update(projects).set(parsed.data).where(eq(projects.id, id));
  const updated = await db.select().from(projects).where(eq(projects.id, id)).get();
  return c.json({ project: projectToDto(updated as ProjectRow, 0) });
});

projectRoutes.patch("/projects/:projectId/archive", async (c) => {
  const parsed = archiveToggleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_ARCHIVE_VALUE", message: "需要提供 archived 布尔值" }, 400);
  const db = createDatabase(c.env);
  const id = c.req.param("projectId");
  const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!existing) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const archivedAt = parsed.data.archived ? new Date().toISOString() : null;
  await db.update(projects).set({ archivedAt }).where(eq(projects.id, id));
  return c.json({ id, archived: parsed.data.archived, archivedAt });
});

/**
 * DELETE /api/projects/:projectId
 * - 404 if the project doesn't exist.
 * - 409 PROJECT_NOT_EMPTY when the project still has linked papers and the
 *   caller didn't pass ?force=true.
 * - 200 on success. Cascade FKs clean up project_papers (shared papers keep
 *   their remaining links) and matrices / dimensions / evidence_cells /
 *   extraction_jobs owned by this project.
 */
projectRoutes.delete("/projects/:projectId", async (c) => {
  const db = createDatabase(c.env);
  const id = c.req.param("projectId");
  const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!existing) {
    throw new HTTPException(404, { message: "项目不存在" });
  }
  const force = c.req.query("force") === "true";
  if (!force) {
    const linkCount = await db
      .select({ id: projectPapers.paperId })
      .from(projectPapers)
      .innerJoin(papers, eq(projectPapers.paperId, papers.id))
      .where(and(eq(projectPapers.projectId, id), isNull(papers.archivedAt)))
      .all()
      .then((rows) => rows.length);
    if (linkCount > 0) {
      return c.json({ error: "PROJECT_NOT_EMPTY", message: "项目仍有关联文献", paperCount: linkCount }, 409);
    }
  }

  // 1) Find every paper linked to this project.
  const linkedPaperIds = await db
    .select({ paperId: projectPapers.paperId })
    .from(projectPapers)
    .where(eq(projectPapers.projectId, id))
    .all()
    .then((rows) => rows.map((row) => row.paperId));

  // 2) Of those, which are linked ONLY to this project? Those are deleted;
  //    shared papers (linked to any other project) survive.
  let deletedPaperIds: string[] = [];
  let sharedPaperIds: string[] = [];
  if (linkedPaperIds.length > 0) {
    const stillLinkedElsewhere = await db
      .select({ paperId: projectPapers.paperId })
      .from(projectPapers)
      .where(and(inArray(projectPapers.paperId, linkedPaperIds), notInArray(projectPapers.projectId, [id])))
      .all()
      .then((rows) => new Set(rows.map((row) => row.paperId)));
    sharedPaperIds = linkedPaperIds.filter((paperId) => stillLinkedElsewhere.has(paperId));
    deletedPaperIds = linkedPaperIds.filter((paperId) => !stillLinkedElsewhere.has(paperId));

    if (deletedPaperIds.length > 0) {
      await db.delete(papers).where(inArray(papers.id, deletedPaperIds));
    }
  }

  // 3) Delete the project. Cascade FKs clean up remaining project_papers rows
  //    for shared papers, plus matrices / dimensions / evidence_cells /
  //    extraction_jobs owned by this project.
  await db.delete(projects).where(eq(projects.id, id));

  return c.json({
    id,
    deleted: true,
    deletedPaperIds,
    sharedPaperIds,
    deletedPaperCount: deletedPaperIds.length,
  });
});
