import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../../src/api";
import { UpdateNotice, UpdateSettings } from "../../src/components/UpdateNotice";

const update: api.AppUpdate = { currentVersion: "3.3.0", latestVersion: "3.4.0", status: "available", desktop: true, downloadUrl: "https://github.com/Fyuan0206/ArguMesh/releases/download/v3.4.0/ArguMesh_3.4.0_x64-setup.exe", releaseUrl: "https://github.com/Fyuan0206/ArguMesh/releases/tag/v3.4.0" };
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  localStorage.clear();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; vi.restoreAllMocks(); });
it("downloads through the desktop browser and remembers dismissal for this version only", async () => {
  const lookup = vi.spyOn(api, "getAppUpdate").mockResolvedValue(update);
  const open = vi.spyOn(api, "openAppUpdate").mockResolvedValue({ opened: true });
  await act(async () => root.render(<UpdateNotice />));
  expect(document.body.textContent).toContain("3.4.0 已发布");
  await act(async () => (document.querySelector("a") as HTMLAnchorElement).click());
  expect(open).toHaveBeenCalledWith("download");
  await act(async () => (document.querySelector("button") as HTMLButtonElement).click());
  expect(document.querySelector("aside")).toBeNull();
  await act(async () => root.render(null));
  await act(async () => root.render(<UpdateNotice />));
  expect(document.querySelector("aside")).toBeNull();
  lookup.mockResolvedValue({ ...update, latestVersion: "3.5.0" });
  await act(async () => root.render(null));
  await act(async () => root.render(<UpdateNotice />));
  expect(document.body.textContent).toContain("3.5.0 已发布");
});
it("keeps manual checking available after a failed network lookup", async () => {
  const lookup = vi.spyOn(api, "getAppUpdate").mockResolvedValueOnce({ currentVersion: "3.3.0", status: "unavailable" }).mockResolvedValueOnce(update);
  await act(async () => root.render(<UpdateSettings />));
  expect(document.body.textContent).toContain("暂时无法检查更新");
  await act(async () => (document.querySelector("button") as HTMLButtonElement).click());
  expect(lookup).toHaveBeenLastCalledWith("manual");
  expect(document.body.textContent).toContain("新版本 3.4.0 可用");
});
