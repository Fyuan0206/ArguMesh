// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, type TestContext } from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(() => {
  ctx.cleanup();
});

describe("GET /api/health", () => {
  it("is public and reports the local SQLite database", async () => {
    const response = await app.request("http://localhost/api/health", {}, ctx.bindings);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean; database: string; storage: string; models: string[]; providers: unknown[] };
    expect(payload.ok).toBe(true);
    expect(payload.database).toBe("sqlite");
    expect(payload.storage).toBe("database");
    // 测试环境未配置 AI:模型与厂商列表应为空。
    expect(payload.models).toEqual([]);
    expect(payload.providers).toEqual([]);
  });
});
