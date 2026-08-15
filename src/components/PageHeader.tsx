import type { ReactNode } from "react";
import { SidebarSimple } from "@phosphor-icons/react";

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/**
 * Standard header for routed pages. Replaces the inline `<div className="title-area">`
 * previously embedded inside App.tsx's topbar.
 */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <button
        type="button"
        className="icon-button mobile-only page-menu"
        onClick={() => window.dispatchEvent(new CustomEvent("paperidea:toggle-sidebar"))}
        aria-label="切换导航"
      >
        <SidebarSimple />
      </button>
      <div className="page-header-text">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
