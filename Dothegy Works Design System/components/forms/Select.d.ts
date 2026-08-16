import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Native dropdown styled to match Input, with a custom chevron.
 * Options may be strings or {value,label} objects.
 */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  options?: (string | SelectOption)[];
  /** Disabled first option shown when nothing is selected */
  placeholder?: string;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
}

export function Select(props: SelectProps): JSX.Element;
