// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("reader knowledge → research thread", () => {
  let context: TestContext;
  const projectId = "knowledge-bridge-project";
  const paperId = "knowledge-bridge-paper";

  beforeAll(async () => {
    context = await createTestContext();
    await app.request(
      `/api/projects/${projectId}`,
      { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ name: "知识桥接项目", description: "" }) },
      context.bindings,
    );
    await app.request(
      `/api/projects/${projectId}/papers/${paperId}`,
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ title: "桥接论文", authors: "A", venue: "V", year: 2026 }),
      },
      context.bindings,
    );
  });

  afterAll(() => context.cleanup());

  it("persists human evidence into knowledge and surfaces it on the research thread", async () => {
    const created = await app.request(
      `/api/projects/${projectId}/knowledge`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          paperId,
          kind: "evidence",
          title: "阅读器摘录 · 第 3 页",
          content: "遮挡建模显著提升 AP。",
          quote: "遮挡建模显著提升 AP。",
          note: "从 PDF 划选保存",
          page: 3,
          status: "draft",
        }),
      },
      context.bindings,
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { item: { id: string; source: string; kind: string } };
    expect(body.item.source).toBe("human");
    expect(body.item.kind).toBe("evidence");

    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    expect(thread.status).toBe(200);
    const payload = (await thread.json()) as {
      insights: Array<{ id: string; type: string; title: string; originType: string; paperIds: string[] }>;
    };
    expect(payload.insights).toContainEqual(
      expect.objectContaining({
        id: body.item.id,
        originType: "knowledge",
        type: "finding",
        title: "阅读器摘录 · 第 3 页",
        paperIds: [paperId],
      }),
    );
  });
});
