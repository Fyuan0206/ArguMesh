import type { ReactNode } from "react";
import { ArrowsClockwise, WarningCircle } from "@phosphor-icons/react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/** Renders the visual treatment used for empty matrix / search results. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      {icon ?? null}
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

interface LoadingStateProps {
  title: ReactNode;
  description?: ReactNode;
}

export function LoadingState({ title, description }: LoadingStateProps) {
  return (
    <div className="empty-state" role="status" aria-busy="true">
      <ArrowsClockwise className="spin" />
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}

interface ErrorStateProps {
  title: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
}

/**
 * Inline error surface used for both auth-rejected and transport-error
 * cases. The matrix route reuses this with a "重试" button.
 */
export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <div className="api-notice" role="alert">
      <WarningCircle />
      <span>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {onRetry ? (
        <button onClick={onRetry}>
          <ArrowsClockwise /> 重试
        </button>
      ) : null}
    </div>
  );
}
