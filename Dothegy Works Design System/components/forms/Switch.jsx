import React from "react";

/**
 * Switch — boolean toggle. Used for 본사 요약 mode and similar on/off
 * controls. Controlled via `checked` + `onChange(next)`.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  label = null,
  size = "md",
  style = {},
  ...rest
}) {
  const dims = size === "sm"
    ? { w: 34, h: 20, knob: 14, pad: 3 }
    : { w: 40, h: 24, knob: 18, pad: 3 };

  return (
    <label style={{
      display: "inline-flex", alignItems: "center", gap: 9,
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "var(--font-sans)", opacity: disabled ? 0.5 : 1, ...style,
    }} {...rest}>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          position: "relative",
          width: dims.w, height: dims.h, flex: "none",
          background: checked ? "var(--primary)" : "var(--slate-300)",
          borderRadius: "var(--radius-full)",
          transition: "background var(--dur-base) var(--ease-standard)",
        }}
      >
        <span style={{
          position: "absolute",
          top: dims.pad,
          left: checked ? dims.w - dims.knob - dims.pad : dims.pad,
          width: dims.knob, height: dims.knob,
          background: "#fff",
          borderRadius: "50%",
          boxShadow: "var(--shadow-sm)",
          transition: "left var(--dur-base) var(--ease-out)",
        }} />
      </span>
      {label ? <span style={{ fontSize: 14, color: "var(--text-body)" }}>{label}</span> : null}
    </label>
  );
}
