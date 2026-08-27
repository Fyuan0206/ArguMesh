import {
  ArrowRight,
  Brain,
  ChartBar,
  CheckCircle,
  Database,
  Flask,
  GitBranch,
  House,
  MagicWand,
  Sparkle,
  Table,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  analyzeExperimentResult,
  asExperimentDesign,
  createAiExperimentDesign,
  deleteExperiment,
  generateExperimentDesign,
  importExperimentResult,
  listExperiments,
  listResearchQuestions,
  type AblationDesign,
  type Experiment,
  type ExperimentResult,
} from "../api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";
import { useDialogKeyboard } from "../components/useDialogKeyboard";

const SUPPORT_LABELS = { supports: "支持假设", partial: "部分支持", not_supported: "不支持", insufficient: "证据不足" } as const;

function SummaryCell({ label, values }: { label: string; values: string[] }) {
  return <div className="ai-design-cell"><span>{label}</span><p>{values.length ? values.join("、") : "AI 标记为待补充"}</p></div>;
}

function AblationTable({ items }: { items: AblationDesign[] }) {
  if (!items.length) return <div className="experiment-inline-empty">AI 尚未生成消融项，可点击“重新生成设计”。</div>;
  return <div className="experiment-table-wrap"><table className="experiment-summary-table ablation-summary-table">
    <thead><tr><th>消融项</th><th>变量操作</th><th>验证假设</th><th>对照与固定条件</th><th>观察指标</th><th>预期方向</th></tr></thead>
    <tbody>{items.map((item, index) => <tr key={`${item.name}-${index}`}>
      <td><strong>A{index + 1}</strong><span>{item.name}</span></td>
      <td>{item.change || "待补充"}</td><td>{item.hypothesis || "待补充"}</td>
      <td>{[item.control, ...item.fixedConditions].filter(Boolean).join("；") || "待补充"}</td>
      <td>{item.metrics.join("、") || "待补充"}</td>
      <td><span className="expected-value">{item.expectedDirection || "[预期] 待补充"}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

function DataPreview({ result }: { result: ExperimentResult }) {
  const columns = Object.keys(result.normalizedData[0] ?? {}).slice(0, 8);
  if (!columns.length) return null;
  return <details className="result-data-preview"><summary><Database />查看导入数据 <span>{result.normalizedData.length} 行 × {Object.keys(result.normalizedData[0] ?? {}).length} 列</span></summary>
    <div className="experiment-table-wrap"><table className="experiment-data-table"><thead><tr><th>#</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{result.normalizedData.slice(0, 6).map((row, index) => <tr key={index}><td>{index + 1}</td>{columns.map((column) => <td key={column}>{String(row[column] ?? "—")}</td>)}</tr>)}</tbody>
    </table></div>
  </details>;
}

function EvidenceRefs({ result, refs }: { result: ExperimentResult; refs: Array<{ row: number; field: string }> }) {
  return <span className="result-evidence-refs">{refs.map((ref) => <code key={`${ref.row}-${ref.field}`}>行 {ref.row} · {ref.field}={String(result.normalizedData[ref.row - 1]?.[ref.field] ?? "—")}</code>)}</span>;
}

export function ExperimentsPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [questions, setQuestions] = useState<Array<{ id: string; question: string }>>([]);
  const [designing, setDesigning] = useState(false);
  const [importingFor, setImportingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const designRef = useDialogKeyboard<HTMLFormElement>(() => setDesigning(false));
  const importRef = useDialogKeyboard<HTMLFormElement>(() => setImportingFor(null));
  const initialQuestion = searchParams.get("question") ?? "";
  const targetExperiment = searchParams.get("experiment") ?? "";
  const targetResult = searchParams.get("result") ?? "";
  const autoOpenedDesign = useRef(false);

  function reload(pid: string) {
    setError("");
    Promise.all([listExperiments(pid), listResearchQuestions(pid)])
      .then(([expRes, rqRes]) => { setExperiments(expRes.experiments); setQuestions(rqRes.researchQuestions.map((rq) => ({ id: rq.id, question: rq.question }))); })
      .catch(() => setError("无法加载 AI 实验工作台。"));
  }
  useEffect(() => { if (projectId) reload(projectId); }, [projectId]);
  useEffect(() => {
    if (!autoOpenedDesign.current && initialQuestion && questions.some((question) => question.id === initialQuestion)) {
      autoOpenedDesign.current = true; setDesigning(true);
    }
  }, [initialQuestion, questions]);
  useEffect(() => {
    const targetId = targetResult ? `result-${targetResult}` : targetExperiment ? `experiment-${targetExperiment}` : "";
    if (!targetId || !experiments.length) return;
    requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ block: "center" }));
  }, [experiments, targetExperiment, targetResult]);

  const analyzedCount = useMemo(() => experiments.reduce((count, experiment) => count + experiment.results.filter((result) => result.analysis).length, 0), [experiments]);
  const resultCount = useMemo(() => experiments.reduce((count, experiment) => count + experiment.results.length, 0), [experiments]);

  function replaceExperiment(experiment: Experiment) { setExperiments((items) => items.map((item) => item.id === experiment.id ? experiment : item)); }
  function replaceResult(experimentId: string, result: ExperimentResult) {
    setExperiments((items) => items.map((item) => item.id !== experimentId ? item : { ...item, results: item.results.map((current) => current.id === result.id ? result : current) }));
  }

  async function submitAiDesign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!projectId) return;
    const form = event.currentTarget; const data = new FormData(form); setBusy("create-ai"); setError("");
    try {
      const { experiment } = await createAiExperimentDesign(projectId, { rqId: String(data.get("rqId") ?? ""), title: String(data.get("title") ?? "").trim(), constraints: String(data.get("constraints") ?? "").trim() });
      setExperiments((items) => [experiment, ...items]); setDesigning(false); form.reset();
    } catch { setError("AI 设计失败。请确认研究问题与 AI 配置有效。" ); } finally { setBusy(""); }
  }
  async function regenerate(exp: Experiment) {
    if (!projectId) return; setBusy(`design-${exp.id}`); setError("");
    try { replaceExperiment((await generateExperimentDesign(projectId, exp.id)).experiment); } catch { setError("AI 重新设计失败。请确认实验已关联研究问题。" ); } finally { setBusy(""); }
  }
  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!projectId || !importingFor) return;
    const form = event.currentTarget; const data = new FormData(form); const experimentId = importingFor;
    setBusy(`import-${experimentId}`); setError("");
    try {
      const imported = await importExperimentResult(projectId, experimentId, { sourceType: String(data.get("sourceType")) as "csv" | "json" | "pasted", sourceName: String(data.get("sourceName") ?? "").trim(), data: String(data.get("data") ?? ""), notes: String(data.get("notes") ?? "").trim() });
      setExperiments((items) => items.map((item) => item.id === experimentId ? { ...item, results: [...item.results, imported.result] } : item));
      setImportingFor(null); form.reset();
      if (data.get("autoAnalyze") === "on") {
        setBusy(`analyze-${imported.result.id}`);
        try { replaceResult(experimentId, (await analyzeExperimentResult(projectId, experimentId, imported.result.id)).result); } catch { setError("真实数据已导入，但 AI 分析失败；可以在汇总表中重试。" ); }
      }
    } catch { setError("结果导入失败。CSV 需要表头；JSON 需要对象或对象数组。" ); } finally { setBusy(""); }
  }
  async function analyze(exp: Experiment, result: ExperimentResult) {
    if (!projectId) return; setBusy(`analyze-${result.id}`); setError("");
    try { replaceResult(exp.id, (await analyzeExperimentResult(projectId, exp.id, result.id)).result); } catch { setError("AI 结果分析失败。请确认结构化设计、真实数据与 AI 配置完整。" ); } finally { setBusy(""); }
  }
  function remove(exp: Experiment) {
    if (!projectId || !confirm(`删除实验设计「${exp.title}」及其结果数据？`)) return;
    deleteExperiment(projectId, exp.id).then(() => setExperiments((items) => items.filter((item) => item.id !== exp.id))).catch(() => setError("删除失败，请重试。"));
  }

  return <div className="route-page experiments-page ai-experiments-page">
    <PageHeader title="AI 实验工作台" eyebrow="AI DESIGN · ABLATION · RESULT SYNTHESIS" description="从研究问题自动生成主实验和消融方案；导入真实结果后，由 AI 完成带证据定位的分析并汇总成表。" actions={<button className="primary" disabled={!projectId || !questions.length} onClick={() => setDesigning(true)}><MagicWand />AI 设计实验</button>} />
    <section className="experiment-workflow-strip" aria-label="AI 实验工作流">
      <div className="active"><span>01</span><Brain /><strong>AI 设计方案</strong><small>主实验、基线、指标、消融</small></div><ArrowRight />
      <div><span>02</span><UploadSimple /><strong>导入真实结果</strong><small>CSV、JSON、结构化粘贴</small></div><ArrowRight />
      <div><span>03</span><Table /><strong>AI 分析成表</strong><small>行列证据、结论与局限</small></div>
    </section>
    <section className="experiment-kpi-row"><div><span>AI 实验方案</span><strong>{experiments.length}</strong></div><div><span>真实结果集</span><strong>{resultCount}</strong></div><div><span>完成 AI 分析</span><strong>{analyzedCount}</strong></div><div><span>研究边界</span><strong className="scope-value">只分析，不运行</strong></div></section>

    {!projectId ? <EmptyState icon={<House />} title="先选一个项目" description="进入项目后，AI 才能读取研究问题和证据设计实验。" /> : null}
    {projectId && !questions.length ? <div className="experiment-research-needed"><GitBranch /><div><strong>先形成研究问题</strong><p>AI 需要明确的研究问题才能设计可验证实验和有目的的消融。</p></div><Link to={`/projects/${encodeURIComponent(projectId)}/research?view=questions`}>前往研究脉络 <ArrowRight /></Link></div> : null}
    {error ? <div className="route-banner route-banner-warning" role="status">{error}</div> : null}

    <div className="experiments-list">{experiments.map((exp, expIndex) => {
      const design = asExperimentDesign(exp.config);
      return <article id={`experiment-${exp.id}`} className={`experiment-card ai-experiment-card${targetExperiment === exp.id ? " route-target" : ""}`} key={exp.id}>
        <header className="ai-experiment-header"><div><span className="experiment-number">EXP-{String(experiments.length - expIndex).padStart(2, "0")}</span><span className="ai-draft-badge"><Sparkle />AI 设计草稿</span></div><div className="experiment-header-actions"><button className="outline" disabled={!exp.rqId || busy === `design-${exp.id}`} onClick={() => regenerate(exp)}><MagicWand />{busy === `design-${exp.id}` ? "生成中…" : "重新生成"}</button><button className="icon-button danger" aria-label="删除实验设计" onClick={() => remove(exp)}><Trash /></button></div></header>
        <div className="experiment-title-block"><div><h2>{exp.title}</h2><p><GitBranch />{questions.find((question) => question.id === exp.rqId)?.question ?? "未关联研究问题"}</p></div><span>{exp.model || "AI"}</span></div>
        {design ? <><section className="ai-design-overview"><div className="ai-design-objective"><span>实验目标</span><p>{design.objective || "AI 标记为待补充"}</p><span>可证伪假设</span><p>{design.hypothesis || "AI 标记为待补充"}</p></div><div className="ai-design-grid"><SummaryCell label="数据集 / 样本" values={design.datasets} /><SummaryCell label="基线 / 对照" values={design.baselines} /><SummaryCell label="自变量 / 因变量" values={[...design.independentVariables.map((value) => `自：${value}`), ...design.dependentVariables.map((value) => `因：${value}`)]} /><SummaryCell label="控制变量" values={design.controlledVariables} /><SummaryCell label="评价指标" values={design.metrics} /><SummaryCell label="实验步骤" values={design.procedure} /><SummaryCell label="成功标准" values={design.successCriteria} /><SummaryCell label="风险与偏差" values={design.risks} /></div></section><section className="experiment-table-section"><header><div><Brain /><span><strong>AI 消融设计</strong><small>{design.ablations.length} 项独立验证</small></span></div></header><AblationTable items={design.ablations} /></section></> : <div className="experiment-inline-empty">这是一条旧版实验记录，点击“重新生成”让 AI 转为结构化设计。</div>}
        <section className="experiment-table-section result-synthesis-section"><header><div><ChartBar /><span><strong>AI 结果分析汇总</strong><small>所有结论均回链真实导入行列</small></span></div><button className="primary" onClick={() => setImportingFor(exp.id)}><UploadSimple />导入并分析</button></header>
          {exp.results.length ? <div className="experiment-table-wrap"><table className="experiment-summary-table result-summary-table"><thead><tr><th>结果集</th><th>数据规模</th><th>AI 判断</th><th>核心结论</th><th>证据定位</th><th>操作</th></tr></thead><tbody>{exp.results.map((result) => <tr id={`result-${result.id}`} className={targetResult === result.id ? "route-target" : ""} key={result.id}><td><strong>{result.sourceName || `${result.sourceType.toUpperCase()} 数据`}</strong><small>{new Date(result.createdAt).toLocaleDateString()}</small></td><td>{result.normalizedData.length} 行 × {Object.keys(result.normalizedData[0] ?? {}).length} 列</td><td>{result.analysis ? <span className={`support-badge support-${result.analysis.supportLevel}`}>{SUPPORT_LABELS[result.analysis.supportLevel]}</span> : <span className="analysis-pending">待 AI 分析</span>}</td><td className="result-summary-copy">{result.analysis?.summary || "导入完成，尚未生成分析。"}</td><td>{result.analysis?.findings.length ? <EvidenceRefs result={result} refs={result.analysis.findings.flatMap((finding) => finding.evidenceRefs).slice(0, 4)} /> : "—"}</td><td><button className="table-action" disabled={busy === `analyze-${result.id}`} onClick={() => analyze(exp, result)}>{busy === `analyze-${result.id}` ? "分析中…" : result.analysis ? "重新分析" : "AI 分析"}</button></td></tr>)}</tbody></table></div> : <div className="experiment-inline-empty"><Database /><span><strong>还没有真实结果</strong>导入数据后，AI 会自动分析并把结论汇总到这里。</span></div>}
          {exp.results.map((result) => <DataPreview result={result} key={`preview-${result.id}`} />)}
        </section>
      </article>;
    })}</div>
    {projectId && questions.length > 0 && !experiments.length ? <EmptyState icon={<Flask />} title="让 AI 完成第一份实验设计" description="选择研究问题并补充约束，AI 将一次生成主实验、基线、评价指标和消融表。" action={<button className="primary" onClick={() => setDesigning(true)}><MagicWand />AI 设计实验</button>} /> : null}

    {designing ? <div className="creation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "create-ai") setDesigning(false); }}><form className="quick-create-dialog ai-design-dialog" onSubmit={submitAiDesign} ref={designRef} role="dialog" aria-modal="true" aria-labelledby="ai-design-title"><header><div className="dialog-icon"><MagicWand /></div><div><span className="eyebrow">AI EXPERIMENT DESIGNER</span><h2 id="ai-design-title">生成主实验与消融方案</h2><p>AI 会读取研究问题和项目证据，自动补全变量、基线、指标、步骤与消融目的。</p></div><button type="button" className="icon-button" onClick={() => setDesigning(false)} disabled={busy === "create-ai"} aria-label="关闭"><X /></button></header><div className="dialog-body"><label><span>研究问题 *</span><select name="rqId" required defaultValue={questions.some((question) => question.id === initialQuestion) ? initialQuestion : questions[0]?.id}>{questions.map((question) => <option value={question.id} key={question.id}>{question.question}</option>)}</select></label><label><span>实验标题（可选）</span><input name="title" placeholder="留空则由研究问题自动命名" /></label><label><span>额外约束（可选）</span><textarea name="constraints" rows={5} placeholder="例如：只能使用公开数据集；优先比较三种强基线；需要控制参数量和推理延迟。" /></label><div className="ai-generation-scope"><CheckCircle /><span><strong>AI 将生成</strong>主实验设计、基线与控制变量、评价指标、成功标准，以及每项都有验证目的的消融表。</span></div></div><footer><button type="button" className="outline" onClick={() => setDesigning(false)} disabled={busy === "create-ai"}>取消</button><button className="primary" disabled={busy === "create-ai"}><Sparkle />{busy === "create-ai" ? "正在核对证据并设计…" : "生成实验方案"}</button></footer></form></div> : null}

    {importingFor ? <div className="creation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy.startsWith("import-")) setImportingFor(null); }}><form className="quick-create-dialog result-import-dialog" onSubmit={submitImport} ref={importRef} role="dialog" aria-modal="true" aria-labelledby="result-import-title"><header><div className="dialog-icon result"><UploadSimple /></div><div><span className="eyebrow">REAL RESULT DATA</span><h2 id="result-import-title">导入真实结果并交给 AI 分析</h2><p>原始数据原样保存；AI 只能依据导入行列形成结论。</p></div><button type="button" className="icon-button" onClick={() => setImportingFor(null)} aria-label="关闭"><X /></button></header><div className="dialog-body import-dialog-grid"><label><span>格式</span><select name="sourceType" defaultValue="csv"><option value="csv">CSV</option><option value="json">JSON</option><option value="pasted">结构化粘贴（CSV）</option></select></label><label><span>数据名称</span><input name="sourceName" placeholder="main-results.csv" /></label><label className="span-all"><span>真实结果数据 *</span><textarea name="data" required rows={10} placeholder={'method,split,ap,latency\nbaseline,test,0.72,18\nours,test,0.79,21'} /></label><label className="span-all"><span>统计口径与备注</span><textarea name="notes" rows={3} placeholder="说明重复次数、均值/方差口径、硬件环境或其他限制。" /></label><label className="auto-analysis-toggle span-all"><input type="checkbox" name="autoAnalyze" defaultChecked /><span><strong>导入后立即运行 AI 分析</strong><small>分析结果会自动进入实验汇总表，并保留行列证据。</small></span></label></div><footer><button type="button" className="outline" onClick={() => setImportingFor(null)}>取消</button><button className="primary" disabled={busy.startsWith("import-")}><UploadSimple />{busy.startsWith("import-") ? "正在导入…" : "导入并分析"}</button></footer></form></div> : null}
  </div>;
}
