/**
 * 跨平台原生文件夹选择器(对齐 DSH directory-picker-native 语义)。
 * 浏览器无法开系统对话框;Node 后端 spawn 子进程调 OS API。
 *
 * - macOS: osascript `choose folder`
 * - Linux: zenity, 回退 kdialog
 * - Windows: PowerShell FolderBrowserDialog(零新依赖;不用 koffi)
 *
 * 取消 → null;失败 → throw。runner / platform 可注入,便于单测。
 */

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";

export type NativeCommandRunner = (
  command: string,
  args: readonly string[],
  signal: AbortSignal,
) => Promise<{ stdout: string; stderr: string; code: number | null }>;

export interface DirectoryPickerInternals {
  platform?: NodeJS.Platform;
  run?: NativeCommandRunner;
}

function outputPath(stdout: string): string | null {
  const path = stdout.replace(/[\r\n]+$/, "").trim();
  return path === "" ? null : path;
}

function normalizeSelectedPath(raw: string): string {
  try {
    return realpathSync(raw);
  } catch {
    return raw;
  }
}

/** 默认 runner:execFile,不经 shell;Windows 隐藏控制台窗口。 */
export const runNativeCommand: NativeCommandRunner = (command, args, signal) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { encoding: "utf8", signal, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & { status?: number | null };
          // 进程已启动但非零退出 → 按 code 交给调用方(取消=1 等)。
          const exitCode = typeof err.status === "number"
            ? err.status
            : typeof err.code === "number"
              ? err.code
              : null;
          if (exitCode !== null) {
            resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code: exitCode });
            return;
          }
          // ENOENT 等启动失败才 reject。
          reject(Object.assign(new Error(error.message, { cause: error }), {
            code: err.code,
            stdout,
            stderr,
          }));
          return;
        }
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code: 0 });
      },
    );
  });

function isMissingCommand(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function errorStderr(error: unknown): string {
  if (typeof error !== "object" || error === null || !("stderr" in error)) return "";
  const stderr = (error as { stderr?: unknown }).stderr;
  return typeof stderr === "string" ? stderr : "";
}

/**
 * 打开平台文件夹选择器。
 * @returns 规范化后的绝对路径;用户取消时返回 null。
 */
export async function pickNativeDirectory(
  signal: AbortSignal,
  internals: DirectoryPickerInternals = {},
): Promise<string | null> {
  const platform = internals.platform ?? process.platform;
  const run = internals.run ?? runNativeCommand;

  if (platform === "darwin") {
    try {
      const result = await run("osascript", [
        "-e", 'set selectedFolder to choose folder with prompt "选择研究项目文件夹"',
        "-e", "POSIX path of selectedFolder",
      ], signal);
      if (result.code !== 0) {
        if (/(?:User canceled|-128)/i.test(result.stderr) || result.code === 1) return null;
        throw new Error(result.stderr.trim() || `osascript exited ${result.code}`);
      }
      const path = outputPath(result.stdout);
      return path ? normalizeSelectedPath(path) : null;
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      if (/(?:User canceled|-128)/i.test(errorStderr(error))) return null;
      throw error;
    }
  }

  if (platform === "win32") {
    // STA 是 WinForms 对话框的硬要求;EncodedCommand 避免引号转义坑。
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$d.Description = '选择研究项目文件夹'",
      "$d.ShowNewFolderButton = $true",
      "try { $d.UseDescriptionForTitle = $true } catch {}",
      "if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }",
      "[Console]::Out.Write($d.SelectedPath)",
    ].join("; ");
    const encoded = Buffer.from(ps, "utf16le").toString("base64");
    const result = await run("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy", "Bypass",
      "-EncodedCommand", encoded,
    ], signal);
    if (result.code === 1) return null;
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || `PowerShell folder picker exited ${result.code}`);
    }
    const path = outputPath(result.stdout);
    return path ? normalizeSelectedPath(path) : null;
  }

  if (platform === "linux") {
    try {
      const result = await run("zenity", [
        "--file-selection", "--directory", "--title=选择研究项目文件夹",
      ], signal);
      if (result.code === 1) return null;
      if (result.code !== 0) throw new Error(result.stderr.trim() || `zenity exited ${result.code}`);
      const path = outputPath(result.stdout);
      return path ? normalizeSelectedPath(path) : null;
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      if (!isMissingCommand(error)) throw error;
    }

    try {
      const result = await run("kdialog", [
        "--getexistingdirectory", ".", "--title", "选择研究项目文件夹",
      ], signal);
      if (result.code === 1) return null;
      if (result.code !== 0) throw new Error(result.stderr.trim() || `kdialog exited ${result.code}`);
      const path = outputPath(result.stdout);
      return path ? normalizeSelectedPath(path) : null;
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      if (isMissingCommand(error)) {
        throw new Error("未找到可用的文件夹选择器(请安装 zenity 或 kdialog)");
      }
      throw error;
    }
  }

  throw new Error(`当前平台不支持原生文件夹选择器: ${platform}`);
}

/**
 * 在系统文件管理器中打开已存在的路径(对齐 DSH host.openPath 的最小能力)。
 */
export async function openNativePath(
  path: string,
  signal: AbortSignal,
  internals: DirectoryPickerInternals = {},
): Promise<void> {
  const platform = internals.platform ?? process.platform;
  const run = internals.run ?? runNativeCommand;
  if (platform === "darwin") {
    const result = await run("open", [path], signal);
    if (result.code !== 0) throw new Error(result.stderr.trim() || `open exited ${result.code}`);
    return;
  }
  if (platform === "win32") {
    const result = await run("explorer.exe", [path], signal);
    // explorer 有时以非零码退出但仍打开成功;仅在明确失败时抛错。
    if (result.code !== 0 && result.stderr.trim()) {
      throw new Error(result.stderr.trim());
    }
    return;
  }
  if (platform === "linux") {
    const result = await run("xdg-open", [path], signal);
    if (result.code !== 0) throw new Error(result.stderr.trim() || `xdg-open exited ${result.code}`);
    return;
  }
  throw new Error(`当前平台不支持打开路径: ${platform}`);
}
