import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

export interface ParserProgress {
  stage: "queued" | "starting" | "downloading" | "parsing";
  completed: number;
  total: number;
}

const downloadProgress = z.object({ stage: z.enum(["downloading", "ready"]), completed: z.number().int().min(0).max(7), total: z.literal(7) });
let preparedRuntime = "";

export function mineruDataDirectory(): string {
  return process.env.ARGUMESH_DATA_DIR ? resolve(process.env.ARGUMESH_DATA_DIR, "data") : resolve("data");
}

export function resolveMineruRuntime(): string | null {
  const configured = process.env.ARGUMESH_MINERU_RUNTIME;
  const directory = configured ? resolve(configured) : resolve("build", "mineru-runtime");
  if (existsSync(join(directory, "python.exe")) && existsSync(join(directory, "runner.py")) && existsSync(join(directory, "runtime.json"))) return directory;
  if (configured || process.env.ARGUMESH_DESKTOP === "1") throw new Error("安装包中的解析环境不完整，请重新下载安装 ArguMesh。");
  return null;
}

/** Read only our fixed progress protocol. PDF-derived text and dependency logs never enter the UI. */
export function parseMineruProgress(line: string): ParserProgress | null {
  const prefix = "ARGUMESH_MINERU=";
  if (!line.startsWith(prefix)) return null;
  const parsed = downloadProgress.safeParse((() => { try { return JSON.parse(line.slice(prefix.length)); } catch { return null; } })());
  if (!parsed.success || parsed.data.completed > parsed.data.total) return null;
  return { stage: "downloading", completed: parsed.data.completed, total: parsed.data.total };
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal, timeoutMs: number, preparing: boolean, progress: (value: ParserProgress) => void): Promise<void> {
  if (signal.aborted) throw new Error("本地解析已取消");
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env });
    let stopped: string | null = null;
    let pending = "";
    const stop = (message: string) => {
      if (stopped) return;
      stopped = message;
      if (process.platform === "win32" && child.pid) {
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => child.kill());
      } else child.kill();
    };
    const onAbort = () => stop("本地解析已取消");
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    const timer = setTimeout(() => stop(preparing ? "模型下载超时，请检查网络后继续翻译。" : "本地解析超时，请重试。"), timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); };
    child.stdout?.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop()?.slice(-4096) ?? "";
      for (const line of lines) {
        const value = parseMineruProgress(line);
        if (value) progress(value);
      }
    });
    // Drain stderr to prevent a full pipe from blocking downloads; no document text is logged.
    child.stderr?.on("data", () => {});
    child.once("error", (error: NodeJS.ErrnoException) => {
      cleanup();
      reject(error.code === "ENOENT" ? new Error("未找到本机 MinerU。源码运行请先构建解析环境；桌面版请更新安装包。") : new Error("无法启动本地解析环境，请重新安装。"));
    });
    // Wait for process closure before callers remove its temporary PDF directory.
    child.once("close", (code) => {
      cleanup();
      if (stopped) reject(new Error(stopped));
      else if (code === 0) done();
      else reject(new Error(preparing ? "解析模型下载失败，请检查网络和磁盘空间后继续翻译；已下载文件会复用。" : `本地 MinerU 解析失败（退出码 ${code ?? "未知"}），请重试。`));
    });
  });
}

export async function runMineruCommand(args: string[], signal: AbortSignal, progress: (value: ParserProgress) => void): Promise<void> {
  const runtime = resolveMineruRuntime();
  if (!runtime) {
    progress({ stage: "parsing", completed: 0, total: 0 });
    return run(process.platform === "win32" ? "mineru.exe" : "mineru", args, process.env, signal, 600_000, false, progress);
  }
  const models = join(mineruDataDirectory(), "mineru-models");
  await mkdir(models, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HF_HOME: join(models, "huggingface"), MODELSCOPE_CACHE: join(models, "modelscope"), MINERU_TOOLS_CONFIG_JSON: join(models, "mineru.json"), MINERU_DEVICE_MODE: "cpu", PYTHONUTF8: "1", PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1", MINERU_MODEL_SOURCE: "modelscope" };
  // Parser children do not need the application's AI credentials.
  for (const key of Object.keys(env)) if (/API_KEY|AUTH_TOKEN|AI_PROVIDERS/.test(key)) delete env[key];
  const python = join(runtime, "python.exe");
  const runner = join(runtime, "runner.py");
  const identity = `${runtime}\n${models}`;
  if (preparedRuntime !== identity) {
    progress({ stage: "starting", completed: 0, total: 7 });
    await run(python, ["-I", runner, "prepare"], env, signal, 1_800_000, true, progress);
    preparedRuntime = identity;
  }
  progress({ stage: "parsing", completed: 7, total: 7 });
  try {
    await run(python, ["-I", runner, "parse", ...args], { ...env, MINERU_MODEL_SOURCE: "local" }, signal, 600_000, false, progress);
  } catch (error) {
    preparedRuntime = "";
    throw error;
  }
}
