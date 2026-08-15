import { useNavigate } from "react-router-dom";
import { ArrowsClockwise, MagnifyingGlass, Play, SidebarSimple, WarningCircle } from "@phosphor-icons/react";

interface TopbarProps {
  breadcrumb: string;
  breadcrumbHref?: string;
  title: string;
  paperCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  progress: number;
  aiMessage: string;
  extracting: boolean;
  onRunExtraction: () => void;
  loadError: string | null;
  onRetry: () => void;
  onToggleSidebar: () => void;
}

export function Topbar({
  breadcrumb,
  breadcrumbHref = "/projects",
  title,
  paperCount,
  query,
  onQueryChange,
  progress,
  aiMessage,
  extracting,
  onRunExtraction,
  loadError,
  onRetry,
  onToggleSidebar,
}: TopbarProps) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div className="title-area">
        <button
          type="button"
          className="icon-button mobile-only"
          onClick={onToggleSidebar}
          aria-label="切换导航"
        >
          <SidebarSimple />
        </button>
        <div>
          <div className="breadcrumb">
            <button
              type="button"
              className="breadcrumb-link"
              onClick={() => navigate(breadcrumbHref)}
            >
              {breadcrumb}
            </button>
            <span>/</span> {title}
          </div>
          <h1>{title}</h1>
        </div>
        <span className="paper-count">{paperCount} 篇文献</span>
      </div>
      <div className="top-actions">
        {loadError ? (
          <div className="api-notice compact" role="alert">
            <WarningCircle />
            <span>{loadError}</span>
            <button onClick={onRetry}>
              <ArrowsClockwise /> 重试
            </button>
          </div>
        ) : null}
        <div className="progress-block" title={aiMessage}>
          <div>
            <span>{aiMessage || "AI 提取进度"}</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
        <label className="search">
          <MagnifyingGlass />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索论文"
          />
        </label>
        <button
          type="button"
          className="primary"
          onClick={onRunExtraction}
          disabled={extracting}
        >
          <Play weight="fill" />
          {extracting ? "正在规划" : "继续 AI 提取"}
        </button>
      </div>
    </header>
  );
}
