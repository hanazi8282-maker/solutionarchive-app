import React from "react";
import { Badge } from "../core/Badge.jsx";

const STATUS_MAP = {
  정상:     { tone: "neutral", dot: true },
  주의:     { tone: "warning", dot: true },
  생산필요: { tone: "danger", dot: true },
  완료:     { tone: "success", dot: true },
  진행중:   { tone: "info", dot: true },
  예정:     { tone: "neutral", dot: true },
  지연:     { tone: "danger", dot: true },
  취소:     { tone: "neutral", dot: false },
  미연동:   { tone: "neutral", dot: false },
};

/**
 * StatusBadge — maps an inventory/factory status string to its badge.
 * Falls back to a neutral dotted badge for unknown values.
 */
export function StatusBadge({ status = "정상", size = "md", ...rest }) {
  const s = STATUS_MAP[status] || { tone: "neutral", dot: true };
  return <Badge tone={s.tone} dot={s.dot} size={size} {...rest}>{status}</Badge>;
}
