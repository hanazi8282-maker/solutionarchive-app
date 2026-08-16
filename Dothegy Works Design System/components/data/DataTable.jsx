import React from "react";

/**
 * DataTable — the standard list surface (재고 낱개 현황, 팀원 목록, 부자재 …).
 * Columns describe header/alignment/width and an optional cell renderer.
 */
export function DataTable({
  columns = [],
  data = [],
  rowKey = (_, i) => i,
  onRowClick = null,
  emptyText = "데이터 없음",
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(-1);

  return (
    <div style={{ width: "100%", overflowX: "auto", fontFamily: "var(--font-sans)", ...style }} {...rest}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                textAlign: c.align || "left",
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.02em",
                color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
                whiteSpace: "nowrap",
                width: c.width,
              }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: "28px 14px", textAlign: "center", color: "var(--text-faint)" }}>
                {emptyText}
              </td>
            </tr>
          ) : data.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              style={{
                background: hover === i ? "var(--slate-50)" : "transparent",
                cursor: onRowClick ? "pointer" : "default",
                transition: "background var(--dur-fast)",
              }}
            >
              {columns.map((c) => (
                <td key={c.key} style={{
                  textAlign: c.align || "left",
                  padding: "11px 14px",
                  color: "var(--text-body)",
                  borderBottom: i === data.length - 1 ? "none" : "1px solid var(--border)",
                  fontVariantNumeric: c.numeric ? "tabular-nums" : undefined,
                  whiteSpace: c.wrap ? "normal" : "nowrap",
                }}>
                  {c.render ? c.render(row[c.key], row, i) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
