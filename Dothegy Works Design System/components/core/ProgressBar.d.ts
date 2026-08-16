import * as React from "react";

/** Maps an achievement % to a status tone: 0–69 danger, 70–99 warning, 100+ success. */
export function achievementTone(pct: number): "danger" | "warning" | "success";

/**
 * Horizontal progress track. `tone="auto"` colours the fill by the
 * achievement-rate rule (red/amber/green); pass an explicit tone to override.
 */
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current value */
  value?: number;
  /** @default 100 */
  max?: number;
  /** @default "auto" */
  tone?: "auto" | "danger" | "warning" | "success" | "info" | "neutral";
  /** Track height in px. @default 8 */
  height?: number;
  /** Show a trailing % label. @default false */
  showLabel?: boolean;
}

export function ProgressBar(props: ProgressBarProps): JSX.Element;
