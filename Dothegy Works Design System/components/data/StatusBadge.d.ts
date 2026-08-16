import * as React from "react";

/**
 * Maps an inventory/factory status string to its themed badge:
 * 정상 gray · 주의 amber · 생산필요 red · 완료 green · 진행중 blue · 지연 red …
 */
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Korean status label, e.g. "정상" | "주의" | "생산필요" | "완료" | "진행중" | "예정" | "지연" | "취소" | "미연동" */
  status?: string;
  /** @default "md" */
  size?: "sm" | "md";
}

export function StatusBadge(props: StatusBadgeProps): JSX.Element;
