import { execFile } from "node:child_process";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import type { AppBindings } from "../types";
import { containsDangerousLatex, getPaperWorkspace, PaperWorkspaceError } from "./paper-files";

export interface LatexIssue { severity: "error" | "warning"; message: string; line: number | null }
export interface CompileStatus {
  status: "idle" | "running" | "succeeded" | "failed" | "cancelled" | "unavailable";
  engine: "tectonic" | "latexmk" | null;
  startedAt: string | null;
  finishedAt: string | null;
  log: string;
  issues: LatexIssue[];
  pdfUpdatedAt: string | null;
}

const activeCompiles = new Map<string, AbortController>();
const IDLE: CompileStatus = { status: "idle", engine: null, startedAt: null, finishedAt: null, log: "", issues: [], pdfUpdatedAt: null };

export async function detectLatexEngine(env: AppBindings): Promise<{ kind: "tectonic" | "latexmk"; path: string } | null> {
  if (env.LATEX_ENGINE_PATH) {
    if (!isAbsolute(env.LATEX_ENGINE_PATH)) throw new PaperWorkspaceError("INVALID_LATEX_ENGINE", "LATEX_ENGINE_PATH 必须是绝对路径");
    const kind = engineKind(env.LATEX_ENGINE_PATH);
    if (!kind) throw new PaperWorkspaceError("INVALID_LATEX_ENGINE", "只支持 tectonic 或 latexmk");
    await access(env.LATEX_ENGINE_PATH);
    return { kind, path: env.LATEX_ENGINE_PATH };
  }
  for (const kind of ["tectonic", "latexmk"] as const) {
    const path = await locateExecutable(kind);
    if (path) return { kind, path };
  }
  return null;
}

export async function compilePaper(env: AppBindings, projectId: string): Promise<CompileStatus> {
  if (activeCompiles.has(projectId)) throw new PaperWorkspaceError("COMPILE_ALREADY_RUNNING", "论文正在编译");
  const paths = await getPaperWorkspace(env, projectId);
  const mainPath = resolve(paths.paperDir, "main.tex");
  await access(mainPath).catch(() => { throw new PaperWorkspaceError("PAPER_NOT_INITIALIZED", "请先初始化论文"); });
  const source = await readFile(mainPath, "utf8");
  if (containsDangerousLatex(source)) {
    throw new PaperWorkspaceError("UNSAFE_LATEX_SOURCE", "论文包含不允许的命令执行或工作区外文件访问，已阻止编译");
  }
  const engine = await detectLatexEngine(env);
  if (!engine) {
    const unavailable: CompileStatus = { ...IDLE, status: "unavailable", finishedAt: new Date().toISOString(), log: "未检测到 Tectonic 或 latexmk。编辑功能仍可使用。" };
    await persistStatus(paths.root, unavailable); return unavailable;
  }
  const controller = new AbortController(); activeCompiles.set(projectId, controller);
  const startedAt = new Date().toISOString();
  await persistStatus(paths.root, { ...IDLE, status: "running", engine: engine.kind, startedAt });
  try {
    const args = engine.kind === "tectonic"
      ? ["main.tex", "--outdir", paths.paperDir, "--keep-logs"]
      : ["-pdf", "-interaction=nonstopmode", "-halt-on-error", "main.tex"];
    const result = await runExecutable(engine.path, args, paths.paperDir, controller.signal);
    const log = `${result.stdout}\n${result.stderr}`.trim().slice(-200_000);
    const pdfPath = resolve(paths.paperDir, "main.pdf");
    const hasPdf = await access(pdfPath).then(() => true).catch(() => false);
    const status: CompileStatus = {
      status: hasPdf ? "succeeded" : "failed", engine: engine.kind, startedAt, finishedAt: new Date().toISOString(),
      log, issues: parseLatexLog(log), pdfUpdatedAt: hasPdf ? (await stat(pdfPath)).mtime.toISOString() : null,
    };
    await persistStatus(paths.root, status); return status;
  } catch (error) {
    const cancelled = controller.signal.aborted;
    const log = error instanceof Error ? error.message.slice(-200_000) : "编译失败";
    const status: CompileStatus = {
      status: cancelled ? "cancelled" : "failed", engine: engine.kind, startedAt, finishedAt: new Date().toISOString(),
      log, issues: parseLatexLog(log), pdfUpdatedAt: null,
    };
    await persistStatus(paths.root, status); return status;
  } finally { activeCompiles.delete(projectId); }
}

export async function cancelCompile(projectId: string) {
  const controller = activeCompiles.get(projectId);
  if (!controller) return false;
  controller.abort(); return true;
}

export async function getCompileStatus(env: AppBindings, projectId: string): Promise<CompileStatus> {
  const paths = await getPaperWorkspace(env, projectId, true);
  try { return JSON.parse(await readFile(resolve(paths.root, ".argumesh", "compile-status.json"), "utf8")) as CompileStatus; }
  catch { return IDLE; }
}

export async function getPaperPdfPath(env: AppBindings, projectId: string) {
  const paths = await getPaperWorkspace(env, projectId);
  const pdfPath = resolve(paths.paperDir, "main.pdf");
  await access(pdfPath).catch(() => { throw new PaperWorkspaceError("PDF_NOT_FOUND", "尚无可预览的编译 PDF"); });
  return pdfPath;
}

export function parseLatexLog(log: string): LatexIssue[] {
  const issues: LatexIssue[] = [];
  const lines = log.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("!")) {
      const nearby = lines.slice(index, index + 4).join(" ");
      const line = nearby.match(/l\.(\d+)/)?.[1];
      issues.push({ severity: "error", message: lines[index].replace(/^!\s*/, "").slice(0, 500), line: line ? Number(line) : null });
    } else if (/LaTeX Warning:|Package .* Warning:/.test(lines[index])) {
      const line = lines[index].match(/line\s+(\d+)/i)?.[1];
      issues.push({ severity: "warning", message: lines[index].slice(0, 500), line: line ? Number(line) : null });
    }
  }
  return issues.slice(0, 100);
}

function engineKind(path: string): "tectonic" | "latexmk" | null {
  const name = basename(path).toLowerCase().replace(/\.exe$/, "");
  return name === "tectonic" || name === "latexmk" ? name : null;
}
async function locateExecutable(name: "tectonic" | "latexmk") {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    const result = await runExecutable(locator, [name], process.cwd(), AbortSignal.timeout(5_000));
    return result.stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean) ?? null;
  } catch { return null; }
}
function runExecutable(file: string, args: string[], cwd: string, signal: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { cwd, windowsHide: true, timeout: 120_000, maxBuffer: 2_000_000, signal }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${stdout}\n${stderr}\n${error.message}`.trim()));
      else resolvePromise({ stdout, stderr });
    });
  });
}
async function persistStatus(root: string, status: CompileStatus) {
  await writeFile(resolve(root, ".argumesh", "compile-status.json"), JSON.stringify(status, null, 2), "utf8");
}
