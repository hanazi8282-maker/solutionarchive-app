import * as React from "react";

/**
 * Team role badge with the spec's fixed colours:
 * 슈퍼어드민 violet · 어드민 blue · 팀원 gray.
 */
export interface RoleBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** @default "member" */
  role?: "super_admin" | "admin" | "member";
  /** @default "md" */
  size?: "sm" | "md";
}

export function RoleBadge(props: RoleBadgeProps): JSX.Element;
