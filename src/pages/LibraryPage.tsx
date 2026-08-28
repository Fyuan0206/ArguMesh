import { ArrowClockwise, ArrowLeft, ArrowRight, BookOpenText, Eye, FileText, FolderOpen, FolderSimple, Heart, LinkSimple, MagnifyingGlass, NotePencil, PencilSimple, Plus, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EditPaperModal } from "../components/EditPaperModal";
import { PageHeader } from "../components/PageHeader";
import { SyncBanner } from "../components/SyncBanner";
import { EmptyState } from "../components/states";
import { deletePaperFiles, savePaperPdf } from "../storage/paperFiles";
import { useWorkspace, type LocalPaper, type ReadingStatus } from "../state/workspace";
import { inspectPdf, sha256File } from "../pdf/document";
import { resolveLiterature, scanLiteratureInbox, syncPaper, syncProject, uploadPaperFile } from "../api";

const STATUSES: ReadingStatus[] = ["待读", "粗读", "精读", "核心文献"];
type UploadItem = { id: string; file: File; progress: number; status: "queued" | "reading" | "uploading" | "done" | "failed"; message: string; paperId?: string };

export function LibraryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { papers, projects, addPaper, updatePaper, setPaperTags, togglePaperFavorite, setReadingStatus, setPaperFile, removePaperFromProject, deletePaper } = useWorkspace();
  const navigate = useNavigate();
  const project = projects.find((item) => item.id === projectId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ReadingStatus | "全部">("全部");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState("");
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [scanningInbox, setScanningInbox] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [editingPaperId, setEditingPaperId] = useState("");
  const projectPapers = useMemo(() => papers.filter((paper) => paper.projectIds.includes(projectId ?? "")), [papers, projectId]);
  const filtered = useMemo(() => projectPapers.filter((paper) => (status === "全部" || paper.status === status) && `${paper.title} ${paper.authors} ${paper.venue} ${paper.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [projectPapers, query, status]);

  if (!projectId) {
    return <div className="route-page">
      <PageHeader eyebrow="项目文献库" title="选择研究项目" />
      <SyncBanner />
      <section className="library-project-grid" aria-label="选择文献所属项目">
        {projects.map((item) => {
          const count = papers.filter((paper) => paper.projectIds.includes(item.id)).length;
          return <Link className={`surface-card library-project-card ${item.status === "archived" ? "is-muted" : ""}`} to={`/projects/${encodeURIComponent(item.id)}/library`} key={item.id}>
            <div className="card-icon"><FolderSimple weight="duotone" /></div>
            <div><span className="eyebrow">进行中</span><h2>{item.name}</h2><p>{item.description || "尚未填写研究目标。"}</p><strong>{count} 篇项目文献</strong></div>
            <ArrowRight className="library-project-arrow" />
          </Link>;
        })}
      </section>
      {projects.length === 0 ? <EmptyState icon={<FolderSimple />} title="还没有研究项目" description="请先创建项目，再向项目中添加文献。" action={<Link className="primary" to="/projects">创建项目</Link>} /> : null}
    </div>;
  }

  if (!project) {
    return <div className="route-page"><EmptyState icon={<FolderSimple />} title="项目不存在" description="该项目可能已被删除，或链接不正确。" action={<Link className="primary" to="/projects">返回项目列表</Link>} /></div>;
  }
  const currentProjectId = project.id;
  const currentProject = project;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;
    const authors = String(form.get("authors") ?? "").trim();
    const venue = String(form.get("venue") ?? "").trim() || "未发表";
    const year = Number(form.get("year")) || new Date().getFullYear();
    const paperId = addPaper({ title, authors, venue, year, projectIds: [currentProjectId] });
    event.currentTarget.reset();
    setAdding(false);
    // 手工保存同样要同步到云端(与导入/PDF 上传路径一致,见 ERR-20260814-001)。
    // 否则论文只存在于浏览器本地:后续编辑会因"论文不存在"反复进同步失败队列,
    // 重载后本地副本还会被 cloud-first 合并清掉。
    try {
      await syncProject(currentProject);
      await syncPaper(currentProjectId, { id: paperId, title, authors, venue, year });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "同步云端失败,已保存到本地");
    }
  }

  async function uploadPdf(paperId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if ((file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) || file.size > 25 * 1024 * 1024) {
      window.alert("请选择不超过 25 MB 的 PDF 文件。");
      return;
    }
    await savePaperPdf(paperId, file);
    const metadata = await inspectPdf(file);
    const hash = await sha256File(file);
    setPaperFile(paperId, { name: file.name, size: file.size });
    updatePaper(paperId, { fileHash: hash, pageCount: metadata.pageCount, outline: metadata.outline, authors: metadata.authors || papers.find((item) => item.id === paperId)?.authors });
    const paper = papers.find((item) => item.id === paperId);
    if (paper) {
      await syncProject(currentProject);
      await syncPaper(currentProjectId, { ...paper, fileHash: hash });
      await uploadPaperFile(paperId, file);
    }
    navigate(`/projects/${encodeURIComponent(currentProjectId)}/library/${encodeURIComponent(paperId)}/read`);
  }

  async function processUpload(item: UploadItem) {
    const file = item.file;
    const update = (updates: Partial<UploadItem>) => setUploadItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updates } : entry));
    try {
      update({ status: "reading", message: "读取元数据与文件指纹" });
      const [metadata, hash] = await Promise.all([inspectPdf(file), sha256File(file)]);
      const title = metadata.title || file.name.replace(/\.pdf$/i, "").trim() || "未命名文献";
      const paperId = addPaper({ title, authors: metadata.authors, venue: "本地 PDF", year: new Date().getFullYear(), projectIds: [currentProjectId], fileHash: hash, fileName: file.name, fileSize: file.size, pageCount: metadata.pageCount, outline: metadata.outline });
      update({ paperId, status: "uploading", progress: .1, message: "本地已保存，正在同步云端" });
      await savePaperPdf(paperId, file);
      setPaperFile(paperId, { name: file.name, size: file.size });
      await syncProject(currentProject);
      const storedPaper = { id: paperId, title, authors: metadata.authors, venue: "本地 PDF", year: new Date().getFullYear(), fileHash: hash };
      const synced = await syncPaper(currentProjectId, storedPaper);
      const upload = await uploadPaperFile(synced.paperId, file, (progress) => update({ progress: .1 + progress * .9 }));
      const localOnlyMessage = upload.cloudStored ? "上传完成" : "已保存到当前浏览器（云端 PDF 未启用）";
      update({ paperId, status: "done", progress: 1, message: synced.duplicate ? "已去重并关联到当前项目" : localOnlyMessage });
    } catch (error) {
      update({ status: "failed", message: error instanceof Error ? error.message : "上传失败" });
    }
  }

  async function uploadNewPdf(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length || uploading) return;
    const accepted = files.filter((file) => (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) && file.size <= 25 * 1024 * 1024);
    if (accepted.length !== files.length) window.alert("已跳过非 PDF 或超过 25 MB 的文件。");
    const items = accepted.map((file) => ({ id: crypto.randomUUID(), file, progress: 0, status: "queued" as const, message: "等待处理" }));
    setUploadItems((current) => [...items, ...current]);
    setUploading(true);
    try {
      for (const item of items) await processUpload(item);
    } finally {
      setUploading(false);
    }
  }

  async function importLiterature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importValue.trim() || importing) return;
    setImporting(true); setImportError("");
    try {
      const metadata = await resolveLiterature(importValue.trim());
      const paperId = addPaper({ ...metadata, projectIds: [currentProjectId] });
      await syncProject(currentProject);
      await syncPaper(currentProjectId, { id: paperId, ...metadata });
      setImportValue(""); setAdding(false);
    } catch (error) { setImportError(error instanceof Error ? error.message : "导入失败"); }
    finally { setImporting(false); }
  }

  async function syncLiteratureFolder() {
    if (scanningInbox || !currentProject.workspacePath) return;
    setScanningInbox(true);
    setScanMessage("");
    try {
      const result = await scanLiteratureInbox(currentProjectId);
      for (const item of result.items) {
        if ((item.status !== "imported" && item.status !== "linked") || !item.paperId || !item.title) continue;
        addPaper({
          id: item.paperId,
          title: item.title,
          authors: "",
          venue: "本地 PDF",
          year: new Date().getFullYear(),
          projectIds: [currentProjectId],
          fileHash: item.fileHash,
          fileName: item.fileName || undefined,
          fileSize: item.fileSize,
          tags: ["inbox"],
        });
      }
      const parts = [
        result.imported ? `新导入 ${result.imported} 篇` : "",
        result.linked ? `关联 ${result.linked} 篇` : "",
        result.skipped ? `跳过 ${result.skipped} 篇` : "",
        result.failed ? `失败 ${result.failed} 篇` : "",
      ].filter(Boolean);
      setScanMessage(parts.length ? `${parts.join("，")}（扫描目录：literature/）` : `literature/ 中暂无可导入的 PDF（${result.inboxPath}）`);
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : "同步文献文件夹失败");
    } finally {
      setScanningInbox(false);
    }
  }

  function openEditModal(paperId: string) { setEditingPaperId(paperId); }

  function handleEditSubmit(paper: LocalPaper, updates: { title: string; authors: string; venue: string; year: number; abstract: string; tags: string[]; readingStatus: ReadingStatus; favorite: boolean }) {
    updatePaper(paper.id, updates);
    setPaperTags(paper.id, updates.tags);
    setReadingStatus(paper.id, updates.readingStatus);
    if (Boolean(paper.favorite) !== updates.favorite) togglePaperFavorite(paper.id);
  }

  function handleDelete(paper: LocalPaper) {
    if (!window.confirm(`永久删除文献「${paper.title}」? 将从所有项目移除，并删除其 PDF、证据与知识记录，云端同步删除，无法恢复。`)) return;
    deletePaper(paper.id);
    void deletePaperFiles(paper.id);
  }

  function handleUnlink(paper: LocalPaper) {
    if (!window.confirm(`从「${currentProject.name}」移除文献「${paper.title}」?`)) return;
    removePaperFromProject(paper.id, currentProjectId);
  }

  const editingPaper = editingPaperId ? papers.find((paper) => paper.id === editingPaperId) ?? null : null;

  return <div className="route-page">
    <PageHeader eyebrow="项目文献库" title={project.name} actions={<><Link className="secondary-button" to="/projects"><ArrowLeft /> 切换项目</Link>{currentProject.workspacePath ? <button className="secondary-button" type="button" disabled={scanningInbox} onClick={() => void syncLiteratureFolder()}><FolderOpen />{scanningInbox ? "正在同步…" : "同步 literature/"}</button> : null}<label className="secondary-button upload-button"><UploadSimple />{uploading ? "正在上传…" : "批量上传 PDF"}<input type="file" accept="application/pdf,.pdf" multiple disabled={uploading} onChange={(event) => void uploadNewPdf(event)} /></label><button className="primary" onClick={() => setAdding(true)}><Plus /> 导入文献</button></>} />
    <SyncBanner />
    {scanMessage ? <p className="form-note library-scan-note">{scanMessage}</p> : null}
    {editingPaper ? <EditPaperModal paper={editingPaper} statuses={STATUSES} currentProjectId={currentProjectId} onClose={() => setEditingPaperId("")} onSubmit={(updates) => { handleEditSubmit(editingPaper, updates); setEditingPaperId(""); }} onDelete={() => handleDelete(editingPaper)} onUnlink={editingPaper.projectIds.length > 1 ? handleUnlink.bind(null, editingPaper) : undefined} /> : null}
    <div className="toolbar-row"><label className="search wide"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者、会议或标签" /></label><div className="segmented">{(["全部", ...STATUSES] as const).map((item) => <button className={status === item ? "active" : ""} onClick={() => setStatus(item)} key={item}>{item}</button>)}</div></div>
    {adding ? <div className="surface-card import-panel"><header><div><strong>导入文献</strong></div><button className="icon-button" type="button" onClick={() => setAdding(false)} aria-label="取消"><X /></button></header><form className="literature-resolver" onSubmit={(event) => void importLiterature(event)}><LinkSimple /><input value={importValue} onChange={(event) => setImportValue(event.target.value)} placeholder="10.xxxx/…、arXiv:2401.12345 或 https://…" autoFocus /><button className="primary" disabled={importing}>{importing ? "正在获取元数据…" : "识别并导入"}</button></form>{importError ? <p className="form-error">{importError}</p> : null}<form className="inline-form multi" onSubmit={submit}><label className="grow"><span>论文标题</span><input name="title" required /></label><label><span>作者</span><input name="authors" /></label><label><span>会议/期刊</span><input name="venue" /></label><label className="compact"><span>年份</span><input name="year" type="number" min="1900" max="2100" defaultValue={new Date().getFullYear()} /></label><button className="secondary-button" type="submit">手工保存</button></form></div> : null}
    {uploadItems.length ? <section className="upload-queue surface-card"><header><strong>PDF 上传任务</strong><button className="text-button" onClick={() => setUploadItems((current) => current.filter((item) => item.status !== "done"))}>清除已完成</button></header>{uploadItems.map((item) => <article key={item.id}><div><FileUploadState status={item.status} /><span><strong>{item.file.name}</strong><small>{item.message}</small></span></div><progress max={1} value={item.progress} />{item.status === "failed" ? <button className="text-button" onClick={() => void processUpload(item)}><ArrowClockwise />重试</button> : null}</article>)}</section> : null}
    {filtered.length === 0 ? (
      <div className="table-surface table-surface-empty">
        <EmptyState
          icon={<BookOpenText />}
          title="当前项目没有匹配的文献"
          description="调整筛选条件，或向这个项目添加一篇文献。"
          action={<button className="primary" type="button" onClick={() => setAdding(true)}><Plus /> 导入文献</button>}
        />
      </div>
    ) : (
      <div className="table-surface"><table className="data-table"><thead><tr><th>文献</th><th>发表</th><th>阅读状态</th><th>工作区</th></tr></thead><tbody>{filtered.map((paper) => <tr key={paper.id}><td><div className="paper-title-cell"><button className={`favorite-button ${paper.favorite ? "active" : ""}`} onClick={() => togglePaperFavorite(paper.id)} aria-label={paper.favorite ? "取消收藏" : "收藏文献"}><Heart weight={paper.favorite ? "fill" : "regular"} /></button><BookOpenText weight="duotone" /><span><strong>{paper.title}</strong><small>{paper.authors}{paper.tags.length ? ` · ${paper.tags.map((tag) => `#${tag}`).join(" ")}` : ""}</small>{paper.fileName ? <em>{paper.fileName} · {(paper.fileSize! / 1024 / 1024).toFixed(1)} MB{paper.pageCount ? ` · ${paper.pageCount} 页` : ""}</em> : null}{editingPaperId === paper.id ? <input className="tag-input" defaultValue={paper.tags.join(", ")} autoFocus onBlur={(event) => { setPaperTags(paper.id, event.target.value.split(/[,，]+/)); setEditingPaperId(""); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="标签，逗号分隔" /> : null}</span><button className="icon-button subtle" onClick={() => setEditingPaperId(paper.id)} aria-label="编辑标签"><NotePencil /></button></div></td><td><strong>{paper.venue}</strong><small>{paper.year}</small></td><td><select className={`status-select status-${STATUSES.indexOf(paper.status)}`} value={paper.status} onChange={(event) => setReadingStatus(paper.id, event.target.value as ReadingStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></td><td><div className="reader-actions"><Link className="secondary-button" to={`/projects/${encodeURIComponent(currentProjectId)}/library/${encodeURIComponent(paper.id)}`}><FileText />Paper Card</Link>{paper.fileName ? <button className="secondary-button" onClick={() => navigate(`/projects/${encodeURIComponent(currentProjectId)}/library/${encodeURIComponent(paper.id)}/read`)}><Eye />阅读</button> : null}<label className="text-button upload-link"><UploadSimple />{paper.fileName ? "更换" : "上传 PDF"}<input type="file" accept="application/pdf,.pdf" onChange={(event) => void uploadPdf(paper.id, event)} /></label><button className="text-button subtle" type="button" onClick={() => openEditModal(paper.id)} aria-label="编辑文献元数据"><PencilSimple /> 编辑</button><button className="text-button danger" type="button" onClick={() => handleDelete(paper)} aria-label="删除文献"><Trash /> 删除</button></div></td></tr>)}</tbody></table></div>
    )}
  </div>;
}

function FileUploadState({ status }: { status: UploadItem["status"] }) {
  return status === "failed" ? <X /> : status === "done" ? <BookOpenText /> : <UploadSimple />;
}
