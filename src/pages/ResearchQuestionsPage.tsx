import { Globe, House, Lightbulb, MagnifyingGlass, Plus, Scroll, Stack, Sparkle, Trash, Trophy, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/states";
import { PageHeader } from "../components/PageHeader";
import { useDialogKeyboard } from "../components/useDialogKeyboard";
import {
  createGap,
  createIdea,
  createResearchQuestion,
  deleteGap,
  deleteIdea,
  deleteResearchQuestion,
  listGaps,
  listIdeas,
  listPapersByProject,
  listResearchQuestions,
  patchGap,
  patchIdea,
  patchResearchQuestion,
  type ResearchQuestion as RQ,
  type Gap,
  type Idea,
} from "../api";

const STATUS_LABELS: Record<RQ["status"], string> = {
  open: "开放",
  investigating: "调研中",
  evidenced: "证据充分",
  concluded: "已结论",
  abandoned: "已搁置",
};

const STATUS_ORDER: RQ["status"][] = ["open", "investigating", "evidenced", "concluded", "abandoned"];

const NEXT_STATUS: Partial<Record<RQ["status"], RQ["status"]>> = {
  open: "investigating",
  investigating: "evidenced",
  evidenced: "concluded",
};

const GAP_STATUS_LABEL: Record<Gap["status"], string> = {
  candidate: "候选",
  searching: "补充检索中",
  evidenced: "证据充分",
  converted: "已转 Idea",
  rejected: "已否决",
};

const GAP_NEXT: Partial<Record<Gap["status"], Gap["status"]>> = {
  candidate: "searching",
  searching: "evidenced",
  evidenced: "converted",
};

/** Research Question 研究问题页面(迁移 0013,v2.0):一屏聚齐 RQ/Gap/Idea 三链。 */
export function ResearchQuestionsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [rqs, setRqs] = useState<Array<RQ & { gaps: Gap[]; ideas: Idea[] }>>([]);
  const [paperNames, setPaperNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const creatingRef = useDialogKeyboard<HTMLFormElement>(() => setCreating(false));

  function changeProject(next: string) {
    navigate(`/projects/${encodeURIComponent(next)}/questions`);
  }

  function reload(pid: string) {
    setError("");
    listResearchQuestions(pid)
      .then(async (res) => {
        const [gapsRes, ideasRes, papersRes] = await Promise.all([
          listGaps(pid).catch(() => ({ gaps: [] as Gap[] })),
          listIdeas(pid).catch(() => ({ ideas: [] as Idea[] })),
          listPapersByProject(pid).catch(() => ({ papers: [] })),
        ]);
        const nameOf = new Map<string, string>();
        for (const p of papersRes.papers) nameOf.set(p.id, p.title || p.id);
        setPaperNames(nameOf);
        setRqs(res.researchQuestions.map((rq) => ({
          ...rq,
          gaps: gapsRes.gaps.filter((g) => g.rqId === rq.id),
          ideas: ideasRes.ideas.filter((i) => i.rqId === rq.id),
        })));
      })
      .catch(() => setError("无法加载研究问题。"));
  }

  useEffect(() => {
    if (projectId) reload(projectId);
  }, [projectId]);

  const totalGaps = useMemo(() => rqs.reduce((sum, rq) => sum + rq.gaps.length, 0), [rqs]);
  const totalIdeas = useMemo(() => rqs.reduce((sum, rq) => sum + rq.ideas.length, 0), [rqs]);
  const totalGapsResolved = useMemo(
    () => rqs.reduce((sum, rq) => sum + rq.gaps.filter((g) => g.status === "converted" || g.status === "rejected").length, 0),
    [rqs],
  );

  function advanceGap(gap: Gap, pid: string) {
    const next = GAP_NEXT[gap.status];
    if (!next) return;
    patchGap(pid, gap.id, { status: next })
      .then((res) => setRqs((list) => list.map((rq) => ({
        ...rq,
        gaps: rq.gaps.map((g) => (g.id === gap.id ? res.gap : g)),
      }))))
      .catch(() => setError("状态推进失败,请重试。"));
  }

  function convertGapToIdea(gap: Gap, pid: string) {
    createIdea(pid, { title: gap.title, summary: gap.description || gap.rationale, sourceGapId: gap.id })
      .then((res) => {
        patchGap(pid, gap.id, { status: "converted", convertedIdeaId: res.idea.id }).catch(() => {});
        navigate(`/projects/${encodeURIComponent(pid)}/ideas/${encodeURIComponent(res.idea.id)}/canvas`);
      })
      .catch(() => setError("转 Idea 失败,请重试。"));
  }

  function removeGap(gap: Gap, pid: string) {
    deleteGap(pid, gap.id)
      .then(() => setRqs((list) => list.map((rq) => ({ ...rq, gaps: rq.gaps.filter((g) => g.id !== gap.id) }))))
      .catch(() => setError("删除缺口失败,请重试。"));
  }

  function removeIdea(idea: Idea, pid: string) {
    deleteIdea(pid, idea.id)
      .then(() => setRqs((list) => list.map((rq) => ({ ...rq, ideas: rq.ideas.filter((i) => i.id !== idea.id) }))))
      .catch(() => setError("删除 Idea 失败,请重试。"));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    const fd = new FormData(event.currentTarget);
    createResearchQuestion(projectId, {
      question: String(fd.get("question") ?? "").trim(),
      goal: String(fd.get("goal") ?? "").trim(),
      paperIds: [],
    })
      .then(() => {
        setCreating(false);
        (event.target as HTMLFormElement).reset();
        reload(projectId);
      })
      .catch(() => setError("创建研究问题失败,请重试。"));
  }

  const sortedRqs = useMemo(() => {
    const rank = (rq: RQ) => STATUS_ORDER.indexOf(rq.status);
    return [...rqs].sort((a, b) => rank(a) - rank(b));
  }, [rqs]);

  return <div className="route-page rq-page">
    <PageHeader
      title="研究问题"
      eyebrow="RQ · 论文 → 证据 → 缺口 → Idea 主轴"
      actions={<div className="rq-actions">
        <span className="rq-stats">{rqs.length} 个问题 · {totalGaps} 个缺口({totalGapsResolved} 已闭环) · {totalIdeas} 个 Idea</span>
        <button className="primary" disabled={!projectId} onClick={() => setCreating(true)}><Plus />新建研究问题</button>
      </div>}
    />
    {!projectId ? <EmptyState icon={<House />} title="先选一个项目" description="进入具体项目后再管理研究问题。" /> : null}
    {error ? <div className="route-banner route-banner-warning" role="status">{error}</div> : null}
    {creating && projectId ? <div className="creation-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
      <form className="quick-create-dialog" onSubmit={submit} ref={creatingRef} role="dialog" aria-modal="true" aria-labelledby="rq-create-title">
        <header><div><span className="eyebrow">研究问题</span><h2 id="rq-create-title">提出一个研究问题</h2><p>一句话说清科学问题与目标,后续论文/缺口/Idea 都可挂到它下面。</p></div><button type="button" className="icon-button" onClick={() => setCreating(false)} aria-label="关闭"><X /></button></header>
        <div className="form-grid">
          <label className="span-all"><span>科学问题 *</span><textarea name="question" required placeholder="例如:遮挡下人体姿态估计如何恢复结构信息?" autoFocus /></label>
          <label className="span-all"><span>研究目标</span><textarea name="goal" placeholder="回答该问题要达成什么(可检验目标)" /></label>
        </div>
        <footer><button className="primary">保存研究问题</button></footer>
      </form>
    </div> : null}

    <div className="rq-list">
      {sortedRqs.map((rq) => {
        const next = NEXT_STATUS[rq.status];
        const linkedCount = rq.papers.length;
        return <article className={`rq-card status-${rq.status}`} key={rq.id}>
          <header>
            <span className={`rq-status rq-status-${rq.status}`}>{STATUS_LABELS[rq.status]}</span>
            <span className="rq-meta"><Stack /> {linkedCount} 篇论文</span>
            <span className="rq-meta"><Lightbulb /> {rq.gaps.length} 缺口</span>
            <span className="rq-meta"><Sparkle /> {rq.ideas.length} Idea</span>
          </header>
          <h3>{rq.question}</h3>
          {rq.goal ? <p className="rq-goal">{rq.goal}</p> : null}

          {rq.papers.length > 0 ? <div className="rq-papers">
            <span className="rq-papers-label"><Scroll /> 关联论文</span>
            <ul>{rq.papers.map((p) => <li key={p.paperId}>
              <Link to={`/projects/${encodeURIComponent(projectId ?? "")}/library/${encodeURIComponent(p.paperId)}`}>{paperNames.get(p.paperId) ?? p.title ?? p.paperId}</Link>
              {p.role && p.role !== "related" ? <small>{p.role}</small> : null}
            </li>)}</ul>
          </div> : null}

          {rq.gaps.length > 0 ? <div className="rq-gaps">
            <span className="rq-gaps-label"><MagnifyingGlass /> 缺口</span>
            <ul>
              {rq.gaps.map((g) => <li className={`rq-gap-item status-${g.status}`} key={g.id}>
                <span className={`gap-pill gap-pill-${g.status}`}>{GAP_STATUS_LABEL[g.status]}</span>
                <span className="rq-gap-title">{g.title}</span>
                {GAP_NEXT[g.status] ? <button className="outline" onClick={() => advanceGap(g, projectId ?? "")}>→ {GAP_STATUS_LABEL[GAP_NEXT[g.status]!]}</button> : null}
                {g.status !== "converted" && g.status !== "rejected" ? <button className="outline" onClick={() => convertGapToIdea(g, projectId ?? "")}><Lightbulb />转 Idea</button> : null}
                <button className="icon-button subtle danger" aria-label="删除缺口" onClick={() => removeGap(g, projectId ?? "")}><Trash /></button>
              </li>)}
            </ul>
          </div> : null}

          {rq.ideas.length > 0 ? <div className="rq-ideas">
            <span className="rq-ideas-label"><Lightbulb /> Idea</span>
            <ul>
              {rq.ideas.map((idea) => <li className="rq-idea-item" key={idea.id}>
                <Link to={`/projects/${encodeURIComponent(projectId ?? "")}/ideas/${encodeURIComponent(idea.id)}/canvas`}>{idea.title}</Link>
                <span className="rq-idea-status">{idea.status}</span>
                <button className="icon-button subtle danger" aria-label="删除 Idea" onClick={() => removeIdea(idea, projectId ?? "")}><Trash /></button>
              </li>)}
            </ul>
          </div> : null}

          <footer>
            <span className="rq-actions">
              {next ? <button className="primary" onClick={() => patchResearchQuestion(projectId ?? "", rq.id, { status: next }).then(() => reload(projectId ?? ""))}>{STATUS_LABELS[next]} →</button> : null}
              {rq.status !== "concluded" && rq.status !== "abandoned" ? <button className="outline" onClick={() => patchResearchQuestion(projectId ?? "", rq.id, { status: "concluded" }).then(() => reload(projectId ?? ""))}><Trophy />标记结论</button> : null}
              {rq.status !== "abandoned" ? <button className="outline" onClick={() => patchResearchQuestion(projectId ?? "", rq.id, { status: "abandoned" }).then(() => reload(projectId ?? ""))}>搁置</button> : null}
            </span>
            <button className="icon-button danger" aria-label="删除研究问题" onClick={() => { if (confirm(`删除研究问题「${rq.question}」?关联的缺口/Idea 会保留(仅解除关联)。`)) deleteResearchQuestion(projectId ?? "", rq.id).then(() => reload(projectId ?? "")); }}><Trash /></button>
          </footer>
        </article>;
      })}
    </div>

    {projectId && rqs.length === 0 ? <EmptyState icon={<Globe />} title="还没有研究问题" description="点「新建研究问题」,把论文、缺口、Idea 都挂到它下面。" /> : null}
  </div>;
}
