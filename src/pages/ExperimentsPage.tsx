import { ChartBar, Flask, GitBranch, House, Link as LinkIcon, NotePencil, Plus, Trash, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/states";
import { PageHeader } from "../components/PageHeader";
import { useDialogKeyboard } from "../components/useDialogKeyboard";
import {
  addExperimentResult,
  createExperiment,
  deleteExperiment,
  listExperiments,
  listResearchQuestions,
  patchExperiment,
  type Experiment,
  type ExperimentResult,
} from "../api";

const STATUS_LABELS: Record<Experiment["status"], string> = {
  planned: "计划中",
  running: "进行中",
  done: "已完成",
  failed: "失败",
};

const NEXT_STATUS: Partial<Record<Experiment["status"], Experiment["status"]>> = {
  planned: "running",
  running: "done",
  failed: "running",
};

function parseResultNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function formatNum(n: number | null): string {
  if (n === null) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function resultPrimary(r: ExperimentResult): { key: string; value: number | null } {
  const entries = Object.entries(r.metrics ?? {});
  for (const e of entries) {
    const n = parseResultNum(e[1]);
    if (n !== null) return { key: e[0], value: n };
  }
  return { key: entries[0]?.[0] ?? "—", value: null };
}

function runCounts(runs: ExperimentResult[]): { first: number | null; last: number | null; delta: number | null } {
  if (runs.length === 0) return { first: null, last: null, delta: null };
  const nums = runs.map((r) => parseResultNum(r.metrics?.[resultPrimary(r).key])).filter((n): n is number => n !== null);
  if (nums.length < 2) return { first: nums[0] ?? null, last: nums[0] ?? null, delta: null };
  const delta = nums[nums.length - 1] - nums[0];
  return { first: nums[0], last: nums[nums.length - 1], delta };
}

/** Experiment 实验页面(迁移 0014,v2.0):Idea → Experiment → Result,单列卡片列表。 */
export function ExperimentsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [questions, setQuestions] = useState<Array<{ id: string; question: string }>>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loggingFor, setLoggingFor] = useState<string | null>(null);
  const creatingRef = useDialogKeyboard<HTMLFormElement>(() => setCreating(false));
  const loggingRef = useDialogKeyboard<HTMLFormElement>(() => setLoggingFor(null));

  function changeProject(next: string) {
    navigate(`/projects/${encodeURIComponent(next)}/experiments`);
  }

  function reload(pid: string) {
    setError("");
    listExperiments(pid)
      .then((res) => setExperiments(res.experiments))
      .catch(() => setError("无法加载实验列表。"));
    listResearchQuestions(pid)
      .then((res) => setQuestions(res.researchQuestions.map((rq) => ({ id: rq.id, question: rq.question }))))
      .catch(() => setQuestions([]));
  }

  useEffect(() => {
    if (projectId) reload(projectId);
  }, [projectId]);

  function advance(exp: Experiment) {
    const next = NEXT_STATUS[exp.status];
    if (!next) return;
    patchExperiment(projectId ?? "", exp.id, { status: next })
      .then((res) => setExperiments((list) => list.map((e) => (e.id === exp.id ? res.experiment : e))))
      .catch(() => setError("状态流转失败,请重试。"));
  }
  function remove(exp: Experiment) {
    if (!confirm(`删除实验「${exp.title}」?将同时清除其结果记录。`)) return;
    deleteExperiment(projectId ?? "", exp.id)
      .then(() => setExperiments((list) => list.filter((e) => e.id !== exp.id)))
      .catch(() => setError("删除失败,请重试。"));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    const fd = new FormData(event.currentTarget);
    createExperiment(projectId, {
      title: String(fd.get("title") ?? "").trim(),
      hypothesis: String(fd.get("hypothesis") ?? "").trim(),
      rqId: String(fd.get("rqId") ?? "") || undefined,
    })
      .then((res) => { setExperiments((list) => [res.experiment, ...list]); setCreating(false); (event.target as HTMLFormElement).reset(); })
      .catch(() => setError("创建实验失败,请重试。"));
  }

  function submitResult(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !loggingFor) return;
    const fd = new FormData(event.currentTarget);
    const primaryKey = String(fd.get("primaryKey") ?? "").trim() || "value";
    const primaryValue = parseResultNum(fd.get("primaryValue"));
    const metrics: Record<string, unknown> = {};
    if (primaryValue !== null) metrics[primaryKey] = primaryValue;
    addExperimentResult(projectId, loggingFor, { metrics, notes: String(fd.get("notes") ?? "").trim() })
      .then((res) => setExperiments((list) => list.map((e) => (e.id === loggingFor ? { ...e, results: [...e.results, res.result] } : e))))
      .then(() => { setLoggingFor(null); })
      .catch(() => setError("记录结果失败,请重试。"));
  }

  return <div className="route-page experiments-page">
    <PageHeader title="实验" eyebrow="Experiment · Idea → Experiment → Result"
      actions={<div className="experiments-actions">
        <span className="experiments-stats">{experiments.length} 个实验</span>
        <button className="primary" disabled={!projectId} onClick={() => setCreating(true)}><Plus />新建实验</button>
      </div>} />
    <div className="toolbar-row">
      <p className="experiments-hint">把 Idea 落到可执行实验方案。每次跑动追加一条结果(不覆盖),看趋势、下结论。</p>
    </div>
    {!projectId ? <EmptyState icon={<House />} title="先选一个项目" description="进入具体项目后再管理实验。" /> : null}
    {error ? <div className="route-banner route-banner-warning" role="status">{error}</div> : null}

    {creating && projectId ? <div className="creation-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
      <form className="quick-create-dialog" onSubmit={submit} ref={creatingRef} role="dialog" aria-modal="true" aria-labelledby="exp-create-title">
        <header><div><span className="eyebrow">实验</span><h2 id="exp-create-title">规划一个实验</h2><p>为研究目标设计可验证实验,后续关联 Idea 并记录每次跑动结果。</p></div><button type="button" className="icon-button" onClick={() => setCreating(false)} aria-label="关闭"><X /></button></header>
        <div className="form-grid">
          <label className="span-all"><span>实验标题 *</span><input name="title" required placeholder="例如:遮挡建模对 AP 的提升" autoFocus /></label>
          <label className="span-all"><span>假设 / 验证目标</span><textarea name="hypothesis" placeholder="本实验验证什么假设,预期结果是什么" /></label>
          <label className="span-all"><span>关联研究问题(可选)</span><select name="rqId" defaultValue=""><option value="">不关联</option>{questions.map((q) => <option key={q.id} value={q.id}>{q.question}</option>)}</select></label>
        </div>
        <footer><button className="primary">保存实验</button></footer>
      </form>
    </div> : null}

    <div className="experiments-list">
      {experiments.map((exp) => {
        const next = NEXT_STATUS[exp.status];
        const counts = runCounts(exp.results);
        const primary = exp.results.length > 0 ? resultPrimary(exp.results[exp.results.length - 1]) : null;
        return <article className={`experiment-card status-${exp.status}`} key={exp.id}>
          <header>
            <span className={`exp-status exp-status-${exp.status}`}>{STATUS_LABELS[exp.status]}</span>
            <span className="exp-meta"><Flask /> {exp.results.length} 次跑动</span>
            {exp.rqId ? <span className="exp-meta"><GitBranch /> {questions.find((q) => q.id === exp.rqId)?.question ?? "研究问题"}</span> : null}
          </header>
          <h3>{exp.title}</h3>
          {exp.hypothesis ? <p className="exp-hypothesis">{exp.hypothesis}</p> : null}

          {exp.results.length > 0 ? <div className="exp-results">
            <div className="exp-results-head"><span><ChartBar /> 结果趋势 · {primary?.key ?? "—"}</span>
              {counts.delta !== null ? <span className={`exp-delta ${counts.delta >= 0 ? "up" : "down"}`}>{counts.delta >= 0 ? "↑" : "↓"} {formatNum(Math.abs(counts.delta))}</span> : null}
            </div>
            <ul>
              {exp.results.map((r) => {
                const p = resultPrimary(r);
                return <li key={r.id}>
                  <span className="exp-run-no">#{r.runNo}</span>
                  <span className="exp-run-value">{formatNum(p.value)}</span>
                  {r.notes ? <span className="exp-run-notes">{r.notes}</span> : null}
                </li>;
              })}
            </ul>
          </div> : <p className="exp-empty-results">还没有结果。记录第一次跑动 →</p>}

          {exp.conclusion ? <blockquote className="exp-conclusion">{exp.conclusion}</blockquote> : null}

          <footer>
            <span className="exp-actions">
              {next ? <button className="primary" onClick={() => advance(exp)}>{STATUS_LABELS[next]} →</button> : null}
              <button className="outline" onClick={() => setLoggingFor(exp.id)}><NotePencil />记录结果</button>
              {exp.status === "done" || exp.status === "failed" ? <button className="outline" onClick={() => {
                const c = prompt("实验结论?", exp.conclusion ?? "");
                if (c !== null) patchExperiment(projectId ?? "", exp.id, { conclusion: c }).then((res) => setExperiments((list) => list.map((e) => (e.id === exp.id ? res.experiment : e))));
              }}><LinkIcon />写结论</button> : null}
            </span>
            <button className="icon-button danger" aria-label="删除实验" onClick={() => remove(exp)}><Trash /></button>
          </footer>
        </article>;
      })}
    </div>

    {loggingFor ? <div className="creation-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setLoggingFor(null); }}>
      <form className="quick-create-dialog" onSubmit={submitResult} ref={loggingRef} role="dialog" aria-modal="true" aria-labelledby="exp-log-title">
        <header><div><span className="eyebrow">记录结果</span><h2 id="exp-log-title">追加一次跑动结果</h2><p>每次跑动追加一条(不覆盖旧结果),用于看趋势。</p></div><button type="button" className="icon-button" onClick={() => setLoggingFor(null)} aria-label="关闭"><X /></button></header>
        <div className="form-grid">
          <label><span>指标名</span><input name="primaryKey" placeholder="AP / F1 / loss" defaultValue="AP" /></label>
          <label><span>指标值</span><input name="primaryValue" type="number" step="0.01" placeholder="0.82" /></label>
          <label className="span-all"><span>备注</span><textarea name="notes" placeholder="这次跑了什么、和上次的差异" /></label>
        </div>
        <footer><button className="primary">追加结果</button></footer>
      </form>
    </div> : null}

    {projectId && experiments.length === 0 ? <EmptyState icon={<Flask />} title="还没有实验" description="点「新建实验」把 Idea 落到可执行方案。" /> : null}
  </div>;
}
