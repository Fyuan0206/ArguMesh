import { ArrowClockwise, X } from "@phosphor-icons/react";
import { useWorkspace, type PendingSyncEntry } from "../state/workspace";

/**
 * 同步失败横幅 — 显示后台同步队列中待重试的条目,提供"重试"和"忽略"按钮。
 * 队列来自 workspace store 的 `pendingSync`,任何写操作 API 失败都会入队。
 */
export function SyncBanner() {
  const { pendingSync, retrySync, dismissSync, dismissAllSync } = useWorkspace();
  if (pendingSync.length === 0) return null;

  return (
    <div className="sync-banner" role="status" aria-live="polite">
      <div>
        <strong>{pendingSync.length} 项后台同步未完成</strong>
        <small>最近的失败:{pendingSync[pendingSync.length - 1]!.label} — {pendingSync[pendingSync.length - 1]!.error}</small>
      </div>
      <span>
        <button className="secondary-button" type="button" onClick={() => void retryAll(pendingSync, retrySync)}><ArrowClockwise /> 重试全部</button>
        <button className="secondary-button" type="button" onClick={() => dismissAllSync()}>全部忽略</button>
        <button className="icon-button" type="button" onClick={() => dismissSync(pendingSync[pendingSync.length - 1]!.id)} aria-label="忽略最新一条"><X /></button>
      </span>
    </div>
  );
}

async function retryAll(entries: PendingSyncEntry[], retry: (id: string) => Promise<void>) {
  for (const entry of [...entries].reverse()) {
    await retry(entry.id);
  }
}