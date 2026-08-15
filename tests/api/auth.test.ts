// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { bearer, createTestContext, jsonHeaders, type TestContext } from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(() => {
  ctx.cleanup();
});

describe("POST /api/login", () => {
  it("logs in the default admin with admin role", async () => {
    const response = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "admin", password: "admin123" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { token: string; user: { id: string; name: string; role: string } };
    expect(payload.token.length).toBeGreaterThan(0);
    expect(payload.user).toMatchObject({ name: "admin", role: "admin" });
  });

  it("logs in a researcher with researcher role", async () => {
    const response = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "researcher", password: "researcher123" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { user: { role: string } };
    expect(payload.user.role).toBe("researcher");
  });

  it("rejects wrong password with 401 and a generic message", async () => {
    const response = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "admin", password: "wrong-pass" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { message?: string };
    expect(payload.message).toBe("用户名或密码不正确");
  });

  it("rejects unknown user with 401", async () => {
    const response = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "nobody", password: "admin123" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(401);
  });

  it("trims surrounding whitespace on the name", async () => {
    const response = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "  admin  ", password: "admin123" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
  });

  it("rejects missing fields with 400", async () => {
    const response = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "admin" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(400);
  });

  it("rejects non-JSON body with 400", async () => {
    const response = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: "not json" },
      ctx.bindings,
    );
    expect(response.status).toBe(400);
  });
});

describe("global auth gate", () => {
  it("returns 401 on protected routes without a bearer token", async () => {
    const response = await app.request("http://localhost/api/projects", {}, ctx.bindings);
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("UNAUTHORIZED");
  });

  it("rejects a garbage token with 401", async () => {
    const response = await app.request("http://localhost/api/projects", { headers: bearer("not-a-real-token") }, ctx.bindings);
    expect(response.status).toBe(401);
  });

  it("accepts a valid admin session token", async () => {
    const response = await app.request("http://localhost/api/projects", { headers: bearer(ctx.adminToken) }, ctx.bindings);
    expect(response.status).toBe(200);
  });

  it("rejects the token of a deleted account", async () => {
    const created = await app.request(
      "http://localhost/api/users",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ name: "doomed", password: "doomed123" }) },
      ctx.bindings,
    );
    expect(created.status).toBe(201);
    const { user } = (await created.json()) as { user: { id: string } };
    const login = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "doomed", password: "doomed123" }) },
      ctx.bindings,
    );
    const { token } = (await login.json()) as { token: string };
    const deleted = await app.request(`http://localhost/api/users/${user.id}`, { method: "DELETE", headers: bearer(ctx.adminToken) }, ctx.bindings);
    expect(deleted.status).toBe(200);
    const after = await app.request("http://localhost/api/projects", { headers: bearer(token) }, ctx.bindings);
    expect(after.status).toBe(401);
  });
});
