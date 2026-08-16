import React from "react";

/**
 * Card — the standard surface: white fill, hairline border, faint lift.
 * Optional title/subtitle header and right-aligned action slot.
 */
export function Card({
  title = null,
  subtitle = null,
  action = null,
  padded = true,
  children,
  style = {},
  bodyStyle = {},
  ...rest
}) {
  const hasHeader = title || subtitle || action;
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        fontFamily: "var(--font-sans)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {hasHeader ? (
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 20px",
          borderBottom: children ? "1px solid var(--border)" : "none",
        }}>
          <div>
            {title ? (
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-strong)" }}>{title}</div>
            ) : null}
            {subtitle ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: title ? 2 : 0 }}>{subtitle}</div>
            ) : null}
          </div>
          {action ? <div style={{ flex: "none" }}>{action}</div> : null}
        </div>
      ) : null}
      {children != null ? (
        <div style={{ padding: padded ? "var(--card-pad)" : 0, ...bodyStyle }}>{children}</div>
      ) : null}
    </div>
  );
}
