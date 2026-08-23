import { ArrowRight, FolderSimple, type Icon } from "@phosphor-icons/react";
import { Lightbulb, NotePencil, Question } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "./states";
import { PageHeader } from "./PageHeader";
import { listProjects, type RemoteProject } from "../api";

/**
 * Project Context 入口闸门(D2)。
 * 唯一真源 = URL 的 :projectId。本组件自己从 useParams() 读取,不接收外部传入。
 * - 无 projectId(全局路由)→ 渲染 ProjectSelector(项目列表从 API 拉取),让用户选择后进入 scoped route。
 * - 有 projectId → 渲染 children。
 */
type Scope = "ideas" | "knowledge" | "gaps";

const SCOPE_META: Record<Scope, { label: string; icon: Icon; blurb: string }> = {
  ideas: { label: "Ideas", icon: Lightbulb, blurb: "从证据形成的研究假设,可补充证据、推进状态。" },
  knowledge: { label: "知识", icon: NotePencil, blurb: "本项目可追溯的笔记、Claim 与 Evidence。" },
  gaps: { label: "缺口", icon: Question, blurb: "从已有知识发现的研究缺口,补证据后可转成 Idea。" },
};

function ProjectSelector({ scope }: { scope: Scope }) {
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const meta = SCOPE_META[scope];
  const Icon = meta.icon;
  // ArguMesh 用 archived boolean(非 status);未归档 = 活跃项目。
  const active = projects.filter((project) => !project.archived);

  useEffect(() => {
    listProjects().then((res) => setProjects(res.projects)).catch(() => setProjects([]));
  }, []);

  return (
    <div className="route-page">
      <PageHeader eyebrow={meta.label} title={`选择一个项目 · ${meta.label}`} description={meta.blurb} />
      {active.length === 0 ? (
        <EmptyState icon={<Icon />} title="还没有项目" description="先创建一个研究项目,再在这里管理它的知识、缺口与 Idea。" action={<Link className="primary" to="/projects"><FolderSimple /> 去创建项目</Link>} />
      ) : (
        <section className="card-grid">
          {active.map((project) => (
            <article className="surface-card project-card" key={project.id}>
              <div className="card-icon"><FolderSimple weight="duotone" /></div>
              <div className="project-card-main">
                <div className="section-heading"><div><h2>{project.name}</h2></div></div>
                <p>{project.description || "尚未填写研究目标。"}</p>
              </div>
              <div className="card-actions vertical">
                <Link className="primary" to={`/projects/${encodeURIComponent(project.id)}/${scope}`}>进入{meta.label} <ArrowRight /></Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export function ProjectGate({ scope, children }: { scope: Scope; children: ReactNode }) {
  const { projectId } = useParams<{ projectId?: string }>();
  if (!projectId) return <ProjectSelector scope={scope} />;
  return <>{children}</>;
}
