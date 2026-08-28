import { ArrowClockwise, Check, Code, FilePdf, FileText, FloppyDisk, FolderOpen, MagicWand, Play, Warning, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  compilePaper,
  getPaperCompileStatus,
  getPaperOutline,
  getPaperProposal,
  getPaperSource,
  initializePaper,
  listPaperSnapshots,
  paperPdfUrl,
  patchProject,
  pickDirectory,
  proposePaperPatch,
  restorePaperSnapshot,
  savePaperSource,
  type PaperCompileStatus,
  type PaperOutlineItem,
  type PaperPatch,
  type PaperSnapshot,
  type PaperSource,
} from "../api";
import { EmptyState } from "../components/states";
import { useWorkspace } from "../state/workspace";

type FileName = "main.tex" | "references.bib";

export function WritingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, updateProject } = useWorkspace();
  const project = projects.find((item) => item.id === projectId);
  const [file, setFile] = useState<FileName>(() => new URLSearchParams(window.location.search).get("file") === "references.bib" ? "references.bib" : "main.tex");
  const [source, setSource] = useState<PaperSource | null>(null);
  const [content, setContent] = useState("");
  const [outline, setOutline] = useState<PaperOutlineItem[]>([]);
  const [snapshots, setSnapshots] = useState<PaperSnapshot[]>([]);
  const [compileStatus, setCompileStatus] = useState<PaperCompileStatus | null>(null);
  const [patch, setPatch] = useState<{ data: PaperPatch; baseVersion: string } | null>(null);
  const [needsInitialization, setNeedsInitialization] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const dirty = source ? content !== source.content : false;

  async function load(pid: string, nextFile: FileName = file) {
    setError("");
    try {
      const [sourceRes, outlineRes, snapshotRes, statusRes] = await Promise.all([
        getPaperSource(pid, nextFile), getPaperOutline(pid), listPaperSnapshots(pid), getPaperCompileStatus(pid),
      ]);
      setSource(sourceRes); setContent(sourceRes.content); setOutline(outlineRes.outline); setSnapshots(snapshotRes.snapshots);
      setCompileStatus(statusRes); setNeedsInitialization(false); setPatch(null);
    } catch { setNeedsInitialization(true); }
  }
  useEffect(() => { if (projectId && project?.workspacePath) void load(projectId, file); }, [projectId, project?.workspacePath]);
  useEffect(() => {
    const actionId = new URLSearchParams(window.location.search).get("proposal");
    if (!projectId || !actionId || !source) return;
    getPaperProposal(projectId, actionId).then((result) => {
      if (result.baseVersion !== source.version) setError("对话中的论文提案基于旧版本，请重新生成。" );
      else setPatch({ data: result.proposal, baseVersion: result.baseVersion });
    }).catch(() => setError("无法读取对话中的论文提案。"));
  }, [projectId, source?.version]);

  if (!projectId || !project) return <div className="route-page"><EmptyState icon={<FileText />} title="项目不存在" description="请从项目列表进入论文写作。" /></div>;

  async function chooseWorkspace() {
    setBusy("folder"); setError("");
    try {
      const path = await pickDirectory(); if (!path) return;
      await patchProject(projectId!, { workspacePath: path }); updateProject(projectId!, { workspacePath: path });
      setNeedsInitialization(true);
    } catch { setError("无法选择或保存工作文件夹。" ); } finally { setBusy(""); }
  }
  async function initialize() {
    setBusy("initialize"); setError("");
    try { await initializePaper(projectId!); await load(projectId!, "main.tex"); }
    catch { setError("初始化失败。请确认项目工作文件夹仍然存在且可写。" ); } finally { setBusy(""); }
  }
  async function switchFile(nextFile: FileName) {
    if (nextFile === file) return;
    if (dirty && !confirm("当前修改尚未保存，仍要切换文件吗？")) return;
    setFile(nextFile); await load(projectId!, nextFile);
  }
  async function save(nextContent = content): Promise<PaperSource | null> {
    if (!source) return null;
    setBusy("save"); setError("");
    try {
      const saved = await savePaperSource(projectId!, file, nextContent, source.version);
      setSource(saved); setContent(saved.content); setPatch(null);
      const snapshotRes = await listPaperSnapshots(projectId!); setSnapshots(snapshotRes.snapshots);
      if (file === "main.tex") setOutline((await getPaperOutline(projectId!)).outline);
      return saved;
    } catch { setError("保存失败：文件可能已被外部修改。请刷新后对比内容，系统没有覆盖外部版本。" ); return null; }
    finally { setBusy(""); }
  }
  async function requestPatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!source || file !== "main.tex") return;
    const form = event.currentTarget; const instruction = String(new FormData(form).get("instruction") ?? "").trim(); if (!instruction) return;
    const textarea = editorRef.current; const selection = textarea && textarea.selectionEnd > textarea.selectionStart ? { start: textarea.selectionStart, end: textarea.selectionEnd } : undefined;
    setBusy("patch"); setError("");
    try {
      const result = await proposePaperPatch(projectId!, instruction, source.version, selection);
      setPatch({ data: result.patch, baseVersion: result.baseVersion }); form.reset();
    } catch { setError("AI 修改提案生成失败；原文未发生变化。请检查 AI 配置或刷新文件版本。" ); }
    finally { setBusy(""); }
  }
  async function acceptPatch() {
    if (!patch || !source || patch.baseVersion !== source.version) { setError("原文版本已变化，不能接受旧 Diff。" ); return; }
    const saved = await save(patch.data.proposedSource);
    if (!saved || file !== "main.tex") return;
    setBusy("compile");
    try { setCompileStatus(await compilePaper(projectId!)); }
    catch {
      setCompileStatus(await getPaperCompileStatus(projectId!));
      setError("AI Diff 已安全保存并创建快照，但自动编译发现问题；可在右侧定位或生成修复 Diff。" );
    } finally { setBusy(""); }
  }
  async function runCompile() {
    if (dirty && !confirm("当前内容尚未保存，编译将使用上次保存的版本。继续吗？")) return;
    setBusy("compile"); setError("");
    try { setCompileStatus(await compilePaper(projectId!)); }
    catch { setError("编译失败。请查看右侧问题列表。" ); setCompileStatus(await getPaperCompileStatus(projectId!)); }
    finally { setBusy(""); }
  }
  async function requestCompileFix() {
    if (!source || file !== "main.tex" || !compileStatus?.issues.length) return;
    if (dirty) { setError("请先保存当前修改，再根据最新版本生成编译修复 Diff。" ); return; }
    const issueText = compileStatus.issues.slice(0, 20).map((issue) => `${issue.line ? `main.tex:${issue.line}` : issue.severity}: ${issue.message}`).join("\n");
    setBusy("compile-fix"); setError("");
    try {
      const result = await proposePaperPatch(projectId!, `仅修复下列 LaTeX 编译问题，不修改无关学术内容，也不要添加不存在的引用或数据：\n${issueText}`, source.version);
      setPatch({ data: result.patch, baseVersion: result.baseVersion });
    } catch { setError("无法生成编译修复 Diff；原文没有发生变化。请检查 AI 配置后重试。" ); }
    finally { setBusy(""); }
  }
  async function restore(snapshotId: string) {
    if (!confirm("恢复此快照？系统会先保存当前版本，操作可撤销。")) return;
    setBusy("restore");
    try { await restorePaperSnapshot(projectId!, snapshotId); await load(projectId!, file); }
    catch { setError("快照恢复失败。" ); } finally { setBusy(""); }
  }
  function jumpToLine(line: number) {
    const editor = editorRef.current; if (!editor) return;
    const offset = content.split(/\r?\n/).slice(0, Math.max(0, line - 1)).reduce((sum, value) => sum + value.length + 1, 0);
    editor.focus(); editor.setSelectionRange(offset, offset); editor.scrollTop = Math.max(0, (line - 5) * 20);
  }

  if (!project.workspacePath) return <div className="route-page writing-setup"><EmptyState icon={<FolderOpen />} title="先关联项目工作文件夹" description="论文将安全地保存在该文件夹的 paper/ 中；ArguMesh 不会在未知目录静默创建文件。" action={<button className="primary" disabled={busy === "folder"} onClick={chooseWorkspace}>{busy === "folder" ? "正在选择…" : "选择文件夹"}</button>} /></div>;
  if (needsInitialization) return <div className="route-page writing-setup"><EmptyState icon={<FileText />} title="初始化论文工作区" description={`将在 ${project.workspacePath} 下创建 paper/main.tex、references.bib、figures/ 与可恢复快照目录。已有文件不会被覆盖。`} action={<div className="writing-setup-actions"><button className="primary" disabled={busy === "initialize"} onClick={initialize}>{busy === "initialize" ? "初始化中…" : "初始化论文"}</button><button className="outline" onClick={chooseWorkspace}>更换文件夹</button></div>} />{error ? <div className="route-banner route-banner-warning">{error}</div> : null}</div>;

  return <div className="writing-workbench">
    <aside className="writing-outline-pane">
      <header><span>PAPER</span><h1>论文写作</h1><small title={project.workspacePath}>{project.name}</small></header>
      <nav className="writing-files"><button className={file === "main.tex" ? "active" : ""} onClick={() => switchFile("main.tex")}><Code />main.tex</button><button className={file === "references.bib" ? "active" : ""} onClick={() => switchFile("references.bib")}><FileText />references.bib</button></nav>
      <section><h2>章节目录</h2>{outline.map((item, index) => <button className={`outline-${item.level}`} key={`${item.line}-${index}`} onClick={() => { if (file !== "main.tex") void switchFile("main.tex").then(() => jumpToLine(item.line)); else jumpToLine(item.line); }}>{item.title}<small>l.{item.line}</small></button>)}</section>
      <section className="writing-snapshots"><h2>版本快照</h2>{snapshots.slice(0, 8).map((snapshot) => <button key={snapshot.id} disabled={busy === "restore"} onClick={() => restore(snapshot.id)}><ArrowClockwise /><span>{snapshot.reason}<small>{new Date(snapshot.createdAt).toLocaleString()}</small></span></button>)}</section>
    </aside>

    <main className="latex-editor-pane">
      <header className="latex-editor-toolbar"><div className="latex-file-state"><strong>{file}</strong>{dirty ? <span className="unsaved-dot">未保存</span> : <span>已同步</span>}</div><button className="primary" disabled={!dirty || busy === "save"} onClick={() => save()}><FloppyDisk />保存</button></header>
      {error ? <div className="route-banner route-banner-warning" role="status">{error}</div> : null}
      {patch ? <section className="latex-diff" aria-label="AI 修改 Diff">
        <header><div><span>AI DIFF</span><strong>{patch.data.summary}</strong></div><div><button className="outline" onClick={() => setPatch(null)}><X />拒绝</button><button className="primary" onClick={acceptPatch}><Check />接受并创建快照</button></div></header>
        {patch.data.warnings.length ? <div className="latex-diff-warnings"><Warning />{patch.data.warnings.join("；")}</div> : null}
        <div className="latex-diff-columns"><div><span>当前版本</span><pre>{source?.content}</pre></div><div><span>候选版本</span><pre>{patch.data.proposedSource}</pre></div></div>
      </section> : <textarea ref={editorRef} className="latex-source-editor" spellCheck={false} value={content} onChange={(event) => setContent(event.target.value)} aria-label={`${file} 编辑器`} />}
      {file === "main.tex" && !patch ? <form className="latex-ai-composer" onSubmit={requestPatch}><MagicWand /><input name="instruction" required placeholder="让 AI 撰写本节、根据证据改写或检查引用…" /><button className="primary" disabled={busy === "patch"}>{busy === "patch" ? "生成中…" : "生成 Diff"}</button></form> : null}
    </main>

    <aside className="pdf-preview-pane">
      <header><div><span>PDF PREVIEW</span><strong>{compileStatus?.engine ? compileStatus.engine : "LaTeX"}</strong></div><button className="primary" disabled={busy === "compile"} onClick={runCompile}><Play />{busy === "compile" ? "编译中…" : "编译"}</button></header>
      {compileStatus?.status === "succeeded" ? <iframe title="论文 PDF 预览" src={paperPdfUrl(projectId!, compileStatus.pdfUpdatedAt ?? "latest")} /> : <div className="pdf-empty-preview"><FilePdf /><strong>{compileStatus?.status === "unavailable" ? "未检测到 LaTeX 引擎" : "尚无 PDF"}</strong><p>{compileStatus?.status === "unavailable" ? "安装 Tectonic 或 TeX Live (latexmk) 后即可编译；编辑与快照功能不受影响。" : "保存 main.tex 后点击编译。"}</p></div>}
      {compileStatus?.issues.length ? <section className="compile-issues"><header><h2>编译问题</h2><button className="compile-ai-fix" disabled={busy === "compile-fix" || dirty} onClick={requestCompileFix}><MagicWand />{busy === "compile-fix" ? "生成中…" : "AI 修复 Diff"}</button></header>{compileStatus.issues.map((issue, index) => <button key={index} onClick={() => issue.line && jumpToLine(issue.line)}><Warning /><span>{issue.message}<small>{issue.line ? `main.tex:${issue.line}` : issue.severity}</small></span></button>)}</section> : null}
      {source?.missingCitations?.length ? <section className="compile-issues"><h2>缺少 BibTeX</h2>{source.missingCitations.map((key) => <div key={key}><Warning /><code>{key}</code></div>)}</section> : null}
    </aside>
  </div>;
}
