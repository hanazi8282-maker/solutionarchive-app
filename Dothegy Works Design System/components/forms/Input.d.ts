import * as React from "react";

/**
 * Single-line text/number field with hairline border and blue focus ring.
 * Optional leading icon and trailing affix (e.g. "원", "개월").
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Icon node inside the field, leading edge */
  leftIcon?: React.ReactNode;
  /** Trailing unit/affix text (e.g. "원", "개월") */
  affix?: React.ReactNode;
  /** Red error border */
  invalid?: boolean;
  /** Style for the wrapping container */
  containerStyle?: React.CSSProperties;
}

export function Input(props: InputProps): JSX.Element;
