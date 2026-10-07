import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface ParsedPageBlock {
  kind: "paragraph" | "heading" | "table" | "image" | "formula";
  text: string;
  column: "full" | 0 | 1;
  html?: string;
  image?: string;
  imageHash?: string;
}

export interface ParsedPage {
  parser: "MinerU";
  columns: 1 | 2;
  blocks: ParsedPageBlock[];
}

type ContentPart = { type?: unknown; content?: unknown };
type ContentBlock = { type?: unknown; content?: Record<string, unknown>; bbox?: unknown };

const cacheDirectory = resolve("data", "mineru-cache");
const inFlight = new Map<string, { promise: Promise<ParsedPage>; controller: AbortController }>();
let parseQueue: Promise<unknown> = Promise.resolve();

function cachedPath(pdf: Uint8Array, page: number): string {
  const digest = createHash("sha256").update(pdf).digest("hex");
  return join(cacheDirectory, `${digest}-p${page}-v1.json`);
}

export async function getCachedPaperPage(pdf: Uint8Array, page: number): Promise<ParsedPage | null> {
  const existing = await readFile(cachedPath(pdf, page), "utf8").then((text) => JSON.parse(text) as ParsedPage).catch(() => null);
  return existing?.parser === "MinerU" && Array.isArray(existing.blocks) ? existing : null;
}

function partsText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((part: ContentPart) => typeof part?.content === "string" ? part.content : "").join(" ").replace(/\s+/g, " ").trim();
}

function imagePath(content: Record<string, unknown>): string | null {
  const source = content.image_source;
  if (!source || typeof source !== "object") return null;
  const path = (source as { path?: unknown }).path;
  return typeof path === "string" && /^images\/[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(path) ? path : null;
}

async function imageData(content: Record<string, unknown>, outputDir: string): Promise<{ image?: string; imageHash?: string }> {
  const path = imagePath(content);
  if (!path) return {};
  const bytes = await readFile(join(outputDir, path)).catch(() => null);
  if (!bytes || bytes.byteLength > 5_000_000) return {};
  const ext = path.split(".").at(-1)?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { image: `data:${mime};base64,${bytes.toString("base64")}`, imageHash: createHash("sha256").update(bytes).digest("hex") };
}

function blockColumn(bbox: unknown): "full" | 0 | 1 {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((value) => typeof value === "number")) return "full";
  return bbox[2] <= 510 ? 0 : bbox[0] >= 490 ? 1 : "full";
}

/** MinerU output is untrusted PDF-derived data. Only plain text, a table string parsed without injection, and bounded local images leave this boundary. */
export async function normalizeMineruPage(raw: unknown, outputDir: string): Promise<ParsedPage> {
  const page = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
  if (!Array.isArray(page)) throw new Error("MinerU 未返回当前页结构");
  const blocks: ParsedPageBlock[] = [];
  for (const entry of page as ContentBlock[]) {
    const content = entry?.content;
    if (!content || typeof content !== "object") continue;
    const type = entry.type;
    const column = blockColumn(entry.bbox);
    if (type === "paragraph" || type === "title" || type === "page_footnote" || type === "list") {
      const text = partsText(content.paragraph_content ?? content.title_content ?? content.page_footnote_content ?? content.list_content);
      if (text) blocks.push({ kind: type === "title" ? "heading" : "paragraph", text, column });
      continue;
    }
    if (type === "table") {
      const caption = partsText(content.table_caption);
      const html = typeof content.html === "string" && content.html.length <= 60_000 ? content.html : "";
      if (html) blocks.push({ kind: "table", text: caption, html, column, ...await imageData(content, outputDir) });
      else if (caption) blocks.push({ kind: "paragraph", text: caption, column });
      continue;
    }
    if (type === "image" || type === "chart") {
      blocks.push({ kind: "image", text: partsText(content.image_caption ?? content.chart_caption), column, ...await imageData(content, outputDir) });
      continue;
    }
    if (type === "equation" || type === "equation_interline" || type === "interline_equation" || type === "formula") {
      const text = typeof content.math_content === "string" ? content.math_content : typeof content.content === "string" ? content.content : partsText(content.equation_content);
      blocks.push({ kind: "formula", text, column, ...await imageData(content, outputDir) });
    }
  }
  if (!blocks.length) throw new Error("MinerU 未识别出当前页内容");
  return { parser: "MinerU", columns: blocks.some((block) => block.column === 0) && blocks.some((block) => block.column === 1) ? 2 : 1, blocks };
}

async function findContentList(directory: string, depth = 0): Promise<string | null> {
  if (depth > 4) return null;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith("_content_list_v2.json")) return path;
    if (entry.isDirectory()) {
      const nested = await findContentList(path, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

async function runMineru(pdf: Uint8Array, page: number, signal: AbortSignal): Promise<ParsedPage> {
  if (signal.aborted) throw new Error("本地解析已取消");
  const directory = await mkdtemp(join(tmpdir(), "argumesh-mineru-"));
  try {
    const input = join(directory, "paper.pdf");
    const output = join(directory, "output");
    await writeFile(input, pdf);
    await mkdir(output);
    await new Promise<void>((done, reject) => {
      const command = process.platform === "win32" ? "mineru.exe" : "mineru";
      const child = spawn(command, ["-p", input, "-o", output, "-s", String(page - 1), "-e", String(page - 1), "-b", "pipeline", "-m", "auto", "-f", "true", "-t", "true"], { windowsHide: true, stdio: "ignore" });
      const stop = () => {
        if (process.platform === "win32" && child.pid) spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        else child.kill();
      };
      const onAbort = () => { stop(); reject(new Error("本地解析已取消")); };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      const timer = setTimeout(() => { stop(); reject(new Error("本地 MinerU 解析超时（3 分钟）")); }, 180_000);
      child.once("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(error.code === "ENOENT" ? new Error("未找到本机 MinerU。请先安装 MinerU 3.x 并加入 PATH；划词翻译与原文阅读仍可使用。") : error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        if (code === 0) done();
        else reject(new Error(`本地 MinerU 解析失败（退出码 ${code ?? "未知"}）`));
      });
    });
    const contentList = await findContentList(output);
    if (!contentList) throw new Error("MinerU 未生成结构化结果");
    const raw = JSON.parse(await readFile(contentList, "utf8")) as unknown;
    return await normalizeMineruPage(raw, resolve(contentList, ".."));
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

/** Only the requested page is analyzed. Cache is keyed by PDF bytes, so replacing a file cannot reuse stale cells. */
export async function parsePaperPageLocally(pdf: Uint8Array, page: number): Promise<ParsedPage> {
  const cached = cachedPath(pdf, page);
  const key = cached;
  const existing = await getCachedPaperPage(pdf, page);
  if (existing) return existing;
  const current = inFlight.get(key);
  if (current) return current.promise;
  const controller = new AbortController();
  const work = parseQueue.catch(() => {}).then(async () => {
    const result = await runMineru(pdf, page, controller.signal);
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cached, JSON.stringify(result), "utf8");
    return result;
  });
  parseQueue = work;
  inFlight.set(key, { promise: work, controller });
  try { return await work; }
  finally { inFlight.delete(key); }
}

export function cancelPaperPageParsing(pdf: Uint8Array, page: number): boolean {
  const active = inFlight.get(cachedPath(pdf, page));
  if (!active) return false;
  active.controller.abort();
  return true;
}
