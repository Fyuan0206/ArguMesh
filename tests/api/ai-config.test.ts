// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { bearer, createTestContext, jsonHeaders, type TestContext } from "./helpers";

/**
 * 账户级 AI 配置(设置页表单):存取、密钥掩码、账户隔离、
 * 以及 AI 端点对自定义 baseUrl/key/model 的实际使用(本地假 OpenAI 服务断言)。
 */

let ctx: TestContext;
let fakeAi: Server;
let fakeUrl = "";

interface ReceivedRequest {
  url: string;
  authorization: string;
  model: unknown;
}

let received: ReceivedRequest | null = null;

/** 通过函数读取,避免 TS 把「received = null」之后的直接读取窄化为 never。 */
function lastReceived(): ReceivedRequest | null {
  return received;
}

function translateBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ text: "Hello world, this is a test.", targetLanguage: "中文", paperTitle: "测试论文", page: 1, ...overrides });
}

beforeAll(async () => {
  ctx = await createTestContext();
  fakeAi = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const body = JSON.parse(raw || "{}") as { model?: unknown };
      received = { url: request.url ?? "", authorization: request.headers.authorization ?? "", model: body.model };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: "你好" } }] }));
    });
  });
  await new Promise<void>((resolve) => fakeAi.listen(0, "127.0.0.1", resolve));
  fakeUrl = `http://127.0.0.1:${(fakeAi.address() as AddressInfo).port}/v1`;
});

afterAll(() => {
  ctx.cleanup();
  fakeAi.close();
});

describe("AI 配置 API", () => {
  it("未登录时 401", async () => {
    const response = await app.request("http://localhost/api/ai/config", { headers: { "content-type": "application/json" } }, ctx.bindings);
    expect(response.status).toBe(401);
  });

  it("未配置时返回空配置", async () => {
    const response = await app.request("http://localhost/api/ai/config", { headers: bearer(ctx.researcherToken) }, ctx.bindings);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({ configured: false, baseUrl: "", model: "", apiKeyMasked: null });
    expect(payload.envProviders).toEqual([]);
  });

  it("保存配置:baseUrl 规范化、密钥只回传掩码", async () => {
    const response = await app.request(
      "http://localhost/api/ai/config",
      {
        method: "PUT",
        headers: jsonHeaders(ctx.adminToken),
        body: JSON.stringify({ baseUrl: `${fakeUrl}/`, apiKey: "sk-test-abc1234567", model: "test-model-x" }),
      },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { configured: boolean; baseUrl: string; model: string; apiKeyMasked: string | null };
    expect(payload).toMatchObject({ configured: true, baseUrl: fakeUrl, model: "test-model-x", apiKeyMasked: "sk-…4567" });
    expect(JSON.stringify(payload)).not.toContain("sk-test-abc1234567");
  });

  it("账户隔离:其他账户看不到该配置", async () => {
    const response = await app.request("http://localhost/api/ai/config", { headers: bearer(ctx.researcherToken) }, ctx.bindings);
    const payload = (await response.json()) as { configured: boolean; apiKeyMasked: string | null };
    expect(payload).toMatchObject({ configured: false, apiKeyMasked: null });
  });

  it("AI 端点使用账户配置的 baseUrl/key/model,忽略客户端传来的 model", async () => {
    received = null;
    const response = await app.request(
      "http://localhost/api/reader/translate",
      {
        method: "POST",
        headers: jsonHeaders(ctx.adminToken),
        body: translateBody({ model: "evil-model" }),
      },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    expect(lastReceived()).toMatchObject({ url: "/v1/chat/completions", authorization: "Bearer sk-test-abc1234567", model: "test-model-x" });
  });

  it("保存时留空 API Key = 保留已保存的密钥", async () => {
    const put = await app.request(
      "http://localhost/api/ai/config",
      {
        method: "PUT",
        headers: jsonHeaders(ctx.adminToken),
        body: JSON.stringify({ baseUrl: fakeUrl, apiKey: "", model: "test-model-x" }),
      },
      ctx.bindings,
    );
    expect(put.status).toBe(200);
    const payload = (await put.json()) as { apiKeyMasked: string };
    expect(payload.apiKeyMasked).toBe("sk-…4567");

    received = null;
    const translate = await app.request("http://localhost/api/reader/translate", { method: "POST", headers: jsonHeaders(ctx.adminToken), body: translateBody() }, ctx.bindings);
    expect(translate.status).toBe(200);
    const seen: ReceivedRequest | null = lastReceived();
    expect(seen?.authorization).toBe("Bearer sk-test-abc1234567");
  });

  it("首次保存缺 API Key → 400", async () => {
    const response = await app.request(
      "http://localhost/api/ai/config",
      {
        method: "PUT",
        headers: jsonHeaders(ctx.researcherToken),
        body: JSON.stringify({ baseUrl: fakeUrl, apiKey: "", model: "test-model-x" }),
      },
      ctx.bindings,
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { message: string };
    expect(payload.message).toContain("API Key");
  });

  it("非法 baseUrl → 400", async () => {
    const response = await app.request(
      "http://localhost/api/ai/config",
      {
        method: "PUT",
        headers: jsonHeaders(ctx.adminToken),
        body: JSON.stringify({ baseUrl: "not-a-url", apiKey: "sk-x", model: "m" }),
      },
      ctx.bindings,
    );
    expect(response.status).toBe(400);
  });

  it("配置缺模型时 AI 端点明确报错(400)", async () => {
    await app.request(
      "http://localhost/api/ai/config",
      { method: "PUT", headers: jsonHeaders(ctx.researcherToken), body: JSON.stringify({ baseUrl: fakeUrl, apiKey: "sk-researcher-key", model: "" }) },
      ctx.bindings,
    );
    const response = await app.request("http://localhost/api/reader/translate", { method: "POST", headers: jsonHeaders(ctx.researcherToken), body: translateBody() }, ctx.bindings);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe("AI_NOT_CONFIGURED");
    expect(payload.message).toContain("模型名称");
  });

  it("完全未配置时 AI 端点返回 400 提示去设置页", async () => {
    await app.request("http://localhost/api/ai/config", { method: "DELETE", headers: bearer(ctx.researcherToken) }, ctx.bindings);
    const response = await app.request("http://localhost/api/reader/translate", { method: "POST", headers: jsonHeaders(ctx.researcherToken), body: translateBody() }, ctx.bindings);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string; message: string };
    expect(payload.error).toBe("AI_NOT_CONFIGURED");
    expect(payload.message).toContain("设置页");
  });

  it("清除配置后回到未配置状态", async () => {
    const del = await app.request("http://localhost/api/ai/config", { method: "DELETE", headers: bearer(ctx.adminToken) }, ctx.bindings);
    expect(del.status).toBe(200);
    const get = await app.request("http://localhost/api/ai/config", { headers: bearer(ctx.adminToken) }, ctx.bindings);
    const payload = (await get.json()) as { configured: boolean; apiKeyMasked: string | null };
    expect(payload).toMatchObject({ configured: false, apiKeyMasked: null });
  });

  it("未保存账户配置时回落到环境变量厂商", async () => {
    const previous = {
      baseUrl: ctx.bindings.STEPFUN_BASE_URL,
      apiKey: ctx.bindings.STEPFUN_API_KEY,
      model: ctx.bindings.STEPFUN_MODEL,
    };
    ctx.bindings.STEPFUN_BASE_URL = fakeUrl;
    ctx.bindings.STEPFUN_API_KEY = "env-key-123";
    ctx.bindings.STEPFUN_MODEL = "env-model-x";
    try {
      received = null;
      const response = await app.request("http://localhost/api/reader/translate", { method: "POST", headers: jsonHeaders(ctx.researcherToken), body: translateBody() }, ctx.bindings);
      expect(response.status).toBe(200);
      expect(lastReceived()).toMatchObject({ url: "/v1/chat/completions", authorization: "Bearer env-key-123", model: "env-model-x" });
    } finally {
      ctx.bindings.STEPFUN_BASE_URL = previous.baseUrl;
      ctx.bindings.STEPFUN_API_KEY = previous.apiKey;
      ctx.bindings.STEPFUN_MODEL = previous.model;
    }
  });
});
