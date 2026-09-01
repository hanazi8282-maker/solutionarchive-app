// 원문 폐기 판정 — 순수 로직.
//
// 설계: docs/review-collection-design.md §9
//
// ⚠️ 이 트랙에서 **유일하게 되돌릴 수 없는 동작**이다. 지운 원문은 다시
//    수집할 수 없다(같은 리뷰는 지문에 남아 재수집 대상에서 제외되므로,
//    폐기 뒤에는 그 리뷰의 본문을 영영 못 본다). 그래서 판정을 순수 함수로
//    떼어 놓고 경계를 테스트로 고정한다. 스크립트는 이 판정만 따른다.
//
// ⚠️ 판정 불가는 **폐기하지 않는다.** 다른 검사에서는 "확인 불가를 양성으로
//    접지 마라"가 실패로 보고하라는 뜻이었는데(§7.1), 여기서는 방향이
//    반대다 — 안전한 쪽이 "안 지운다"이기 때문이다. 대신 조용히 넘기지
//    않고 경보로 올린다. 둘 다 지키려면 "안 지우되 보고한다"가 된다.

/** 보존 기간. 설계 §9 — extract 가 소비하고 나면 원본 가치가 급락한다. */
export const RETENTION_DAYS = 30

export interface PurgeCandidate {
  id: string
  /** null = 사람이 붙여넣은 원문. 폐기 대상이 아니다. */
  source_key: string | null
  /** null 이면 나이를 알 수 없다. */
  collected_at: string | null
  /** null 이면 이미 폐기됐거나 애초에 원문이 없다. */
  raw_text: string | null
  purged_at: string | null
}

export type PurgeDecision =
  | { action: 'purge'; ageDays: number }
  | { action: 'keep'; reason: string }
  | { action: 'unjudgeable'; reason: string }

/**
 * 행 하나에 대한 판정.
 *
 * 순서가 곧 우선순위다. 위에서 걸리면 아래는 보지 않는다.
 */
export function decidePurge(row: PurgeCandidate, now: Date): PurgeDecision {
  // 사람이 붙여넣은 원문은 다시 구할 수 없다. 나이와 무관하게 보존한다.
  if (row.source_key === null) {
    return { action: 'keep', reason: '사람이 붙여넣은 원문(source_key 없음)' }
  }

  if (row.raw_text === null) {
    return { action: 'keep', reason: '이미 원문이 없다' }
  }

  // 수집기가 넣었는데 수집 시각이 없다 → 나이를 알 수 없다.
  // **지우지 않는다.** 다만 조용히 넘기지도 않는다 — 수집기가 collected_at 을
  // 안 넣는 경로가 생겼다는 뜻이고, 그러면 그 행들은 영영 폐기되지 않는다.
  if (!row.collected_at) {
    return { action: 'unjudgeable', reason: 'source_key 는 있는데 collected_at 이 없다 — 나이 판정 불가' }
  }

  const collected = new Date(row.collected_at)
  if (Number.isNaN(collected.getTime())) {
    return { action: 'unjudgeable', reason: `collected_at 을 날짜로 못 읽는다: ${row.collected_at}` }
  }

  // 미래 시각이면 시계가 어긋났거나 데이터가 오염된 것이다. 지우지 않는다.
  if (collected.getTime() > now.getTime()) {
    return { action: 'unjudgeable', reason: `collected_at 이 미래다: ${row.collected_at}` }
  }

  const ageDays = (now.getTime() - collected.getTime()) / 86_400_000
  if (ageDays < RETENTION_DAYS) {
    return { action: 'keep', reason: `보존 기간 내(${ageDays.toFixed(1)}일 / ${RETENTION_DAYS}일)` }
  }

  return { action: 'purge', ageDays }
}

export interface PurgePlan {
  purge: Array<{ id: string; ageDays: number }>
  keep: number
  unjudgeable: Array<{ id: string; reason: string }>
}

export function planPurge(rows: PurgeCandidate[], now: Date): PurgePlan {
  const plan: PurgePlan = { purge: [], keep: 0, unjudgeable: [] }
  for (const row of rows) {
    const d = decidePurge(row, now)
    if (d.action === 'purge') plan.purge.push({ id: row.id, ageDays: d.ageDays })
    else if (d.action === 'keep') plan.keep++
    else plan.unjudgeable.push({ id: row.id, reason: d.reason })
  }
  return plan
}

/**
 * 폐기 시 써야 하는 값.
 *
 * ⚠️ `raw_text` 와 `purged_at` 을 **같은 UPDATE 에서** 써야 한다.
 *    `analysis_inputs_purge_trace_check` 가
 *    `raw_text IS NOT NULL OR purged_at IS NOT NULL` 이므로, raw_text 만
 *    비우면 제약 위반으로 실패한다. 그 제약이 있는 이유가 바로
 *    "아직 안 받은 것"과 "받았다가 폐기한 것"을 구분하기 위해서다.
 */
export function purgePatch(now: Date): { raw_text: null; purged_at: string } {
  return { raw_text: null, purged_at: now.toISOString() }
}

/** 야간 보고 한 줄. 지울 게 없고 판정 불가도 없으면 null — 늘 있는 줄은 안 읽힌다. */
export function purgeLine(plan: PurgePlan, dryRun: boolean): string | null {
  if (plan.purge.length === 0 && plan.unjudgeable.length === 0) return null

  const parts: string[] = []
  if (plan.purge.length > 0) {
    parts.push(dryRun ? `폐기 대상 ${plan.purge.length}건(dry-run)` : `원문 폐기 ${plan.purge.length}건`)
  }
  if (plan.unjudgeable.length > 0) {
    parts.push(`⚠️ 판정 불가 ${plan.unjudgeable.length}건 — 지우지 않았다`)
  }
  return `- 원문 보존(${RETENTION_DAYS}일): ${parts.join(' · ')}`
}
