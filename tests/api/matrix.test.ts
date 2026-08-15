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

const PROJECT_ID = "matrix-project-1";
const PAPER_ID = "matrix-paper-1";
const MATRIX_ID = "matrix-1";
const EVIDENCE_ID = `${MATRIX_ID}:dim-1:${PAPER_ID}`;

describe("evidence matrix workflow", () => {
  it("creates a project and syncs a paper into it", async () => {
    const project = await app.request(
      `http://localhost/api/projects/${PROJECT_ID}`,
      { method: "PUT", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ id: PROJECT_ID, name: "矩阵测试项目" }) },
      ctx.bindings,
    );
    expect(project.status).toBeLessThan(300);

    const paper = await app.request(
      `http://localhost/api/projects/${PROJECT_ID}/papers/${PAPER_ID}`,
      { method: "PUT", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ id: PAPER_ID, title: "测试论文", authors: "测试作者", venue: "测试会议", year: 2024 }) },
      ctx.bindings,
    );
    expect(paper.status).toBeLessThan(300);
  });

  it("creates a matrix with dimensions and placeholder evidence cells", async () => {
    const created = await app.request(
      `http://localhost/api/matrices/${MATRIX_ID}`,
      {
        method: "PUT",
        headers: jsonHeaders(ctx.adminToken),
        body: JSON.stringify({
          id: MATRIX_ID,
          projectId: PROJECT_ID,
          name: "测试矩阵",
          description: "",
          paperIds: [PAPER_ID],
          dimensions: [
            { id: "dim-1", label: "解决的核心问题" },
            { id: "dim-2", label: "方法架构" },
          ],
        }),
      },
      ctx.bindings,
    );
    expect(created.status).toBe(201);

    const fetched = await app.request(`http://localhost/api/matrices/${MATRIX_ID}`, { headers: bearer(ctx.adminToken) }, ctx.bindings);
    expect(fetched.status).toBe(200);
    const payload = (await fetched.json()) as {
      papers: Array<{ id: string }>;
      groups: Array<{ rows: Array<{ id: string }> }>;
      cells: Record<string, { value: string; status: string }>;
    };
    expect(payload.papers.map((p) => p.id)).toEqual([PAPER_ID]);
    expect(payload.groups[0].rows.map((r) => r.id)).toEqual(["dim-1", "dim-2"]);
    expect(payload.cells[`dim-1:${PAPER_ID}`]).toMatchObject({ value: "待提取", status: "draft" });
    expect(payload.cells[`dim-2:${PAPER_ID}`]).toBeTruthy();
  });

  it("confirms and locks an evidence cell", async () => {
    const response = await app.request(
      `http://localhost/api/evidence/${EVIDENCE_ID}`,
      { method: "PATCH", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ status: "confirmed" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string; locked: boolean };
    expect(payload).toMatchObject({ status: "confirmed", locked: true });
  });

  it("refuses to roll a locked cell back to draft", async () => {
    const response = await app.request(
      `http://localhost/api/evidence/${EVIDENCE_ID}`,
      { method: "PATCH", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ status: "draft" }) },
      ctx.bindings,
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("EVIDENCE_LOCKED");
  });

  it("allows unlocking with locked:false", async () => {
    const response = await app.request(
      `http://localhost/api/evidence/${EVIDENCE_ID}`,
      { method: "PATCH", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ status: "draft", locked: false }) },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string; locked: boolean };
    expect(payload).toMatchObject({ status: "draft", locked: false });
  });

  it("hides another account's matrix with 404", async () => {
    const response = await app.request(`http://localhost/api/matrices/${MATRIX_ID}`, { headers: bearer(ctx.researcherToken) }, ctx.bindings);
    expect(response.status).toBe(404);
  });
});
