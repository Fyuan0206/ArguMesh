// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(() => {
  ctx.cleanup();
});

const askBody = {
  paper: { id: "reader-paper", title: "测试论文", authors: "测试作者", year: 2024 },
  page: 1,
  selection: "这是被选中的论文原文片段,足够长以便通过校验。",
  question: "这段话的核心观点是什么?",
};

describe("POST /api/reader/ask (no AI configured)", () => {
  it("returns 400 with a clear message when AI is not configured", async () => {
    const response = await app.request(
      "http://localhost/api/reader/ask",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify(askBody) },
      ctx.bindings,
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string; message?: string };
    expect(payload.error).toBe("AI_NOT_CONFIGURED");
    expect(payload.message).toContain("设置页");
  });

  it("rate-limits repeated asks within the cooldown window", async () => {
    // 用 researcher 的 token,避免与前一个用例(admin)共享限流键。
    // 先保存一份配置(指向不可达地址,请求快速失败),让请求通过配置解析、真正进入限流阶段。
    await app.request(
      "http://localhost/api/ai/config",
      { method: "PUT", headers: jsonHeaders(ctx.researcherToken), body: JSON.stringify({ baseUrl: "http://127.0.0.1:1/v1", apiKey: "sk-rate-limit", model: "test-model" }) },
      ctx.bindings,
    );
    const first = await app.request(
      "http://localhost/api/reader/ask",
      { method: "POST", headers: jsonHeaders(ctx.researcherToken), body: JSON.stringify(askBody) },
      ctx.bindings,
    );
    expect(first.status).toBe(502);
    const second = await app.request(
      "http://localhost/api/reader/ask",
      { method: "POST", headers: jsonHeaders(ctx.researcherToken), body: JSON.stringify(askBody) },
      ctx.bindings,
    );
    expect(second.status).toBe(429);
    const payload = (await second.json()) as { error?: string };
    expect(payload.error).toBe("READER_AI_RATE_LIMITED");
  });

  it("rejects empty selection without fullText with 400", async () => {
    const response = await app.request(
      "http://localhost/api/reader/ask",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ ...askBody, selection: "" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(400);
  });
});
