import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FolderOpen, X } from "@phosphor-icons/react";
import * as api from "../api";
import type { LocalProject } from "../state/workspace";

interface EditProjectFormProps {
  project: LocalProject;
  onSubmit: (updates: { name: string; description: string; workspacePath?: string | null }) => void;
  onCancel: () => void;
}

/**
 * 项目编辑模态框 — 与 EditPaperModal 一致的 crud-modal 风格。
 *
 * 设计要点(2026-08-13 UX 整改):
 * - 与"创建项目"的内联表单视觉分离,避免在同一区域出现两个 inline-form。
 * - 字段垂直堆叠,顶部标题 + 描述区,底部主从操作(取消/保存)右对齐。
 * - Escape 关闭,点击背景关闭,焦点 trap 在模态内。
 * - 名称为空时给出明确错误反馈(不再静默 return)。
 */
export function EditProjectForm({ project, onSubmit, onCancel }: EditProjectFormProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [workspacePath, setWorkspacePath] = useState(project.workspacePath ?? "");
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState("");
  const [openError, setOpenError] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description);
    setWorkspacePath(project.workspacePath ?? "");
    setError("");
    setPickError("");
    setOpenError("");
  }, [project.id, project.name, project.description, project.workspacePath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
      if (event.key === "Tab") trapFocus(event);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  function trapFocus(event: KeyboardEvent) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>("input, button, textarea, [href], [tabindex]:not([tabindex='-1'])");
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function handlePickFolder() {
    setPickError("");
    setPicking(true);
    try {
      const path = await api.pickDirectory();
      if (path) setWorkspacePath(path);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "选择文件夹失败");
    } finally {
      setPicking(false);
    }
  }

  async function handleOpenPath() {
    setOpenError("");
    try {
      await api.openLocalPath(workspacePath);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "无法打开文件夹");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("项目名称不能为空");
      return;
    }
    onSubmit({ name: trimmedName, description: description.trim(), workspacePath: workspacePath.trim() || null });
  }

  function onBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onCancel();
  }

  return createPortal(
    <div className="crud-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-project-title" onMouseDown={onBackdrop}>
      <form className="crud-modal" onSubmit={submit} ref={dialogRef}>
        <header>
          <div>
            <strong id="edit-project-title">编辑项目「{project.name}」</strong>
            <span>仅修改名称与研究目标,文献、矩阵与 Ideas 保持不变。</span>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="关闭"><X /></button>
        </header>
        <label>
          <span>项目名称</span>
          <input
            value={name}
            required
            autoFocus
            onChange={(event) => { setName(event.target.value); if (error) setError(""); }}
            maxLength={120}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? "edit-project-error" : undefined}
          />
          {error ? <small id="edit-project-error" className="crud-error">{error}</small> : null}
        </label>
        <label>
          <span>研究目标</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="一句话描述要解决的问题" />
        </label>
        <label>
          <span>本地文件夹(可选,仅记录路径)</span>
          <div className="path-picker-row">
            <input readOnly value={workspacePath} placeholder="未选择(可选)" title={workspacePath || undefined} />
            <button type="button" className="secondary-button" disabled={picking} onClick={() => void handlePickFolder()}>
              <FolderOpen />{picking ? "选择中…" : "选择文件夹"}
            </button>
            {workspacePath ? <button type="button" className="text-button subtle" onClick={() => void handleOpenPath()}>打开</button> : null}
            {workspacePath ? <button type="button" className="text-button subtle" onClick={() => setWorkspacePath("")}>清除</button> : null}
          </div>
          {pickError ? <small className="crud-error">{pickError}</small> : null}
          {openError ? <small className="crud-error">{openError}</small> : null}
        </label>
        <footer>
          <small>URL 仍以 ID 标识,改名不影响分享与刷新。</small>
          <span>
            <button type="button" className="secondary-button" onClick={onCancel}>取消</button>
            <button type="submit" className="primary">保存修改</button>
          </span>
        </footer>
      </form>
    </div>,
    document.body,
  );
}