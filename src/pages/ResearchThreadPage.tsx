import {
  ArrowRight,
  BookOpenText,
  CheckCircle,
  Flask,
  GitBranch,
  Lightbulb,
  Link as LinkIcon,
  MagnifyingGlass,
  Plus,
  Question,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getResearchThread, promoteInsight, type InsightType, type ResearchInsight, type ResearchThread } from "../api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";
import { useDialogKeyboard } from "../components/useDialogKeyboard";

const TYPE_META: Record<InsightType, { label: string; icon: React.ReactNode }> = {
  finding: { label: "发现", icon: <CheckCircle /> },
  contradiction: { label: "矛盾", icon: <WarningCircle /> },
  gap: { label: "缺口", icon: <Question /> },
  concept: { label: "构想", icon: <Lightbulb /> },
};

const RQ_STATUS: Record<string, string> = {
  open: "待研究",
  investigating: "分析中",
  evidenced: "已有证据",
  concluded: "已形成结论",
  abandoned: "已搁置",
};

const SUPPORT_LABEL: Record<string, string> = {
  supports: "支持问题假设",
  partial: "部分支持",
  not_supported: "暂不支持",
  insufficient: "证据不足",
};

function suggestedQuestion(insight: ResearchInsight): string {
  if (insight.type === "gap") return `如何解决“${insight.title}”所描述的研究缺口？`;
  if (insight.type === "contradiction") return `在什么条件下可以解释“${insight.title}”中的证据矛盾？`;
  if (insight.type === "concept") return `“${insight.title}”能否在目标场景中带来可验证的改进？`;
  return `“${insight.title}”在不同研究条件下是否仍然成立？`;
}

export function ResearchThreadPage() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "questions" ? "questions" : "insights";
  const typeParam = searchParams.get("type");
  const typeFilter = typeParam && typeParam in TYPE_META ? typeParam as InsightType : "all";
  const [thread, setThread] = useState<ResearchThread | null>(null);
  const [error, setError] = useState("");
  const [promoting, setPromoting] = useState<ResearchInsight | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialogKeyboard<HTMLFormElement>(() => { if (!saving) setPromoting(null); });

  function load() {
    if (!projectId) return;
    setError("");
    getResearchThread(projectId)
      .then(setThread)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法加载研究脉络。"));
  }

  useEffect(load, [projectId]);

  const visibleInsights = useMemo(() => {
    if (!thread) return [];
    return typeFilter === "all" ? thread.insights : thread.insights.filter((item) => item.type === typeFilter);
  }, [thread, typeFilter]);

  function selectView(next: "insights" | "questions") {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    if (next === "questions") params.delete("type");
    setSearchParams(params);
  }

  function selectType(next: InsightType | "all") {
    const params = new URLSearchParams(searchParams);
    params.set("view", "insights");
    if (next === "all") params.delete("type");
    else params.set("type", next);
    setSearchParams(params);
  }

  function submitPromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promoting || !projectId) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    promoteInsight(projectId, promoting, {
      question: String(data.get("question") ?? "").trim(),
      goal: String(data.get("goal") ?? "").trim(),
    })
      .then(() => {
        setPromoting(null);
        const params = new URLSearchParams(searchParams);
        params.set("view", "questions");
        params.delete("type");
        setSearchParams(params);
        load();
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法创建研究问题。"))
      .finally(() => setSaving(false));
  }

  if (!projectId) return <EmptyState icon={<GitBranch />} title="先进入一个项目" description="研究脉络只展示当前项目的洞见和研究问题。" />;

  return <div className="route-page research-thread-page">
    <PageHeader
      eyebrow="Research Thread · Evidence → Insight → Question"
      title="研究脉络"
      description="把分散的发现、矛盾、缺口和构想汇成洞见，再筛选成可验证的研究问题。"
      actions={<Link className="outline" to={`/projects/${encodeURIComponent(projectId)}/matrices`}><BookOpenText />查看证据矩阵</Link>}
    />

    {error ? <div className="route-banner route-banner-warning" role="alert">{error}</div> : null}

    <section className="thread-overview" aria-label="研究脉络概览">
      <div><span>洞见</span><strong>{thread?.stats.insights ?? "—"}</strong><small>从研究资产中形成</small></div>
      <ArrowRight aria-hidden />
      <div><span>研究问题</span><strong>{thread?.stats.questions ?? "—"}</strong><small>值得继续验证</small></div>
      <ArrowRight aria-hidden />
      <div><span>下一步</span><strong><Flask /> 实验</strong><small>设计主实验与消融</small></div>
    </section>

    <div className="thread-tabs" role="tablist" aria-label="研究脉络视图">
      <button type="button" role="tab" aria-selected={view === "insights"} className={view === "insights" ? "active" : ""} onClick={() => selectView("insights")}><Sparkle />洞见池 <span>{thread?.stats.insights ?? 0}</span></button>
      <button type="button" role="tab" aria-selected={view === "questions"} className={view === "questions" ? "active" : ""} onClick={() => selectView("questions")}><MagnifyingGlass />研究问题 <span>{thread?.stats.questions ?? 0}</span></button>
    </div>

    {view === "insights" ? <>
      <div className="thread-filters" aria-label="洞见类型筛选">
        <button type="button" className={typeFilter === "all" ? "active" : ""} onClick={() => selectType("all")}>全部 {thread?.stats.insights ?? 0}</button>
        {(Object.keys(TYPE_META) as InsightType[]).map((type) => <button type="button" key={type} className={typeFilter === type ? "active" : ""} data-type={type} onClick={() => selectType(type)}>{TYPE_META[type].label} {type === "finding" ? thread?.stats.findings : type === "contradiction" ? thread?.stats.contradictions : type === "gap" ? thread?.stats.gaps : thread?.stats.concepts}</button>)}
      </div>
      <div className="insight-list">
        {visibleInsights.map((insight) => {
          const meta = TYPE_META[insight.type];
          const promoted = insight.researchQuestionIds.length > 0;
          return <article className="insight-card" key={`${insight.originType}:${insight.id}`} data-type={insight.type}>
            <header>
              <span className="insight-kind">{meta.icon}{meta.label}</span>
              <span className={`insight-state ${insight.status}`}>{insight.status === "confirmed" ? "已确认" : insight.status === "draft" ? "草稿" : insight.status}</span>
            </header>
            <h2>{insight.title}</h2>
            <p>{insight.summary || "暂无说明。"}</p>
            <div className="insight-meta">
              <span><LinkIcon />{insight.evidenceCount} 条证据</span>
              <span><BookOpenText />{insight.paperIds.length} 篇文献</span>
              <span>{insight.source === "ai" ? "AI 提炼" : "人工记录"}</span>
            </div>
            <footer>
              {promoted
                ? <button type="button" className="thread-linked" onClick={() => selectView("questions")}><CheckCircle />已形成研究问题 <ArrowRight /></button>
                : <button type="button" className="primary" onClick={() => setPromoting(insight)}><Plus />提升为研究问题</button>}
            </footer>
          </article>;
        })}
      </div>
      {thread && visibleInsights.length === 0 ? <EmptyState icon={<Sparkle />} title="这个分类还没有洞见" description="从文献阅读或证据矩阵中确认内容后，洞见会出现在这里。" /> : null}
    </> : <div className="question-list">
      {thread?.researchQuestions.map((question, index) => <article className="question-card" key={question.id}>
        <div className="question-index">RQ-{String(index + 1).padStart(2, "0")}</div>
        <div className="question-body">
          <header><span className={`rq-state ${question.status}`}>{RQ_STATUS[question.status] ?? question.status}</span><span>{question.source === "ai" ? "AI 草拟" : "人工创建"}</span></header>
          <h2>{question.question}</h2>
          {question.goal ? <p>{question.goal}</p> : null}
          <div className="question-links">
            <span><Sparkle />{question.origins.length} 条来源洞见</span>
            <span><BookOpenText />{question.papers.length} 篇关联文献</span>
            <span><LinkIcon />{question.evidence.length} 条直接证据</span>
            <span><Flask />{question.conclusions.length} 份结果结论</span>
          </div>
          {question.conclusions.length ? <div className="rq-conclusion-list" aria-label="实验结果结论">
            {question.conclusions.slice(0, 3).map((conclusion) => <Link
              key={conclusion.id}
              to={`/projects/${encodeURIComponent(projectId)}/experiments?experiment=${encodeURIComponent(conclusion.experimentId)}&result=${encodeURIComponent(conclusion.resultId)}`}
            >
              <span className={`support-level ${conclusion.supportLevel}`}>{SUPPORT_LABEL[conclusion.supportLevel]}</span>
              <strong>{conclusion.summary}</strong>
              <small>{conclusion.status === "draft" ? "AI 分析草稿" : "已确认结论"} · {new Date(conclusion.createdAt).toLocaleString()}</small>
            </Link>)}
          </div> : null}
        </div>
        <Link className="outline" to={`/projects/${encodeURIComponent(projectId)}/experiments?question=${encodeURIComponent(question.id)}`}>设计实验 <ArrowRight /></Link>
      </article>)}
      {thread && thread.researchQuestions.length === 0 ? <EmptyState icon={<MagnifyingGlass />} title="还没有研究问题" description="先从洞见池选择一条重要洞见，将它提升为可验证的研究问题。" action={<button type="button" className="primary" onClick={() => selectView("insights")}>浏览洞见池</button>} /> : null}
    </div>}

    {promoting ? <div className="creation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPromoting(null); }}>
      <form ref={dialogRef} className="quick-create-dialog promote-dialog" onSubmit={submitPromotion} role="dialog" aria-modal="true" aria-labelledby="promote-title">
        <header><div><span className="eyebrow">从{TYPE_META[promoting.type].label}形成问题</span><h2 id="promote-title">提升为研究问题</h2><p>保留来源关系，后续实验和论文都可以回到这条洞见。</p></div><button type="button" className="icon-button" onClick={() => setPromoting(null)} disabled={saving} aria-label="关闭"><X /></button></header>
        <blockquote className="promote-origin"><strong>{promoting.title}</strong><span>{promoting.summary}</span></blockquote>
        <div className="form-grid">
          <label className="span-all"><span>研究问题 *</span><textarea name="question" required maxLength={500} defaultValue={suggestedQuestion(promoting)} autoFocus /></label>
          <label className="span-all"><span>研究目标</span><textarea name="goal" maxLength={4000} defaultValue={`验证该洞见的适用条件、作用机制与可复现性。`} /></label>
        </div>
        <footer><button type="button" className="outline" onClick={() => setPromoting(null)} disabled={saving}>取消</button><button className="primary" disabled={saving}>{saving ? "正在创建…" : "创建研究问题"}</button></footer>
      </form>
    </div> : null}
  </div>;
}
