import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BookOpenText, Clock, Flask, FolderSimple, GearSix, GitBranch, GridFour, MagnifyingGlass, NotePencil, PuzzlePiece, SidebarSimple, Sparkle } from "@phosphor-icons/react";
import { listAgentSkills, type AgentSkillSummary } from "../api";
import { useWorkspace } from "../state/workspace";
import { AgentSkillsPanel } from "./AgentSkillsPanel";
import { BrandMark } from "./BrandMark";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  prefix?: string;
}

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { settings, projects } = useWorkspace();
  const location = useLocation();
  const [showSkills, setShowSkills] = useState(false);
  const [skills, setSkills] = useState<AgentSkillSummary[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const skillsRequestRef = useRef(0);
  const refreshSkills = useCallback(async () => {
    const request = ++skillsRequestRef.current;
    setSkillsLoading(true); setSkillsError("");
    try {
      const response = await listAgentSkills();
      if (request === skillsRequestRef.current) setSkills(response.skills);
    } catch (cause) {
      if (request === skillsRequestRef.current) setSkillsError(cause instanceof Error ? cause.message : "无法加载技能，请重试。");
    } finally { if (request === skillsRequestRef.current) setSkillsLoading(false); }
  }, []);
  useEffect(() => () => { skillsRequestRef.current += 1; }, []);
  const refreshManagedSkills = useCallback(async () => {
    await refreshSkills();
    window.dispatchEvent(new Event("paperidea:agent-skills-changed"));
  }, [refreshSkills]);
  const displayName = settings.displayName;
  const initials = useMemo(() => {
    const cleaned = displayName.trim();
    return cleaned ? cleaned.slice(0, 2).toUpperCase() : "PI";
  }, [displayName]);

  const pathMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const queryProjectId = new URLSearchParams(location.search).get("project") ?? "";
  const projectId = pathMatch ? decodeURIComponent(pathMatch[1]) : queryProjectId;
  const inProject = Boolean(projectId);
  const encodedProjectId = encodeURIComponent(projectId);
  const activeProjects = useMemo(
    () => projects.filter((project) => project.status !== "archived").slice().sort((a, b) => a.name.localeCompare(b.name, "zh")),
    [projects],
  );
  const mainNav: NavItem[] = inProject
    ? [
        { to: `/projects/${encodedProjectId}`, label: "AI 研究助手", icon: <Sparkle weight="fill" />, end: true },
        { to: `/projects/${encodedProjectId}/library`, label: "文献", icon: <BookOpenText />, prefix: `/projects/${projectId}/library` },
        { to: `/projects/${encodedProjectId}/matrices`, label: "证据矩阵", icon: <GridFour weight="fill" />, prefix: `/projects/${projectId}/matrices` },
        { to: `/projects/${encodedProjectId}/research`, label: "研究脉络", icon: <GitBranch />, prefix: `/projects/${projectId}/research` },
        { to: `/projects/${encodedProjectId}/experiments`, label: "实验", icon: <Flask />, prefix: `/projects/${projectId}/experiments` },
        { to: `/projects/${encodedProjectId}/writing`, label: "论文写作", icon: <NotePencil />, prefix: `/projects/${projectId}/writing` },
      ]
    : [];

  function isActive(item: NavItem) {
    if (item.prefix) return location.pathname.startsWith(item.prefix);
    if (item.end) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  }

  return (
    <aside className="sidebar" aria-label="主导航">
      <NavLink className="brand" to="/projects">
        <BrandMark className="brand-mark" />
        <span className="brand-text">ArguMesh<small>论脉 · 科研 personal agent</small></span>
      </NavLink>
      <nav aria-label={inProject ? "项目研究导航" : "已有项目"}>
        {inProject ? (
          mainNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className={() => `nav-item${isActive(item) ? " active" : ""}`}>
              {item.icon}<span>{item.label}</span>
            </NavLink>
          ))
        ) : (
          <>
            <div className="sidebar-section-label"><span>已有项目</span><em>{activeProjects.length}</em></div>
            {activeProjects.length === 0 ? (
              <p className="sidebar-empty">还没有项目，可在右侧新建</p>
            ) : (
              activeProjects.map((project) => (
                <NavLink
                  key={project.id}
                  to={`/projects/${encodeURIComponent(project.id)}`}
                  title={project.name}
                  className={({ isActive: active }) => `nav-item nav-project${active ? " active" : ""}`}
                >
                  <FolderSimple weight="duotone" /><span>{project.name}</span>
                </NavLink>
              ))
            )}
          </>
        )}
        <button type="button" title="管理技能" aria-label="管理技能" aria-haspopup="dialog" aria-expanded={showSkills} className={`nav-item${showSkills ? " active" : ""}`} onClick={() => { setShowSkills(true); void refreshSkills(); }}><PuzzlePiece /><span>管理技能</span></button>
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/search" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><MagnifyingGlass /><span>全局搜索</span></NavLink>
        <NavLink to="/tasks" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><Clock /><span>任务中心</span></NavLink>
        <NavLink to="/projects" end title="所有项目" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><FolderSimple /><span>所有项目</span></NavLink>
        <NavLink to="/settings" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><GearSix /><span>设置</span></NavLink>
        <div className="profile"><span>{initials}</span><div><strong>{displayName}</strong><small>本地工作台</small></div></div>
        <button type="button" className="icon-button sidebar-toggle" onClick={onToggle} aria-label={open ? "收起导航" : "展开导航"} aria-expanded={open}><SidebarSimple /></button>
      </div>
      {showSkills ? <AgentSkillsPanel skills={skills} loading={skillsLoading} error={skillsError} onRefresh={refreshManagedSkills} onClose={() => setShowSkills(false)} /> : null}
    </aside>
  );
}
