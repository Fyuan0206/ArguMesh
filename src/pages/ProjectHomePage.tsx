import { ArrowRight, BookOpenText, FolderSimple, GridFour, Lightbulb } from "@phosphor-icons/react";
import { Link, useParams } from "react-router-dom";
import { AiHero } from "../components/ai/AiHero";
import { EmptyState } from "../components/states";
import { useWorkspace } from "../state/workspace";

export function ProjectHomePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, papers, matrices, ideas } = useWorkspace();
  const project = projects.find((item) => item.id === projectId);

  if (!project) {
    return <div className="route-page"><EmptyState icon={<FolderSimple />} title="项目不存在" description="该项目可能已被删除，或链接不正确。" action={<Link className="primary" to="/projects">返回项目列表</Link>} /></div>;
  }

  const encodedId = encodeURIComponent(project.id);
  const projectPapers = papers.filter((paper) => paper.projectIds.includes(project.id));
  const projectMatrices = matrices.filter((matrix) => matrix.projectId === project.id);
  const projectIdeas = ideas.filter((idea) => idea.projectId === project.id);
  const latestMatrix = projectMatrices[projectMatrices.length - 1];
  const matrixTarget = latestMatrix
    ? `/projects/${encodedId}/matrices/${encodeURIComponent(latestMatrix.id)}`
    : `/projects/${encodedId}/matrices`;
  const dimensionCount = latestMatrix?.dimensions.length ?? 0;

  return (
    <div className="route-page project-home">
      <AiHero />
      <section className="knowledge-overview" aria-labelledby="knowledge-overview-title">
        <div className="knowledge-overview-copy">
          <span className="knowledge-overview-icon"><BookOpenText /></span>
          <span><strong id="knowledge-overview-title">知识资产概览</strong><small>基于现有文献，构建证据矩阵，驱动发现与验证</small></span>
        </div>
        <div className="knowledge-badges" aria-label="知识资产统计">
          <span className="knowledge-badge success"><BookOpenText /> {projectPapers.length} 篇论文</span>
          <span className="knowledge-badge primary"><GridFour /> {dimensionCount} 个维度</span>
        </div>
        <Link className="knowledge-overview-link" to={matrixTarget}>打开证据矩阵 <ArrowRight /></Link>
      </section>
      <section className="research-assets-grid" aria-label="研究资产">
        <article className="research-asset-card literature">
          <span className="research-asset-icon"><BookOpenText /></span>
          <strong className="research-asset-number">{projectPapers.length}</strong>
          <h2>文献资产</h2>
          <p>已导入并解析的论文与证据，构成研究的知识基础。</p>
          <Link className="research-asset-action" to={`/projects/${encodedId}/library`}>管理文献库 <ArrowRight /></Link>
        </article>
        <article className="research-asset-card matrix">
          <span className="research-asset-icon"><GridFour /></span>
          <strong className="research-asset-number">{projectMatrices.length}</strong>
          <h2>证据矩阵</h2>
          <p>{latestMatrix ? `基于 ${dimensionCount} 个维度横向对比论文，识别趋势与证据强度。` : "按研究维度横向对比论文，识别趋势与证据强度。"}</p>
          <Link className="research-asset-action" to={matrixTarget}>打开证据矩阵 <ArrowRight /></Link>
        </article>
        <article className={`research-asset-card idea${projectIdeas.length === 0 ? " empty" : ""}`}>
          <span className="research-asset-icon"><Lightbulb /></span>
          <strong className="research-asset-number">{projectIdeas.length}</strong>
          <h2>Idea</h2>
          <p>从证据出发生成可验证的研究想法，连接问题、方法与验证路径。</p>
          <Link className="research-asset-action" to={`/ideas?project=${encodedId}`}>生成 Idea <ArrowRight />{projectIdeas.length === 0 ? <span className="pending-badge">待生成</span> : null}</Link>
        </article>
      </section>
    </div>
  );
}
