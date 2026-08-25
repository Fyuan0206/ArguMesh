import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api";
import { WorkspaceProvider, useWorkspace, type PendingSyncEntry } from "../../src/state/workspace";

/**
 * ERR-20260814-001 回归测试:后台同步队列对"云端已不存在"的错误要宽容,
 * 且从 localStorage 恢复的条目(JSON 丢弃 retry 闭包)重试时必须被清除而不是永久卡住。
 */

const STORAGE_KEY = "paperidea_workspace_v2_local";

function seedWorkspace(pendingSync: Array<Omit<PendingSyncEntry, "retry">> = []) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    projects: [{ id: "project-1", name: "测试项目", description: "", status: "active", paperIds: ["paper-1"], createdAt: "2026-08-14" }],
    papers: [{ id: "paper-1", title: "旧标题", authors: "", venue: "", year: 2026, status: "待读", tags: [], projectIds: ["project-1"] }],
    pendingSync,
  }));
}

function SyncHarness({ onState }: { onState: (pending: PendingSyncEntry[]) => void }) {
  const workspace = useWorkspace();
  const pending = workspace.pendingSync;
  useEffect(() => {
    onState(pending);
  }, [onState, pending]);
  return (
    <>
      <button type="button" onClick={() => workspace.updatePaper("paper-1", { title: "新标题" })}>update-paper</button>
      <button type="button" onClick={() => { const entry = pending[0]; if (entry) void workspace.retrySync(entry.id); }}>retry</button>
      <button type="button" onClick={() => workspace.dismissAllSync()}>dismiss-all</button>
    </>
  );
}

async function renderSyncHarness(onState: (pending: PendingSyncEntry[]) => void) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<WorkspaceProvider><SyncHarness onState={onState} /></WorkspaceProvider>);
  });
  return { host, root };
}

async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function click(label: string) {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!button) throw new Error(`button not found: ${label}`);
  return act(async () => { button.click(); });
}

describe("Workspace pendingSync queue", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.spyOn(api, "syncProject").mockResolvedValue({ id: "project-1" });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("does not enqueue when a paper update fails with 论文不存在 (already resolved)", async () => {
    seedWorkspace();
    vi.spyOn(api, "patchPaper").mockRejectedValue(new Error("论文不存在"));
    const snapshots: PendingSyncEntry[][] = [];
    const { root } = await renderSyncHarness((next) => snapshots.push(next));

    await click("update-paper");
    await flush();

    expect(snapshots.at(-1)).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("enqueues retryable network errors, then drops the entry when retry hits 论文不存在", async () => {
    seedWorkspace();
    const patchPaper = vi.spyOn(api, "patchPaper")
      .mockRejectedValueOnce(new Error("网络错误"))
      .mockRejectedValueOnce(new Error("论文不存在"));
    const snapshots: PendingSyncEntry[][] = [];
    const { root } = await renderSyncHarness((next) => snapshots.push(next));

    await click("update-paper");
    await flush();
    expect(snapshots.at(-1)).toHaveLength(1);
    expect(snapshots.at(-1)![0]!.error).toBe("网络错误");

    await click("retry");
    await flush();

    expect(snapshots.at(-1)).toHaveLength(0);
    expect(patchPaper).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("drops restored entries without a retry closure instead of failing forever", async () => {
    // 模拟 localStorage 恢复:JSON 序列化后 retry 闭包不存在。
    seedWorkspace([{ id: "sync-1", label: "更新文献「旧标题」", error: "论文不存在", createdAt: "2026-08-14T00:00:00.000Z" }]);
    const snapshots: PendingSyncEntry[][] = [];
    const { root } = await renderSyncHarness((next) => snapshots.push(next));
    expect(snapshots.at(-1)).toHaveLength(1);

    await click("retry");
    await flush();

    expect(snapshots.at(-1)).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("dismissAllSync clears the whole queue", async () => {
    seedWorkspace([
      { id: "sync-1", label: "条目 A", error: "论文不存在", createdAt: "2026-08-14T00:00:00.000Z" },
      { id: "sync-2", label: "条目 B", error: "网络错误", createdAt: "2026-08-14T00:00:00.000Z" },
    ]);
    const snapshots: PendingSyncEntry[][] = [];
    const { root } = await renderSyncHarness((next) => snapshots.push(next));
    expect(snapshots.at(-1)).toHaveLength(2);

    await click("dismiss-all");
    await flush();

    expect(snapshots.at(-1)).toHaveLength(0);
    await act(async () => root.unmount());
  });
});
