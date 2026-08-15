import { BookOpenText, CheckCircle, FileText, FloppyDisk, Quotes, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { generatePaperCard } from "../api";
import { EmptyState } from "../components/states";
import { PageHeader } from "../components/PageHeader";
import { extractPdfText } from "../pdf/document";
import { getPaperPdf } from "../storage/paperFiles";
import { useWorkspace, type PaperCard, type PaperCardSources } from "../state/workspace";

const FIELDS: Array<{ key: keyof Omit<PaperCard, "confirmed" | "updatedAt" | "generatedBy" | "generatedAt" | "generatedSource" | "sources">; label: string; hint: string }> = [
  { key: "problem", label: "研究问题", hint: "论文试图解决什么问题？" },
  { key: "method", label: "方法", hint: "核心方法、架构或理论是什么？" },
  { key: "data", label: "数据与评测", hint: "使用哪些数据集、基线和指标？" },
  { key: "findings", label: "主要发现", hint: "作者报告了哪些关键结果？" },
  { key: "limitations", label: "局限性", hint: "适用边界、失败模式和未解决问题。" },
];

const EMPTY_DRAFT = { problem: "", method: "", data: "", findings: "", limitations: "" };

interface GenMeta {
  model: string;
  generatedAt: string;
  source: string;
  sources: PaperCardSources;
}

export function PaperPage() {
  const { projectId = "", paperId = "" } = useParams<{ projectId: string; paperId: string }>();
  const { papers, projects, readerAnswers, readerExcerpts, knowledge, settings, updatePaper } = useWorkspace();
  const paper = papers.find((item) => item.id === paperId && item.projectIds.includes(projectId));
  const project = projects.find((item) => item.id === projectId);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [abstract, setAbstract] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [genMeta, setGenMeta] = useState<GenMeta | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // 切换论文时把草稿/摘要/确认/来源状态重置为该论文本地卡片(如有)。
  useEffect(() => {
    const next = paper?.card;
    setDraft(next ? { problem: next.problem, method: next.method, data: next.data, findings: next.findings, limitations: next.limitations } : EMPTY_DRAFT);
    setAbstract(paper?.abstract ?? "");
    setConfirmed(Boolean(next?.confirmed));
    setGenMeta(next?.generatedBy ? { model: next.generatedBy, generatedAt: next.generatedAt ?? "", source: next.generatedSource ?? "", sources: next.sources ?? { problem: "", method: "", data: "", findings: "", limitations: "" } } : null);
    setGenError("");
    setSaved(false);
  }, [paperId]);

  if (!paper) return <div className="route-page"><EmptyState icon={<BookOpenText />} title="当前项目中没有这篇文献" description="请返回项目文献库重新选择。" /></div>;
  const card = paper.card ?? { ...EMPTY_DRAFT, confirmed: false, updatedAt: "" };
  const excerpts = readerExcerpts.filter((item) => item.paperId === paperId && item.projectId === projectId);
  const answers = readerAnswers.filter((item) => item.paperId === paperId && item.projectId === projectId);
  const items = knowledge.filter((item) => item.paperId === paperId && item.projectId === projectId);
  const confidenceLabel = confirmed ? "已人工确认" : genMeta ? "AI 草稿（待人工确认）" : "草稿";

  /**
   * 解析 AI 生成的事实来源:优先浏览器本地 PDF 文本,其次当前表单里的摘要(未保存也能用)。没有原文则拒绝生成。
   * 文本上限 15K:真实 PDF 的 30K 全文让 StepFun 推理逼近 55s 超时(生产 502,2026-08-14),
   * 15K(约 20–30 页)已足以支撑五字段提取;省略处由后端 trimTextForLlm 再兜底标注。
   */
  const MAX_LLM_TEXT = 15_000;
  const resolveMaterial = async (): Promise<{ text: string; source: string }> => {
    const blob = await getPaperPdf(paperId);
    if (blob) {
      const pages = await extractPdfText(blob, paperId, { maxPages: 50, maxChars: MAX_LLM_TEXT });
      const text = pages.map((page) => page.text).join("\n").slice(0, MAX_LLM_TEXT);
      return { text, source: `PDF 文本（前 ${text.length} 字）` };
    }
    const abstractText = abstract.trim();
    if (abstractText.length >= 100) return { text: abstractText.slice(0, MAX_LLM_TEXT), source: "论文摘要" };
    throw new Error("AI 生成需要原文依据：请先上传 PDF，或填写论文摘要（≥100 字）。生成只依据上传的文本，不会凭标题臆造。");
  };

  const generate = async () => {
    setGenerating(true);
    setGenError("");
    try {
      const { text, source } = await resolveMaterial();
      if (text.trim().length < 100) {
        setGenError("可供 AI 依据的原文太短（<100 字），请上传完整 PDF 后重试。");
        return;
      }
      const result = await generatePaperCard(paperId, { text, title: paper.title, authors: paper.authors, source });
      setDraft(result.card);
      setConfirmed(false);
      setGenMeta({ model: result.model, generatedAt: result.generatedAt, source: result.source, sources: result.sources });
    } catch (error) {
      setGenError(error instanceof Error ? (error.message === "Unauthorized" ? "登录已过期，请重新登录。" : error.message) : "AI 卡片生成失败，请重试。");
    } finally {
      setGenerating(false);
    }
  };

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updatePaper(paperId, {
      abstract: abstract.trim() || undefined,
      card: {
        ...draft,
        confirmed,
        updatedAt: new Date().toISOString(),
        generatedBy: genMeta?.model,
        generatedAt: genMeta?.generatedAt,
        generatedSource: genMeta?.source,
        sources: genMeta?.sources,
      },
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return <div className="route-page paper-page">
    <PageHeader eyebrow={`${project?.name ?? "项目"} · Paper`} title={paper.title} description={`${paper.authors} · ${paper.venue} ${paper.year}`} actions={<><Link className="secondary-button" to={`/projects/${encodeURIComponent(projectId)}/library/${encodeURIComponent(paperId)}/read`}><BookOpenText />阅读 PDF</Link><Link className="secondary-button" to="/knowledge"><Quotes />查看知识</Link></>} />
    <div className="paper-workspace-grid">
      <form className="surface-card paper-card-editor" onSubmit={save}>
        <header><div><span className="eyebrow">Paper Card</span><h2>结构化论文资产</h2></div>
          <button className="secondary-button" type="button" disabled={generating} onClick={() => void generate()} title={`依据浏览器中的 PDF/摘要文本生成草稿，模型：${genMeta?.model ?? "step-3.7-flash"}，约 1 次调用 · 3 万字输入上限`}><Sparkle />{generating ? "AI 生成中…（约 30 秒）" : "AI 生成草稿"}</button>
        </header>
        {genError ? <p className="form-error card-gen-error" role="alert"><WarningCircle weight="fill" />{genError}</p> : null}
        {generating ? <p className="form-hint"><Sparkle /> 正在调用 {genMeta?.model ?? "step-3.7-flash"} 依据原文生成草稿，完成后请对照原文审阅确认。</p> : null}
        <label className="paper-abstract-field"><span>论文摘要{abstract.trim().length >= 100 ? <em className="ai-field-badge">AI 生成可用</em> : <em className="ai-field-badge">摘要过短，AI 生成不可用</em>}</span><textarea name="abstract" value={abstract} onChange={(event) => setAbstract(event.target.value)} placeholder="粘贴论文摘要（≥100 字）。没有 PDF 时，AI 生成会依据摘要进行。" rows={4} /></label>
        {FIELDS.map((field) => <label key={field.key}><span>{field.label}{genMeta ? <em className="ai-field-badge">AI 草稿</em> : null}</span><textarea name={field.key} value={draft[field.key]} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.hint} /></label>)}
        {genMeta ? <details className="ai-evidence-panel" open><summary>AI 草稿依据 · {genMeta.model} · {new Date(genMeta.generatedAt).toLocaleString("zh-CN")} · {genMeta.source}</summary>{FIELDS.map((field) => <p key={field.key}><strong>{field.label}</strong><span>{genMeta.sources[field.key] || "文中未说明"}</span></p>)}</details> : null}
        <footer><label className="check-control"><input name="confirmed" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我已对照原文确认</label><button className="primary"><FloppyDisk />{saved ? "已保存" : "保存 Paper Card"}</button></footer>
      </form>
      <aside className="paper-activity-stack">
        <section className="surface-card summary-card"><span className="eyebrow">可信度</span><strong>{confidenceLabel}</strong><p>{card.updatedAt ? `最近更新 ${new Date(card.updatedAt).toLocaleString("zh-CN")}` : "尚未填写 Paper Card"}</p>{confirmed ? <CheckCircle weight="fill" /> : <FileText />}</section>
        <section className="surface-card activity-card"><h2>阅读产物</h2><dl><div><dt>摘录</dt><dd>{excerpts.length}</dd></div><div><dt>问答</dt><dd>{answers.length}</dd></div><div><dt>知识对象</dt><dd>{items.length}</dd></div></dl></section>
      </aside>
    </div>
  </div>;
}
