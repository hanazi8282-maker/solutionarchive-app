// 소스 고장 보고 — 수집이 끝난 뒤 고장(broken) 소스를 Notion "일일 상태 로그" CTO 행에 올린다.
//
// 왜 (남헌 2026-09-30): 러너가 고장 소스를 스스로 `enabled=false` 로 끄던 것을 없앴다. 무인 루프가
// `review_sources` 에 쓸 수 있는 컬럼은 CLAUDE.md §10.1 대로 `daily_request_cap` 하나뿐이다.
// 그 대신 고장은 **사람이 끌 때까지 매 실행 재시도된다** — 그래서 이 보고가 빠지면 고장이 묻힌다.
//
// 지키는 것
//   · 판정 기준은 lib/review/health.ts 그대로(health='broken'). 여기는 판정 결과를 모으기만 한다.
//   · 고장 목록을 만드는 곳과 보고하는 곳이 이 파일 한 함수(runSourceHealthReport)다 — 판단만 하고
//     보고를 건너뛰는 분기가 없다. review-collect.mjs 는 결과를 넘기고 반환값으로 종료 코드를 정한다.
//   · 고장 0개면 Notion 을 부르지 않는다(정상이면 행 없음 — cron-watchdog 관행).
//   · 하루 한 행 — 비고의 MARKER 로 같은 날 행을 찾아 갱신한다(upsertStatusLog). 같은 날 두 번째 실행이 행을 늘리지 않는다.
//   · 실패(토큰 없음 포함)는 ok:false + 폴백 파일(ops/state/status-log-pending). 호출자가 빨간불로 끝낸다(§7.1·§11-3).
//   · "N일째"는 review_collection_runs.health_after 에서 센다. 못 읽으면 "확인 불가"라고 적는다 — 지어내지 않는다.
//   · `알림완료` 는 쓰지도 읽지도 않는다.

import { upsertStatusLog } from './notion-status-log.mjs'

export const MARKER = 'source-health-report'
/** N일째를 셀 때 거슬러 보는 최대 일수. 이걸 다 채우면 "N일 이상"이라고 적는다. */
export const LOOKBACK_DAYS = 30

const kstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
const kstClock = (d) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(11, 16)

/** 러너가 남긴 타깃별 결과 중 에러로 보이는 마지막 줄. 없으면 null. */
function lastError(perTarget) {
  const hits = (perTarget ?? []).map((p) => p.outcome).filter((o) => /차단 응답|HTTP \d|요청 실패|실패/.test(String(o)))
  return hits.length ? hits[hits.length - 1] : null
}

/** 소스별 결과 → 고장 목록. 입력 모양은 review-collect.mjs 의 sourceResults 항목({ key, health, perTarget, stats }). */
export function brokenSources(sourceResults) {
  return (sourceResults ?? [])
    .filter((s) => s.health?.health === 'broken')
    .map((s) => ({
      key: s.key,
      reason: s.health.detail,
      blocked: Number(s.stats?.blockedResponses ?? 0),
      parsed: Number(s.stats?.reviewsParsed ?? 0),
      attempted: Number(s.stats?.reviewsParsed ?? 0) + Number(s.stats?.parseFailures ?? 0),
      lastError: lastError(s.perTarget),
    }))
}

/**
 * 한 소스의 실행 기록(최신순) → { runs, days, capped }.
 *   runs = 최신부터 연속으로 health_after='broken' 인 실행 수(이번 실행 포함)
 *   days = 오늘(KST)부터 거꾸로, 날마다 broken 실행이 하나라도 있었던 연속 일수
 * rows 가 null 이면 null(확인 불가).
 */
export function streaks(rows, today) {
  if (!Array.isArray(rows)) return null
  let runs = 0
  for (const r of rows) { if (r.health_after === 'broken') runs++; else break }
  const brokenDays = new Set(rows.filter((r) => r.health_after === 'broken').map((r) => kstDay(r.started_at)))
  let days = 0
  const d = new Date(`${today}T00:00:00Z`)
  while (brokenDays.has(d.toISOString().slice(0, 10)) && days < LOOKBACK_DAYS) { days++; d.setUTCDate(d.getUTCDate() - 1) }
  return { runs, days, capped: days >= LOOKBACK_DAYS }
}

/** 고장 목록 → 일일 상태 로그 입력. 소스마다 한 줄, 판단에 필요한 수치를 전부 적는다. */
export function buildBrokenEntry({ date, broken, history, now, runUrl }) {
  const at = `${kstClock(now)} KST`
  const lines = broken.map((b) => {
    const s = history?.[b.key] ?? null
    const streak = s ? `연속 broken 실행 ${s.runs}회 · ${s.days}일째${s.capped ? ' 이상' : ''}` : '연속 횟수·N일째 확인 불가(실행 기록 조회 실패)'
    return [
      `[${at}] ${b.key}: ${b.reason}`,
      streak,
      `차단 응답 ${b.blocked}건 · 파싱 ${b.parsed}/${b.attempted}`,
      `마지막 에러: ${b.lastError ?? '기록 없음'}`,
      'enabled 그대로(자동 비활성 안 함)',
      runUrl ? `실행 ${runUrl}` : null,
    ].filter(Boolean).join(' · ')
  })
  const keys = broken.map((b) => b.key).join(', ')
  return {
    date,
    track: 'CTO',
    done: `[${at}] 소스 건강 체크 — 고장 판정 ${broken.length}개(${keys}). 자동으로 끄지 않았다`,
    blocked: lines.join('\n'),
    next: `[${at}] ${keys} 를 끌지 사람이 판단 — 끄기 전까지 매 수집 실행에서 재시도된다(차단은 실행당 1회 403/429 뒤 중단, 파싱 고장은 타깃 첫 페이지 뒤 중단)`,
    needsHuman: true,
    note: `${MARKER} · nightly-review-collect · ${runUrl ?? '로컬 실행(run URL 없음)'}`,
  }
}

/**
 * 판정 결과 → (고장 있으면) Notion 보고. 이 함수가 유일한 경로다.
 * @param loadRuns async (keys) => ({ [key]: rows 최신순 }) — 실패하면 throw 해도 된다(확인 불가로 적는다).
 * 반환 { ok, broken, record? }. ok:false 면 호출자가 실패로 끝낸다.
 */
export async function runSourceHealthReport({ sourceResults, loadRuns, now = new Date(), date, runUrl = null, token, dbId, pendingDir, upsert = upsertStatusLog }) {
  const broken = brokenSources(sourceResults)
  if (!broken.length) return { ok: true, broken }

  let history = null
  try {
    const rows = await loadRuns(broken.map((b) => b.key))
    history = Object.fromEntries(broken.map((b) => [b.key, streaks(rows?.[b.key] ?? null, date)]).filter(([, v]) => v))
  } catch {
    history = null
  }
  const entry = buildBrokenEntry({ date, broken, history, now, runUrl })
  const record = await upsert(entry, { marker: MARKER, token, dbId, pendingDir })
  return { ok: record.ok === true, broken, record, entry }
}
