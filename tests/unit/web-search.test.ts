// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AppBindings } from "../../server/types";
import { isWebSearchConfigured, resolveSearxngBaseUrl, searchWeb } from "../../server/services/web-search";

const baseEnv: AppBindings = {
  DATABASE_URL: "file:./data/test.db",
};

describe("web-search / SearXNG", () => {
  it("reports not configured when SEARXNG_BASE_URL is missing", async () => {
    expect(isWebSearchConfigured(baseEnv)).toBe(false);
    const result = await searchWeb(baseEnv, { query: "agent memory" });
    expect(result).toMatchObject({ ok: false, code: "WEB_SEARCH_NOT_CONFIGURED" });
  });

  it("rejects non-http base URLs", () => {
    expect(resolveSearxngBaseUrl("ftp://example.com")).toBeNull();
    expect(resolveSearxngBaseUrl("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
  });

  it("parses SearXNG JSON hits", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: "HyperMem",
              url: "https://arxiv.org/abs/2604.08256",
              content: "Hypergraph memory for agents",
              engine: "arxiv",
            },
            { title: "bad", url: "javascript:alert(1)", content: "x" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await searchWeb(
      { ...baseEnv, SEARXNG_BASE_URL: "http://127.0.0.1:8080" },
      { query: "hypergraph memory", maxResults: 5 },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe("searxng");
    expect(result.hits).toEqual([
      {
        title: "HyperMem",
        url: "https://arxiv.org/abs/2604.08256",
        snippet: "Hypergraph memory for agents",
        engine: "arxiv",
        publishedDate: undefined,
      },
    ]);
    expect(fetchImpl).toHaveBeenCalled();
    const firstCall = fetchImpl.mock.calls[0] as unknown as [unknown] | undefined;
    const calledUrl = String(firstCall?.[0] ?? "");
    expect(calledUrl).toContain("format=json");
    expect(calledUrl).toContain("q=hypergraph");
  });

  it("maps HTTP failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    const result = await searchWeb(
      { ...baseEnv, SEARXNG_BASE_URL: "http://127.0.0.1:8080" },
      { query: "test" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toMatchObject({ ok: false, code: "WEB_SEARCH_FAILED" });
  });
});
