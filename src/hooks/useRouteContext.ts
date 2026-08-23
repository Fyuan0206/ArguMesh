import { useLocation, useParams } from "react-router-dom";

export interface RouteContext {
  projectId?: string;
  paperId?: string;
  inReader: boolean;
}

/** Read the current research context from the canonical path or legacy ?project= scope. */
export function useRouteContext(): RouteContext {
  const params = useParams<{ projectId?: string; paperId?: string }>();
  const location = useLocation();
  const pathMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const queryProjectId = new URLSearchParams(location.search).get("project") ?? undefined;
  const projectId = params.projectId ?? (pathMatch ? decodeURIComponent(pathMatch[1]) : undefined) ?? queryProjectId;
  const paperId = params.paperId;
  const inReader = Boolean(projectId && paperId && location.pathname.endsWith("/read"));
  return { projectId, paperId, inReader };
}
