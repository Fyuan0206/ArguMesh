import { ArrowLeft, ArrowRight, BookOpenText, Clock, FolderSimple, GridFour, Lightbulb, MagnifyingGlass, NotePencil, Sparkle } from "@phosphor-icons/react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";
import { SyncBanner } from "../components/SyncBanner";
import { useWorkspace } from "../state/workspace";

/**
 * 项目首页 — 进入项目后的落地页:项目统计 + 文献/矩阵/Ideas/知识入口。
 * 文献、矩阵等研究内容只在项目内部访问(登录后落地 /projects)。
 */
export function ProjectHomePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, papers, matrices, ideas, knowledge } = useWorkspace();
  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    return <div className="route-page"><EmptyState icon={<FolderSimple />} title="项目不存在" description="该项目可能已被删除，或链接不正确。" action={<Link className="primary" to="/projects">返回项目列表</Link>} /></div>;
  }

  const encodedId = encodeURIComponent(project.id);
  const projectPapers = papers.filter((paper) => paper.projectIds.includes(project.id));
  const projectMatrices = matrices.filter((matrix) => matrix.projectId === project.id);
  const projectIdeas = ideas.filter((idea) => idea.projectId === project.id);
  const projectKnowledge = knowledge.filter((item) => item.projectId === project.id);
  const latestMatrix = projectMatrices[projectMatrices.length - 1];
  const latestCells = latestMatrix ? Object.values(latestMatrix.cells) : [];
  const latestConfirmed = latestCells.filter((cell) => cell.status === "confirmed").length;

  return (
    <div className="route-page">
      <PageHeader eyebrow="项目" title={project.name} actions={<Link className="secondary-button" to="/projects"><ArrowLeft /> 返回项目列表</Link>} />
      <SyncBanner />
      <p className="project-home-desc">{project.description || "尚未填写研究目标。"}</p>
      <section className="metric-grid" aria-label="项目概览">
        <Link className="metric-card" to={`/projects/${encodedId}/library`}><BookOpenText /><span>项目文献</span><strong>{projectPapers.length}</strong><small>上传 PDF 或按 DOI 导入</small></Link>
        <Link className="metric-card" to={`/projects/${encodedId}/matrices`}><GridFour /><span>证据矩阵</span><strong>{projectMatrices.length}</strong><small>论文 × 研究维度</small></Link>
        <Link className="metric-card" to={`/ideas?project=${encodedId}`}><Lightbulb /><span>Ideas</span><strong>{projectIdeas.length}</strong><small>从证据形成假设</small></Link>
        <Link className="metric-card" to="/knowledge"><NotePencil /><span>知识对象</span><strong>{projectKnowledge.length}</strong><small>本项目笔记 · Claim · Evidence</small></Link>
      </section>

      <section className="dashboard-grid">
        {latestMatrix ? (
          <article className="surface-card continue-card">
            <div className="section-heading"><div><span className="eyebrow">继续研究</span><h2>{latestMatrix.name}</h2></div><span className="live-pill"><Sparkle weight="fill" /> {latestCells.length} 个证据单元格</span></div>
            <p>{latestMatrix.description || `覆盖 ${latestMatrix.paperIds.length} 篇论文 × ${latestMatrix.dimensions.length} 个研究维度。`}</p>
            <div className="card-actions">
              <Link className="primary" to={`/projects/${encodedId}/matrices/${encodeURIComponent(latestMatrix.id)}`}>打开证据矩阵 <ArrowRight /></Link>
              <Link className="secondary-button" to={`/projects/${encodedId}/matrices`}>管理矩阵</Link>
            </div>
          </article>
        ) : (
          <article className="surface-card continue-card">
            <div className="section-heading"><div><span className="eyebrow">下一步</span><h2>{projectPapers.length ? "构建证据矩阵" : "导入第一批文献"}</h2></div></div>
            <p>{projectPapers.length ? `「${project.name}」已有 ${projectPapers.length} 篇文献，创建证据矩阵开始横向对比。` : "通过 DOI / arXiv / PDF 导入论文，再构建证据矩阵对比研究维度。"}</p>
            <div className="card-actions">
              {projectPapers.length
                ? <Link className="primary" to={`/projects/${encodedId}/matrices`}>创建矩阵 <ArrowRight /></Link>
                : <Link className="primary" to={`/projects/${encodedId}/library`}>导入文献 <ArrowRight /></Link>}
            </div>
          </article>
        )}

        <article className="surface-card activity-card">
          <div className="section-heading"><div><span className="eyebrow">项目内</span><h2>研究工作流</h2></div></div>
          <ul className="task-list">
            <li><BookOpenText /><span><strong>文献库</strong><small>阅读、标注与 Paper Card</small></span><Link to={`/projects/${encodedId}/library`}>打开</Link></li>
            <li><GridFour /><span><strong>证据矩阵</strong><small>{latestMatrix ? `最近:${latestMatrix.name}` : "论文 × 维度横向对比"}</small></span><Link to={`/projects/${encodedId}/matrices`}>打开</Link></li>
            <li><Lightbulb /><span><strong>Ideas</strong><small>{projectIdeas.length} 个 Idea</small></span><Link to={`/ideas?project=${encodedId}`}>打开</Link></li>
            <li><NotePencil /><span><strong>知识对象</strong><small>{projectKnowledge.length} 条笔记/Claim/Evidence</small></span><Link to="/knowledge">打开</Link></li>
          </ul>
        </article>
      </section>

      <section className="home-links surface-card"><div><span className="eyebrow">全局</span><h2>知识库、任务与搜索</h2><p>跨项目工具仍可随时访问。</p></div><span><Link className="secondary-button" to="/knowledge">知识库</Link><Link className="secondary-button" to="/tasks"><Clock />任务中心</Link><Link className="secondary-button" to="/search"><MagnifyingGlass />全局搜索</Link></span></section>
    </div>
  );
}
