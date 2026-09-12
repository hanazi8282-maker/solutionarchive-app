"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

/**
 * 관제실 — 로컬 세션(CMO/CTO/CEO-staff/HUB)이 지금 뭘 하는지 보는 오버레이.
 *
 * 이 페이지 URL은 공개다. 그래서 이 패널은 화면 위에 덧대는 완전히 별도의 층이고,
 * 기존 12개 부서 렌더링이나 sim.ts 엔진 상태를 한 줄도 참조하지 않는다.
 * 데이터는 오직 GET /api/agent-status 하나에서 온다.
 *
 * 토큰이 없으면 아예 렌더링되지 않는다(page.tsx가 마운트조차 하지 않는다).
 * 서버가 거절하면 조용히 멈춘다 — 토큰이 틀렸다는 사실을 화면에 드러내지 않는다.
 */

type Props = { ops: string };

/** 30분 넘게 소식이 없으면 살아 있다고 보지 않는다 */
const STALE_MS = 30 * 60 * 1000;
const POLL_MS = 2500;

/** role-status.json 의 최상위 키 그대로다 (activity-status.sh 가 쓰는 표기) */
const ROLES = [
  { key: "CMO", emoji: "📣" },
  { key: "CTO", emoji: "🛠️" },
  { key: "CEO-STAFF", emoji: "🗂️" },
  { key: "HUB", emoji: "🛰️" },
];

type Dot = "working" | "waiting" | "silent";
const DOT_COLOR: Record<Dot, string> = { working: "#34d399", waiting: "#fbbf24", silent: "#64748b" };
const DOT_LABEL: Record<Dot, string> = { working: "일하는 중", waiting: "대기 중", silent: "소식 없음" };

/** role-status.json 의 역할 하나. tool·history 도 오지만 이 패널은 쓰지 않는다. */
type Entry = { status: string; task: string; updatedAt: number | null };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function readEntry(payload: Record<string, unknown>, roleKey: string): Entry | null {
  const raw = payload[roleKey];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const stamp = Date.parse(text(source.updated_at));
  return {
    status: text(source.status),
    task: text(source.task),
    updatedAt: Number.isNaN(stamp) ? null : stamp,
  };
}

function dotOf(entry: Entry | null, now: number): Dot {
  if (!entry || (!entry.task && !entry.status)) return "silent";
  // updated_at 이 없거나 읽을 수 없으면 살아 있다고 보지 않는다 (§7.1 — 확인 불가는 양성이 아니다)
  if (entry.updatedAt === null || now - entry.updatedAt > STALE_MS) return "silent";
  return entry.status === "idle" ? "waiting" : "working";
}

const panel: CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  zIndex: 60,
  width: 236,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 10,
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.88)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  boxShadow: "0 10px 30px rgba(2, 6, 23, 0.35)",
  color: "#e2e8f0",
  font: "500 11px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif",
  backdropFilter: "blur(6px)",
};

const card: CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start" };
const bubble: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "5px 8px",
  borderRadius: 9,
  background: "rgba(30, 41, 59, 0.9)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
};

export default function ExecOverlay({ ops }: Props) {
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    // 렌더를 멈추는 것과 폴링을 멈추는 것은 다른 일이다 — 타이머까지 같이 끊어야
    // 거절당한 토큰으로 서버를 계속 두드리지 않는다.
    const stop = () => {
      alive = false;
      window.clearInterval(timer);
    };

    const poll = async () => {
      try {
        const response = await fetch(`/api/agent-status?token=${encodeURIComponent(ops)}`, { cache: "no-store" });
        if (!alive) return;
        // 서버가 거절했다(401 포함). 사유를 화면에 남기지 않고 폴링째로 멈춘다.
        if (!response.ok) {
          setStopped(true);
          stop();
          return;
        }
        setPayload((await response.json()) as Record<string, unknown>);
      } catch {
        // 네트워크가 한 번 끊긴 것과 거절당한 것은 다르다 — 이 틱만 건너뛴다.
      }
    };

    void poll();
    timer = window.setInterval(poll, POLL_MS);
    return stop;
  }, [ops]);

  if (stopped || !payload) return null;

  const now = Date.now();
  const fetchedAt = typeof payload.fetched_at === "string" ? payload.fetched_at : "";

  return (
    <aside style={panel} aria-label="관제실 — 세션 현황">
      <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.75, fontSize: 10 }}>
        <span>🛡️ 관제실</span>
        <span>{fetchedAt ? new Date(fetchedAt).toLocaleTimeString("ko-KR") : "—"}</span>
      </div>

      {ROLES.map((role) => {
        const entry = readEntry(payload, role.key);
        const dot = dotOf(entry, now);
        return (
          <div key={role.key} style={card}>
            <span style={{ fontSize: 16, lineHeight: "20px" }} aria-hidden>
              {role.emoji}
            </span>
            <div style={bubble}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <i
                  style={{ width: 6, height: 6, borderRadius: "50%", background: DOT_COLOR[dot], flexShrink: 0 }}
                  aria-hidden
                />
                <b style={{ fontSize: 10, letterSpacing: 0.4 }}>{role.key}</b>
                <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.6 }}>{DOT_LABEL[dot]}</span>
              </div>
              <p style={{ margin: "3px 0 0", opacity: dot === "silent" ? 0.45 : 0.95, wordBreak: "break-word" }}>
                {entry?.task || "—"}
              </p>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
