import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ProjectContextValue {
  /** The route's :projectId param. */
  projectId: string;
  setProjectId: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  initialProjectId?: string;
  children: ReactNode;
}

/**
 * 当前选中的项目 ID — 由路由参数或页面调用 setProjectId 设置。
 * 不再硬编码任何默认演示项目,新用户从空状态开始。
 */
export function ProjectProvider({ initialProjectId, children }: ProjectProviderProps) {
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const value = useMemo(() => ({ projectId, setProjectId }), [projectId]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("useProject must be used inside <ProjectProvider>");
  return value;
}