import { ArrowClockwise, DownloadSimple, X } from "@phosphor-icons/react";
import { useEffect, useState, type MouseEvent } from "react";
import { getAppUpdate, openAppUpdate, type AppUpdate } from "../api";

function UpdateLinks({ update }: { update: AppUpdate }) {
  const [error, setError] = useState("");
  function open(event: MouseEvent<HTMLAnchorElement>, target: "download" | "release") {
    if (!update.desktop) return;
    event.preventDefault(); setError("");
    void openAppUpdate(target).catch(() => setError("无法打开系统浏览器，请稍后重试。"));
  }
  return <><div className="update-actions">
    <a className="primary" href={update.downloadUrl} onClick={(event) => open(event, "download")} target="_blank" rel="noopener noreferrer"><DownloadSimple />下载新安装包</a>
    <a href={update.releaseUrl} onClick={(event) => open(event, "release")} target="_blank" rel="noopener noreferrer">查看更新说明</a>
  </div>{error ? <p role="alert">{error}</p> : null}</>;
}

export function UpdateNotice() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  useEffect(() => {
    let active = true;
    void getAppUpdate().then((result) => {
      if (!active || result.status !== "available") return;
      try { if (localStorage.getItem("argumesh.dismissed-update") === result.latestVersion) return; } catch { /* Storage is optional. */ }
      setUpdate(result);
    }).catch(() => { /* Offline startup remains usable. */ });
    return () => { active = false; };
  }, []);
  if (!update) return null;
  function dismiss() {
    try { localStorage.setItem("argumesh.dismissed-update", update!.latestVersion!); } catch { /* Dismiss for this session. */ }
    setUpdate(null);
  }
  return <aside className="update-notice" aria-label="应用更新" role="status">
    <button type="button" className="update-dismiss" aria-label="关闭本版本更新提醒" onClick={dismiss}><X /></button>
    <strong>ArguMesh {update.latestVersion} 已发布</strong>
    <p>当前版本 {update.currentVersion}。请关闭应用后覆盖安装，现有研究数据和 AI 配置会保留。</p>
    <UpdateLinks update={update} />
  </aside>;
}

export function UpdateSettings() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getAppUpdate().then((result) => { if (active) setUpdate(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  async function check() {
    setChecking(true); setFailed(false);
    try { setUpdate(await getAppUpdate("manual")); } catch { setFailed(true); }
    finally { setChecking(false); }
  }
  return <section className="settings-section" aria-labelledby="app-update-title">
    <header className="settings-section-header"><span><ArrowClockwise /></span><div><h2 id="app-update-title">应用更新</h2><p>桌面版启动时检查新版本，也可手动检查。</p></div></header>
    <div className="settings-section-body app-update-settings">
      <div className="settings-row"><span><strong>当前版本 {update?.currentVersion ?? "…"}</strong><small>仅查询 GitHub 发布信息，不发送研究数据。更新需下载并安装新安装包。</small></span><button type="button" className="secondary-button" disabled={checking} onClick={() => void check()}>{checking ? "检查中…" : "检查更新"}</button></div>
      <div aria-live="polite">
        {failed || update?.status === "unavailable" ? <p>暂时无法检查更新，请稍后重试。</p> : null}
        {update?.status === "up_to_date" ? <p>当前已是最新版本。</p> : null}
        {update?.status === "available" ? <><p>新版本 {update.latestVersion} 可用。关闭应用后覆盖安装，现有研究数据和 AI 配置会保留。</p><UpdateLinks update={update} /></> : null}
      </div>
    </div>
  </section>;
}
