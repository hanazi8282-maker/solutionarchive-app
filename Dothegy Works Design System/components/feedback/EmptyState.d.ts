import * as React from "react";

/**
 * "No data yet" surface — icon + title + guiding description + optional action.
 * Replaces bare "데이터 없음" text everywhere data can be empty.
 *
 * @startingPoint section="Feedback" subtitle="Empty / no-data state" viewport="700x260"
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon node shown in the tinted badge */
  icon?: React.ReactNode;
  /** @default "데이터 없음" */
  title?: React.ReactNode;
  /** Guiding line under the title (what to do next) */
  description?: React.ReactNode;
  /** Optional action (usually a Button) */
  action?: React.ReactNode;
  /** Icon badge tint. @default "neutral" */
  tone?: "neutral" | "info" | "warning" | "danger";
  /** Tighter padding for inline use. @default false */
  compact?: boolean;
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
