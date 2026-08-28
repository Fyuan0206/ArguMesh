import { ArrowRight, BookOpenText, FolderSimple, GridFour, Lightbulb, MagnifyingGlass, NotePencil } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/states";
import { useWorkspace } from "../state/workspace";

type SearchResult = {
  id: string;
  type: string;
  title: string;
  detail: string;
  to: string;
  icon: ReactNode;
};

export function SearchPage() {
  const { projects, papers, matrices, ideas, knowledge } = useWorkspace();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const results = useMemo<SearchResult[]>(() => {
    if (normalized.length < 2) return [];
    return [
      ...projects
        .filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(normalized))
        .map((item) => ({
          id: `project:${item.id}`,
          type: "项目",
          title: item.name,
          detail: item.description || "尚未填写研究目标",
          to: `/projects/${item.id}`,
          icon: <FolderSimple weight="duotone" />,
        })),
      ...papers
        .filter((item) => `${item.title} ${item.authors} ${item.tags.join(" ")} ${item.abstract ?? ""}`.toLowerCase().includes(normalized))
        .map((item) => ({
          id: `paper:${item.id}`,
          type: "论文",
          title: item.title,
          detail: `${item.authors || "未知作者"} · ${item.venue} ${item.year}`,
          to: item.projectIds[0] ? `/projects/${item.projectIds[0]}/library/${item.id}` : "/library",
          icon: <BookOpenText weight="duotone" />,
        })),
      ...matrices
        .filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(normalized))
        .map((item) => ({
          id: `matrix:${item.id}`,
          type: "矩阵",
          title: item.name,
          detail: item.description,
          to: `/projects/${encodeURIComponent(item.projectId)}/matrices/${encodeURIComponent(item.id)}`,
          icon: <GridFour weight="duotone" />,
        })),
      ...ideas
        .filter((item) => `${item.title} ${item.summary} ${Object.values(item.canvas).join(" ")}`.toLowerCase().includes(normalized))
        .map((item) => ({
          id: `idea:${item.id}`,
          type: "Idea",
          title: item.title,
          detail: item.summary,
          to: `/ideas/${item.id}/canvas`,
          icon: <Lightbulb weight="duotone" />,
        })),
      ...knowledge
        .filter((item) => `${item.title} ${item.content} ${item.note}`.toLowerCase().includes(normalized))
        .map((item) => ({
          id: `knowledge:${item.id}`,
          type: item.kind,
          title: item.title,
          detail: item.content,
          to: "/knowledge",
          icon: <NotePencil weight="duotone" />,
        })),
    ];
  }, [ideas, knowledge, matrices, normalized, papers, projects]);

  const activeProjects = projects.filter((item) => item.status !== "archived");
  const showHint = normalized.length < 2;
  const showEmpty = normalized.length >= 2 && results.length === 0;

  return (
    <div className="route-page search-page">
      <div className="search-page-shell">
        <header className="search-page-head">
          <span className="eyebrow">Search</span>
          <h1>全局搜索</h1>
          <p>在项目、文献、证据矩阵与洞见中快速定位。</p>
        </header>

        <label className="global-search-input search-page-input">
          <MagnifyingGlass weight="bold" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="标题、作者、标签或关键词"
            aria-label="搜索工作区"
          />
          <span className="search-page-count">{showHint ? "≥2 字" : `${results.length} 结果`}</span>
        </label>

        {showHint ? (
          <>
            <div className="search-stat-row" aria-label="工作区概览">
              <span>{activeProjects.length} 项目</span>
              <span>{papers.length} 文献</span>
              <span>{matrices.length} 矩阵</span>
            </div>

            {activeProjects.length > 0 ? (
              <section className="search-shortcuts" aria-label="快速进入">
                <h2>快速进入</h2>
                <div className="search-shortcut-grid">
                  {activeProjects.slice(0, 6).map((project) => {
                    const paperCount = papers.filter((paper) => paper.projectIds.includes(project.id)).length;
                    const matrixCount = matrices.filter((matrix) => matrix.projectId === project.id).length;
                    return (
                      <article className="search-shortcut-card" key={project.id}>
                        <div className="search-shortcut-top">
                          <FolderSimple weight="duotone" />
                          <strong>{project.name}</strong>
                        </div>
                        <p>{paperCount} 篇文献 · {matrixCount} 个矩阵</p>
                        <div className="search-shortcut-links">
                          <Link to={`/projects/${encodeURIComponent(project.id)}`}>项目首页</Link>
                          <Link to={`/projects/${encodeURIComponent(project.id)}/library`}>文献库</Link>
                          {matrixCount > 0 ? (
                            <Link to={`/projects/${encodeURIComponent(project.id)}/matrices/${encodeURIComponent(matrices.find((matrix) => matrix.projectId === project.id)!.id)}`}>
                              证据矩阵
                            </Link>
                          ) : (
                            <Link to={`/projects/${encodeURIComponent(project.id)}/matrices`}>证据矩阵</Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : (
              <EmptyState
                icon={<FolderSimple />}
                title="还没有项目"
                description="创建项目后即可在这里搜索文献与证据。"
                action={<Link className="primary" to="/projects">前往项目列表</Link>}
              />
            )}
          </>
        ) : null}

        {!showHint && results.length > 0 ? (
          <section className="search-result-list" aria-label="搜索结果">
            {results.map((item) => (
              <Link className="search-result" to={item.to} key={item.id}>
                <span className="search-result-icon">{item.icon}</span>
                <div className="search-result-body">
                  <small>{item.type}</small>
                  <h2>{item.title}</h2>
                  <p>{item.detail}</p>
                </div>
                <ArrowRight className="search-result-arrow" aria-hidden />
              </Link>
            ))}
          </section>
        ) : null}

        {showEmpty ? (
          <EmptyState
            icon={<MagnifyingGlass />}
            title="没有匹配结果"
            description={`未找到「${query.trim()}」。试试更短关键词，或确认文献已同步到当前工作区。`}
          />
        ) : null}
      </div>
    </div>
  );
}
