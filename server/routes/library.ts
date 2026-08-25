import { eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { papers, projectPapers, projects } from "../db/schema";
import type { AppEnv } from "../types";

const paperSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(500),
  authors: z.string().trim().max(1_000).default(""),
  venue: z.string().trim().max(300).default("未发表"),
  year: z.number().int().min(1500).max(2200),
  abstract: z.string().trim().max(20_000).optional(),
  doi: z.string().trim().max(300).optional(),
  arxivId: z.string().trim().max(100).optional(),
  sourceUrl: z.string().url().max(2_000).optional(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

const importSchema = z.object({ value: z.string().trim().min(3).max(2_000) });

export const libraryRoutes = new Hono<AppEnv>();

const projectSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2_000).default(""),
  /** 空串按 null 处理,避免把 "" 写入 DB。 */
  workspacePath: z.union([z.string().trim().min(1).max(1_000), z.null()]).optional(),
});

libraryRoutes.put("/projects/:projectId", async (c) => {
  const parsed = projectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_PROJECT", message: "项目信息不完整" }, 400);
  const db = createDatabase(c.env);
  const id = c.req.param("projectId");
  await db.insert(projects).values({ id, ...parsed.data, createdAt: new Date().toISOString() }).onConflictDoUpdate({ target: projects.id, set: parsed.data });
  return c.json({ id }, 201);
});

function shortName(title: string) {
  return title.replace(/\s*[:—-].*$/, "").trim().slice(0, 80) || title.slice(0, 80);
}

libraryRoutes.put("/projects/:projectId/papers/:paperId", async (c) => {
  const parsed = paperSchema.safeParse({ ...await c.req.json().catch(() => null), id: c.req.param("paperId") });
  if (!parsed.success) return c.json({ error: "INVALID_PAPER", message: "论文元数据不完整", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const projectId = c.req.param("projectId");
  if (!await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()) {
    return c.json({ error: "PROJECT_NOT_FOUND", message: "项目不存在" }, 404);
  }
  const duplicate = await db.select({ id: papers.id }).from(papers).where(or(
    parsed.data.doi ? eq(papers.doi, parsed.data.doi) : eq(papers.id, parsed.data.id),
    parsed.data.arxivId ? eq(papers.arxivId, parsed.data.arxivId) : eq(papers.id, parsed.data.id),
    parsed.data.fileHash ? eq(papers.fileHash, parsed.data.fileHash) : eq(papers.id, parsed.data.id),
  )).get();
  const paperId = duplicate?.id ?? parsed.data.id;
  const row = { ...parsed.data, id: paperId, shortName: shortName(parsed.data.title), createdAt: new Date().toISOString() };
  await db.insert(papers).values(row).onConflictDoUpdate({ target: papers.id, set: {
    title: row.title, shortName: row.shortName, authors: row.authors, venue: row.venue, year: row.year,
    abstract: row.abstract, doi: row.doi, arxivId: row.arxivId, sourceUrl: row.sourceUrl, fileHash: row.fileHash,
  } });
  await db.insert(projectPapers).values({ projectId, paperId, sortOrder: 0 }).onConflictDoNothing();
  return c.json({ paperId, duplicate: Boolean(duplicate) }, duplicate ? 200 : 201);
});

function normalizeDoi(value: string) {
  const match = value.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match?.[0].replace(/[).,;]+$/, "") ?? "";
}

function normalizeArxiv(value: string) {
  const match = value.match(/(?:arxiv(?:\.org\/(?:abs|pdf)\/|:))?((?:\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(?:v\d+)?)/i);
  return match?.[1].replace(/v\d+$/i, "") ?? "";
}

function assertPublicUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("只支持 HTTP/HTTPS 链接");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("不允许读取本机或私网地址");
  }
}

async function fetchPublicHtml(initialUrl: URL) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    assertPublicUrl(url);
    const response = await fetch(url, { redirect: "manual", headers: { accept: "text/html" }, signal: AbortSignal.timeout(12_000) });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    url = new URL(location, url);
  }
  throw new Error("论文链接重定向次数过多");
}

libraryRoutes.post("/literature/resolve", async (c) => {
  const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_IMPORT_VALUE", message: "请输入 DOI、arXiv 编号或论文 URL" }, 400);
  const value = parsed.data.value;
  const doi = normalizeDoi(value);
  if (doi) {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { "user-agent": "PaperIdea/1.0 (mailto:support@paperidea.local)" }, signal: AbortSignal.timeout(12_000) });
    const payload = await response.json().catch(() => null) as { message?: Record<string, unknown> } | null;
    if (!response.ok || !payload?.message) return c.json({ error: "METADATA_NOT_FOUND", message: "Crossref 未找到该 DOI" }, 404);
    const item = payload.message;
    const authors = Array.isArray(item.author) ? item.author.map((author) => {
      const entry = author as { given?: string; family?: string };
      return [entry.given, entry.family].filter(Boolean).join(" ");
    }).filter(Boolean).join(", ") : "";
    const parts = (item.published ?? item.issued) as { "date-parts"?: number[][] } | undefined;
    return c.json({ title: Array.isArray(item.title) ? String(item.title[0] ?? "") : "", authors, venue: Array.isArray(item["container-title"]) ? String(item["container-title"][0] ?? "") : "Crossref", year: parts?.["date-parts"]?.[0]?.[0] ?? new Date().getFullYear(), abstract: typeof item.abstract === "string" ? item.abstract.replace(/<[^>]+>/g, " ") : "", doi, sourceUrl: typeof item.URL === "string" ? item.URL : `https://doi.org/${doi}` });
  }
  const arxivId = normalizeArxiv(value);
  if (arxivId) {
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`, { signal: AbortSignal.timeout(12_000) });
    const xml = await response.text();
    if (!response.ok || !xml.includes("<entry>")) return c.json({ error: "METADATA_NOT_FOUND", message: "arXiv 未找到该编号" }, 404);
    const read = (tag: string) => xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    const authors = [...xml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((match) => match[1].trim()).join(", ");
    return c.json({ title: read("title"), authors, venue: "arXiv", year: Number(read("published").slice(0, 4)) || new Date().getFullYear(), abstract: read("summary"), arxivId, sourceUrl: `https://arxiv.org/abs/${arxivId}` });
  }
  try {
    const url = new URL(value);
    assertPublicUrl(url);
    const response = await fetchPublicHtml(url);
    if (!response.ok) return c.json({ error: "URL_FETCH_FAILED", message: "无法读取该链接" }, 422);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return c.json({ error: "UNSUPPORTED_URL", message: "该链接不是可解析的论文网页" }, 415);
    const html = (await response.text()).slice(0, 2_000_000);
    const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i"))?.[1] ?? "";
    const title = meta("citation_title") || meta("og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/<[^>]+>/g, " ").trim() || "";
    const authors = [...html.matchAll(/<meta[^>]+name=["']citation_author["'][^>]+content=["']([^"']+)["']/gi)].map((match) => match[1]).join(", ") || meta("author");
    return c.json({ title, authors, venue: meta("citation_journal_title") || meta("citation_conference_title") || url.hostname, year: Number((meta("citation_publication_date") || meta("citation_date")).slice(0, 4)) || new Date().getFullYear(), abstract: meta("description") || meta("citation_abstract"), sourceUrl: response.url });
  } catch (error) {
    return c.json({ error: "INVALID_IMPORT_VALUE", message: error instanceof Error ? error.message : "无法识别该导入内容" }, 400);
  }
});
