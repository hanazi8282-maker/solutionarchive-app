import * as React from "react";

export interface DataTableColumn {
  /** Field key in each row object */
  key: string;
  /** Column header label */
  header: React.ReactNode;
  /** @default "left" */
  align?: "left" | "center" | "right";
  /** Fixed width (e.g. 80, "120px") */
  width?: number | string;
  /** Tabular figures for numeric columns */
  numeric?: boolean;
  /** Allow cell text to wrap */
  wrap?: boolean;
  /** Custom cell renderer: (value, row, index) => node */
  render?: (value: any, row: any, index: number) => React.ReactNode;
}

/**
 * Standard list/table surface — caps header, hairline row dividers,
 * hover highlight, optional row click and empty state.
 *
 * @startingPoint section="Data" subtitle="Data table with badges & actions" viewport="700x300"
 */
export interface DataTableProps extends React.HTMLAttributes<HTMLDivElement> {
  columns: DataTableColumn[];
  data: any[];
  /** Stable key per row. @default index */
  rowKey?: (row: any, index: number) => React.Key;
  /** Row click handler */
  onRowClick?: (row: any, index: number) => void;
  /** Shown when data is empty */
  emptyText?: React.ReactNode;
}

export function DataTable(props: DataTableProps): JSX.Element;
