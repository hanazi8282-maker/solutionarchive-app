#!/usr/bin/env node
// 원문 폐기 판정 셀프테스트 — DB·네트워크 없이 경계를 고정한다.
//
// 이 트랙에서 유일하게 되돌릴 수 없는 동작이라, 경계를 코드가 아니라
// 테스트가 붙잡고 있어야 한다.

import {
  decidePurge,
  planPurge,
  purgePatch,
  purgeLine,
  RETENTION_DAYS,
} from '../lib/review/purge.ts'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (Object.is(actual, expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}

const NOW = new Date('2026-09-02T00:00:00Z')
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const row = (over = {}) => ({
  id: 'r1',
  source_key: 'danawa',
  collected_at: daysAgo(40),
  raw_text: '원문',
  purged_at: null,
  ...over,
})

// ── 사람이 붙여넣은 원문은 절대 지우지 않는다 ─────────────────────
// 다시 구할 수 없는 데이터다. 나이와 무관하다.
t('source_key null 이면 보존', decidePurge(row({ source_key: null }), NOW).action, 'keep')
t(
  'source_key null 은 아무리 오래돼도 보존',
  decidePurge(row({ source_key: null, collected_at: daysAgo(3650) }), NOW).action,
  'keep',
)

// ── 이미 원문이 없으면 할 일이 없다 ───────────────────────────────
t('raw_text null 이면 보존', decidePurge(row({ raw_text: null }), NOW).action, 'keep')

// ── 보존 기간 경계 ────────────────────────────────────────────────
t(`${RETENTION_DAYS}일 미만은 보존`, decidePurge(row({ collected_at: daysAgo(29) }), NOW).action, 'keep')
t(`${RETENTION_DAYS}일 정확히는 폐기`, decidePurge(row({ collected_at: daysAgo(30) }), NOW).action, 'purge')
t(`${RETENTION_DAYS}일 초과는 폐기`, decidePurge(row({ collected_at: daysAgo(31) }), NOW).action, 'purge')
t(
  '경계 직전(29.9일)은 보존',
  decidePurge(row({ collected_at: new Date(NOW.getTime() - 29.9 * 86_400_000).toISOString() }), NOW).action,
  'keep',
)

// ── 판정 불가는 지우지 않는다 ─────────────────────────────────────
//
// 다른 검사에서 "확인 불가를 양성으로 접지 마라"는 실패로 보고하라는 뜻인데,
// 여기서는 안전한 쪽이 "안 지운다"다. 대신 조용히 넘기지 않는다.
t(
  'collected_at 없으면 판정 불가',
  decidePurge(row({ collected_at: null }), NOW).action,
  'unjudgeable',
)
t(
  'collected_at 이 날짜가 아니면 판정 불가',
  decidePurge(row({ collected_at: 'not-a-date' }), NOW).action,
  'unjudgeable',
)
t(
  'collected_at 이 미래면 판정 불가',
  decidePurge(row({ collected_at: daysAgo(-5) }), NOW).action,
  'unjudgeable',
)
t(
  '판정 불가에 사유가 남는다',
  decidePurge(row({ collected_at: null }), NOW).reason.includes('collected_at'),
  true,
)

// ⚠️ 우선순위 — source_key 가 null 이면 collected_at 이 이상해도 '보존'이다.
//    판정 불가로 떨어뜨리면 매일 밤 경보가 뜨는데, 그 행은 애초에 폐기
//    대상이 아니라 조치할 것이 없다. 늘 뜨는 경보는 안 읽는 경보가 된다.
t(
  '사람 원문은 collected_at 이 없어도 보존(판정 불가 아님)',
  decidePurge(row({ source_key: null, collected_at: null }), NOW).action,
  'keep',
)

// ── 계획 집계 ─────────────────────────────────────────────────────
{
  const plan = planPurge(
    [
      row({ id: 'a', collected_at: daysAgo(40) }),
      row({ id: 'b', collected_at: daysAgo(10) }),
      row({ id: 'c', source_key: null }),
      row({ id: 'd', collected_at: null }),
      row({ id: 'e', collected_at: daysAgo(90) }),
    ],
    NOW,
  )
  t('계획: 폐기 2건', plan.purge.length, 2)
  t('계획: 보존 2건', plan.keep, 2)
  t('계획: 판정 불가 1건', plan.unjudgeable.length, 1)
  t('계획: 폐기 목록에 id 가 있다', plan.purge.map((p) => p.id).join(','), 'a,e')
  t('계획: 판정 불가에 id 가 있다', plan.unjudgeable[0].id, 'd')
  t('계획: 나이가 실려 있다', Math.round(plan.purge[0].ageDays), 40)
}

// ── UPDATE 패치 — 제약을 만족해야 한다 ────────────────────────────
//
// analysis_inputs_purge_trace_check 가
// `raw_text IS NOT NULL OR purged_at IS NOT NULL` 이므로,
// raw_text 만 비우면 제약 위반으로 실패한다.
{
  const p = purgePatch(NOW)
  t('패치: raw_text 를 null 로', p.raw_text, null)
  t('패치: purged_at 을 같이 쓴다', p.purged_at, NOW.toISOString())
  t('패치: 두 필드뿐', Object.keys(p).sort().join(','), 'purged_at,raw_text')
}

// ── 보고 줄 — 정상이면 줄이 없다 ──────────────────────────────────
t('할 일 없으면 줄 없음', purgeLine({ purge: [], keep: 5, unjudgeable: [] }, true), null)
{
  const l = purgeLine({ purge: [{ id: 'a', ageDays: 40 }], keep: 0, unjudgeable: [] }, true)
  t('dry-run 은 "대상"으로 적는다', l.includes('폐기 대상'), true)
  t('dry-run 임을 밝힌다', l.includes('dry-run'), true)
}
{
  const l = purgeLine({ purge: [{ id: 'a', ageDays: 40 }], keep: 0, unjudgeable: [] }, false)
  t('실제 폐기는 "폐기"로 적는다', l.includes('원문 폐기'), true)
  t('실제 폐기에는 dry-run 문구가 없다', l.includes('dry-run'), false)
}
{
  const l = purgeLine({ purge: [], keep: 0, unjudgeable: [{ id: 'd', reason: 'x' }] }, true)
  t('판정 불가만 있어도 줄이 나온다', l !== null, true)
  t('판정 불가는 안 지웠다고 밝힌다', l.includes('지우지 않았다'), true)
}

t('보존 기간 상수 30일', RETENTION_DAYS, 30)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('폐기 판정이 틀렸다. 되돌릴 수 없는 동작이라 이 상태로 돌리면 안 된다.')
  process.exit(1)
}
console.log('폐기 판정 정상 — 사람 원문 보존, 판정 불가는 지우지 않는다.')
