import React from "react";

/**
 * Select — native dropdown styled to match Input. Pass `options` as
 * an array of {value,label} or strings, plus an optional placeholder.
 */
export function Select({
  options = [],
  placeholder = null,
  size = "md",
  invalid = false,
  disabled = false,
  value,
  onChange,
  style = {},
  ...rest
}) {
  const heights = { sm: 30, md: 36, lg: 42 };
  const h = heights[size] || 36;
  const norm = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

  return (
    <div style={{ position: "relative", display: "inline-flex", width: "100%" }}>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          width: "100%",
          height: h,
          padding: "0 32px 0 10px",
          background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
          border: `1px solid ${invalid ? "var(--danger)" : "var(--border-strong)"}`,
          borderRadius: "var(--radius-md)",
          fontFamily: "var(--font-sans)",
          fontSize: size === "sm" ? 13 : 14,
          color: value || !placeholder ? "var(--text-body)" : "var(--text-faint)",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          ...style,
        }}
        {...rest}
      >
        {placeholder ? <option value="" disabled>{placeholder}</option> : null}
        {norm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }}>
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
