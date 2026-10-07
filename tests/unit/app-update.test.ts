// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAppUpdate, isNewerVersion, readRelease } from "../../server/services/app-update";
import { systemRoutes } from "../../server/routes/system";
import * as nativePicker from "../../server/services/native-picker";

const release = (version = "3.4.0") => ({
  tag_name: `v${version}`, draft: false, prerelease: false,
  assets: [{ name: `ArguMesh_${version}_x64-setup.exe`, browser_download_url: `https://github.com/Fyuan0206/ArguMesh/releases/download/v${version}/ArguMesh_${version}_x64-setup.exe` }],
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("application updates", () => {
  it("compares stable numeric versions without suggesting downgrades", () => {
    expect(isNewerVersion("3.10.0", "3.9.9")).toBe(true);
    expect(isNewerVersion("3.3.0", "3.3.0")).toBe(false);
    expect(isNewerVersion("3.2.5", "3.3.0")).toBe(false);
    expect(isNewerVersion("3.4.0-beta", "3.3.0")).toBe(false);
    expect(readRelease(release("3.2.5"), "3.3.0").status).toBe("up_to_date");
  });
  it("requires a trusted installer asset for the new stable release", () => {
    expect(readRelease(release(), "3.3.0").status).toBe("available");
    expect(() => readRelease({ ...release(), draft: true })).toThrow();
    expect(() => readRelease({ ...release(), prerelease: true })).toThrow();
    expect(() => readRelease({ ...release(), assets: [] })).toThrow();
    const unsafe = release(); unsafe.assets[0].browser_download_url = "https://example.com/installer.exe";
    expect(() => readRelease(unsafe)).toThrow();
  });
  it("does not contact GitHub automatically from the web host", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await systemRoutes.request("/system/update", {}, { DATABASE_URL: "file:unused" });
    expect((await response.json()).status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await systemRoutes.request("/system/update?check=invalid", {}, { DATABASE_URL: "file:unused" })).status).toBe(400);
  });
  it("contains lookup failures and caches concurrent checks", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await Promise.all([checkAppUpdate(true), checkAppUpdate(true)]);
    expect(first.status).toBe("unavailable"); expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await checkAppUpdate()).toEqual(first);
    fetchMock.mockResolvedValue(new Response(JSON.stringify(release())));
    expect((await checkAppUpdate(true)).status).toBe("available");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.github.com/repos/Fyuan0206/ArguMesh/releases/latest");
  });
  it("opens only the verified release asset in the desktop system browser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(release()))));
    await checkAppUpdate(true);
    const open = vi.spyOn(nativePicker, "openNativePath").mockResolvedValue();
    const request = (body: unknown, desktop = "1") => systemRoutes.request("/system/update/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, { DATABASE_URL: "file:unused", ARGUMESH_DESKTOP: desktop });
    expect((await request({ target: "download" })).status).toBe(200);
    expect(open.mock.calls[0][0]).toBe(release().assets[0].browser_download_url);
    expect((await request({ target: "download", url: "https://example.com" })).status).toBe(400);
    expect((await request({ target: "download" }, "")).status).toBe(400);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
