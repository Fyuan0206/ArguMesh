import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Lightbulb } from "@phosphor-icons/react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";

interface PlaceholderPageProps {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  /** The PRD page ID this route corresponds to (e.g. "PG-002"). */
  pageId: string;
}

/**
 * TODO-01 placeholder for routed pages whose real implementation lives
 * in later TODOs (03 / 10 / 11 / 12). They render the same shell so
 * navigation, breadcrumbs, and routing work end-to-end today.
 */
export function PlaceholderPage({ eyebrow, title, description, pageId }: PlaceholderPageProps) {
  const location = useLocation();
  return (
    <article className="placeholder-page">
      <PageHeader
        eyebrow={`${eyebrow} · ${pageId}`}
        title={title}
        description={description}
      />
      <EmptyState
        icon={<Lightbulb weight="duotone" />}
        title="建设中"
        description={
          <>
            本页面将在后续开发任务中实现。当前路由已就绪：
            <code>{location.pathname}</code>
          </>
        }
      />
    </article>
  );
}
