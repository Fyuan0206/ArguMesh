/**
 * src/api.ts 客户端 helper:pickDirectory / openLocalPath
 * 不打真实后端 — mock fetch,验证状态码分支与返回值映射。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { openLocalPath, pickDirectory } from "../../src/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("pickDirectory / openLocalPath (api helpers)", () => {
  it("pickDirectory returns path on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { path: "C:\\\\Research\\\\pose" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(pickDirectory()).resolves.toBe("C:\\\\Research\\\\pose");
    expect(fetchMock).toHaveBeenCalledWith("/api/system/pick-directory", expect.objectContaining({ method: "POST" }));
  });

  it("pickDirectory returns null when cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { cancelled: true })));
    await expect(pickDirectory()).resolves.toBeNull();
  });

  it("pickDirectory throws on 500 / 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { message: "选择器失败" })));
    await expect(pickDirectory()).rejects.toThrow(/选择器失败/);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { message: "已有文件夹选择对话框在运行" })));
    await expect(pickDirectory()).rejects.toThrow(/已有文件夹选择对话框/);
  });

  it("openLocalPath resolves on opened:true and throws on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { opened: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(openLocalPath("C:\\\\Users\\\\me")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/system/open-path", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ path: "C:\\\\Users\\\\me" }),
    }));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { message: "路径不存在或不可访问" })));
    await expect(openLocalPath("C:\\\\missing")).rejects.toThrow(/路径不存在/);
  });
});
