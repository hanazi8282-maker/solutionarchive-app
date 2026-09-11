// 라이브 오피스의 하루 결과 → 보고서로 변환하고 서버(/api/report)로 발행한다
import type { Snapshot } from "./sim";
import { BLOCK_NEED, DEPT_BRIEF } from "./staff";
import { roomOf } from "./world";
import { COMPANY, SCENARIO } from "../../company.config";

// 보고서 모양은 워커(worker/report.ts)가 정본이다. 여기서 다시 정의하면 두 곳이 어긋난다.
// 타입 전용 import 라 클라이언트 번들에는 아무것도 실리지 않는다.
import type { DayReport, IntegrationStatus, PublishResult } from "../../worker/report";
export type { DayReport, IntegrationStatus, PublishResult };

export function buildReport(snap: Snapshot): DayReport {
  const entries = Object.entries(snap.deptStatus);

  const highlights = entries
    .filter(([, status]) => status === "완료")
    .map(([dept]) => `${roomOf(dept).name} — ${DEPT_BRIEF[dept]?.report ?? "완료"}`);

  const risks = entries
    .filter(([, status]) => status === "연동 대기")
    .map(([dept]) => `${roomOf(dept).name} — ${BLOCK_NEED[dept] ?? "외부 연동"} 대기로 오늘 진행 불가`);

  const { decision, next: nextStep } = SCENARIO.approval;
  const decisions = snap.approved
    ? [decision.approved]
    : snap.approvalPending
      ? [decision.pending]
      : [decision.none];

  const next = [
    ...risks.map((risk) => `${risk.split(" — ")[0]}: 연동 완료되면 즉시 재가동`),
    snap.approved ? nextStep.approved : nextStep.pending,
  ];

  return {
    title: `${snap.clock} ${COMPANY.reportName} 일일 브리핑`,
    clock: snap.clock,
    phase: snap.phase,
    counts: {
      total: entries.length,
      done: snap.stats.done,
      working: snap.stats.working,
      approval: snap.stats.approval,
      blocked: snap.stats.blocked,
    },
    highlights,
    decisions,
    risks,
    next,
    log: [...snap.log].reverse().map((entry) => ({ time: entry.time, text: `${entry.icon} ${entry.text}` })),
  };
}

export async function publish(report: DayReport): Promise<PublishResult> {
  const response = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) {
    // 서버가 막은 이유(발행 미설정·권한 없음)를 그대로 화면에 보여준다
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `발행 실패 (HTTP ${response.status})`);
  }
  return (await response.json()) as PublishResult;
}

export async function fetchIntegrations(): Promise<IntegrationStatus> {
  const response = await fetch("/api/integrations");
  if (!response.ok) throw new Error("연동 상태 조회 실패");
  return (await response.json()) as IntegrationStatus;
}
