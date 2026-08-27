// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";
import app from "../../server/index";

describe("research thread aggregation and promotion", () => {
  let context: TestContext;
  const projectId = "thread-project";

  beforeAll(async () => {
    context = await createTestContext();
    await app.request(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: "研究脉络测试", description: "" }),
    }, context.bindings);
    await app.request(`/api/projects/${projectId}/papers/thread-paper`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ title: "Evidence Paper", shortName: "EP", authors: "A", venue: "V", year: 2026 }),
    }, context.bindings);
    await app.request(`/api/projects/${projectId}/knowledge`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ paperId: "thread-paper", kind: "claim", title: "稳定发现", content: "在多个设置下均有效", status: "confirmed" }),
    }, context.bindings);
    await app.request(`/api/projects/${projectId}/gaps`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ paperId: "thread-paper", title: "跨语言证据不足", description: "中文数据尚未验证" }),
    }, context.bindings);
    await app.request(`/api/projects/${projectId}/ideas`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ title: "语言适配构想", summary: "引入语言条件适配层" }),
    }, context.bindings);
  });

  afterAll(() => context.cleanup());

  it("aggregates existing knowledge, gaps, ideas and questions", async () => {
    const response = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      insights: Array<{ type: string; title: string }>;
      researchQuestions: unknown[];
      stats: { insights: number; findings: number; gaps: number; concepts: number };
    };
    expect(payload.insights.map((item) => item.title)).toEqual(expect.arrayContaining(["稳定发现", "跨语言证据不足", "语言适配构想"]));
    expect(payload.stats).toMatchObject({ insights: 3, findings: 1, gaps: 1, concepts: 1 });
    expect(payload.researchQuestions).toHaveLength(0);
  });

  it("promotes an insight once and preserves its origin and paper", async () => {
    const before = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const snapshot = await before.json() as { insights: Array<{ id: string; originType: string; type: string }> };
    const gap = snapshot.insights.find((item) => item.type === "gap");
    expect(gap).toBeDefined();

    const request = {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ question: "该方法在中文数据集上是否仍然有效？", goal: "验证跨语言泛化" }),
    };
    const created = await app.request(`/api/projects/${projectId}/insights/gap/${gap!.id}/promote`, request, context.bindings);
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ created: true, origin: { type: "gap", id: gap!.id } });

    const repeated = await app.request(`/api/projects/${projectId}/insights/gap/${gap!.id}/promote`, request, context.bindings);
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ created: false });

    const response = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const payload = await response.json() as {
      insights: Array<{ id: string; researchQuestionIds: string[] }>;
      researchQuestions: Array<{ question: string; origins: Array<{ type: string; id: string }>; papers: Array<{ paperId: string }> }>;
    };
    expect(payload.researchQuestions).toHaveLength(1);
    expect(payload.researchQuestions[0]).toMatchObject({
      question: "该方法在中文数据集上是否仍然有效？",
      origins: [{ type: "gap", id: gap!.id }],
    });
    expect(payload.researchQuestions[0].papers.map((paper) => paper.paperId)).toContain("thread-paper");
    expect(payload.insights.find((item) => item.id === gap!.id)?.researchQuestionIds).toHaveLength(1);
  });

  it("rejects a source from another project", async () => {
    const response = await app.request(`/api/projects/${projectId}/insights/gap/not-in-project/promote`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ question: "无效问题" }),
    }, context.bindings);
    expect(response.status).toBe(404);
  });
});
