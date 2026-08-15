import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { papers, projectPapers, projects } from "../db/schema";
import type { AppEnv } from "../types";

/**
 * 项目管理路由 — 项目 CRUD、归档切换、删除。
 *
 * 与 `routes/library.ts` 的职责边界:
 * - library.ts 提供 PUT upsert(创建/全量替换),用于已有 PUT /projects/:projectId。
 * - 本文件提供 GET 列表/详情、PATCH 局部更新、archive 切换、DELETE。避免 URL 冲突,
 *   archive 切换用专用 PATCH /projects/:id/archive,不与 library.ts 的 PUT 重叠。
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
  ownerId: string;
  name: string;
  description: string | null;
  extractionProgress: number;
  createdAt: string;
  archivedAt: string | null;
  sortOrder: number;
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
    paperCount,
  };
}

projectRoutes.get("/projects", async (c) => {
  const db = createDatabase(c.env);
  const showArchived = c.req.query("includeArchived") === "true";
  const ownerId = c.get("accountId");
  const rows = await db
    .select()
    .from(projects)
    .where(showArchived ? eq(projects.ownerId, ownerId) : and(eq(projects.ownerId, ownerId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.sortOrder), asc(projects.createdAt));

  const counts = new Map<string, number>();
  const linkRows = await db.select({ projectId: projectPapers.projectId }).from(projectPapers).innerJoin(papers, eq(projectPapers.paperId, papers.id)).where(and(eq(papers.ownerId, ownerId), isNull(papers.archivedAt)));
  for (const row of linkRows) counts.set(row.projectId, (counts.get(row.projectId) ?? 0) + 1);

  return c.json({ projects: rows.map((row) => projectToDto(row as ProjectRow, counts.get(row.id) ?? 0)) });
});

projectRoutes.get("/projects/:projectId", async (c) => {
  const db = createDatabase(c.env);
  const row = await db.select().from(projects).where(and(eq(projects.id, c.req.param("projectId")), eq(projects.ownerId, c.get("accountId")))).get();
  if (!row) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const paperCount = await db.select({ id: projectPapers.paperId })
    .from(projectPapers)
    .innerJoin(papers, eq(projectPapers.paperId, papers.id))
    .innerJoin(projects, eq(projectPapers.projectId, projects.id))
    .where(and(eq(projectPapers.projectId, row.id), eq(projects.ownerId, c.get("accountId")), eq(papers.ownerId, c.get("accountId")), isNull(papers.archivedAt)))
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
  const ownerCondition = and(eq(projects.id, id), eq(projects.ownerId, c.get("accountId")));
  const existing = await db.select({ id: projects.id }).from(projects).where(ownerCondition).get();
  if (!existing) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  await db.update(projects).set(parsed.data).where(ownerCondition);
  const updated = await db.select().from(projects).where(ownerCondition).get();
  return c.json({ project: projectToDto(updated as ProjectRow, 0) });
});

projectRoutes.patch("/projects/:projectId/archive", async (c) => {
  const parsed = archiveToggleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_ARCHIVE_VALUE", message: "需要提供 archived 布尔值" }, 400);
  const db = createDatabase(c.env);
  const id = c.req.param("projectId");
  const ownerCondition = and(eq(projects.id, id), eq(projects.ownerId, c.get("accountId")));
  const existing = await db.select({ id: projects.id }).from(projects).where(ownerCondition).get();
  if (!existing) return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  const archivedAt = parsed.data.archived ? new Date().toISOString() : null;
  await db.update(projects).set({ archivedAt }).where(ownerCondition);
  return c.json({ id, archived: parsed.data.archived, archivedAt });
});

/**
 * DELETE /api/projects/:projectId
 *
 * - 400 if ownerId mismatch is impossible here (gate resolves accountId).
 * - 404 if the project doesn't exist or belongs to another account.
 * - 409 PROJECT_NOT_EMPTY when the project still has linked papers and the
 *   caller didn't pass ?force=true. We surface the count so the UI can show
 *   "项目下还有 N 篇文献,确认要一并删除吗?".
 * - 200 on success. Cascade semantics:
 *     - Papers that are linked ONLY to this project are deleted (FK cascades
 *       clean up matrix_papers / evidence_cells referencing them).
 *     - Papers that are shared across multiple projects keep their remaining
 *       project_papers links and survive. The project_papers rows for THIS
 *       project are removed by the project-delete cascade.
 *     - All matrices / dimensions / evidence_cells / extraction_jobs owned by
 *       this project are removed by the project-delete cascade.
 *   The response lists which paper IDs were actually deleted so the frontend
 *   can strip them from local state.
 */
projectRoutes.delete("/projects/:projectId", async (c) => {
  const db = createDatabase(c.env);
  const id = c.req.param("projectId");
  const ownerId = c.get("accountId");
  const ownerCondition = and(eq(projects.id, id), eq(projects.ownerId, ownerId));
  const existing = await db.select({ id: projects.id }).from(projects).where(ownerCondition).get();
  if (!existing) {
    throw new HTTPException(404, { message: "项目不存在" });
  }
  const force = c.req.query("force") === "true";
  if (!force) {
    const linkCount = await db
      .select({ id: projectPapers.paperId })
      .from(projectPapers)
      .innerJoin(papers, eq(projectPapers.paperId, papers.id))
      .where(and(eq(projectPapers.projectId, id), eq(papers.ownerId, ownerId), isNull(papers.archivedAt)))
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

  // 2) Of those, which ones are linked ONLY to this project (and owned by the
  //    current account)? Those are the candidates for deletion. Shared papers
  //    (linked to any other project) survive.
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

    // Delete the exclusively-owned papers first. FK cascades fire:
    //   - project_papers rows for these papers (this project's only link)
    //   - matrix_papers rows referencing them
    //   - evidence_cells rows referencing them
    // We must do this BEFORE the project delete so shared papers still have
    // their project_papers links intact when we check exclusivity.
    if (deletedPaperIds.length > 0) {
      await db.delete(papers).where(and(inArray(papers.id, deletedPaperIds), eq(papers.ownerId, ownerId)));
    }
  }

  // 3) Delete the project. Cascade FKs clean up remaining project_papers
  //    rows for shared papers, plus matrices / dimensions / evidence_cells /
  //    extraction_jobs owned by this project.
  await db.delete(projects).where(ownerCondition);

  return c.json({
    id,
    deleted: true,
    deletedPaperIds,
    sharedPaperIds,
    deletedPaperCount: deletedPaperIds.length,
  });
});
