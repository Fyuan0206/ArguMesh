import { ArrowRight, Lightbulb, Plus, Sparkle, Trash, X } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useWorkspace, type IdeaStatus } from "../state/workspace";

const COLUMNS: IdeaStatus[] = ["Inbox", "Draft", "Reviewing", "Approved"];

export function IdeasPage() {
  const { ideas, projects, addIdea, setIdeaStatus, deleteIdea } = useWorkspace();
  const [creating, setCreating] = useState(false);
  // 项目内入口(/ideas?project=:id)只显示该项目的 Ideas;直接访问 /ideas 显示全部。
  const [searchParams] = useSearchParams();
  const scopedProjectId = searchParams.get("project");
  const scopedProject = scopedProjectId ? projects.find((project) => project.id === scopedProjectId) : undefined;
  const visibleIdeas = scopedProjectId ? ideas.filter((idea) => idea.projectId === scopedProjectId) : ideas;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get("title") ?? "").trim(); if (!title) return; addIdea({ title, summary: String(form.get("summary") ?? "").trim(), projectId: String(form.get("projectId") ?? "") }); event.currentTarget.reset(); setCreating(false); }
  return <div className="route-page ideas-page"><PageHeader eyebrow={scopedProject ? scopedProject.name : "Ideas"} title="Idea 工作流" actions={<button className="primary" onClick={() => setCreating(true)}><Plus />记录 Idea</button>} />
    {creating ? <form className="inline-form" onSubmit={submit}><div><strong>快速记录</strong></div><label><span>标题</span><input name="title" required autoFocus /></label><label className="grow"><span>核心描述</span><input name="summary" /></label><label><span>项目</span><select name="projectId" required defaultValue={scopedProjectId ?? ""}>{projects.filter((project) => project.status === "active").map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><button className="primary">保存</button><button type="button" className="icon-button" onClick={() => setCreating(false)}><X /></button></form> : null}
    <section className="idea-board">{COLUMNS.map((column) => <div className="idea-column" key={column}><header><span>{column}</span><strong>{visibleIdeas.filter((idea) => idea.status === column).length}</strong></header><div>{visibleIdeas.filter((idea) => idea.status === column).map((idea) => <article className="idea-card" key={idea.id}><div className="idea-card-head"><div className="idea-icon">{column === "Inbox" ? <Lightbulb /> : <Sparkle />}</div><button className="icon-button subtle danger" onClick={() => deleteIdea(idea.id)} aria-label="移到回收站"><Trash /></button></div><h3>{idea.title}</h3><p>{idea.summary || "尚未补充描述。"}</p><div className="idea-meta"><span>{projects.find((project) => project.id === idea.projectId)?.name ?? "未归属项目"}</span><span>{idea.evidenceCount} 条证据</span></div><label><span>推进状态</span><select value={idea.status} onChange={(event) => setIdeaStatus(idea.id, event.target.value as IdeaStatus)}>{COLUMNS.map((item) => <option key={item}>{item}</option>)}</select></label><Link className="idea-open" to={`/ideas/${encodeURIComponent(idea.id)}/canvas?project=${encodeURIComponent(idea.projectId)}`}>打开 Canvas <ArrowRight /></Link></article>)}</div></div>)}</section>
    {visibleIdeas.some((idea) => !COLUMNS.includes(idea.status)) ? <section className="surface-card archived-ideas"><h2>后续阶段与归档</h2>{visibleIdeas.filter((idea) => !COLUMNS.includes(idea.status)).map((idea) => <Link key={idea.id} to={`/ideas/${idea.id}/canvas?project=${encodeURIComponent(idea.projectId)}`}><span>{idea.title}</span><strong>{idea.status}</strong></Link>)}</section> : null}
  </div>;
}
