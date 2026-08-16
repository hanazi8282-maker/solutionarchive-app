import React from "react";

/**
 * Input — single-line text/number field. Hairline border, 6px radius,
 * blue focus ring. Optional leading icon and trailing affix (e.g. "원", "개월").
 */
export function Input({
  size = "md",
  leftIcon = null,
  affix = null,
  invalid = false,
  disabled = false,
  style = {},
  containerStyle = {},
  ...rest
}) {
  const heights = { sm: 30, md: 36, lg: 42 };
  const h = heights[size] || 36;
  const [focused, setFocused] = React.useState(false);

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      height: h,
      padding: "0 10px",
      background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
      border: `1px solid ${invalid ? "var(--danger)" : focused ? "var(--ring)" : "var(--border-strong)"}`,
      borderRadius: "var(--radius-md)",
      boxShadow: focused ? "var(--shadow-focus)" : "none",
      transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
      fontFamily: "var(--font-sans)",
      width: "100%",
      boxSizing: "border-box",
      ...containerStyle,
    }}>
      {leftIcon ? <span style={{ display: "inline-flex", color: "var(--text-faint)" }}>{leftIcon}</span> : null}
      <input
        disabled={disabled}
        onFocus={(e) => { setFocused(true); rest.onFocus && rest.onFocus(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur && rest.onBlur(e); }}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "inherit",
          fontSize: size === "sm" ? 13 : 14,
          color: "var(--text-body)",
          padding: 0,
          ...style,
        }}
        {...rest}
      />
      {affix ? <span style={{ fontSize: 13, color: "var(--text-muted)", flex: "none" }}>{affix}</span> : null}
    </div>
  );
}
