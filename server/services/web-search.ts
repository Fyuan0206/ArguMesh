/**
 * Optional web search via self-hosted SearXNG JSON API.
 * Inspired by sxng-cli; called in-process from Pi tools (no shell/CLI).
 */
import type { AppBindings } from "../types";

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  publishedDate?: string;
}

export interface WebSearchSuccess {
  ok: true;
  provider: "searxng";
  query: string;
  hits: WebSearchHit[];
}

export interface WebSearchFailure {
  ok: false;
  code: "WEB_SEARCH_NOT_CONFIGURED" | "WEB_SEARCH_INVALID_URL" | "WEB_SEARCH_FAILED" | "WEB_SEARCH_TIMEOUT";
  message: string;
}

export type WebSearchResult = WebSearchSuccess | WebSearchFailure;

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESULTS = 10;

export function isWebSearchConfigured(env: AppBindings): boolean {
  return Boolean(env.SEARXNG_BASE_URL?.trim());
}

export function resolveSearxngBaseUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function clampMaxResults(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.min(MAX_RESULTS, Math.max(1, Math.floor(value)));
}

function truncate(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

type SearxngJson = {
  results?: Array<{
    title?: unknown;
    url?: unknown;
    content?: unknown;
    engine?: unknown;
    publishedDate?: unknown;
  }>;
};

export async function searchWeb(
  env: AppBindings,
  input: {
    query: string;
    maxResults?: number;
    /** SearXNG categories, e.g. "general" | "science" | "it" */
    categories?: string;
    language?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<WebSearchResult> {
  const query = input.query.trim();
  if (!query) {
    return { ok: false, code: "WEB_SEARCH_FAILED", message: "搜索词不能为空" };
  }

  const configured = env.SEARXNG_BASE_URL?.trim();
  if (!configured) {
    return {
      ok: false,
      code: "WEB_SEARCH_NOT_CONFIGURED",
      message:
        "未配置网页搜索。请在 .env 设置 SEARXNG_BASE_URL 指向自托管 SearXNG（需启用 formats.json），然后重启 API。",
    };
  }

  const baseUrl = resolveSearxngBaseUrl(configured);
  if (!baseUrl) {
    return {
      ok: false,
      code: "WEB_SEARCH_INVALID_URL",
      message: "SEARXNG_BASE_URL 无效：需要 http(s) 地址，例如 http://127.0.0.1:8080",
    };
  }

  const maxResults = clampMaxResults(input.maxResults);
  const timeoutMs = Math.min(
    60_000,
    Math.max(3_000, Number(env.SEARXNG_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
  );

  const params = new URLSearchParams({
    q: query.slice(0, 300),
    format: "json",
    pageno: "1",
  });
  if (input.categories?.trim()) params.set("categories", input.categories.trim().slice(0, 80));
  if (input.language?.trim()) params.set("language", input.language.trim().slice(0, 16));

  const endpoint = `${baseUrl}/search?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "ArguMesh-ResearchAgent/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "WEB_SEARCH_FAILED",
        message: `SearXNG 返回 HTTP ${response.status}。请确认实例可访问且启用了 JSON 格式。`,
      };
    }

    const payload = (await response.json()) as SearxngJson;
    const hits: WebSearchHit[] = [];
    for (const row of payload.results ?? []) {
      const title = typeof row.title === "string" ? truncate(row.title, 240) : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      if (!title || !url || !/^https?:\/\//i.test(url)) continue;
      hits.push({
        title,
        url: url.slice(0, 2_000),
        snippet: typeof row.content === "string" ? truncate(row.content, 500) : "",
        engine: typeof row.engine === "string" ? row.engine.slice(0, 80) : undefined,
        publishedDate: typeof row.publishedDate === "string" ? row.publishedDate.slice(0, 40) : undefined,
      });
      if (hits.length >= maxResults) break;
    }

    return { ok: true, provider: "searxng", query, hits };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        code: "WEB_SEARCH_TIMEOUT",
        message: `SearXNG 请求超时（${timeoutMs}ms）。请检查实例是否在线。`,
      };
    }
    return {
      ok: false,
      code: "WEB_SEARCH_FAILED",
      message: error instanceof Error ? error.message.slice(0, 300) : "网页搜索失败",
    };
  } finally {
    clearTimeout(timer);
  }
}
