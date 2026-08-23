import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BookOpenText, Clock, Flask, FolderSimple, GearSix, GridFour, House, Lightbulb, MagnifyingGlass, NotePencil, Question, SidebarSimple, Sparkle, UsersThree } from "@phosphor-icons/react";
import { useAuth } from "../state/auth";
import { useWorkspace } from "../state/workspace";
import { BrandMark } from "./BrandMark";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  prefix?: string;
}

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { settings } = useWorkspace();
  const { session } = useAuth();
  const location = useLocation();
  const displayName = session?.displayName || settings.displayName;
  const initials = useMemo(() => {
    const cleaned = displayName.trim();
    return cleaned ? cleaned.slice(0, 2).toUpperCase() : "PI";
  }, [displayName]);

  const pathMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const queryProjectId = new URLSearchParams(location.search).get("project") ?? "";
  const projectId = pathMatch ? decodeURIComponent(pathMatch[1]) : queryProjectId;
  const inProject = Boolean(projectId);
  const encodedProjectId = encodeURIComponent(projectId);
  const mainNav: NavItem[] = inProject
    ? [
        { to: `/projects/${encodedProjectId}`, label: "概览", icon: <House />, end: true },
        { to: `/projects/${encodedProjectId}/library`, label: "文献", icon: <BookOpenText />, prefix: `/projects/${projectId}/library` },
        { to: `/projects/${encodedProjectId}/matrices`, label: "证据矩阵", icon: <GridFour weight="fill" />, prefix: `/projects/${projectId}/matrices` },
        { to: `/knowledge?project=${encodedProjectId}`, label: "知识", icon: <NotePencil />, prefix: "/knowledge" },
        { to: `/ideas?project=${encodedProjectId}`, label: "Ideas", icon: <Lightbulb />, prefix: "/ideas" },
        { to: `/projects/${encodedProjectId}/gaps`, label: "发现缺口", icon: <Question />, prefix: `/projects/${projectId}/gaps` },
        { to: `/projects/${encodedProjectId}/questions`, label: "研究问题", icon: <MagnifyingGlass />, prefix: `/projects/${projectId}/questions` },
        { to: `/projects/${encodedProjectId}/experiments`, label: "实验", icon: <Flask />, prefix: `/projects/${projectId}/experiments` },
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
        <span className="brand-text">ArguMesh<small>论脉 · Research Workbench</small></span>
      </NavLink>
      <nav aria-label="项目研究导航">
        {inProject ? (
          <button type="button" className="nav-item nav-ai" onClick={() => window.dispatchEvent(new CustomEvent("paperidea:open-ai"))} aria-label="打开 AI 助手">
            <Sparkle weight="fill" /><span>AI 助手</span>
          </button>
        ) : null}
        {mainNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className={() => `nav-item${isActive(item) ? " active" : ""}`}>
            {item.icon}<span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/search" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><MagnifyingGlass /><span>全局搜索</span></NavLink>
        <NavLink to="/tasks" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><Clock /><span>任务中心</span></NavLink>
        <NavLink to="/projects" title="所有项目" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><FolderSimple /><span>所有项目</span></NavLink>
        {session?.role === "admin" ? <NavLink to="/users" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><UsersThree /><span>用户管理</span></NavLink> : null}
        <NavLink to="/settings" className={({ isActive: active }) => `nav-item${active ? " active" : ""}`}><GearSix /><span>设置</span></NavLink>
        <div className="profile"><span>{initials}</span><div><strong>{displayName}</strong><small>{session?.role === "admin" ? "管理员" : "研究者"}</small></div></div>
        <button type="button" className="icon-button sidebar-toggle" onClick={onToggle} aria-label={open ? "收起导航" : "展开导航"} aria-expanded={open}><SidebarSimple /></button>
      </div>
    </aside>
  );
}
