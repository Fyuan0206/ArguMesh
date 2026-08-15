import { BookOpenText, CheckCircle, Funnel, NotePencil, Plus, Trash, X } from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";
import { useWorkspace, type KnowledgeKind } from "../state/workspace";

const LABELS: Record<KnowledgeKind, string> = { note: "笔记", claim: "Claim", evidence: "Evidence" };

export function KnowledgePage() {
  const { knowledge, projects, papers, addKnowledge, updateKnowledge, deleteKnowledge } = useWorkspace();
  const [kind, setKind] = useState<KnowledgeKind | "all">("all");
  const [projectId, setProjectId] = useState("all");
  const [creating, setCreating] = useState(false);
  const filtered = useMemo(() => knowledge.filter((item) => (kind === "all" || item.kind === kind) && (projectId === "all" || item.projectId === projectId)), [kind, knowledge, projectId]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const project = String(form.get("projectId")); const paper = String(form.get("paperId"));
    addKnowledge({ projectId: project, paperId: paper, kind: String(form.get("kind")) as KnowledgeKind, title: String(form.get("title")).trim(), content: String(form.get("content")).trim(), note: "", page: Number(form.get("page")) || 1, source: "human", status: "draft" });
    setCreating(false); event.currentTarget.reset();
  }
  return <div className="route-page knowledge-page"><PageHeader eyebrow="Knowledge" title="知识与证据" actions={<button className="primary" onClick={() => setCreating(true)}><Plus />新建知识</button>} />
    <div className="toolbar-row"><div className="segmented">{(["all", "note", "claim", "evidence"] as const).map((item) => <button className={kind === item ? "active" : ""} onClick={() => setKind(item)} key={item}>{item === "all" ? "全部" : LABELS[item]}</button>)}</div><label className="filter-select"><Funnel /><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">所有项目</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label></div>
    {creating ? <form className="surface-card knowledge-form" onSubmit={submit}><header><strong>新建知识对象</strong><button type="button" className="icon-button" onClick={() => setCreating(false)}><X /></button></header><label><span>类型</span><select name="kind"><option value="note">笔记</option><option value="claim">Claim</option><option value="evidence">Evidence</option></select></label><label><span>项目</span><select name="projectId" required>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label><span>论文</span><select name="paperId" required>{papers.map((paper) => <option value={paper.id} key={paper.id}>{paper.title}</option>)}</select></label><label><span>页码</span><input name="page" type="number" min="1" defaultValue="1" /></label><label className="span-all"><span>标题</span><input name="title" required /></label><label className="span-all"><span>内容或原文</span><textarea name="content" required /></label><button className="primary">保存</button></form> : null}
    <section className="knowledge-list">{filtered.map((item) => { const paper = papers.find((entry) => entry.id === item.paperId); return <article className={`surface-card knowledge-card kind-${item.kind}`} key={item.id}><header><span>{LABELS[item.kind]}</span><small>{item.source === "ai" ? "AI 生成" : "人工记录"}</small></header><h2>{item.title}</h2><p>{item.content}</p>{item.note ? <blockquote>{item.note}</blockquote> : null}<footer><Link to={`/projects/${encodeURIComponent(item.projectId)}/library/${encodeURIComponent(item.paperId)}/read`}>{paper?.title ?? "来源论文"} · 第 {item.page} 页 <BookOpenText /></Link><span><button className={item.status === "confirmed" ? "confirmed" : ""} onClick={() => updateKnowledge(item.id, { status: item.status === "confirmed" ? "draft" : "confirmed" })}><CheckCircle weight={item.status === "confirmed" ? "fill" : "regular"} />{item.status === "confirmed" ? "已确认" : "确认"}</button><button onClick={() => { const note = window.prompt("补充你的判断", item.note); if (note !== null) updateKnowledge(item.id, { note }); }}><NotePencil /></button><button className="danger" onClick={() => deleteKnowledge(item.id)}><Trash /></button></span></footer></article>; })}</section>
    {filtered.length === 0 ? <EmptyState icon={<NotePencil />} title="还没有匹配的知识对象" description="从 PDF 阅读器保存摘录，或在这里手工创建。" /> : null}
  </div>;
}
