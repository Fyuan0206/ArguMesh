import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Heart, X } from "@phosphor-icons/react";
import type { LocalPaper, ReadingStatus } from "../state/workspace";

interface EditPaperModalProps {
  paper: LocalPaper;
  statuses: ReadingStatus[];
  onSubmit: (updates: {
    title: string;
    authors: string;
    venue: string;
    year: number;
    abstract: string;
    tags: string[];
    readingStatus: ReadingStatus;
    favorite: boolean;
  }) => void;
  onDelete: () => void;
  onUnlink?: (projectId: string) => void;
  currentProjectId?: string;
  onClose: () => void;
}

/**
 * 论文编辑模态框 — Portal 渲染,Escape 关闭,点击背景关闭,焦点 trap。
 *
 * 设计要点(2026-08-13 UX 整改):
 * - 危险操作(删除/解绑)放入独立的"危险操作"折叠区,避免与保存按钮视觉混淆。
 * - 删除前要求输入论文标题前缀二次确认,降低误触。
 * - 标签区显示当前已有标签作为 chip,用户可一键移除。
 * - 焦点 trap 在 modal 内循环。
 */
export function EditPaperModal({ paper, statuses, onSubmit, onDelete, onUnlink, currentProjectId, onClose }: EditPaperModalProps) {
  const [title, setTitle] = useState(paper.title);
  const [authors, setAuthors] = useState(paper.authors);
  const [venue, setVenue] = useState(paper.venue);
  const [year, setYear] = useState(paper.year);
  const [abstract, setAbstract] = useState(paper.abstract ?? "");
  const [tags, setTags] = useState<string[]>(paper.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [status, setStatus] = useState<ReadingStatus>(paper.status);
  const [favorite, setFavorite] = useState(Boolean(paper.favorite));
  const [titleError, setTitleError] = useState("");
  const [confirming, setConfirming] = useState<"delete" | "unlink" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(paper.title);
    setAuthors(paper.authors);
    setVenue(paper.venue);
    setYear(paper.year);
    setAbstract(paper.abstract ?? "");
    setTags(paper.tags);
    setTagDraft("");
    setStatus(paper.status);
    setFavorite(Boolean(paper.favorite));
    setTitleError("");
    setConfirming(null);
    setConfirmText("");
  }, [paper.id, paper.title, paper.authors, paper.venue, paper.year, paper.abstract, paper.status, paper.favorite, paper.tags]);

  useEffect(() => { titleInputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") trapFocus(event);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, confirming]);

  function trapFocus(event: KeyboardEvent) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])");
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function addTag() {
    const next = tagDraft.split(/[,，]+/).map((t) => t.trim()).filter(Boolean);
    if (next.length === 0) return;
    setTags((current) => [...new Set([...current, ...next])].slice(0, 40));
    setTagDraft("");
  }

  function removeTag(tag: string) {
    setTags((current) => current.filter((t) => t !== tag));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError("论文标题不能为空");
      titleInputRef.current?.focus();
      return;
    }
    onSubmit({
      title: trimmedTitle,
      authors: authors.trim(),
      venue: venue.trim() || "未发表",
      year: Number(year) || new Date().getFullYear(),
      abstract: abstract.trim(),
      tags,
      readingStatus: status,
      favorite,
    });
  }

  function onBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !confirming) onClose();
  }

  const archiveMatchLength = 3;
  const archiveConfirmOk = useMemo(() => confirmText.trim() === paper.title.slice(0, archiveMatchLength).trim() && confirmText.trim().length > 0, [confirmText, paper.title]);
  const unlinkOk = useMemo(() => confirmText.trim().toLowerCase() === "remove", [confirmText]);

  const showUnlink = Boolean(onUnlink && currentProjectId && paper.projectIds.length > 1);

  return createPortal(
    <div className="crud-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-paper-title" onMouseDown={onBackdrop}>
      <form className="crud-modal" onSubmit={submit} ref={dialogRef}>
        <header>
          <div>
            <strong id="edit-paper-title">编辑文献</strong>
            <span>修改元数据后,云端会后台同步;失败时可在顶部横幅重试。</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X /></button>
        </header>
        <label>
          <span>论文标题</span>
          <input
            ref={titleInputRef}
            value={title}
            onChange={(event) => { setTitle(event.target.value); if (titleError) setTitleError(""); }}
            maxLength={500}
            aria-invalid={titleError ? "true" : "false"}
            aria-describedby={titleError ? "edit-paper-error" : undefined}
          />
          {titleError ? <small id="edit-paper-error" className="crud-error">{titleError}</small> : null}
        </label>
        <div className="field-row">
          <label>
            <span>作者</span>
            <input value={authors} onChange={(event) => setAuthors(event.target.value)} maxLength={500} placeholder="例如: Sun et al." />
          </label>
          <label>
            <span>会议/期刊</span>
            <input value={venue} onChange={(event) => setVenue(event.target.value)} maxLength={200} />
          </label>
        </div>
        <div className="field-row">
          <label>
            <span>年份</span>
            <input type="number" min="1500" max="2200" step="1" value={year} onChange={(event) => setYear(Number(event.target.value) || new Date().getFullYear())} />
          </label>
          <label>
            <span>阅读状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ReadingStatus)}>
              {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="tag-editor">
          <span className="tag-editor-label">标签</span>
          <div className="tag-chips" aria-label="已添加的标签">
            {tags.length === 0 ? <span className="tag-empty">暂无标签</span> : tags.map((tag) => (
              <span key={tag} className="tag-chip">
                #{tag}
                <button type="button" aria-label={`移除标签 ${tag}`} onClick={() => removeTag(tag)}>×</button>
              </span>
            ))}
          </div>
          <div className="tag-input-row">
            <input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); }
                if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) setTags((current) => current.slice(0, -1));
              }}
              placeholder="输入新标签后回车或按逗号"
              maxLength={60}
            />
            <button type="button" className="secondary-button" onClick={addTag} disabled={tagDraft.trim().length === 0}>添加</button>
          </div>
          <small>最多 40 个标签,每个不超过 60 字符。</small>
        </div>
        <label>
          <span>摘要</span>
          <textarea value={abstract} onChange={(event) => setAbstract(event.target.value)} maxLength={4000} placeholder="支持 Markdown 风格的纯文本,可在 Reader 中检索。" />
        </label>
        <label className="inline-checkbox">
          <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} />
          <Heart weight={favorite ? "fill" : "regular"} className={favorite ? "favorited" : ""} />
          <span>收藏</span>
        </label>

        {confirming ? (
          <div className="crud-confirm" role="alertdialog" aria-labelledby="crud-confirm-title">
            <strong id="crud-confirm-title">
              {confirming === "delete" ? `永久删除「${paper.title}」?` : `从当前项目移除「${paper.title}」?`}
            </strong>
            <p>
              {confirming === "delete"
                ? "将删除论文及其 PDF、证据与知识记录,云端同步删除,无法恢复。"
                : "论文本体仍保留,可在其他项目中重新关联。"}
            </p>
            <small>
              {confirming === "delete"
                ? `为防止误操作,请输入论文标题前 ${archiveMatchLength} 个字:「${paper.title.slice(0, archiveMatchLength)}」`
                : "输入 REMOVE 确认移除"}
            </small>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoFocus
              placeholder={confirming === "delete" ? paper.title.slice(0, archiveMatchLength) : "REMOVE"}
            />
            <div className="crud-confirm-actions">
              <button type="button" className="secondary-button" onClick={() => { setConfirming(null); setConfirmText(""); }}>取消</button>
              <button
                type="button"
                className="primary danger-button"
                disabled={!(confirming === "delete" ? archiveConfirmOk : unlinkOk)}
                onClick={() => {
                  if (confirming === "delete") onDelete();
                  if (confirming === "unlink" && currentProjectId) onUnlink!(currentProjectId);
                  setConfirming(null);
                  setConfirmText("");
                }}
              >
                {confirming === "delete" ? "确认删除" : "确认移除"}
              </button>
            </div>
          </div>
        ) : (
          <details className="crud-danger-zone">
            <summary>危险操作</summary>
            <div className="crud-danger-actions">
              {showUnlink ? (
                <button type="button" className="secondary-button" onClick={() => { setConfirming("unlink"); setConfirmText(""); }}>从当前项目移除</button>
              ) : null}
              <button type="button" className="secondary-button danger-button" onClick={() => { setConfirming("delete"); setConfirmText(""); }}>删除文献</button>
            </div>
          </details>
        )}

        <footer>
          <small>操作不可撤销请谨慎,善用上方下拉。</small>
          <span>
            <button type="button" className="secondary-button" onClick={onClose}>取消</button>
            <button type="submit" className="primary">保存</button>
          </span>
        </footer>
      </form>
    </div>,
    document.body,
  );
}