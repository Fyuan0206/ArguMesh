import { ArrowLeft, ClockCounterClockwise, FloppyDisk, LinkSimple, Trash } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/states";
import { useWorkspace, type IdeaCanvas, type IdeaStatus } from "../state/workspace";

const FIELDS: Array<{ key: keyof IdeaCanvas; label: string; prompt: string }> = [
  { key: "problem", label: "Problem", prompt: "具体问题、使用场景和受影响对象是什么？" }, { key: "gap", label: "Gap", prompt: "现有研究缺少什么？哪些证据支持这个判断？" }, { key: "hypothesis", label: "Hypothesis", prompt: "可证伪的核心假设是什么？" }, { key: "method", label: "Method", prompt: "准备如何解决？与现有方法的关键差异是什么？" }, { key: "experiment", label: "Experiment", prompt: "数据集、基线、指标和关键消融。" }, { key: "risks", label: "Risk", prompt: "最大失败风险、反例与替代解释。" },
];
const STATUSES: IdeaStatus[] = ["Inbox", "Draft", "Reviewing", "Revise", "Approved", "Experimenting", "Writing", "Archived"];

export function IdeaCanvasPage() {
  const { ideaId = "" } = useParams<{ ideaId: string }>(); const navigate = useNavigate();
  // 从项目内 Ideas 进入时带 ?project=,返回时回到该项目过滤视图,保持侧栏项目上下文。
  const [searchParams] = useSearchParams();
  const backProject = searchParams.get("project");
  const backTo = backProject ? `/ideas?project=${encodeURIComponent(backProject)}` : "/ideas";
  const { ideas, projects, knowledge, papers, updateIdea, setIdeaStatus, restoreIdeaVersion, deleteIdea } = useWorkspace();
  const idea = ideas.find((item) => item.id === ideaId); const [saved, setSaved] = useState(false);
  if (!idea) return <div className="route-page"><EmptyState title="Idea 不存在" description="它可能已经被移到回收站。" /></div>;
  const evidence = knowledge.filter((item) => item.projectId === idea.projectId && item.kind === "evidence");
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!idea) return; const form = new FormData(event.currentTarget); const canvas = Object.fromEntries(FIELDS.map((field) => [field.key, String(form.get(field.key) ?? "").trim()])) as unknown as IdeaCanvas; updateIdea(idea.id, { title: String(form.get("title")).trim(), summary: String(form.get("summary")).trim(), canvas, evidenceIds: form.getAll("evidenceIds").map(String) }); setSaved(true); window.setTimeout(() => setSaved(false), 1600); }
  return <div className="route-page idea-canvas-page"><header className="canvas-header"><Link className="icon-button" to={backTo}><ArrowLeft /></Link><div><span className="eyebrow">{projects.find((project) => project.id === idea.projectId)?.name} · Idea Canvas</span><h1>{idea.title}</h1></div><select value={idea.status} onChange={(event) => setIdeaStatus(idea.id, event.target.value as IdeaStatus)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></header>
    <form className="idea-canvas-layout" onSubmit={save}><main><section className="surface-card canvas-basics"><label><span>标题</span><input name="title" defaultValue={idea.title} required /></label><label><span>一句话描述</span><textarea name="summary" defaultValue={idea.summary} /></label></section><section className="canvas-grid">{FIELDS.map((field) => <label className="surface-card canvas-field" key={field.key}><span>{field.label}</span><small>{field.prompt}</small><textarea name={field.key} defaultValue={idea.canvas[field.key]} /></label>)}</section><button className="primary canvas-save"><FloppyDisk />{saved ? "已保存新版本" : "保存 Canvas"}</button></main>
      <aside><section className="surface-card evidence-picker"><header><h2>{idea.evidenceIds.length} 条已关联证据</h2><LinkSimple /></header>{evidence.map((item) => <label key={item.id}><input type="checkbox" name="evidenceIds" value={item.id} defaultChecked={idea.evidenceIds.includes(item.id)} /><span><strong>{item.title}</strong><small>{papers.find((paper) => paper.id === item.paperId)?.title} · 第 {item.page} 页</small></span></label>)}{evidence.length === 0 ? <p>暂无 Evidence。</p> : null}</section>
      <section className="surface-card version-list"><header><ClockCounterClockwise /><h2>版本历史</h2></header>{idea.versions.map((version) => <button type="button" onClick={() => restoreIdeaVersion(idea.id, version.id)} key={version.id}><span>{new Date(version.createdAt).toLocaleString("zh-CN")}</span><small>恢复此版本</small></button>)}{idea.versions.length === 0 ? <p>暂无历史版本。</p> : null}</section><button type="button" className="danger-button full" onClick={() => { deleteIdea(idea.id); navigate("/ideas"); }}><Trash />移到回收站</button></aside></form>
  </div>;
}
