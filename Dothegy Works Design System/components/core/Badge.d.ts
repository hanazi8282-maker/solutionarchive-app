import * as React from "react";

/**
 * Compact status / category pill. Soft tint by default, `solid` for
 * emphasis, optional leading `dot`. Tone carries meaning.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** @default "neutral" */
  tone?: "neutral" | "info" | "success" | "warning" | "danger" | "violet";
  /** Solid fill instead of soft tint. @default false */
  solid?: boolean;
  /** Show a leading status dot. @default false */
  dot?: boolean;
  /** @default "md" */
  size?: "sm" | "md";
  children?: React.ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;
