import * as React from "react";

/**
 * Headline achievement readout — label + large % number (coloured by the
 * achievement rule) + progress bar. Used for 전사 종합 달성률 and per-person rates.
 *
 * @startingPoint section="Core" subtitle="KPI achievement gauge" viewport="700x160"
 */
export interface StatGaugeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Caption above the number */
  label?: React.ReactNode;
  /** Achievement percentage (0–100+) */
  value?: number;
  /** Small dim text beside the number (e.g. "목표 2,500") */
  caption?: React.ReactNode;
  /** @default "lg" */
  size?: "sm" | "md" | "lg";
}

export function StatGauge(props: StatGaugeProps): JSX.Element;
