import * as React from "react";

/**
 * Primary interactive control. Blue `primary` for prominent CTAs
 * (지금 수집, 프롬프트 생성), near-black `neutral` for default actions,
 * `outline`/`ghost` for secondary, `destructive` for delete.
 *
 * @startingPoint section="Core" subtitle="Buttons — all variants & sizes" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "neutral" */
  variant?: "primary" | "neutral" | "outline" | "ghost" | "destructive";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Icon node rendered before the label */
  leftIcon?: React.ReactNode;
  /** Icon node rendered after the label */
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  /** Stretch to container width */
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
