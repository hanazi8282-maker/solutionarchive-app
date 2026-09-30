// `/cases/report` 매칭 리포트 질의 기록 — 로그인 여부와 무관하게 실행된 질의 1회 = idea_query_log 1행
// (source='report_view', outcome='view'). 남헌 2026-10-01: 익명 질의도 남긴다(기존 "저장 안 함" 권고 반려).
//
// ★ 익명은 requested_by NULL — 질의 원문·해시·kind·시각만. 이메일·IP·쿠키·User-Agent·Referer 는 받지도 않는다.
// ★ 삭제·TTL·정리 코드 없음(결정 b, 앵글 로그와 같다).
// ★ 절대 던지지 않는다 — page 가 after() 로 부르고, 기록 실패가 리포트를 막으면 안 된다. 실패는 console.warn 한 줄.
// ★ console 에는 원문·이메일을 남기지 않는다(에러 코드·건수만). Postgres 에러 details 는 "Failing row contains (…)" 로
//   원문을 실을 수 있어 message·details 를 찍지 않는다.
// ★ 플러드 천장: 공개 경로가 DB 에 쓰므로 인스턴스 메모리 토큰 버킷. "모든 질의 저장"에서 벗어나는 **유일한** 지점이다.
//   초과분은 조용히 버리지 않고 버려진 건수를 console.warn 으로 남긴다.
// 셀프테스트: scripts/idea-angles-selftest.mjs (가짜 Supabase · 버킷 주입).
import type { SupabaseClient } from '@supabase/supabase-js'
import { queryHash } from './idea-angles.ts'

/**
 * 인스턴스당 분당 60건(버스트 60). 근거: 한 사람이 폼을 제출·링크를 여는 속도는 분당 몇 건이다. 60/분은 정상 사용자
 * 수십 명이 같은 분에 동시에 리포트를 여는 수준이라 개방 전 트래픽(허용목록 한 자리 수 + 체험판 방문자)에서는 닿지 않는다.
 * 스크립트 폭주는 인스턴스당 하루 최대 86,400행으로 묶인다.
 * ponytail: 인스턴스 메모리라 서버리스 인스턴스 수만큼 천장이 곱해진다 — 전역 천장이 필요하면 DB 쪽 rate(RPC)로.
 */
export const REPORT_LOG_PER_MIN = 60
/** 버림 경고 간격 — 첫 건과 100건마다(폭주 중 로그 자체가 폭주하지 않게), 그리고 다시 저장되기 시작할 때 누계. */
const DROP_WARN_EVERY = 100

export type LogBucket = { tokens: number; at: number; dropped: number }
export const newLogBucket = (now: number): LogBucket => ({ tokens: REPORT_LOG_PER_MIN, at: now, dropped: 0 })
const shared = newLogBucket(Date.now())

function take(b: LogBucket, now: number): boolean {
  b.tokens = Math.min(REPORT_LOG_PER_MIN, b.tokens + (Math.max(0, now - b.at) * REPORT_LOG_PER_MIN) / 60_000)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}

export type ReportViewLog = { q: string; kind: 'saas' | 'all'; /** 로그인(허용목록) 사용자만. 익명·허용목록 밖은 null. */ email: string | null }

export async function logReportView(
  sb: SupabaseClient,
  row: ReportViewLog,
  opts: { bucket?: LogBucket; now?: number } = {},
): Promise<'logged' | 'dropped' | 'failed'> {
  const b = opts.bucket ?? shared
  if (!take(b, opts.now ?? Date.now())) {
    b.dropped++
    if (b.dropped === 1 || b.dropped % DROP_WARN_EVERY === 0) {
      console.warn(`[query-log] flood ceiling ${REPORT_LOG_PER_MIN}/min — report_view not saved, dropped=${b.dropped}`)
    }
    return 'dropped'
  }
  if (b.dropped > 0) {
    console.warn(`[query-log] resumed — ${b.dropped} report_view rows were dropped by the flood ceiling`)
    b.dropped = 0
  }
  try {
    const { error } = await sb.from('idea_query_log').insert({
      query_text: row.q,
      query_hash: await queryHash(row.q, row.kind),
      kind: row.kind,
      requested_by: row.email,
      run_id: null,
      outcome: 'view',
      source: 'report_view',
    })
    if (error) {
      console.warn(`[query-log] report_view insert failed code=${error.code ?? '-'}`)
      return 'failed'
    }
    return 'logged'
  } catch (e) {
    console.warn(`[query-log] report_view insert threw ${e instanceof Error ? e.name : typeof e}`)
    return 'failed'
  }
}
