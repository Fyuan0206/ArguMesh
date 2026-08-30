// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("Pi Research Agent mode", () => {
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

  it("lists conversations with piAgentEnabled flag", async () => {
    const response = await app.request(`/api/projects/${projectId}/ai/conversations`, {}, context.bindings);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { piAgentEnabled: boolean; conversations: unknown[] };
    expect(body.piAgentEnabled).toBe(true);
    expect(Array.isArray(body.conversations)).toBe(true);
  });

  it("creates a pi_research conversation", async () => {
    const response = await app.request(
      `/api/projects/${projectId}/ai/conversations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ title: "Pi 多步会话", mode: "pi_research" }),
      },
      context.bindings,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { conversation: { mode: string; title: string } };
    expect(body.conversation.mode).toBe("pi_research");
    expect(body.conversation.title).toBe("Pi 多步会话");
  });

  it("rejects pi_research when ARGUMESH_ENABLE_PI_AGENT=0", async () => {
    const disabled = { ...context.bindings, ARGUMESH_ENABLE_PI_AGENT: "0" };
    const response = await app.request(
      `/api/projects/${projectId}/ai/conversations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ title: "应被拒绝", mode: "pi_research" }),
      },
      disabled,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("PI_AGENT_DISABLED");
  });

  it("returns AI_NOT_CONFIGURED via SSE error when Pi turn has no AI config", async () => {
    const created = await app.request(
      `/api/projects/${projectId}/ai/conversations`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ title: "无密钥 Pi 会话", mode: "pi_research" }),
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
