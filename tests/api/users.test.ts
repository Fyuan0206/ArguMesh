// @vitest-environment node
import { createClient } from "@libsql/client";
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

describe("GET /api/users", () => {
  it("lists all users for admin", async () => {
    const response = await app.request("http://localhost/api/users", { headers: bearer(ctx.adminToken) }, ctx.bindings);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { users: Array<{ name: string; role: string }> };
    expect(payload.users.map((u) => u.name)).toEqual(expect.arrayContaining(["admin", "researcher"]));
  });

  it("returns 403 for a researcher", async () => {
    const response = await app.request("http://localhost/api/users", { headers: bearer(ctx.researcherToken) }, ctx.bindings);
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("FORBIDDEN");
  });
});

describe("POST /api/users", () => {
  it("creates a researcher account", async () => {
    const response = await app.request(
      "http://localhost/api/users",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ name: "zhang-san", password: "zhang123456" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { user: { name: string; role: string } };
    expect(payload.user).toMatchObject({ name: "zhang-san", role: "researcher" });
    const login = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "zhang-san", password: "zhang123456" }) },
      ctx.bindings,
    );
    expect(login.status).toBe(200);
  });

  it("rejects duplicate names with 409", async () => {
    const response = await app.request(
      "http://localhost/api/users",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ name: "admin", password: "whatever123" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("USER_EXISTS");
  });

  it("rejects passwords shorter than 6 chars with 400", async () => {
    const response = await app.request(
      "http://localhost/api/users",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ name: "short-pass", password: "12345" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(400);
  });

  it("returns 403 for a researcher", async () => {
    const response = await app.request(
      "http://localhost/api/users",
      { method: "POST", headers: jsonHeaders(ctx.researcherToken), body: JSON.stringify({ name: "hacker", password: "hacker123" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/users/:userId", () => {
  it("changes role and resets password", async () => {
    const created = await app.request(
      "http://localhost/api/users",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ name: "promotable", password: "promote123" }) },
      ctx.bindings,
    );
    const { user } = (await created.json()) as { user: { id: string } };

    const promoted = await app.request(
      `http://localhost/api/users/${user.id}`,
      { method: "PATCH", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ role: "admin", password: "new-pass-123" }) },
      ctx.bindings,
    );
    expect(promoted.status).toBe(200);
    const payload = (await promoted.json()) as { user: { role: string } };
    expect(payload.user.role).toBe("admin");

    const oldLogin = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "promotable", password: "promote123" }) },
      ctx.bindings,
    );
    expect(oldLogin.status).toBe(401);
    const newLogin = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "promotable", password: "new-pass-123" }) },
      ctx.bindings,
    );
    expect(newLogin.status).toBe(200);
  });

  it("returns 404 for unknown users", async () => {
    const response = await app.request(
      "http://localhost/api/users/does-not-exist",
      { method: "PATCH", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ role: "admin" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/users/:userId", () => {
  it("refuses to delete the current account", async () => {
    const listed = await app.request("http://localhost/api/users", { headers: bearer(ctx.adminToken) }, ctx.bindings);
    const { users } = (await listed.json()) as { users: Array<{ id: string; name: string }> };
    const admin = users.find((u) => u.name === "admin")!;
    const response = await app.request(`http://localhost/api/users/${admin.id}`, { method: "DELETE", headers: bearer(ctx.adminToken) }, ctx.bindings);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("CANNOT_DELETE_SELF");
  });

  it("deletes a user together with their data", async () => {
    const created = await app.request(
      "http://localhost/api/users",
      { method: "POST", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ name: "temp-user", password: "temp123456" }) },
      ctx.bindings,
    );
    const { user } = (await created.json()) as { user: { id: string; name: string } };

    const login = await app.request(
      "http://localhost/api/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "temp-user", password: "temp123456" }) },
      ctx.bindings,
    );
    const { token } = (await login.json()) as { token: string };
    const project = await app.request(
      "http://localhost/api/projects/temp-project",
      { method: "PUT", headers: jsonHeaders(token), body: JSON.stringify({ id: "temp-project", name: "临时项目" }) },
      ctx.bindings,
    );
    expect(project.status).toBeLessThan(300);

    const deleted = await app.request(`http://localhost/api/users/${user.id}`, { method: "DELETE", headers: bearer(ctx.adminToken) }, ctx.bindings);
    expect(deleted.status).toBe(200);

    const after = await app.request("http://localhost/api/projects", { headers: bearer(token) }, ctx.bindings);
    expect(after.status).toBe(401);

    const client = createClient({ url: ctx.dbUrl });
    const rows = await client.execute({ sql: "SELECT COUNT(*) AS count FROM projects WHERE owner_id = ?", args: [user.id] });
    client.close();
    expect(Number(rows.rows[0]?.count ?? -1)).toBe(0);
  });
});
