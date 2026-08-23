import { Funnel, Lightbulb, Plus, Sparkle, Target, Trash, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProjectGate } from "../components/ProjectGate";
import { EmptyState } from "../components/states";
import { PageHeader } from "../components/PageHeader";
import { useDialogKeyboard } from "../components/useDialogKeyboard";
import { addGapEvidence, createGap, createIdea, deleteGap, deleteGapEvidence, discoverGaps, listGaps, listKnowledge, listProjects, patchGap, type Gap, type GapEvidenceLink, type KnowledgeItem, type RemoteProject } from "../api";

const STATUS_LABELS: Record<Gap["status"], string> = {
  candidate: "候选",
  searching: "补充检索中",
  evidenced: "证据充分",
  converted: "已转 Idea",
  rejected: "已否决",
};
const STATUS_ORDER: Gap["status"][] = ["candidate", "searching", "evidenced", "converted", "rejected"];
const STANCE_LABELS: Record<GapEvidenceLink["stance"], string> = { supports: "支撑", contradicts: "反驳", context: "背景" };

/** 状态机的合法下一步(与后端 GAP_TRANSITIONS 一致)。 */
const NEXT_STATUS: Record<Gap["status"], Gap["status"]> = {
  candidate: "searching",
  searching: "evidenced",
  evidenced: "converted",
  converted: "rejected",
  rejected: "rejected",
};

/** Gap 缺口页面(迁移 0009):项目范围,Gap 状态机 + 证据挂载 + AI Gap Discovery。 */
export function GapsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [gaps, setGaps] = useState<Array<Gap & { evidence: GapEvidenceLink[] }>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // D2:项目 scope 唯一真源 = URL 的 :projectId(只读派生)。ProjectGate 保证进入此组件时 projectId 非空。
  const { projectId = "" } = useParams<{ projectId?: string }>();
  const [creating, setCreating] = useState(false);
  const creatingRef = useDialogKeyboard<HTMLFormElement>(() => setCreating(false));
  // Project Switcher:切换 scope = navigate 到新项目的 scoped route,不拥有 scope。
  function switchProject(next: string) {
    navigate(`/projects/${encodeURIComponent(next)}/gaps`);
  }

  useEffect(() => {
    let cancelled = false;
    // gaps + 本项目知识对象(证据挂载用)+ 项目列表(切换器用)一并拉取。
    listGaps(projectId)
      .then((res) => { if (!cancelled) setGaps(res.gaps); })
      .catch(() => { if (!cancelled) setError("无法加载缺口列表。"); });
    listKnowledge(projectId)
      .then((res) => { if (!cancelled) setKnowledge(res.items); })
      .catch(() => { if (!cancelled) setKnowledge([]); });
    listProjects()
      .then((res) => { if (!cancelled) setProjects(res.projects); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [projectId]);

  const candidateKnowledge = useMemo(() => knowledge.filter((k) => k.projectId === projectId), [knowledge, projectId]);
  const titleOf = useMemo(() => new Map(candidateKnowledge.map((k) => [k.id, k.title])), [candidateKnowledge]);

  function advance(gap: Gap) {
    const next = NEXT_STATUS[gap.status];
    patchGap(projectId, gap.id, { status: next })
      .then((res) => setGaps((list) => list.map((g) => (g.id === gap.id ? { ...res.gap, evidence: g.evidence } : g))))
      .catch(() => setError("状态流转失败,请重试。"));
  }
  function reject(gap: Gap) {
    patchGap(projectId, gap.id, { status: "rejected" })
      .then((res) => setGaps((list) => list.map((g) => (g.id === gap.id ? { ...res.gap, evidence: g.evidence } : g))))
      .catch(() => setError("否决失败,请重试。"));
  }
  /** Gap → Convert to Idea(P3):后端建 Idea 并把该 Gap 推进到 converted。成功后跳到新 Idea 的 Canvas。 */
  function convert(gap: Gap) {
    if (!confirm(`把缺口「${gap.title}」转成 Idea?缺口会被标记为「已转 Idea」。`)) return;
    createIdea(projectId, { title: gap.title, summary: gap.description || gap.rationale, sourceGapId: gap.id })
      .then((res) => {
        setGaps((list) => list.map((g) => (g.id === gap.id ? { ...g, status: "converted" } : g)));
        navigate(`/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(res.idea.id)}/canvas`);
      })
      .catch(() => setError("转 Idea 失败,请重试。"));
  }
  function remove(gap: Gap) {
    if (!confirm(`删除缺口「${gap.title}」?`)) return;
    deleteGap(projectId, gap.id).then(() => setGaps((list) => list.filter((g) => g.id !== gap.id))).catch(() => setError("删除失败,请重试。"));
  }
  function attach(gapId: string, knowledgeItemId: string) {
    if (!knowledgeItemId) return;
    addGapEvidence(projectId, gapId, { knowledgeItemId, stance: "supports" })
      .then(() => listGaps(projectId))
      .then((res) => setGaps(res.gaps))
      .catch(() => setError("挂载证据失败,请重试。"));
  }
  function detach(gapId: string, evidenceId: string) {
    deleteGapEvidence(projectId, gapId, evidenceId)
      .then(() => listGaps(projectId))
      .then((res) => setGaps(res.gaps))
      .catch(() => setError("摘除证据失败,请重试。"));
  }
  function runDiscover() {
    setBusy(true); setError("");
    discoverGaps(projectId)
      .then((res) => setGaps((list) => [...res.gaps.map((g) => ({ ...g, evidence: [] })), ...list]))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "AI 缺口发现失败。"))
      .finally(() => setBusy(false));
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const paper = String(fd.get("paperId") ?? "");
    createGap(projectId, {
      paperId: paper || undefined,
      title: String(fd.get("title") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim(),
      rationale: String(fd.get("rationale") ?? "").trim(),
    })
      .then((res) => { setGaps((list) => [{ ...res.gap, evidence: [] }, ...list]); setCreating(false); (event.target as HTMLFormElement).reset(); })
      .catch(() => setError("创建缺口失败,请重试。"));
  }

  return <ProjectGate scope="gaps"><div className="route-page gaps-page">
    <PageHeader title="缺口" eyebrow="Gap · Evidence → Gap → Idea 主链第一环" actions={<div className="gaps-actions"><button className="primary" disabled={busy} onClick={runDiscover}><Sparkle />{busy ? "发现中…" : "AI 发现缺口"}</button><button className="primary" onClick={() => setCreating(true)}><Plus />新建缺口</button></div>} />
    <div className="toolbar-row"><label className="filter-select"><Funnel /><select value={projectId} onChange={(e) => switchProject(e.target.value)} title="切换到其他项目">{projects.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><p className="gaps-hint">Gap 是一等对象:从已有知识发现研究缺口,补证据、定状态,再转成 Idea(P3)。</p></div>
    {error ? <div className="route-banner route-banner-warning" role="status">{error}</div> : null}
    {creating ? <div className="creation-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}><form className="quick-create-dialog gap-create-dialog" onSubmit={submit} ref={creatingRef} role="dialog" aria-modal="true" aria-labelledby="gap-create-title"><header><div><span className="eyebrow">缺口</span><h2 id="gap-create-title">记录一个研究缺口</h2><p>说清缺什么、为什么是缺口,之后再补证据、流转状态。</p></div><button type="button" className="icon-button" onClick={() => setCreating(false)} aria-label="关闭"><X /></button></header><div className="gap-create-grid"><label><span>项目</span><select value={projectId} disabled><option value={projectId}>{projects.find((p) => p.id === projectId)?.name ?? "未选"}</option></select></label><label><span>来源论文</span><select name="paperId" defaultValue=""><option value="">不限</option>{knowledge.filter((k) => k.projectId === projectId).map((k) => <option value={k.paperId} key={k.paperId}>{k.paperId}</option>)}</select></label><label className="span-all"><span>标题</span><input name="title" required placeholder="一句话缺口" autoFocus /></label><label className="span-all"><span>缺什么</span><textarea name="description" placeholder="现有知识未覆盖的内容" /></label><label className="span-all"><span>为什么是缺口</span><textarea name="rationale" placeholder="推断依据,可标 [推断]" /></label></div><footer><button className="primary">保存缺口</button></footer></form></div> : null}
    <section className="gaps-list">
      {gaps.map((gap) => <article className={`surface-card gap-card status-${gap.status}${gap.source === "ai" ? " source-ai" : ""}`} key={gap.id}>
        <header><span className={`gap-status gap-status-${gap.status}`}>{STATUS_LABELS[gap.status]}</span><small>{gap.source === "ai" ? `AI 发现${gap.model ? ` · ${gap.model}` : ""}` : "人工记录"}</small></header>
        <h2>{gap.title}</h2>
        {gap.description ? <p>{gap.description}</p> : null}
        {gap.rationale ? <blockquote className="gap-rationale">{gap.rationale}</blockquote> : null}
        <div className="gap-evidence">
          <span className="gap-evidence-label"><Target /> 证据({gap.evidence.length})</span>
          {gap.evidence.map((e) => <span className={`evidence-chip stance-${e.stance}`} key={e.id}>{STANCE_LABELS[e.stance]} · {titleOf.get(e.knowledgeItemId) ?? "知识对象"}<button className="icon-button" aria-label="摘除证据" onClick={() => detach(gap.id, e.id)}><X /></button></span>)}
          {candidateKnowledge.filter((k) => !gap.evidence.some((e) => e.knowledgeItemId === k.id)).length > 0 ? <EvidenceAdder gap={gap} knowledge={candidateKnowledge} used={gap.evidence.map((e) => e.knowledgeItemId)} onAdd={attach} /> : null}
        </div>
        <footer>
          <span className="gap-actions">
            {gap.status !== "converted" && gap.status !== "rejected" ? <button className="primary" onClick={() => advance(gap)}>{STATUS_LABELS[NEXT_STATUS[gap.status]]} →</button> : null}
            {gap.status !== "converted" && gap.status !== "rejected" ? <button className="outline" onClick={() => convert(gap)}><Sparkle />转 Idea</button> : null}
            {gap.status !== "converted" && gap.status !== "rejected" ? <button className="danger" onClick={() => reject(gap)}>否决</button> : null}
          </span>
          <button className="icon-button" aria-label="删除缺口" onClick={() => remove(gap)}><Trash /></button>
        </footer>
      </article>)}
    </section>
    {gaps.length === 0 ? <EmptyState icon={<Lightbulb />} title="还没有缺口" description="点「AI 发现缺口」从知识里找,或「新建缺口」手工记录。" /> : null}
  </div></ProjectGate>;
}

/** 缺口证据挂载器:选一条本项目知识挂到缺口上。 */
function EvidenceAdder(props: { gap: Gap; knowledge: KnowledgeItem[]; used: string[]; onAdd: (gapId: string, itemId: string) => void }) {
  const { gap, knowledge, used, onAdd } = props;
  const available = knowledge.filter((k) => !used.includes(k.id));
  const [pick, setPick] = useState("");
  if (available.length === 0) return null;
  return <span className="evidence-add"><select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="挂载证据"><option value="">挂证据…</option>{available.map((k) => <option value={k.id} key={k.id}>{k.title}</option>)}</select><button className="primary" disabled={!pick} onClick={() => { onAdd(gap.id, pick); setPick(""); }}>挂上</button></span>;
}
