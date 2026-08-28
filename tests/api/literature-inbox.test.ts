// @vitest-environment node
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { LITERATURE_INBOX_DIR } from "../../server/services/literature-inbox";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("literature inbox scan", () => {
  let context: TestContext;
  let workspacePath: string;
  let pdf: Uint8Array;
  const projectId = "inbox-project";

  beforeAll(async () => {
    context = await createTestContext();
    workspacePath = mkdtempSync(join(tmpdir(), "argumesh-inbox-"));
    pdf = new Uint8Array(await readFile("tests/fixtures/reader-selection-sample.pdf"));
    mkdirSync(join(workspacePath, LITERATURE_INBOX_DIR), { recursive: true });
    copyFileSync("tests/fixtures/reader-selection-sample.pdf", join(workspacePath, LITERATURE_INBOX_DIR, "sample-paper.pdf"));
    writeFileSync(join(workspacePath, LITERATURE_INBOX_DIR, "not-a-pdf.txt"), "hello");
    await app.request(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: "收件箱项目", description: "", workspacePath }),
    }, context.bindings);
  });

  afterAll(() => {
    context.cleanup();
    rmSync(workspacePath, { recursive: true, force: true });
  });

  it("imports PDFs from workspace/literature and deduplicates on rescan", async () => {
    const first = await app.request(`/api/projects/${projectId}/library/scan-inbox`, { method: "POST" }, context.bindings);
    expect(first.status).toBe(200);
    const firstPayload = await first.json() as {
      imported: number;
      skipped: number;
      items: Array<{ status: string; paperId?: string; fileName: string }>;
    };
    expect(firstPayload.imported).toBe(1);
    expect(firstPayload.items.some((item) => item.status === "imported" && item.fileName === "sample-paper.pdf")).toBe(true);

    const paperId = firstPayload.items.find((item) => item.status === "imported")?.paperId;
    expect(paperId).toBeTruthy();

    const fileResponse = await app.request(`http://localhost/api/papers/${paperId}/file`, {}, context.bindings);
    expect(fileResponse.status).toBe(200);

    const second = await app.request(`/api/projects/${projectId}/library/scan-inbox`, { method: "POST" }, context.bindings);
    expect(second.status).toBe(200);
    const secondPayload = await second.json() as { imported: number; skipped: number };
    expect(secondPayload.imported).toBe(0);
    expect(secondPayload.skipped).toBeGreaterThanOrEqual(1);
  });

  it("returns 400 when workspace path is missing", async () => {
    const noWorkspaceProject = "inbox-no-workspace";
    await app.request(`/api/projects/${noWorkspaceProject}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ name: "无工作区", description: "" }),
    }, context.bindings);
    const response = await app.request(`/api/projects/${noWorkspaceProject}/library/scan-inbox`, { method: "POST" }, context.bindings);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "WORKSPACE_PATH_REQUIRED" });
  });
});
