import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/ai/CommandPalette";
import { IdeasPage } from "./pages/IdeasPage";
import { LibraryPage } from "./pages/LibraryPage";
import { MatricesIndexPage } from "./pages/MatricesIndexPage";
import { MatrixPage } from "./pages/MatrixPage";
import { ProjectHomePage } from "./pages/ProjectHomePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { IdeaCanvasPage } from "./pages/IdeaCanvasPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { PaperPage } from "./pages/PaperPage";
import { SearchPage } from "./pages/SearchPage";
import { TasksPage } from "./pages/TasksPage";
import { UsersPage } from "./pages/UsersPage";
import { ResearchQuestionsPage } from "./pages/ResearchQuestionsPage";
import { GapsPage } from "./pages/GapsPage";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import { useAuth } from "./state/auth";
import { ProjectProvider } from "./state/project";
import { WorkspaceProvider } from "./state/workspace";
import { LandingPage } from "./pages/LandingPage";

const ReaderPage = lazy(() => import("./pages/ReaderPage").then((module) => ({ default: module.ReaderPage })));

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
        <CommandPalette />
      </section>
    </main>
  );
}

export function App() {
  const auth = useAuth();
  if (!auth.hasToken) return <LandingPage />;
  const accountId = auth.session?.accountId;
  if (!accountId) return <LandingPage />;

  return (
    <WorkspaceProvider accountId={accountId}>
      <ProjectProvider>
        <Routes>
          <Route element={<AppShell />}>
            {/* 登录后落地项目列表;文献/矩阵等内容都在项目内部访问。 */}
            <Route index element={<Navigate to="/projects" replace />} />
            <Route path="/home" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectHomePage />} />
            <Route path="/projects/:projectId/library" element={<LibraryPage />} />
            <Route path="/projects/:projectId/library/:paperId" element={<PaperPage />} />
            <Route path="/projects/:projectId/library/:paperId/read" element={<Suspense fallback={<div className="reader-route-loading">正在加载 PDF 阅读器…</div>}><ReaderPage /></Suspense>} />
            <Route path="/projects/:projectId/matrices" element={<MatricesIndexPage />} />
            <Route path="/projects/:projectId/matrices/:matrixId" element={<MatrixPage />} />
            {/* 研究弧(v2.0):Research Question 脊柱 / Gap / Experiment,均项目作用域。全局路由由 ProjectGate 处理无 projectId 情况。 */}
            <Route path="/projects/:projectId/questions" element={<ResearchQuestionsPage />} />
            <Route path="/projects/:projectId/gaps" element={<GapsPage />} />
            <Route path="/projects/:projectId/experiments" element={<ExperimentsPage />} />
            <Route path="/questions" element={<ResearchQuestionsPage />} />
            <Route path="/gaps" element={<GapsPage />} />
            <Route path="/experiments" element={<ExperimentsPage />} />
            {/* 旧链接兼容:/matrices(全局矩阵列表)与 /knowledge/matrices/:matrixId(矩阵详情)。 */}
            <Route path="/matrices" element={<MatricesIndexPage />} />
            <Route path="/knowledge/matrices/:projectId" element={<MatrixPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/ideas/:ideaId/canvas" element={<IdeaCanvasPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/users" element={auth.session?.role === "admin" ? <UsersPage /> : <Navigate to="/projects" replace />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
      </ProjectProvider>
    </WorkspaceProvider>
  );
}
