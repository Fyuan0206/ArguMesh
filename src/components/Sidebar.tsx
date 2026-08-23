import { useMemo } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { BookOpenText, Clock, Flask, FolderSimple, GearSix, GridFour, House, Lightbulb, MagnifyingGlass, NotePencil, Question, SidebarSimple, UsersThree } from "@phosphor-icons/react";
import { useAuth } from "../state/auth";
import { useWorkspace } from "../state/workspace";
import { BrandMark } from "./BrandMark";

/**
 * 上下文导航:登录后落地项目列表,项目外只显示「项目」;
 * 进入某个项目(/projects/:projectId/*)后,显示该项目的 概览/文献/矩阵/Ideas。
 */

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** 精确匹配(用于项目概览) */
  end?: boolean;
  /** 前缀匹配(如 /library 子路由) */
  prefix?: string;
  /** Ideas 走查询参数过滤,单独判断 */
  ideasScope?: boolean;
}

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { settings } = useWorkspace();
  const { session } = useAuth();
  const location = useLocation();
  const displayName = session?.displayName || settings.displayName;
  const initials = useMemo(() => {
    const cleaned = displayName.trim();
    if (!cleaned) return "PI";
    // 取每个连续汉字首字母不现实,这里退化为前两字符;对英文姓名也能正常切片。
    return cleaned.slice(0, 2).toUpperCase();
  }, [displayName]);

  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  // Ideas 页(/ideas、/ideas/:id/canvas)不在 /projects/ 前缀下,
  // 项目上下文改由 ?project= 查询参数恢复,否则进入 Idea 工作流后侧栏只剩「项目」。
  const [searchParams] = useSearchParams();
  const ideasProjectId = location.pathname.startsWith("/ideas") ? searchParams.get("project") : "";
  const projectId = (match ? decodeURIComponent(match[1]) : ideasProjectId ?? "") || "";
  const inProject = Boolean(projectId);

  const nav: NavItem[] = inProject
    ? [
        { to: `/projects/${encodeURIComponent(projectId)}`, label: "项目概览", icon: <House />, end: true },
        { to: `/projects/${encodeURIComponent(projectId)}/library`, label: "文献", icon: <BookOpenText />, prefix: `/projects/${projectId}/library` },
        { to: `/projects/${encodeURIComponent(projectId)}/matrices`, label: "矩阵", icon: <GridFour weight="fill" />, prefix: `/projects/${projectId}/matrices` },
        { to: `/projects/${encodeURIComponent(projectId)}/questions`, label: "研究问题", icon: <MagnifyingGlass />, prefix: `/projects/${projectId}/questions` },
        { to: `/projects/${encodeURIComponent(projectId)}/gaps`, label: "缺口", icon: <Question />, prefix: `/projects/${projectId}/gaps` },
        { to: `/projects/${encodeURIComponent(projectId)}/experiments`, label: "实验", icon: <Flask />, prefix: `/projects/${projectId}/experiments` },
        { to: `/ideas?project=${encodeURIComponent(projectId)}`, label: "Ideas", icon: <Lightbulb />, ideasScope: true },
        { to: "/projects", label: "所有项目", icon: <FolderSimple />, end: true },
      ]
    : [
        { to: "/projects", label: "项目", icon: <FolderSimple />, end: true },
      ];

  function isActive(item: NavItem) {
    if (item.ideasScope) {
      return location.pathname.startsWith("/ideas") && location.search.includes(`project=${encodeURIComponent(projectId)}`);
    }
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
      <nav>
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={() => `nav-item${isActive(item) ? " active" : ""}`}>
            {item.icon}<span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/search" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><MagnifyingGlass /><span>搜索</span></NavLink>
        <NavLink to="/knowledge" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><NotePencil /><span>知识库</span></NavLink>
        <NavLink to="/tasks" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><Clock /><span>任务中心</span></NavLink>
        {session?.role === "admin" ? <NavLink to="/users" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><UsersThree /><span>用户管理</span></NavLink> : null}
        <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}><GearSix /><span>设置</span></NavLink>
        <div className="profile"><span>{initials}</span><div><strong>{displayName}</strong><small>{session?.role === "admin" ? "管理员" : "研究者"}</small></div></div>
        <button type="button" className="icon-button sidebar-toggle" onClick={onToggle} aria-label={open ? "收起导航" : "展开导航"} aria-expanded={open}><SidebarSimple /></button>
      </div>
    </aside>
  );
}
