// @vitest-environment node
import { createServer, type Server } from "node:http";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("safe LaTeX writing workspace", () => {
  let context: TestContext;
  let fakeAi: Server;
  let dangerousPatch = false;
  const projectId = "writing-project";
  const workspacePath = mkdtempSync(join(tmpdir(), "argumesh-writing-"));

  beforeAll(async () => {
    context = await createTestContext();
    fakeAi = createServer((_request, response) => {
      const source = dangerousPatch
        ? "\\documentclass{article}\\begin{document}\\input{/etc/passwd}\\end{document}"
        : "\\documentclass{article}\n\\begin{document}\n\\section{Evidence}\nVerified draft.\n\\end{document}";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "新增证据章节", proposedSource: source, citations: [], warnings: [] }) } }] }));
    });
    await new Promise<void>((resolve) => fakeAi.listen(0, "127.0.0.1", resolve));
    context.bindings.STEPFUN_BASE_URL = `http://127.0.0.1:${(fakeAi.address() as AddressInfo).port}/v1`;
    context.bindings.STEPFUN_API_KEY = "test-key";
    context.bindings.STEPFUN_MODEL = "test-model";
    await app.request(`/api/projects/${projectId}`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ name: "写作项目", description: "", workspacePath }),
    }, context.bindings);
  });
  afterAll(() => { fakeAi.close(); context.cleanup(); rmSync(workspacePath, { recursive: true, force: true }); });

  it("initializes main.tex and bibliography without overwriting them", async () => {
    const first = await app.request(`/api/projects/${projectId}/paper/initialize`, { method: "POST" }, context.bindings);
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ createdMain: true, createdBibliography: true });
    const second = await app.request(`/api/projects/${projectId}/paper/initialize`, { method: "POST" }, context.bindings);
    expect(await second.json()).toMatchObject({ createdMain: false, createdBibliography: false });
  });

  it("parses outline and refuses stale-version overwrites", async () => {
    const sourceResponse = await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings);
    const source = await sourceResponse.json() as { content: string; version: string };
    expect(source.content).toContain("\\section{Introduction}");
    const outline = await app.request(`/api/projects/${projectId}/paper/outline`, {}, context.bindings);
    const outlinePayload = await outline.json() as { outline: Array<{ title: string; line: number }> };
    expect(outlinePayload.outline).toContainEqual(expect.objectContaining({ title: "Introduction" }));

    const saved = await app.request(`/api/projects/${projectId}/paper/source`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ content: source.content.replace("Introduction", "Motivation"), expectedVersion: source.version }),
    }, context.bindings);
    expect(saved.status).toBe(200);
    const stale = await app.request(`/api/projects/${projectId}/paper/source`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ content: "stale", expectedVersion: source.version }),
    }, context.bindings);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "PAPER_VERSION_CONFLICT" });
  });

  it("proposes a Diff without writing it and blocks unsafe LaTeX", async () => {
    const source = await (await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings)).json() as { content: string; version: string };
    dangerousPatch = false;
    const proposed = await app.request(`/api/projects/${projectId}/paper/patch`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ instruction: "新增证据章节", baseVersion: source.version }),
    }, context.bindings);
    expect(proposed.status).toBe(200);
    expect(await proposed.json()).toMatchObject({ patch: { summary: "新增证据章节" }, baseVersion: source.version });
    const unchanged = await (await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings)).json() as { content: string };
    expect(unchanged.content).toBe(source.content);

    dangerousPatch = true;
    const unsafe = await app.request(`/api/projects/${projectId}/paper/patch`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ instruction: "危险修改", baseVersion: source.version }),
    }, context.bindings);
    expect(unsafe.status).toBe(422);
    expect(await unsafe.json()).toMatchObject({ error: "UNSAFE_LATEX_PATCH" });
  });

  it("lists and restores snapshots while rejecting path traversal", async () => {
    const listed = await app.request(`/api/projects/${projectId}/paper/snapshots`, {}, context.bindings);
    const payload = await listed.json() as { snapshots: Array<{ id: string }> };
    expect(payload.snapshots.length).toBeGreaterThan(0);
    const restored = await app.request(`/api/projects/${projectId}/paper/snapshots/${payload.snapshots[0].id}/restore`, { method: "POST" }, context.bindings);
    expect(restored.status).toBe(200);
    const escaped = await app.request(`/api/projects/${projectId}/paper/snapshots/..%2F..%2Foutside/restore`, { method: "POST" }, context.bindings);
    expect([400, 404]).toContain(escaped.status);
  });

  it("reports engine availability and never fabricates a PDF", async () => {
    const status = await app.request(`/api/projects/${projectId}/paper/compile-status`, {}, context.bindings);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ status: expect.stringMatching(/idle|unavailable|succeeded|failed/) });
    const pdf = await app.request(`/api/projects/${projectId}/paper/pdf`, {}, context.bindings);
    expect(pdf.status).toBe(404);
    const cancel = await app.request(`/api/projects/${projectId}/paper/compile/cancel`, { method: "POST" }, context.bindings);
    expect(await cancel.json()).toEqual({ cancelled: false });
  });

  it("compiles with an allowlisted engine path and serves the produced PDF", async () => {
    const fakeEngine = join(workspacePath, "tectonic.exe");
    copyFileSync(process.execPath, fakeEngine);
    context.bindings.LATEX_ENGINE_PATH = fakeEngine;
    const current = await (await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings)).json() as { version: string };
    const fakeSource = readFileSync(join(process.cwd(), "tests", "fixtures", "fake-tectonic-main.tex"), "utf8");
    const saved = await app.request(`/api/projects/${projectId}/paper/source`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ content: fakeSource, expectedVersion: current.version }),
    }, context.bindings);
    expect(saved.status).toBe(200);
    const compiled = await app.request(`/api/projects/${projectId}/paper/compile`, { method: "POST" }, context.bindings);
    expect(compiled.status).toBe(200);
    expect(await compiled.json()).toMatchObject({ status: "succeeded", engine: "tectonic" });
    const pdf = await app.request(`/api/projects/${projectId}/paper/pdf`, {}, context.bindings);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 8))).toContain("%PDF-1.4");
  });

  it("blocks compilation when the saved source requests unsafe file access", async () => {
    const current = await (await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings)).json() as { version: string };
    const saved = await app.request(`/api/projects/${projectId}/paper/source`, {
      method: "PUT", headers: jsonHeaders(),
      body: JSON.stringify({ content: "\\documentclass{article}\\begin{document}\\input{/etc/passwd}\\end{document}", expectedVersion: current.version }),
    }, context.bindings);
    expect(saved.status).toBe(200);
    const compiled = await app.request(`/api/projects/${projectId}/paper/compile`, { method: "POST" }, context.bindings);
    expect(compiled.status).toBe(400);
    expect(await compiled.json()).toMatchObject({ error: "UNSAFE_LATEX_SOURCE" });
  });
});
