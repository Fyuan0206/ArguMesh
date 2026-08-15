import { FolderSimple, MagnifyingGlass, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EditProjectForm } from "../components/EditProjectForm";
import { PageHeader } from "../components/PageHeader";
import { SyncBanner } from "../components/SyncBanner";
import { EmptyState } from "../components/states";
import { useWorkspace, type LocalProject } from "../state/workspace";

export function ProjectsPage() {
  const { projects, papers, ideas, addProject, updateProject, deleteProject } = useWorkspace();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const filtered = useMemo(() => projects.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase())), [projects, query]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    addProject({ name, description: String(form.get("description") ?? "").trim() });
    event.currentTarget.reset();
    setCreating(false);
  }

  async function handleDelete(project: LocalProject) {
    const paperCount = papers.filter((paper) => paper.projectIds.includes(project.id)).length;
    const warning = paperCount > 0
      ? `项目「${project.name}」下还有 ${paperCount} 篇文献、${ideas.filter((idea) => idea.projectId === project.id).length} 个 Ideas。\n\n删除后,云端项目及其全部关联数据将无法恢复。\n确定要继续吗?`
      : `确定要删除项目「${project.name}」吗?此操作会从云端移除该项目的所有数据。`;
    if (!window.confirm(warning)) return;
    setDeletingId(project.id);
    setDeleting(true);
    try {
      await deleteProject(project.id, { force: paperCount > 0 });
    } finally {
      setDeleting(false);
      setDeletingId("");
    }
  }

  return (
    <div className="route-page">
      <PageHeader eyebrow="项目" title="研究项目" actions={<button className="primary" onClick={() => setCreating(true)}><Plus /> 新建项目</button>} />
      <SyncBanner />
      <div className="toolbar-row">
        <label className="search wide"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" /></label>
      </div>
      {creating ? <form className="inline-form" onSubmit={submit}><div><strong>创建研究项目</strong></div><label><span>项目名称</span><input name="name" required autoFocus placeholder="例如：多模态医学影像推理" /></label><label className="grow"><span>研究目标</span><input name="description" placeholder="一句话描述要解决的问题" /></label><button className="primary" type="submit">创建</button><button className="icon-button" type="button" onClick={() => setCreating(false)} aria-label="取消"><X /></button></form> : null}
      {editingId ? (() => {
        const editing = projects.find((project) => project.id === editingId);
        return editing ? <EditProjectForm project={editing} onCancel={() => setEditingId("")} onSubmit={(updates) => { updateProject(editing.id, updates); setEditingId(""); }} /> : null;
      })() : null}
      <section className="card-grid">
        {filtered.map((project) => {
          const paperCount = papers.filter((paper) => paper.projectIds.includes(project.id)).length;
          const ideaCount = ideas.filter((idea) => idea.projectId === project.id).length;
          return <article className="surface-card project-card" key={project.id}>
            {/* 整卡可点击进入项目,不再设独立的「进入项目」按钮;编辑/删除仍是明确的小按钮。 */}
            <Link className="project-card-entry" to={`/projects/${encodeURIComponent(project.id)}`}>
              <div className="card-icon"><FolderSimple weight="duotone" /></div>
              <div className="project-card-main"><div className="section-heading"><div><h2>{project.name}</h2></div></div><p>{project.description || "尚未填写研究目标。"}</p><dl className="mini-stats"><div><dt>文献</dt><dd>{paperCount}</dd></div><div><dt>Ideas</dt><dd>{ideaCount}</dd></div><div><dt>创建</dt><dd>{project.createdAt.slice(5)}</dd></div></dl></div>
            </Link>
            <div className="card-actions vertical"><button className="text-button subtle" type="button" onClick={() => setEditingId(project.id)}><PencilSimple /> 编辑</button><button className="text-button danger" type="button" disabled={deleting && deletingId === project.id} onClick={() => handleDelete(project)}><Trash />{deleting && deletingId === project.id ? "删除中…" : "删除项目"}</button></div>
          </article>;
        })}
      </section>
      {filtered.length === 0 ? <EmptyState icon={<FolderSimple />} title="没有匹配的项目" description="调整搜索词或创建一个新项目。" /> : null}
    </div>
  );
}
