import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { papers, projectPapers, projects } from "../db/schema";
import type { AppEnv } from "../types";

/**
 * 论文管理路由 — 论文级 CRUD、归档切换、阅读状态/标签/收藏局部更新。
 *
 * 与 `routes/library.ts` 的职责边界:
 * - library.ts 提供 PUT upsert,把论文加入项目;新矩阵/导入流程沿用 library.ts。
 * - 本文件提供 GET 列表(按项目/按 ids)、PATCH 局部更新、archive 切换、
 *   DELETE 解绑项目。"加入项目"仍走 library.ts 的 PUT,不重复实现。
 */

const paperPatchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  authors: z.string().trim().max(1_000).optional(),
  venue: z.string().trim().max(300).optional(),
  year: z.number().int().min(1500).max(2200).optional(),
  abstract: z.string().trim().max(20_000).optional(),
  doi: z.string().trim().max(300).optional(),
  arxivId: z.string().trim().max(100).optional(),
  sourceUrl: z.string().trim().max(2_000).optional(),
  readingStatus: z.string().trim().min(1).max(40).optional(),
  favorite: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  fileName: z.string().trim().max(300).optional(),
  pageCount: z.number().int().min(0).max(100_000).optional(),
  outline: z.array(z.object({ title: z.string().trim().min(1).max(200), page: z.number().int().min(1).max(100_000) })).max(500).optional(),
});

const archiveToggleSchema = z.object({ archived: z.boolean() });

const idsQuerySchema = z.object({ ids: z.string().trim().min(1).max(2_000) });

export const paperRoutes = new Hono<AppEnv>();

interface PaperRow {
  id: string;
  ownerId: string;
  title: string;
  shortName: string;
  authors: string;
  venue: string;
  year: number;
  abstract: string | null;
  doi: string | null;
  arxivId: string | null;
  sourceUrl: string | null;
  fileHash: string | null;
  r2Key: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  readingStatus: string;
  favorite: boolean;
  tagsJson: string;
  fileName: string | null;
  pageCount: number | null;
  outlineJson: string | null;
  archivedAt: string | null;
}

function paperToDto(row: PaperRow) {
  let tags: string[] = [];
  let outline: Array<{ title: string; page: number }> = [];
  try { tags = JSON.parse(row.tagsJson) as string[]; } catch { tags = []; }
  if (row.outlineJson) {
    try { outline = JSON.parse(row.outlineJson) as Array<{ title: string; page: number }>; } catch { outline = []; }
  }
  return {
    id: row.id,
    title: row.title,
    shortName: row.shortName,
    authors: row.authors,
    venue: row.venue,
    year: row.year,
    abstract: row.abstract,
    doi: row.doi,
    arxivId: row.arxivId,
    sourceUrl: row.sourceUrl,
    fileHash: row.fileHash,
    hasFile: Boolean(row.r2Key),
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    createdAt: row.createdAt,
    readingStatus: row.readingStatus,
    favorite: Boolean(row.favorite),
    tags,
    fileName: row.fileName,
    pageCount: row.pageCount,
    outline,
    archived: Boolean(row.archivedAt),
    archivedAt: row.archivedAt,
  };
}

paperRoutes.get("/papers", async (c) => {
  const db = createDatabase(c.env);
  const ownerId = c.get("accountId");
  const url = c.req.query("projectId");
  if (url) {
    const rows = await db.select().from(papers)
      .innerJoin(projectPapers, eq(projectPapers.paperId, papers.id))
      .innerJoin(projects, eq(projectPapers.projectId, projects.id))
      .where(and(eq(projectPapers.projectId, url), eq(projects.ownerId, ownerId), eq(papers.ownerId, ownerId), isNull(papers.archivedAt)))
      .orderBy(asc(projectPapers.sortOrder), asc(papers.createdAt))
      .all();
    return c.json({ papers: rows.map((r) => paperToDto(r.papers as PaperRow)) });
  }
  const parsed = idsQuerySchema.safeParse({ ids: c.req.query("ids") ?? "" });
  if (!parsed.success || !parsed.data.ids) return c.json({ error: "MISSING_IDS", message: "请提供 ids 查询参数" }, 400);
  const ids = [...new Set(parsed.data.ids.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 200))];
  if (ids.length === 0) return c.json({ papers: [] });
  const rows = await db.select().from(papers).where(and(eq(papers.ownerId, ownerId), inArray(papers.id, ids))).all();
  return c.json({ papers: rows.map((row) => paperToDto(row as PaperRow)) });
});

paperRoutes.get("/papers/:paperId", async (c) => {
  const db = createDatabase(c.env);
  const row = await db.select().from(papers).where(and(eq(papers.id, c.req.param("paperId")), eq(papers.ownerId, c.get("accountId")))).get();
  if (!row) return c.json({ error: "PAPER_NOT_FOUND", message: "论文不存在" }, 404);
  return c.json({ paper: paperToDto(row as PaperRow) });
});

paperRoutes.patch("/papers/:paperId", async (c) => {
  const parsed = paperPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_PAPER", message: "论文字段不合法", issues: parsed.error.issues }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "NO_FIELDS_TO_UPDATE", message: "至少提供一个待更新字段" }, 400);
  const db = createDatabase(c.env);
  const id = c.req.param("paperId");
  const ownerCondition = and(eq(papers.id, id), eq(papers.ownerId, c.get("accountId")));
  const existing = await db.select({ id: papers.id }).from(papers).where(ownerCondition).get();
  if (!existing) return c.json({ error: "PAPER_NOT_FOUND", message: "论文不存在" }, 404);

  const set: Partial<typeof papers.$inferInsert> = {};
  const data = parsed.data;
  if (data.title !== undefined) { set.title = data.title; set.shortName = data.title.replace(/\s*[:—-].*$/, "").trim().slice(0, 80) || data.title.slice(0, 80); }
  if (data.authors !== undefined) set.authors = data.authors;
  if (data.venue !== undefined) set.venue = data.venue;
  if (data.year !== undefined) set.year = data.year;
  if (data.abstract !== undefined) set.abstract = data.abstract;
  if (data.doi !== undefined) set.doi = data.doi;
  if (data.arxivId !== undefined) set.arxivId = data.arxivId;
  if (data.sourceUrl !== undefined) set.sourceUrl = data.sourceUrl;
  if (data.readingStatus !== undefined) set.readingStatus = data.readingStatus;
  if (data.favorite !== undefined) set.favorite = data.favorite;
  if (data.tags !== undefined) set.tagsJson = JSON.stringify([...new Set(data.tags)]);
  if (data.fileName !== undefined) set.fileName = data.fileName;
  if (data.pageCount !== undefined) set.pageCount = data.pageCount;
  if (data.outline !== undefined) set.outlineJson = JSON.stringify(data.outline);

  await db.update(papers).set(set).where(ownerCondition);
  const updated = await db.select().from(papers).where(ownerCondition).get();
  return c.json({ paper: paperToDto(updated as PaperRow) });
});

paperRoutes.patch("/papers/:paperId/archive", async (c) => {
  const parsed = archiveToggleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_ARCHIVE_VALUE", message: "需要提供 archived 布尔值" }, 400);
  const db = createDatabase(c.env);
  const id = c.req.param("paperId");
  const ownerCondition = and(eq(papers.id, id), eq(papers.ownerId, c.get("accountId")));
  const existing = await db.select({ id: papers.id }).from(papers).where(ownerCondition).get();
  if (!existing) return c.json({ error: "PAPER_NOT_FOUND", message: "论文不存在" }, 404);
  const archivedAt = parsed.data.archived ? new Date().toISOString() : null;
  await db.update(papers).set({ archivedAt }).where(ownerCondition);
  return c.json({ id, archived: parsed.data.archived, archivedAt });
});

/**
 * DELETE /api/papers/:paperId — 物理删除论文(替代前端"归档"操作)。
 * 论文行删除后,project_papers / evidence_cells / paper_files(PDF 本体)等关联
 * 由外键 onDelete:cascade 自动清理。归档操作已从前端移除,但保留 PATCH archive 端点兼容旧数据。
 */
paperRoutes.delete("/papers/:paperId", async (c) => {
  const db = createDatabase(c.env);
  const id = c.req.param("paperId");
  const row = await db.select({ id: papers.id }).from(papers)
    .where(and(eq(papers.id, id), eq(papers.ownerId, c.get("accountId")))).get();
  if (!row) return c.json({ error: "PAPER_NOT_FOUND", message: "论文不存在" }, 404);
  await db.delete(papers).where(and(eq(papers.id, id), eq(papers.ownerId, c.get("accountId"))));
  return c.json({ paperId: id, deleted: true });
});

paperRoutes.delete("/papers/:paperId/project/:projectId", async (c) => {
  const db = createDatabase(c.env);
  const paperId = c.req.param("paperId");
  const projectId = c.req.param("projectId");
  const ownedProject = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, c.get("accountId")))).get();
  const ownedPaper = await db.select({ id: papers.id }).from(papers).where(and(eq(papers.id, paperId), eq(papers.ownerId, c.get("accountId")))).get();
  if (!ownedProject || !ownedPaper) return c.json({ error: "LINK_NOT_FOUND", message: "论文未关联到此项目" }, 404);
  const link = await db.select().from(projectPapers)
    .where(and(eq(projectPapers.projectId, projectId), eq(projectPapers.paperId, paperId)))
    .get();
  if (!link) return c.json({ error: "LINK_NOT_FOUND", message: "论文未关联到此项目" }, 404);
  await db.delete(projectPapers)
    .where(and(eq(projectPapers.projectId, projectId), eq(projectPapers.paperId, paperId)));
  // 软引用一致性:同时清掉该 paper 在此项目矩阵中的 evidence_cells(matrix_id 与 projectId 对应)
  return c.json({ paperId, projectId, removed: true });
});
