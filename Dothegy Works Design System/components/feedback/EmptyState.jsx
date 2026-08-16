import React from "react";

/**
 * EmptyState — the standard "no data yet" surface. Replaces bare
 * "데이터 없음" text with an icon, a title, a guiding line, and an
 * optional action. Use inside Cards, tables, and empty tabs.
 */
export function EmptyState({
  icon = null,
  title = "데이터 없음",
  description = null,
  action = null,
  tone = "neutral",
  compact = false,
  style = {},
  ...rest
}) {
  const tint = {
    neutral: { bg: "var(--surface-muted)", fg: "var(--text-faint)" },
    info:    { bg: "var(--info-bg)", fg: "var(--info-fg)" },
    warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
    danger:  { bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
  }[tone] || { bg: "var(--surface-muted)", fg: "var(--text-faint)" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: compact ? "28px 24px" : "48px 32px",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
      {...rest}
    >
      {icon ? (
        <div style={{
          width: compact ? 40 : 52,
          height: compact ? 40 : 52,
          borderRadius: "var(--radius-lg)",
          background: tint.bg,
          color: tint.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}>{icon}</div>
      ) : null}
      <div style={{
        fontSize: compact ? 14 : 15,
        fontWeight: 600,
        color: "var(--text-body)",
      }}>{title}</div>
      {description ? (
        <div style={{
          fontSize: 13,
          color: "var(--text-muted)",
          marginTop: 6,
          maxWidth: 340,
          lineHeight: 1.55,
        }}>{description}</div>
      ) : null}
      {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
    </div>
  );
}
