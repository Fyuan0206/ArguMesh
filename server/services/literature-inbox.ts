import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "../db/client";
import { paperFiles, papers, projectPapers, projects } from "../db/schema";
import type { AppBindings } from "../types";
import { PaperWorkspaceError, getPaperWorkspace } from "./paper-files";

/** 项目工作区下用于自动扫描 PDF 的固定子目录名。 */
export const LITERATURE_INBOX_DIR = "literature";

export const MAX_INBOX_SCAN_FILES = 50;
export const MAX_INBOX_FILE_SIZE = 25 * 1024 * 1024;

export type ScanItemStatus = "imported" | "linked" | "skipped" | "failed";

export type ScanInboxItem = {
  fileName: string;
  relativePath: string;
  status: ScanItemStatus;
  paperId?: string;
  title?: string;
  fileHash?: string;
  fileSize?: number;
  message?: string;
};

export type ScanInboxResult = {
  inboxPath: string;
  scanned: number;
  imported: number;
  linked: number;
  skipped: number;
  failed: number;
  items: ScanInboxItem[];
};

export async function getLiteratureInboxDir(env: AppBindings, projectId: string, create = false) {
  const { root } = await getPaperWorkspace(env, projectId, create);
  const inboxDir = resolve(root, LITERATURE_INBOX_DIR);
  await assertInside(root, inboxDir);
  if (create) await mkdir(inboxDir, { recursive: true });
  if (await exists(inboxDir)) await assertInside(root, await realpath(inboxDir));
  return { root, inboxDir };
}

export async function scanLiteratureInbox(env: AppBindings, projectId: string): Promise<ScanInboxResult> {
  const db = createDatabase(env);
  const project = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new PaperWorkspaceError("PROJECT_NOT_FOUND", "项目不存在");

  const { inboxDir } = await getLiteratureInboxDir(env, projectId, true);
  const candidates = await listInboxPdfs(inboxDir);
  const limited = candidates.slice(0, MAX_INBOX_SCAN_FILES);
  const items: ScanInboxItem[] = [];
  let imported = 0;
  let linked = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of limited) {
    try {
      const item = await importInboxPdf(db, projectId, entry.absolutePath, entry.relativePath);
      items.push(item);
      if (item.status === "imported") imported += 1;
      else if (item.status === "linked") linked += 1;
      else if (item.status === "skipped") skipped += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      items.push({
        fileName: basename(entry.relativePath),
        relativePath: entry.relativePath,
        status: "failed",
        message: error instanceof Error ? error.message : "导入失败",
      });
    }
  }

  if (candidates.length > MAX_INBOX_SCAN_FILES) {
    items.push({
      fileName: "",
      relativePath: "",
      status: "skipped",
      message: `仅处理前 ${MAX_INBOX_SCAN_FILES} 个 PDF，其余 ${candidates.length - MAX_INBOX_SCAN_FILES} 个请下次再同步`,
    });
    skipped += 1;
  }

  return {
    inboxPath: inboxDir,
    scanned: limited.length,
    imported,
    linked,
    skipped,
    failed,
    items,
  };
}

async function listInboxPdfs(inboxDir: string) {
  const entries = await readdir(inboxDir, { withFileTypes: true });
  const pdfs: Array<{ absolutePath: string; relativePath: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) continue;
    const absolutePath = resolve(inboxDir, entry.name);
    pdfs.push({ absolutePath, relativePath: `${LITERATURE_INBOX_DIR}/${entry.name}` });
  }
  return pdfs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function importInboxPdf(
  db: ReturnType<typeof createDatabase>,
  projectId: string,
  absolutePath: string,
  relativePath: string,
): Promise<ScanInboxItem> {
  const fileName = basename(relativePath);
  const metadata = await stat(absolutePath);
  if (!metadata.isFile()) {
    return { fileName, relativePath, status: "failed", message: "不是有效文件" };
  }
  if (metadata.size <= 0) {
    return { fileName, relativePath, status: "failed", message: "文件为空" };
  }
  if (metadata.size > MAX_INBOX_FILE_SIZE) {
    return { fileName, relativePath, status: "failed", message: "PDF 不能超过 25 MB" };
  }

  const data = new Uint8Array(await readFile(absolutePath));
  if (!isPdf(data)) {
    return { fileName, relativePath, status: "failed", message: "不是有效的 PDF 文件" };
  }

  const fileHash = createHash("sha256").update(data).digest("hex");
  const title = titleFromFileName(fileName);
  const inboxTag = `inbox:${relativePath.replace(/\\/g, "/")}`;

  const existing = await db.select().from(papers).where(eq(papers.fileHash, fileHash)).get();
  if (existing) {
    const alreadyLinked = await db.select({ paperId: projectPapers.paperId })
      .from(projectPapers)
      .where(eq(projectPapers.projectId, projectId))
      .all()
      .then((rows) => rows.some((row) => row.paperId === existing.id));
    if (alreadyLinked) {
    return {
      fileName,
      relativePath,
      status: "skipped",
      paperId: existing.id,
      title: existing.title,
      fileHash,
      fileSize: existing.fileSize ?? data.byteLength,
      message: "已在当前项目文献库中",
    };
    }
    await db.insert(projectPapers).values({ projectId, paperId: existing.id, sortOrder: 0 }).onConflictDoNothing();
    await mergeInboxTag(db, existing.id, inboxTag);
    return {
      fileName,
      relativePath,
      status: "linked",
      paperId: existing.id,
      title: existing.title,
      fileHash,
      fileSize: existing.fileSize ?? data.byteLength,
      message: "已关联到当前项目",
    };
  }

  const paperId = `inbox-${fileHash.slice(0, 32)}`;
  const now = new Date().toISOString();
  const shortName = title.replace(/\s*[:—-].*$/, "").trim().slice(0, 80) || title.slice(0, 80);
  await db.insert(papers).values({
    id: paperId,
    title,
    shortName,
    authors: "",
    venue: "本地 PDF",
    year: metadata.mtime.getFullYear() || new Date().getFullYear(),
    fileHash,
    mimeType: "application/pdf",
    fileSize: data.byteLength,
    fileName,
    tagsJson: JSON.stringify(["inbox", inboxTag]),
    createdAt: now,
  });
  await db.insert(projectPapers).values({ projectId, paperId, sortOrder: 0 }).onConflictDoNothing();
  await db.insert(paperFiles).values({
    paperId,
    data,
    mimeType: "application/pdf",
    fileSize: data.byteLength,
    createdAt: now,
    updatedAt: now,
  });

  return {
    fileName,
    relativePath,
    status: "imported",
    paperId,
    title,
    fileHash,
    fileSize: data.byteLength,
    message: "已导入文献库",
  };
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "未命名文献";
}

function isPdf(data: Uint8Array) {
  return data.byteLength >= 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
}

async function mergeInboxTag(db: ReturnType<typeof createDatabase>, paperId: string, inboxTag: string) {
  const row = await db.select({ tagsJson: papers.tagsJson }).from(papers).where(eq(papers.id, paperId)).get();
  if (!row) return;
  let tags: string[] = [];
  try { tags = JSON.parse(row.tagsJson) as string[]; } catch { tags = []; }
  if (!tags.includes("inbox")) tags.push("inbox");
  if (!tags.includes(inboxTag)) tags.push(inboxTag);
  await db.update(papers).set({ tagsJson: JSON.stringify(tags) }).where(eq(papers.id, paperId));
}

async function assertInside(root: string, target: string) {
  if (!isAbsolute(target)) throw new PaperWorkspaceError("INVALID_WORKSPACE_PATH", "路径必须是绝对路径");
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) return;
  throw new PaperWorkspaceError("PATH_ESCAPE_REJECTED", "文献路径越过了项目工作文件夹");
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
