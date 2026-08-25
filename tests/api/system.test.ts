// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../server/services/native-picker", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/native-picker")>("../../server/services/native-picker");
  return {
    ...actual,
    pickNativeDirectory: vi.fn(),
    openNativePath: vi.fn(),
  };
});

import app from "../../server/index";
import { openNativePath, pickNativeDirectory } from "../../server/services/native-picker";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

const pickMock = vi.mocked(pickNativeDirectory);
const openMock = vi.mocked(openNativePath);

let ctx: TestContext;
let tempDir: string;

beforeAll(async () => {
  ctx = await createTestContext();
  tempDir = mkdtempSync(join(tmpdir(), "argumesh-open-path-"));
  writeFileSync(join(tempDir, "marker.txt"), "ok");
});

afterAll(() => {
  ctx.cleanup();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("system pick-directory / open-path", () => {
  it("returns cancelled when native picker returns null", async () => {
    pickMock.mockResolvedValueOnce(null);
    const response = await app.request(
      "http://localhost/api/system/pick-directory",
      { method: "POST", headers: jsonHeaders(), body: "{}" },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cancelled: true });
  });

  it("returns the selected path", async () => {
    pickMock.mockResolvedValueOnce("C:\\Research\\pose");
    const response = await app.request(
      "http://localhost/api/system/pick-directory",
      { method: "POST", headers: jsonHeaders(), body: "{}" },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: "C:\\Research\\pose" });
  });

  it("maps picker failures to 500", async () => {
    pickMock.mockRejectedValueOnce(new Error("no supported native directory picker found"));
    const response = await app.request(
      "http://localhost/api/system/pick-directory",
      { method: "POST", headers: jsonHeaders(), body: "{}" },
      ctx.bindings,
    );
    expect(response.status).toBe(500);
    const payload = await response.json() as { error: string; message: string };
    expect(payload.error).toBe("PICKER_FAILED");
    expect(payload.message).toMatch(/picker/i);
  });

  it("opens an existing path", async () => {
    openMock.mockResolvedValueOnce(undefined);
    const response = await app.request(
      "http://localhost/api/system/open-path",
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ path: tempDir }) },
      ctx.bindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ opened: true });
    expect(openMock).toHaveBeenCalledWith(tempDir, expect.any(AbortSignal));
  });

  it("404 when open-path target is missing", async () => {
    const response = await app.request(
      "http://localhost/api/system/open-path",
      { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ path: join(tempDir, "does-not-exist") }) },
      ctx.bindings,
    );
    expect(response.status).toBe(404);
  });

  it("persists workspacePath on create and exposes it on list", async () => {
    const create = await app.request(
      "http://localhost/api/projects/proj-with-path",
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: "路径项目", description: "", workspacePath: tempDir }),
      },
      ctx.bindings,
    );
    expect(create.status).toBe(201);

    const list = await app.request("http://localhost/api/projects", {}, ctx.bindings);
    const payload = await list.json() as { projects: Array<{ id: string; workspacePath: string | null }> };
    const row = payload.projects.find((project) => project.id === "proj-with-path");
    expect(row?.workspacePath).toBe(tempDir);

    const patch = await app.request(
      "http://localhost/api/projects/proj-with-path",
      {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ workspacePath: null }),
      },
      ctx.bindings,
    );
    expect(patch.status).toBe(200);
    const patched = await patch.json() as { project: { workspacePath: string | null } };
    expect(patched.project.workspacePath).toBeNull();
  });
});
