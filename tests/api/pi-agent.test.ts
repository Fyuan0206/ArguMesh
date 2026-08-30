// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("Research Agent (Pi substrate)", () => {
  let context: TestContext;
  const projectId = "pi-agent-project";

  beforeAll(async () => {
    context = await createTestContext();
    await app.request(
      `/api/projects/${projectId}`,
      { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ name: "Pi Agent 项目", description: "" }) },
      context.bindings,
    );
  });

  afterAll(() => context.cleanup());

  it("creates conversations in research_agent mode (legacy aliases normalized)", async () => {
    const created = await app.request(
      `/api/projects/${projectId}/ai/conversations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ title: "研究会话", mode: "pi_research" }),
      },
      context.bindings,
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { conversation: { mode: string; title: string } };
    expect(body.conversation.mode).toBe("research_agent");
    expect(body.conversation.title).toBe("研究会话");

    const listed = await app.request(`/api/projects/${projectId}/ai/conversations`, {}, context.bindings);
    expect(listed.status).toBe(200);
    const list = (await listed.json()) as { conversations: unknown[]; piAgentEnabled?: boolean };
    expect(Array.isArray(list.conversations)).toBe(true);
    expect(list.piAgentEnabled).toBeUndefined();
  });

  it("returns AI_NOT_CONFIGURED via SSE error when turn has no AI config", async () => {
    const created = await app.request(
      `/api/projects/${projectId}/ai/conversations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ title: "无密钥会话" }),
      },
      context.bindings,
    );
    const { conversation } = (await created.json()) as { conversation: { id: string } };
    const response = await app.request(
      `/api/projects/${projectId}/ai/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ content: "请读取项目上下文并总结。" }),
      },
      context.bindings,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: error");
    expect(text).toMatch(/AI_NOT_CONFIGURED|PI_AGENT_FAILED|未配置/);
  });
});
