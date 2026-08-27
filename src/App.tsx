import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { LibraryPage } from "./pages/LibraryPage";
import { MatricesIndexPage } from "./pages/MatricesIndexPage";
import { MatrixPage } from "./pages/MatrixPage";
import { ProjectHomePage } from "./pages/ProjectHomePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { IdeaCanvasPage } from "./pages/IdeaCanvasPage";
import { PaperPage } from "./pages/PaperPage";
import { SearchPage } from "./pages/SearchPage";
import { TasksPage } from "./pages/TasksPage";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import { ResearchThreadPage } from "./pages/ResearchThreadPage";
import { WritingPage } from "./pages/WritingPage";
import { ProjectProvider } from "./state/project";
import { WorkspaceProvider } from "./state/workspace";

const ReaderPage = lazy(() => import("./pages/ReaderPage").then((module) => ({ default: module.ReaderPage })));

function LegacyResearchRedirect({ view, type }: { view: "insights" | "questions"; type?: string }) {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const location = useLocation();
  const queryProjectId = new URLSearchParams(location.search).get("project") ?? "";
  const projectId = routeProjectId ?? queryProjectId;
  if (!projectId) return <Navigate to="/projects" replace />;
  const params = new URLSearchParams({ view });
  if (type) params.set("type", type);
  return <Navigate to={`/projects/${encodeURIComponent(projectId)}/research?${params}`} replace />;
}

function AppShell() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 矩阵详情页(旧 /knowledge/matrices/:id 与新 /projects/:projectId/matrices/:matrixId)全屏展示。
  const isMatrix = location.pathname.includes("/matrices/");
  const isReader = location.pathname.startsWith("/projects/") && location.pathname.includes("/library/") && location.pathname.endsWith("/read");

  useEffect(() => {
    const toggle = () => setSidebarOpen((open) => !open);
    window.addEventListener("paperidea:toggle-sidebar", toggle);
    return () => window.removeEventListener("paperidea:toggle-sidebar", toggle);
  }, []);

  useEffect(() => {
    if (window.innerWidth <= 900) setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <main className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} />
      <section className={`workspace ${isMatrix || isReader ? "" : "route-workspace"} ${isReader ? "reader-workspace" : ""}`}>
        <Outlet />
      </section>
    </main>
  );
}

export function App() {
  // 单用户本地版:无登录,直接进入工作台。
  return (
    <WorkspaceProvider>
      <ProjectProvider>
        <Routes>
          <Route element={<AppShell />}>
            {/* 落地项目列表;文献/矩阵等内容都在项目内部访问。 */}
            <Route index element={<Navigate to="/projects" replace />} />
            <Route path="/home" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectHomePage />} />
            <Route path="/projects/:projectId/library" element={<LibraryPage />} />
            <Route path="/projects/:projectId/library/:paperId" element={<PaperPage />} />
            <Route path="/projects/:projectId/library/:paperId/read" element={<Suspense fallback={<div className="reader-route-loading">正在加载 PDF 阅读器…</div>}><ReaderPage /></Suspense>} />
            <Route path="/projects/:projectId/matrices" element={<MatricesIndexPage />} />
            <Route path="/projects/:projectId/matrices/:matrixId" element={<MatrixPage />} />
            <Route path="/projects/:projectId/research" element={<ResearchThreadPage />} />
            {/* 旧研究对象入口统一重定向到“研究脉络”，保留书签兼容。 */}
            <Route path="/projects/:projectId/questions" element={<LegacyResearchRedirect view="questions" />} />
            <Route path="/projects/:projectId/gaps" element={<LegacyResearchRedirect view="insights" type="gap" />} />
            <Route path="/projects/:projectId/experiments" element={<ExperimentsPage />} />
            <Route path="/projects/:projectId/writing" element={<WritingPage />} />
            <Route path="/questions" element={<LegacyResearchRedirect view="questions" />} />
            <Route path="/gaps" element={<LegacyResearchRedirect view="insights" type="gap" />} />
            <Route path="/experiments" element={<ExperimentsPage />} />
            {/* 旧链接兼容:/matrices(全局矩阵列表)与 /knowledge/matrices/:matrixId(矩阵详情)。 */}
            <Route path="/matrices" element={<MatricesIndexPage />} />
            <Route path="/knowledge/matrices/:projectId" element={<MatrixPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/ideas" element={<LegacyResearchRedirect view="insights" type="concept" />} />
            <Route path="/ideas/:ideaId/canvas" element={<IdeaCanvasPage />} />
            <Route path="/knowledge" element={<LegacyResearchRedirect view="insights" />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
      </ProjectProvider>
    </WorkspaceProvider>
  );
}
