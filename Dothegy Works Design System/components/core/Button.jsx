import React from "react";

/**
 * Button — the primary interactive control for Dothegy Works.
 * shadcn-style: solid blue for prominent CTAs, near-black neutral
 * for default actions, outline/ghost for secondary, red for destructive.
 */
export function Button({
  variant = "neutral",
  size = "md",
  leftIcon = null,
  rightIcon = null,
  disabled = false,
  fullWidth = false,
  type = "button",
  children,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { height: 30, padding: "0 10px", fontSize: 13, gap: 6 },
    md: { height: 36, padding: "0 14px", fontSize: 14, gap: 7 },
    lg: { height: 42, padding: "0 18px", fontSize: 15, gap: 8 },
  };

  const variants = {
    primary: { background: "var(--primary)", color: "var(--primary-fg)", border: "1px solid transparent" },
    neutral: { background: "var(--neutral-btn)", color: "var(--neutral-btn-fg)", border: "1px solid transparent" },
    outline: { background: "var(--surface-card)", color: "var(--text-body)", border: "1px solid var(--border-strong)" },
    ghost:   { background: "transparent", color: "var(--text-body)", border: "1px solid transparent" },
    destructive: { background: "var(--danger)", color: "#fff", border: "1px solid transparent" },
  };

  const sz = sizes[size] || sizes.md;
  const vr = variants[variant] || variants.neutral;

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: sz.gap,
    height: sz.height,
    padding: sz.padding,
    fontSize: sz.fontSize,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    lineHeight: 1,
    borderRadius: "var(--radius-md)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? "100%" : undefined,
    whiteSpace: "nowrap",
    transition: "background var(--dur-fast) var(--ease-standard), opacity var(--dur-fast)",
    userSelect: "none",
    ...vr,
    ...style,
  };

  const hoverBg = {
    primary: "var(--primary-hover)",
    neutral: "var(--neutral-btn-hover)",
    outline: "var(--slate-50)",
    ghost: "var(--slate-100)",
    destructive: "var(--red-600)",
  }[variant];

  const onEnter = (e) => { if (!disabled && hoverBg) e.currentTarget.style.background = hoverBg; };
  const onLeave = (e) => { if (!disabled) e.currentTarget.style.background = vr.background; };

  return (
    <button
      type={type}
      disabled={disabled}
      style={base}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      {...rest}
    >
      {leftIcon ? <span style={{ display: "inline-flex" }}>{leftIcon}</span> : null}
      {children}
      {rightIcon ? <span style={{ display: "inline-flex" }}>{rightIcon}</span> : null}
    </button>
  );
}
