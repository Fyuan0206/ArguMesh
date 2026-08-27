import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "../db/client";
import { projects } from "../db/schema";
import type { AppBindings } from "../types";

export const PAPER_FILES = ["main.tex", "references.bib"] as const;
export type PaperFileName = (typeof PAPER_FILES)[number];

const MAIN_TEMPLATE = String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{geometry}
\usepackage{hyperref}
\geometry{margin=1in}

\title{Research Manuscript}
\author{}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
% Summarize the research question, method, and evidence-supported findings.
\end{abstract}

\section{Introduction}
% Define the problem and research gap.

\section{Related Work}
% Compare prior work with traceable citations.

\section{Method}
% Describe the proposed method.

\section{Experiments}
% Report only imported, verified experimental results.

\section{Conclusion}
% State supported conclusions and limitations.

\bibliographystyle{plain}
\bibliography{references}
\end{document}
`;

export class PaperWorkspaceError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export async function getPaperWorkspace(env: AppBindings, projectId: string, create = false) {
  const row = await createDatabase(env).select({ workspacePath: projects.workspacePath }).from(projects).where(eq(projects.id, projectId)).get();
  if (!row) throw new PaperWorkspaceError("PROJECT_NOT_FOUND", "项目不存在");
  if (!row.workspacePath) throw new PaperWorkspaceError("WORKSPACE_PATH_REQUIRED", "请先为项目选择工作文件夹");
  if (!isAbsolute(row.workspacePath)) throw new PaperWorkspaceError("INVALID_WORKSPACE_PATH", "项目工作文件夹必须是绝对路径");
  try {
    const root = await realpath(row.workspacePath);
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) throw new Error("not directory");
    const paperDir = resolve(root, "paper");
    const snapshotDir = resolve(root, ".argumesh", "paper-snapshots");
    if (create) { await mkdir(paperDir, { recursive: true }); await mkdir(snapshotDir, { recursive: true }); }
    await assertInside(root, create ? await realpath(paperDir) : paperDir);
    await assertInside(root, create ? await realpath(snapshotDir) : snapshotDir);
    return { root, paperDir, snapshotDir };
  } catch (error) {
    if (error instanceof PaperWorkspaceError) throw error;
    throw new PaperWorkspaceError("WORKSPACE_NOT_ACCESSIBLE", "项目工作文件夹不存在或不可访问");
  }
}

export async function initializePaper(env: AppBindings, projectId: string) {
  const paths = await getPaperWorkspace(env, projectId, true);
  const mainPath = await safePaperPath(paths.root, paths.paperDir, "main.tex");
  const bibPath = await safePaperPath(paths.root, paths.paperDir, "references.bib");
  let createdMain = false; let createdBibliography = false;
  if (!(await exists(mainPath))) { await atomicWrite(mainPath, MAIN_TEMPLATE); createdMain = true; }
  if (!(await exists(bibPath))) { await atomicWrite(bibPath, "% Add verified BibTeX entries here.\n"); createdBibliography = true; }
  await mkdir(resolve(paths.paperDir, "figures"), { recursive: true });
  return { createdMain, createdBibliography, paperDir: paths.paperDir };
}

export async function readPaperSource(env: AppBindings, projectId: string, file: PaperFileName) {
  const paths = await getPaperWorkspace(env, projectId);
  const filePath = await safePaperPath(paths.root, paths.paperDir, file);
  let content: string;
  try { content = await readFile(filePath, "utf8"); } catch { throw new PaperWorkspaceError("PAPER_NOT_INITIALIZED", "论文尚未初始化"); }
  const metadata = await stat(filePath);
  return { file, content, version: versionOf(content), updatedAt: metadata.mtime.toISOString() };
}

export async function writePaperSource(env: AppBindings, projectId: string, file: PaperFileName, content: string, expectedVersion: string) {
  const current = await readPaperSource(env, projectId, file);
  if (current.version !== expectedVersion) throw new PaperWorkspaceError("PAPER_VERSION_CONFLICT", "文件已在其他位置修改，未覆盖当前内容");
  await createSnapshot(env, projectId, `before-${file.replace(".", "-")}`);
  const paths = await getPaperWorkspace(env, projectId, true);
  const filePath = await safePaperPath(paths.root, paths.paperDir, file);
  await atomicWrite(filePath, content);
  return readPaperSource(env, projectId, file);
}

export async function createSnapshot(env: AppBindings, projectId: string, reason = "manual") {
  const paths = await getPaperWorkspace(env, projectId, true);
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  const target = resolve(paths.snapshotDir, id);
  await assertInside(paths.root, target); await mkdir(target, { recursive: false });
  for (const file of PAPER_FILES) {
    const source = await safePaperPath(paths.root, paths.paperDir, file);
    if (await exists(source)) await copyFile(source, resolve(target, file));
  }
  await writeFile(resolve(target, "metadata.json"), JSON.stringify({ id, reason, createdAt: new Date().toISOString() }), "utf8");
  return { id, reason, createdAt: new Date().toISOString() };
}

export async function listSnapshots(env: AppBindings, projectId: string) {
  const paths = await getPaperWorkspace(env, projectId, true);
  const entries = await readdir(paths.snapshotDir, { withFileTypes: true });
  const snapshots = [] as Array<{ id: string; reason: string; createdAt: string }>;
  for (const entry of entries.filter((item) => item.isDirectory()).slice(-100)) {
    try { snapshots.push(JSON.parse(await readFile(resolve(paths.snapshotDir, entry.name, "metadata.json"), "utf8"))); } catch { /* ignore incomplete snapshot */ }
  }
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreSnapshot(env: AppBindings, projectId: string, snapshotId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(snapshotId)) throw new PaperWorkspaceError("INVALID_SNAPSHOT", "快照标识不合法");
  const paths = await getPaperWorkspace(env, projectId, true);
  const sourceDir = resolve(paths.snapshotDir, snapshotId); await assertInside(paths.root, sourceDir);
  if (!(await exists(sourceDir))) throw new PaperWorkspaceError("SNAPSHOT_NOT_FOUND", "快照不存在");
  await assertInside(paths.root, await realpath(sourceDir));
  await createSnapshot(env, projectId, "before-restore");
  for (const file of PAPER_FILES) {
    const source = resolve(sourceDir, file);
    if (await exists(source)) await atomicWrite(await safePaperPath(paths.root, paths.paperDir, file), await readFile(source, "utf8"));
  }
  return { restored: true, snapshotId };
}

export function parseOutline(source: string) {
  const outline: Array<{ level: "section" | "subsection"; title: string; line: number }> = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^\s*\\(section|subsection)\*?\{([^}]*)\}/);
    if (match) outline.push({ level: match[1] as "section" | "subsection", title: match[2], line: index + 1 });
  });
  return outline;
}

export function findMissingCitations(source: string, bibliography: string) {
  const cited = new Set([...source.matchAll(/\\cite(?:\[[^\]]*\])?\{([^}]+)\}/g)].flatMap((match) => match[1].split(",").map((key) => key.trim())));
  const available = new Set([...bibliography.matchAll(/@[A-Za-z]+\s*\{\s*([^,\s]+)/g)].map((match) => match[1]));
  return [...cited].filter((key) => key && !available.has(key));
}

export function containsDangerousLatex(source: string) {
  return /\\(?:write18|openin|openout|read|input|include)\s*(?:\{|\d|=)?\s*(?:[A-Za-z]:[\\/]|\/|\.\.)|\\usepackage(?:\[[^\]]*\])?\{shellesc\}/i.test(source);
}

async function safePaperPath(root: string, paperDir: string, file: PaperFileName) {
  if (!PAPER_FILES.includes(file)) throw new PaperWorkspaceError("INVALID_PAPER_FILE", "不支持的论文文件");
  const target = resolve(paperDir, file); await assertInside(root, target);
  if (await exists(target)) await assertInside(root, await realpath(target));
  return target;
}
async function assertInside(root: string, target: string) {
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) return;
  throw new PaperWorkspaceError("PATH_ESCAPE_REJECTED", "论文路径越过了项目工作文件夹");
}
async function atomicWrite(target: string, content: string) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = resolve(dirname(target), `.${crypto.randomUUID()}.tmp`);
  try { await writeFile(temporary, content, { encoding: "utf8", flag: "wx" }); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }).catch(() => undefined); }
}
async function exists(path: string) { try { await access(path); return true; } catch { return false; } }
function versionOf(content: string) { return createHash("sha256").update(content).digest("hex"); }
