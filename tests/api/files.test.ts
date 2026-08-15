// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { bearer, createTestContext, jsonHeaders, type TestContext } from "./helpers";

let ctx: TestContext;
let pdf: Uint8Array;

beforeAll(async () => {
  ctx = await createTestContext();
  pdf = new Uint8Array(await readFile("tests/fixtures/reader-selection-sample.pdf"));

  // 准备论文:file-paper-1(将要上传)与 file-paper-2(无文件)。
  for (const [projectId, paperId] of [["file-project", "file-paper-1"], ["file-project", "file-paper-2"]] as const) {
    await app.request(
      `http://localhost/api/projects/${projectId}`,
      { method: "PUT", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ id: projectId, name: "文件测试项目" }) },
      ctx.bindings,
    );
    await app.request(
      `http://localhost/api/projects/${projectId}/papers/${paperId}`,
      { method: "PUT", headers: jsonHeaders(ctx.adminToken), body: JSON.stringify({ id: paperId, title: "文件测试论文", authors: "测试作者", venue: "测试会议", year: 2024 }) },
      ctx.bindings,
    );
  }
});

afterAll(() => {
  ctx.cleanup();
});

describe("paper file upload (PDF in SQLite)", () => {
  it("uploads a PDF and downloads it back", async () => {
    const upload = await app.request(
      "http://localhost/api/papers/file-paper-1/file",
      {
        method: "PUT",
        headers: { ...bearer(ctx.adminToken), "content-type": "application/pdf", "content-length": String(pdf.byteLength) },
        body: pdf.buffer as ArrayBuffer,
      },
      ctx.bindings,
    );
    expect(upload.status).toBe(201);
    const payload = (await upload.json()) as { paperId: string; size: number; cloudStored: boolean };
    expect(payload).toMatchObject({ paperId: "file-paper-1", size: pdf.byteLength, cloudStored: true });

    const download = await app.request(
      "http://localhost/api/papers/file-paper-1/file",
      { headers: bearer(ctx.adminToken) },
      ctx.bindings,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    const body = new Uint8Array(await download.arrayBuffer());
    expect(body.byteLength).toBe(pdf.byteLength);
    expect(body.slice(0, 4)).toEqual(pdf.slice(0, 4));
  });

  it("rejects non-PDF content types with 415", async () => {
    const response = await app.request(
      "http://localhost/api/papers/file-paper-1/file",
      { method: "PUT", headers: { ...bearer(ctx.adminToken), "content-type": "text/plain" }, body: new TextEncoder().encode("not a pdf") },
      ctx.bindings,
    );
    expect(response.status).toBe(415);
  });

  it("returns 404 when the paper has no PDF", async () => {
    const response = await app.request(
      "http://localhost/api/papers/file-paper-2/file",
      { headers: bearer(ctx.adminToken) },
      ctx.bindings,
    );
    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("FILE_NOT_FOUND");
  });

  it("returns 404 when the paper belongs to another account", async () => {
    const response = await app.request(
      "http://localhost/api/papers/file-paper-1/file",
      { headers: bearer(ctx.researcherToken) },
      ctx.bindings,
    );
    expect(response.status).toBe(404);
  });
});
