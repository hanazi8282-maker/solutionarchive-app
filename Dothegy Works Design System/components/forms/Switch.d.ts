import * as React from "react";

/**
 * Boolean toggle. Controlled via `checked` + `onChange(next)`.
 * Used for mode switches like 본사 요약.
 */
export interface SwitchProps {
  checked?: boolean;
  /** Called with the next boolean value */
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Optional trailing label */
  label?: React.ReactNode;
  /** @default "md" */
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

export function Switch(props: SwitchProps): JSX.Element;
