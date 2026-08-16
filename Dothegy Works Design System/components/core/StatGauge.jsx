import React from "react";
import { ProgressBar, achievementTone } from "./ProgressBar.jsx";

const TONE_FG = {
  danger: "var(--danger)",
  warning: "var(--warning-fg)",
  success: "var(--success-fg)",
};

/**
 * StatGauge — the headline achievement readout: a label, a large
 * tabular % number coloured by the achievement rule, and a progress bar.
 * Used for 전사 종합 달성률 and per-person rates.
 */
export function StatGauge({
  label = null,
  value = 0,
  caption = null,
  size = "lg",
  style = {},
  ...rest
}) {
  const tone = achievementTone(value);
  const numSize = size === "sm" ? 22 : size === "md" ? 28 : 34;

  return (
    <div style={{ fontFamily: "var(--font-sans)", ...style }} {...rest}>
      {label ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      ) : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: numSize,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: TONE_FG[tone],
          fontVariantNumeric: "tabular-nums",
        }}>
          {Math.round(value)}%
        </span>
        {caption ? (
          <span style={{ fontSize: 13, color: "var(--text-faint)" }}>{caption}</span>
        ) : null}
      </div>
      <ProgressBar value={value} tone={tone} height={size === "sm" ? 6 : 8} />
    </div>
  );
}
