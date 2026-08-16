import React from "react";

/**
 * Badge — compact status / category pill. Soft tinted background
 * with matching foreground, or a solid fill. Carries meaning via tone.
 */
export function Badge({
  tone = "neutral",
  solid = false,
  dot = false,
  size = "md",
  children,
  style = {},
  ...rest
}) {
  const tones = {
    neutral: { fg: "var(--slate-600)", bg: "var(--slate-100)", bd: "var(--slate-200)", solidBg: "var(--slate-500)" },
    info:    { fg: "var(--info-fg)", bg: "var(--info-bg)", bd: "var(--info-border)", solidBg: "var(--info)" },
    success: { fg: "var(--success-fg)", bg: "var(--success-bg)", bd: "var(--success-border)", solidBg: "var(--success)" },
    warning: { fg: "var(--warning-fg)", bg: "var(--warning-bg)", bd: "var(--warning-border)", solidBg: "var(--warning)" },
    danger:  { fg: "var(--danger-fg)", bg: "var(--danger-bg)", bd: "var(--danger-border)", solidBg: "var(--danger)" },
    violet:  { fg: "var(--violet-600)", bg: "var(--violet-50)", bd: "var(--violet-100)", solidBg: "var(--violet-500)" },
  };
  const t = tones[tone] || tones.neutral;
  const sz = size === "sm"
    ? { fontSize: 11, padding: dot ? "2px 8px 2px 6px" : "2px 7px", height: 18 }
    : { fontSize: 12, padding: dot ? "3px 9px 3px 7px" : "3px 9px", height: 22 };

  const base = solid
    ? { background: t.solidBg, color: "#fff", border: "1px solid transparent" }
    : { background: t.bg, color: t.fg, border: `1px solid ${t.bd}` };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        lineHeight: 1,
        borderRadius: "var(--radius-full)",
        whiteSpace: "nowrap",
        ...sz,
        ...base,
        ...style,
      }}
      {...rest}
    >
      {dot ? (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: solid ? "#fff" : t.solidBg,
        }} />
      ) : null}
      {children}
    </span>
  );
}
