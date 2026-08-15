import { ArrowCounterClockwise, Check, DownloadSimple, ShieldCheck, SignOut, Trash, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { deleteAiConfig, getAiConfig, saveAiConfig, type AiConfig } from "../api";
import { useAuth } from "../state/auth";
import { useWorkspace } from "../state/workspace";

export function SettingsPage() {
  const auth = useAuth();
  const { settings, trash, updateSettings, resetLocalData, exportWorkspace, importWorkspace, restoreTrashItem, permanentlyDeleteTrashItem } = useWorkspace();
  const [saved, setSaved] = useState(false); const [message, setMessage] = useState(""); const inputRef = useRef<HTMLInputElement>(null);
  // AI 配置(账户级,存后端;密钥永不回传,只显示掩码)
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.openai.com/v1");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getAiConfig().then((config) => {
      if (cancelled) return;
      setAiConfig(config);
      if (config.baseUrl) setAiBaseUrl(config.baseUrl);
      setAiModel(config.model);
    }).catch(() => { /* 加载失败保持表单默认值,保存时会报错 */ });
    return () => { cancelled = true; };
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); updateSettings({ displayName: String(form.get("displayName") ?? "").trim() || "Researcher", autoSave: form.get("autoSave") === "on", evidenceFirst: form.get("evidenceFirst") === "on" }); setSaved(true); window.setTimeout(() => setSaved(false), 1800); }
  async function saveAi() {
    const baseUrl = aiBaseUrl.trim();
    const apiKey = aiApiKey.trim();
    const model = aiModel.trim();
    if (!/^https?:\/\//i.test(baseUrl)) { setAiError(true); setAiMessage("Base URL 需以 http(s):// 开头"); return; }
    if (!model) { setAiError(true); setAiMessage("请填写模型名称"); return; }
    if (!apiKey && !aiConfig?.configured) { setAiError(true); setAiMessage("请填写 API Key"); return; }
    setAiSaving(true); setAiError(false); setAiMessage("");
    try {
      const next = await saveAiConfig({ baseUrl, apiKey, model });
      setAiConfig(next); setAiApiKey(""); setAiBaseUrl(next.baseUrl); setAiModel(next.model);
      setAiMessage("AI 配置已保存");
    } catch (error) {
      setAiError(true);
      setAiMessage(error instanceof Error ? (error.message === "Unauthorized" ? "登录已过期，请重新登录" : error.message) : "保存失败");
    } finally { setAiSaving(false); }
  }
  async function clearAi() {
    if (!window.confirm("确定清除已保存的 AI 配置？清除后 AI 功能将回落到服务器环境配置（若有）。")) return;
    setAiError(false);
    try {
      await deleteAiConfig();
      setAiConfig(null); setAiApiKey(""); setAiModel(""); setAiBaseUrl("https://api.openai.com/v1");
      setAiMessage("AI 配置已清除");
    } catch (error) {
      setAiError(true);
      setAiMessage(error instanceof Error ? (error.message === "Unauthorized" ? "登录已过期，请重新登录" : error.message) : "清除失败");
    }
  }
  function downloadBackup() { const blob = new Blob([exportWorkspace()], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `paperidea-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage("备份已导出"); }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const result = importWorkspace(await file.text()); setMessage(result.ok ? "备份已恢复" : result.error); event.target.value = ""; }
  return <div className="route-page settings-page"><PageHeader eyebrow="设置" title="工作台设置" />
    <form className="settings-grid" onSubmit={submit}><section className="surface-card settings-card"><div className="section-heading"><div><span className="eyebrow">个人</span><h2>基础设置</h2></div></div><label className="field"><span>显示名称</span><input name="displayName" defaultValue={settings.displayName} /></label><label className="switch-row"><span><strong>自动保存</strong><small>保存工作区中的本地修改</small></span><input name="autoSave" type="checkbox" defaultChecked={settings.autoSave} /></label><label className="switch-row"><span><strong>证据优先模式</strong><small>强调来源、定位和人工确认状态</small></span><input name="evidenceFirst" type="checkbox" defaultChecked={settings.evidenceFirst} /></label><button className="primary save-settings">{saved ? <><Check />已保存</> : "保存设置"}</button></section>
      <section className="surface-card settings-card"><div className="section-heading"><div><span className="eyebrow">模型接入</span><h2>AI 配置</h2></div></div>
        {aiConfig?.envProviders.length ? <div className="security-note"><strong>服务器环境配置:{aiConfig.envProviders.map((provider) => provider.label).join("、")}</strong><p>未保存自定义配置时 AI 使用环境厂商;保存后以下配置优先。</p></div> : <div className="security-note"><strong>未检测到服务器环境配置</strong><p>请填写以下表单接入任意 OpenAI 兼容服务,否则 AI 功能不可用。</p></div>}
        <label className="field"><span>Base URL</span><input value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /><small>OpenAI 兼容接口地址,可换成任意兼容服务(如 StepFun、MiniMax、本地 Ollama 等)。</small></label>
        <label className="field"><span>API Key</span><input type="password" value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} placeholder={aiConfig?.apiKeyMasked ? `已保存 ${aiConfig.apiKeyMasked}(留空保持不变)` : "sk-..."} autoComplete="off" /><small>密钥保存在服务器账户下,不会存进浏览器;这里只回显掩码。</small></label>
        <label className="field"><span>模型名称</span><input value={aiModel} onChange={(event) => setAiModel(event.target.value)} placeholder="如 gpt-4o-mini" /><small>填写服务商提供的模型 ID;Paper Card、证据提取、阅读问答都会使用该模型。</small></label>
        <span className="ai-actions"><button className="primary save-settings" type="button" disabled={aiSaving} onClick={() => void saveAi()}>{aiSaving ? "保存中…" : "保存 AI 配置"}</button>{aiConfig?.configured ? <button className="secondary-button" type="button" onClick={() => void clearAi()}>清除配置</button> : null}</span>
        {aiMessage ? <p className={aiError ? "settings-message ai-error" : "settings-message"}>{aiMessage}</p> : null}
      </section>
      <section className="surface-card settings-card"><div className="section-heading"><div><span className="eyebrow">当前账号</span><h2>{auth.session?.displayName ?? "未登录"}</h2></div><ShieldCheck className="security-icon" /></div><div className="security-note"><strong>会话仅保存在当前标签页</strong><p>关闭浏览器标签页后将自动登出,如需继续使用请重新输入姓名 + 密码。</p></div><button className="secondary-button full" type="button" onClick={auth.signOut}><SignOut />退出当前账号</button></section>
      <section className="surface-card settings-card"><div className="section-heading"><div><span className="eyebrow">安全与数据</span><h2>当前浏览器</h2></div></div><div className="security-note"><strong>API 访问令牌仅保存在当前标签页会话</strong><p>JSON 备份包含项目、文献元数据、知识与 Idea，不包含 IndexedDB 中的 PDF 文件和 OCR 缓存。</p></div><button className="secondary-button full" type="button" onClick={downloadBackup}><DownloadSimple />导出工作区备份</button><button className="secondary-button full" type="button" onClick={() => inputRef.current?.click()}><UploadSimple />从备份恢复</button><input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importBackup(event)} />{message ? <p className="settings-message">{message}</p> : null}<button className="danger-button full" type="button" onClick={() => { if (window.confirm("确定恢复本地示例数据？你的本地页面修改将被清除。")) resetLocalData(); }}><Trash />恢复本地示例数据</button></section>
    </form>
    <section className="surface-card trash-panel"><header><h2>回收站 · {trash.length}</h2></header>{trash.map((item) => <article key={item.id}><div><strong>{item.label}</strong><small>{item.kind === "idea" ? "Idea" : "知识对象"} · {new Date(item.deletedAt).toLocaleString("zh-CN")}</small></div><span><button className="secondary-button" onClick={() => restoreTrashItem(item.id)}><ArrowCounterClockwise />恢复</button><button className="danger-button" onClick={() => permanentlyDeleteTrashItem(item.id)}><Trash />永久删除</button></span></article>)}{trash.length === 0 ? <p>回收站为空。</p> : null}</section>
  </div>;
}
