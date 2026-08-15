import { ArrowRight, CheckCircle, GridFour, Plus, Sparkle, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";
import { useWorkspace } from "../state/workspace";
import { saveMatrix, syncPaper, syncProject } from "../api";

/**
 * 预设研究维度 — 一键勾选,覆盖常见文献综述场景。
 * 用户可以全部取消,只保留自添加维度。
 */
const PRESET_DIMENSIONS = [
  { key: "question", label: "研究问题", hint: "论文要回答的核心科学问题" },
  { key: "method", label: "方法设计", hint: "模型架构、训练策略、关键技术" },
  { key: "dataset", label: "数据集", hint: "训练/评测数据来源与规模" },
  { key: "metric", label: "评价指标", hint: "量化方法与基准分数" },
  { key: "result", label: "主要结论", hint: "最重要的实验发现或定量结果" },
  { key: "limit", label: "局限性", hint: "作者自述或显而易见的短板" },
] as const;

export function MatricesIndexPage() {
  const { matrices, projects, papers, addMatrix, markMatrixSynced } = useWorkspace();
  const navigate = useNavigate();
  // 项目内路由 /projects/:projectId/matrices 会带上 projectId;全局 /matrices(旧链接)没有。
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const scopedProject = routeProjectId ? projects.find((project) => project.id === routeProjectId) : undefined;
  const activeProjects = projects.filter((project) => project.status === "active");
  const [creating, setCreating] = useState(false);
  const [projectId, setProjectId] = useState(scopedProject?.id ?? activeProjects[0]?.id ?? "");
  useEffect(() => {
    if (routeProjectId && projects.some((project) => project.id === routeProjectId)) setProjectId(routeProjectId);
  }, [routeProjectId]);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set(PRESET_DIMENSIONS.map((d) => d.key)));
  const [customDimensions, setCustomDimensions] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>(() => papers.filter((paper) => paper.projectIds.includes(activeProjects[0]?.id ?? "")).map((paper) => paper.id));
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const projectPapers = useMemo(() => papers.filter((paper) => paper.projectIds.includes(projectId)), [papers, projectId]);
  // 项目内访问时只显示该项目的矩阵;全局 /matrices 旧链接仍显示全部。
  const visibleMatrices = useMemo(() => (scopedProject ? matrices.filter((matrix) => matrix.projectId === scopedProject.id) : matrices), [matrices, scopedProject]);

  const allDimensions = useMemo(() => {
    const fromPresets = PRESET_DIMENSIONS.filter((d) => enabledKeys.has(d.key)).map((d) => d.label);
    return [...fromPresets, ...customDimensions];
  }, [enabledKeys, customDimensions]);

  function chooseProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    setSelectedPaperIds(papers.filter((paper) => paper.projectIds.includes(nextProjectId)).map((paper) => paper.id));
  }

  function togglePaper(paperId: string) {
    setSelectedPaperIds((current) => current.includes(paperId) ? current.filter((id) => id !== paperId) : [...current, paperId]);
  }

  function togglePreset(key: string) {
    setEnabledKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function addCustomDimension() {
    const next = customDraft.split(/[,，;\n]+/).map((d) => d.trim()).filter(Boolean);
    if (next.length === 0) return;
    setCustomDimensions((current) => [...current, ...next.filter((d) => !current.includes(d))].slice(0, 30));
    setCustomDraft("");
  }

  function removeCustomDimension(label: string) {
    setCustomDimensions((current) => current.filter((d) => d !== label));
  }

  function onCustomKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addCustomDimension();
    }
    if (event.key === "Backspace" && customDraft === "" && customDimensions.length > 0) {
      setCustomDimensions((current) => current.slice(0, -1));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!name || !projectId || selectedPaperIds.length === 0 || allDimensions.length === 0) return;
    setSaving(true); setCreateError("");
    const matrixId = addMatrix({ projectId, name, description, paperIds: selectedPaperIds, dimensionLabels: allDimensions });
    const project = projects.find((item) => item.id === projectId)!;
    const dimensions = allDimensions.map((label, index) => ({ id: `${matrixId}:dimension-${index + 1}`, label }));
    try {
      await syncProject(project);
      await Promise.all(selectedPaperIds.map((paperId) => {
        const paper = papers.find((item) => item.id === paperId)!;
        return syncPaper(projectId, { id: paper.id, title: paper.title, authors: paper.authors, venue: paper.venue, year: paper.year, abstract: paper.abstract, doi: paper.doi, arxivId: paper.arxivId, sourceUrl: paper.sourceUrl, fileHash: paper.fileHash });
      }));
      await saveMatrix({ id: matrixId, projectId, name, description, paperIds: selectedPaperIds, dimensions });
      markMatrixSynced(matrixId);
      navigate(`/projects/${encodeURIComponent(projectId)}/matrices/${encodeURIComponent(matrixId)}`);
    } catch (error) {
      setCreateError(`${error instanceof Error ? error.message : "矩阵保存失败"}。已保留本地副本，可稍后重试。`);
    } finally { setSaving(false); }
  }

  return <div className="route-page">
    <PageHeader eyebrow={scopedProject ? scopedProject.name : "证据矩阵"} title="矩阵列表" actions={<button className="primary" onClick={() => setCreating(true)}><Plus /> 新建矩阵</button>} />
    {creating ? <form className="surface-card matrix-creator" onSubmit={(event) => void submit(event)}>
      <header><div><span className="eyebrow">创建证据矩阵</span><h2>定义比较范围</h2></div><button className="icon-button" type="button" onClick={() => setCreating(false)} aria-label="关闭"><X /></button></header>
      <div className="matrix-form-grid">
        <label><span>所属项目</span><select name="projectId" value={projectId} onChange={(event) => chooseProject(event.target.value)} required><option value="" disabled>选择项目</option>{activeProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label><span>矩阵名称</span><input name="name" required autoFocus placeholder="例如：方法与数据集对比矩阵" /></label>
        <label className="matrix-description"><span>比较目标（可选）</span><input name="description" placeholder="说明这个矩阵要回答的研究问题" /></label>

        <fieldset className="dimension-picker">
          <legend>
            <span>研究维度</span>
            <small>{allDimensions.length} 个已选 · {selectedPaperIds.length * allDimensions.length} 个证据单元格</small>
          </legend>
          <div className="dimension-presets">
            {PRESET_DIMENSIONS.map((preset) => {
              const checked = enabledKeys.has(preset.key);
              return (
                <label key={preset.key} className={`dimension-chip ${checked ? "checked" : ""}`}>
                  <input type="checkbox" checked={checked} onChange={() => togglePreset(preset.key)} />
                  <span className="dimension-chip-label">{preset.label}</span>
                  <small>{preset.hint}</small>
                </label>
              );
            })}
          </div>
          <div className="dimension-custom">
            <span className="dimension-custom-label"><Sparkle /> 自定义维度</span>
            <div className="dimension-custom-chips" aria-live="polite">
              {customDimensions.length === 0 ? <span className="dimension-empty">未添加自定义维度</span> : customDimensions.map((label) => (
                <span key={label} className="dimension-tag">
                  {label}
                  <button type="button" aria-label={`移除维度 ${label}`} onClick={() => removeCustomDimension(label)}>×</button>
                </span>
              ))}
            </div>
            <div className="dimension-input-row">
              <input
                value={customDraft}
                onChange={(event) => setCustomDraft(event.target.value)}
                onKeyDown={onCustomKeyDown}
                onBlur={() => { if (customDraft.trim()) addCustomDimension(); }}
                placeholder="例如:复现难度、推理延迟、可解释性"
                maxLength={40}
              />
              <button type="button" className="secondary-button" onClick={addCustomDimension} disabled={customDraft.trim().length === 0}>
                <Plus /> 添加
              </button>
            </div>
            <small>按 Enter / 逗号添加;Backspace 移除最后一个。最多 30 个。</small>
          </div>
        </fieldset>

        <fieldset className="matrix-paper-picker"><legend>纳入论文 <strong>{selectedPaperIds.length} / {projectPapers.length}</strong><small>默认全选项目论文;之后项目新增论文会自动加入矩阵</small></legend>{projectPapers.length ? <div>{projectPapers.map((paper) => <label key={paper.id}><input type="checkbox" checked={selectedPaperIds.includes(paper.id)} onChange={() => togglePaper(paper.id)} /><span><strong>{paper.title}</strong><small>{paper.authors} · {paper.venue} {paper.year}</small></span></label>)}</div> : <p>当前项目还没有论文。请先到项目文献库添加论文。</p>}</fieldset>
      </div>
      {createError ? <p className="form-error">{createError}</p> : null}<footer><span>{selectedPaperIds.length > 0 && allDimensions.length > 0 ? `${selectedPaperIds.length} × ${allDimensions.length} = ${selectedPaperIds.length * allDimensions.length} 个证据单元格` : "至少 1 篇论文 + 1 个维度"}</span><button className="primary" type="submit" disabled={saving || !projectId || selectedPaperIds.length === 0 || allDimensions.length === 0}>{saving ? "正在保存…" : "创建并打开"} <ArrowRight /></button></footer>
    </form> : null}
    <section className="matrix-list">
      {visibleMatrices.map((matrix) => {
        const project = projects.find((item) => item.id === matrix.projectId);
        const cells = Object.values(matrix.cells);
        const confirmed = cells.filter((cell) => cell.status === "confirmed").length;
        const conflicts = cells.filter((cell) => cell.status === "conflict").length;
        const drafts = cells.filter((cell) => cell.status === "draft").length;
        const progress = cells.length ? Math.round(confirmed / cells.length * 100) : 0;
        return <article className="surface-card matrix-index-card" key={matrix.id}><div className="matrix-cover"><GridFour weight="duotone" /><div className="matrix-mini-grid">{Array.from({ length: Math.min(20, Math.max(12, matrix.paperIds.length * matrix.dimensions.length)) }, (_, index) => <i className={index < confirmed ? "done" : index < confirmed + conflicts ? "alert" : ""} key={index} />)}</div></div><div className="matrix-index-main"><span className="eyebrow">{project?.name ?? "未知项目"}{matrix.source === "local" ? " · 本地矩阵" : " · 服务端矩阵"}</span><h2>{matrix.name}</h2><p>{matrix.paperIds.length} 篇论文 × {matrix.dimensions.length} 个研究维度。{matrix.description}</p><div className="matrix-health">{cells.length ? <><span><CheckCircle weight="fill" /> {confirmed} 条已确认</span><span><WarningCircle weight="fill" /> {conflicts} 条冲突</span><span>{drafts} 条 AI 草稿</span></> : <span>打开矩阵后加载实时证据统计</span>}</div></div><div className="matrix-index-side"><strong>{cells.length ? `${progress}%` : "—"}</strong><span>核验完成度</span><Link className="primary" to={`/projects/${encodeURIComponent(matrix.projectId)}/matrices/${encodeURIComponent(matrix.id)}`}>打开矩阵 <ArrowRight /></Link></div></article>;
      })}
    </section>
    {visibleMatrices.length === 0 ? <EmptyState icon={<GridFour />} title="还没有证据矩阵" description="矩阵自动使用项目里的论文——新建时默认纳入项目全部论文，之后新增论文也会自动加入。" action={<button className="primary" onClick={() => setCreating(true)}><Plus /> 新建矩阵</button>} /> : null}
  </div>;
}