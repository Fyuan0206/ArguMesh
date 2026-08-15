import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDatabase } from "../db/client";
import { paperFiles, papers } from "../db/schema";
import type { AppEnv } from "../types";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export const fileRoutes = new Hono<AppEnv>();

// PDF 文件本体存 Turso 数据库(paper_files 表,替代 R2——无银行卡/免费额度方案,
// 见 CLAUDE.md "Deployment Status")。单文件 ≤ 25 MB,行内 BLOB 存储。

fileRoutes.put("/papers/:paperId/file", async (c) => {
  const paperId = c.req.param("paperId");
  const contentType = c.req.header("content-type") ?? "application/pdf";
  const contentLengthHeader = c.req.header("content-length");
  const contentLength = Number(contentLengthHeader ?? "0");

  if (!contentType.toLowerCase().startsWith("application/pdf")) {
    return c.json({ error: "UNSUPPORTED_FILE_TYPE", message: "当前仅支持 PDF" }, 415);
  }
  if (!contentLengthHeader || !Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return c.json({ error: "CONTENT_LENGTH_REQUIRED", message: "上传 PDF 时必须提供有效的 Content-Length" }, 411);
  }
  if (contentLength > MAX_FILE_SIZE) {
    return c.json({ error: "FILE_TOO_LARGE", message: "PDF 不能超过 25 MB" }, 413);
  }
  if (!c.req.raw.body) {
    return c.json({ error: "EMPTY_FILE", message: "请求体中没有文件" }, 400);
  }

  const db = createDatabase(c.env);
  const ownerId = c.get("accountId");
  const ownerCondition = and(eq(papers.id, paperId), eq(papers.ownerId, ownerId));
  const paper = await db.select().from(papers).where(ownerCondition).get();
  if (!paper) {
    return c.json({ error: "PAPER_NOT_FOUND", message: "论文不存在" }, 404);
  }

  const data = new Uint8Array(await c.req.arrayBuffer());
  const now = new Date().toISOString();

  await db
    .insert(paperFiles)
    .values({
      paperId,
      ownerId,
      data,
      mimeType: "application/pdf",
      fileSize: data.byteLength,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: paperFiles.paperId,
      set: { data, mimeType: "application/pdf", fileSize: data.byteLength, updatedAt: now },
    });

  await db
    .update(papers)
    .set({ mimeType: "application/pdf", fileSize: data.byteLength })
    .where(ownerCondition);

  return c.json({ paperId, size: data.byteLength, cloudStored: true }, 201);
});

fileRoutes.get("/papers/:paperId/file", async (c) => {
  const db = createDatabase(c.env);
  const paperId = c.req.param("paperId");
  const paper = await db.select().from(papers).where(and(eq(papers.id, paperId), eq(papers.ownerId, c.get("accountId")))).get();

  if (!paper) {
    return c.json({ error: "PAPER_NOT_FOUND", message: "论文不存在" }, 404);
  }

  const file = await db.select().from(paperFiles).where(eq(paperFiles.paperId, paperId)).get();
  if (!file) {
    return c.json({ error: "FILE_NOT_FOUND", message: "该论文尚未上传 PDF" }, 404);
  }

  const headers = new Headers();
  headers.set("content-type", file.mimeType);
  headers.set("content-disposition", `inline; filename="${paperId}.pdf"`);
  headers.set("content-length", String(file.fileSize));
  return new Response(new Uint8Array(file.data), { headers });
});
