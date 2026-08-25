/**
 * 手工冒烟辅助:验证 native-picker 真能拉起本机进程(非假 runner)。
 * - open-path: 真实打开资源管理器
 * - pick-directory: 拉起后约 4s abort,期间确认 powershell.exe 已出现
 *
 * 用法: pnpm exec tsx scripts/smoke-native-picker.ts
 */
import { execFileSync } from "node:child_process";

const API = process.env.ARGUMESH_API ?? "http://127.0.0.1:8787";

function listPowershell(): string[] {
  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"name='powershell.exe'\" | Select-Object -ExpandProperty CommandLine"],
      { encoding: "utf8", windowsHide: true },
    );
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function smokeOpenPath(): Promise<void> {
  const path = process.env.USERPROFILE || "C:\\Users\\24019";
  const response = await fetch(`${API}/api/system/open-path`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`open-path failed: ${response.status} ${JSON.stringify(body)}`);
  console.log("[ok] open-path", body, "→", path);
}

async function smokePickSpawnsPowershell(): Promise<void> {
  const before = new Set(listPowershell());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  const pending = fetch(`${API}/api/system/pick-directory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: controller.signal,
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const during = listPowershell().filter((line) => !before.has(line));
  const spawned = during.some((line) => /EncodedCommand|FolderBrowserDialog|STA/i.test(line) || line.length > 80);

  let settled: { status?: number; body?: unknown; aborted?: boolean } = {};
  try {
    const response = await pending;
    settled = { status: response.status, body: await response.json() };
  } catch (error) {
    settled = { aborted: true, body: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }

  if (!spawned) {
    console.error("[fail] pick-directory 期间未观测到新增 powershell(FolderBrowserDialog) 进程");
    console.error("during delta:", during.slice(0, 5));
    console.error("settled:", settled);
    process.exitCode = 1;
    return;
  }
  console.log("[ok] pick-directory 已拉起 PowerShell STA 对话框进程");
  console.log("    settled:", settled);
}

async function smokePersistPath(): Promise<void> {
  const id = `smoke-folder-${Date.now()}`;
  const workspacePath = process.env.USERPROFILE || "C:\\Users\\24019";
  const create = await fetch(`${API}/api/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "冒烟文件夹项目", description: "smoke", workspacePath }),
  });
  if (!create.ok) throw new Error(`create failed: ${create.status}`);
  const list = await fetch(`${API}/api/projects`);
  const payload = await list.json() as { projects: Array<{ id: string; workspacePath: string | null }> };
  const row = payload.projects.find((project) => project.id === id);
  if (row?.workspacePath !== workspacePath) {
    throw new Error(`workspacePath not persisted: ${JSON.stringify(row)}`);
  }
  const patch = await fetch(`${API}/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspacePath: null }),
  });
  const patched = await patch.json() as { project: { workspacePath: string | null } };
  if (patched.project.workspacePath !== null) throw new Error("clear path failed");
  await fetch(`${API}/api/projects/${encodeURIComponent(id)}?force=true`, { method: "DELETE" });
  console.log("[ok] create/list/patch/clear workspacePath round-trip");
}

async function main() {
  const health = await fetch(`${API}/api/health`);
  if (!health.ok) throw new Error(`API not healthy: ${health.status}`);
  console.log("[ok] health", await health.json().then((j: { ok?: boolean }) => j.ok));
  await smokePersistPath();
  await smokeOpenPath();
  await smokePickSpawnsPowershell();
}

main().catch((error) => {
  console.error("[fail]", error);
  process.exitCode = 1;
});
