import React from "react";

/** Maps an achievement % to the spec's status hue (0–69 red, 70–99 amber, 100+ green). */
export function achievementTone(pct) {
  if (pct >= 100) return "success";
  if (pct >= 70) return "warning";
  return "danger";
}

const TONE_COLOR = {
  danger: "var(--danger)",
  warning: "var(--warning)",
  success: "var(--success)",
  info: "var(--info)",
  neutral: "var(--slate-400)",
};

/**
 * ProgressBar — horizontal track + fill. `tone="auto"` colours the fill
 * by the achievement-rate rule; otherwise pass an explicit tone.
 */
export function ProgressBar({
  value = 0,
  max = 100,
  tone = "auto",
  height = 8,
  showLabel = false,
  style = {},
  ...rest
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const clamped = Math.max(0, Math.min(100, pct));
  const resolved = tone === "auto" ? achievementTone(pct) : tone;
  const color = TONE_COLOR[resolved] || TONE_COLOR.neutral;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-sans)", ...style }} {...rest}>
      <div style={{
        flex: 1,
        height,
        background: "var(--slate-100)",
        borderRadius: "var(--radius-full)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${clamped}%`,
          height: "100%",
          background: color,
          borderRadius: "var(--radius-full)",
          transition: "width var(--dur-slow) var(--ease-out)",
        }} />
      </div>
      {showLabel ? (
        <span style={{
          fontSize: 12, fontWeight: 600, color: "var(--text-body)",
          fontVariantNumeric: "tabular-nums", minWidth: 38, textAlign: "right",
        }}>
          {Math.round(pct)}%
        </span>
      ) : null}
    </div>
  );
}
