import React from "react";
import { Badge } from "../core/Badge.jsx";

const ROLE_MAP = {
  super_admin: { tone: "violet", label: "슈퍼어드민" },
  admin:       { tone: "info", label: "어드민" },
  member:      { tone: "neutral", label: "팀원" },
};

/**
 * RoleBadge — renders a team role as its spec-mandated coloured badge.
 * 슈퍼어드민 violet · 어드민 blue · 팀원 gray.
 */
export function RoleBadge({ role = "member", size = "md", ...rest }) {
  const r = ROLE_MAP[role] || ROLE_MAP.member;
  return <Badge tone={r.tone} solid={role === "member"} size={size} {...rest}>{r.label}</Badge>;
}
