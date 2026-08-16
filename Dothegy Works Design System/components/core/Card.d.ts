import * as React from "react";

/**
 * Standard content surface — white fill, hairline border, faint lift.
 * Optional header (title/subtitle + action slot) above the body.
 *
 * @startingPoint section="Core" subtitle="Card surface with header" viewport="700x220"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Header title */
  title?: React.ReactNode;
  /** Header subtitle under the title */
  subtitle?: React.ReactNode;
  /** Right-aligned header slot (e.g. a Button or dropdown) */
  action?: React.ReactNode;
  /** Apply default body padding. @default true */
  padded?: boolean;
  /** Extra style for the body wrapper */
  bodyStyle?: React.CSSProperties;
  children?: React.ReactNode;
}

export function Card(props: CardProps): JSX.Element;
