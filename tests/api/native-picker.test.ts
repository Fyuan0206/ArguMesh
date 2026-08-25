// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { pickNativeDirectory, type NativeCommandRunner } from "../../server/services/native-picker";

function runner(impl: NativeCommandRunner): NativeCommandRunner {
  return impl;
}

describe("pickNativeDirectory", () => {
  it("parses macOS osascript stdout and treats cancel as null", async () => {
    const run = vi.fn<NativeCommandRunner>(async () => ({
      stdout: "/Users/me/Papers/pose/\n",
      stderr: "",
      code: 0,
    }));
    await expect(pickNativeDirectory(new AbortController().signal, {
      platform: "darwin",
      run: runner(run),
    })).resolves.toMatch(/pose/);

    const cancel = vi.fn<NativeCommandRunner>(async () => ({
      stdout: "",
      stderr: "User canceled.",
      code: 1,
    }));
    await expect(pickNativeDirectory(new AbortController().signal, {
      platform: "darwin",
      run: runner(cancel),
    })).resolves.toBeNull();
  });

  it("uses zenity on linux and falls back to kdialog when missing", async () => {
    const missing = Object.assign(new Error("not found"), { code: "ENOENT" });
    const run = vi.fn<NativeCommandRunner>(async (command) => {
      if (command === "zenity") throw missing;
      return { stdout: "/home/me/research\n", stderr: "", code: 0 };
    });
    await expect(pickNativeDirectory(new AbortController().signal, {
      platform: "linux",
      run: runner(run),
    })).resolves.toBe("/home/me/research");
    expect(run).toHaveBeenCalledWith("kdialog", expect.any(Array), expect.any(AbortSignal));
  });

  it("maps Windows PowerShell exit 1 to cancel", async () => {
    const run = vi.fn<NativeCommandRunner>(async () => ({
      stdout: "",
      stderr: "",
      code: 1,
    }));
    await expect(pickNativeDirectory(new AbortController().signal, {
      platform: "win32",
      run: runner(run),
    })).resolves.toBeNull();
    expect(run).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-STA", "-EncodedCommand"]),
      expect.any(AbortSignal),
    );
  });
});
