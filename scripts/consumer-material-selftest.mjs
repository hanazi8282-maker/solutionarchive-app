#!/usr/bin/env node
// 소비재 자료 태그(남헌 v61) 셀프테스트 — DB 없이. 스위치 · 대기열 제외 · 하위 사용처 '관련 없음' 읽기 · 일괄 도구 드라이런/--apply.
//   node scripts/consumer-material-selftest.mjs     (종료코드 0 = 전부 통과)

import { boundaryKindOf, consumerReasonOf, consumerSkipEnabled, loadConsumerTagged } from '../lib/analysis/consumer-material.ts'
import { dropIrrelevant } from '../lib/analysis/relevance-judge.ts'
import { createPendingFor } from '../lib/analysis/relevance-pending.ts'
import { main, planTags } from './consumer-material-tag.mjs'

let pass = 0
let fail = 0
const t = (name, ok) => { if (ok) pass += 1; else { fail += 1; console.log(`✗ ${name}`) } }

/** 모의 PostgREST — select/eq/is/order/range. errors[table] 가 있으면 그 오류를 준다. */
function mockDb(tables, errors = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const st = { table, filters: [], range: null }
      const b = {
        select(c) { st.cols = c.split(',').map((x) => x.trim()); return b },
        eq(c, v) { st.filters.push([c, v]); return b }, is(c, v) { st.filters.push([c, v]); return b },
        order(c) { st.order = c; return b }, range(a, z) { st.range = [a, z]; return b },
        then(res, rej) {
          calls.push(table)
          if (errors[table]) return Promise.resolve({ data: null, error: errors[table] }).then(res, rej)
          let rows = (tables[table] ?? []).filter((r) => st.filters.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)))
          if (st.order) rows = [...rows].sort((a, z) => String(a[st.order]).localeCompare(String(z[st.order])))
          const [a, z] = st.range ?? [0, 999]
          const page = rows.slice(a, z + 1).map((r) => Object.fromEntries(st.cols.filter((k) => k in r).map((k) => [k, r[k]])))
          return Promise.resolve({ data: page, error: null }).then(res, rej)
        },
      }
      return b
    },
  }
}

// ── 1. 스위치 · 정의 ──
t('스위치 기본 on(env 없음)', consumerSkipEnabled(undefined) === true)
t("스위치 'off'(대소문자·공백 무시)만 끈다", consumerSkipEnabled(' OFF ') === false && consumerSkipEnabled('of') === true && consumerSkipEnabled('false') === true)
t('사유: out-consumer 영역 우선', consumerReasonOf('out-consumer', 'youtube') === 'area:out-consumer')
t('사유: 유튜브는 어느 프로젝트든', consumerReasonOf('2', 'youtube') === 'source:youtube' && consumerReasonOf(null, 'youtube') === 'source:youtube')
t('사유: 그 밖은 null', consumerReasonOf('2', 'danawa') === null && consumerReasonOf('out-founder', 'hackernews') === null)

// ── 2. 하위 사용처 한 곳(dropIrrelevant) — 태그 = 관련 없음, 사람 채점이 이긴다 ──
{
  const inputs = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
  const rows = [
    { input_id: 'b', verdict: 'relevant' },                           // 태그 + LLM relevant → 뺀다
    { input_id: 'c', verdict: 'relevant', human_verdict: 'relevant' }, // 태그 + 사람 relevant → 남긴다
    { input_id: 'd', verdict: 'irrelevant' },                          // 태그 없음 + irrelevant → 뺀다
  ]
  const tags = new Set(['a', 'b', 'c'])
  const r = dropIrrelevant(inputs, rows, tags)
  t('태그 + 판정 없음 → 뺀다(관련 없음으로 읽음)', !r.kept.some((i) => i.id === 'a'))
  t('태그 + LLM relevant → 뺀다', !r.kept.some((i) => i.id === 'b'))
  t('태그 + 사람 relevant → 남긴다(사람이 이김)', r.kept.some((i) => i.id === 'c'))
  t('건수: 무관 3 중 태그 2', r.droppedIrrelevant === 3 && r.droppedConsumer === 2 && r.kept.map((i) => i.id).join() === 'c,e')
  t('판정 캐시 못 읽음(null) → 태그도 안 쓴다(아무것도 안 뺌)', dropIrrelevant(inputs, null, tags).kept.length === 5)
  t('판정 캐시 0행 + 태그 → 태그만 뺀다', dropIrrelevant(inputs, [], tags).droppedConsumer === 3)
  t('태그 조회 실패(null)·없음 → 예전 동작', dropIrrelevant(inputs, rows, null).droppedIrrelevant === 1 && dropIrrelevant(inputs, rows).droppedIrrelevant === 1)
  t('rows 원본 불변(판정 행을 건드리지 않음)', rows[0].verdict === 'relevant' && rows.length === 3)
}

// ── 3. loadConsumerTagged — 스위치 off·표 없음·오류 3상태 ──
{
  const db = mockDb({ consumer_material_tags: [{ input_id: 'x', project_id: 'p1' }, { input_id: 'y', project_id: 'p2' }] })
  const got = await loadConsumerTagged(db, 'p1', { enabled: true })
  t('프로젝트 태그만 읽는다', got?.size === 1 && got.has('x'))
  const off = mockDb({})
  t('스위치 off → 빈 Set · 조회도 안 함', (await loadConsumerTagged(off, 'p1', { enabled: false }))?.size === 0 && off.calls.length === 0)
  let warned = ''
  const missing = await loadConsumerTagged(mockDb({}, { consumer_material_tags: { code: 'PGRST205', message: 'no table' } }), 'p1', { enabled: true, warn: (m) => { warned = m } })
  t('표 없음(마이그 미적용) → 빈 Set + 경고(원래 동작)', missing?.size === 0 && warned.includes('20261015000010'))
  const throwing = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({}) }) }) }) } // .range 없는 목(CI session-guard 사고)
  t('던지는 클라이언트 → null(확인 불가, 죽지 않음)', (await loadConsumerTagged(throwing, 'p1', { enabled: true })) === null)
  t('던지는 클라이언트 + 대기열 → 그 프로젝트 건너뜀(null, fail-closed)', (await createPendingFor({ supabase: { from: (tb) => (tb === 'consumer_material_tags' ? throwing.from() : mockDb({ analysis_inputs: [{ id: 'z', project_id: 'p1', purged_at: null, source_key: 'danawa' }] }).from(tb)) }, sampleSize: 1, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {}, skipConsumer: true }).countFor({ id: 'p1' })) === null)
  t('그 밖 오류 → null(확인 불가)', (await loadConsumerTagged(mockDb({}, { consumer_material_tags: { code: '500', message: 'boom' } }), 'p1', { enabled: true })) === null)
}

// ── 4. 판정 대기열 — 태그된 미판정만 뺀다, 판정 행은 그대로 ──
{
  const text = '배터리가 너무 빨리 닳아서 불편합니다 정말로요 이건 고쳐 주세요'
  const inputs = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, project_id: 'p1', purged_at: null, raw_text: `${text} ${i}`, created_at: `2026-10-0${i + 1}T00:00:00Z`, collected_at: null, source_key: 'danawa', rating: 2 }))
  const tables = {
    analysis_inputs: inputs,
    review_relevance_verdicts: [{ input_id: 'i0', project_id: 'p1', verdict: 'relevant' }],
    consumer_material_tags: [{ input_id: 'i0', project_id: 'p1' }, { input_id: 'i1', project_id: 'p1' }, { input_id: 'i2', project_id: 'p1' }],
  }
  const base = { sampleSize: 100, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {} }
  const on = createPendingFor({ ...base, supabase: mockDb(tables), skipConsumer: true })
  const p = await on.pendingFor({ id: 'p1' })
  t('대기열: 태그된 미판정 2건 빠짐(i1,i2) · 판정된 i0 은 원래대로 빠짐', p.reviews.map((r) => r.input_id).sort().join() === 'i3,i4,i5' && p.consumer === 2 && p.unjudged === 3)
  const c = await on.countFor({ id: 'p1' })
  t('countFor: 미판정 3 · 소비재 2(판정된 태그는 안 셈)', c.unjudged === 3 && c.consumer === 2)
  const off = await createPendingFor({ ...base, supabase: mockDb(tables), skipConsumer: false }).pendingFor({ id: 'p1' })
  t('재개 스위치 off → 태그 무시, 미판정 5건 전부', off.reviews.length === 5 && off.consumer === 0)
  const broken = createPendingFor({ ...base, supabase: mockDb(tables, { consumer_material_tags: { code: '500', message: 'boom' } }), skipConsumer: true })
  t('태그 조회 실패 → 이 프로젝트 건너뜀(null)', (await broken.pendingFor({ id: 'p1' })) === null && (await broken.countFor({ id: 'p1' })) === null)
  const noTable = await createPendingFor({ ...base, supabase: mockDb(tables, { consumer_material_tags: { code: '42P01', message: 'x' } }), skipConsumer: true }).pendingFor({ id: 'p1' })
  t('표 없음(마이그 전) → 원래 동작(5건)', noTable.reviews.length === 5)
  t('대기열 계산이 판정·태그 표를 바꾸지 않는다', tables.review_relevance_verdicts.length === 1 && tables.consumer_material_tags.length === 3)
}

// ── 5. 일괄 도구 — 드라이런 기본 · 멱등 · 제외 · 절감 ──
const projects = [
  { id: 'pc', status: 'collecting', area_code: 'out-consumer', business_model: 'MARKETPLACE_SELLER', product_elevator_pitch: '샴푸' },
  { id: 'ps', status: 'collecting', area_code: '2', business_model: 'SAAS', product_elevator_pitch: 'CRM' },
]
const inputs = [
  { id: 'c1', project_id: 'pc', source_key: 'danawa' },     // 새 태그 · 미판정 → 보류
  { id: 'c2', project_id: 'pc', source_key: 'danawa' },     // 새 태그 · 판정 있음 → 보류 아님
  { id: 'c3', project_id: 'pc', source_key: 'danawa' },     // 이미 태그
  { id: 'c4', project_id: 'pc', source_key: 'hackernews' }, // 사람 제외(경계 A)
  { id: 'y1', project_id: 'ps', source_key: 'youtube' },    // 유튜브 태그 · 원래 제외 소스라 보류 아님
  { id: 's1', project_id: 'ps', source_key: 'appstore' },   // 태그 대상 아님
]
{
  const { rows, stats } = planTags({ projects, inputs, judged: new Set(['c2']), tagged: new Set(['c3']), exclude: new Set(['c4']) })
  t('계획: 새 태그 c1·c2·y1', rows.map((r) => r.input_id).sort().join() === 'c1,c2,y1')
  t('계획: 사유·버전', rows.find((r) => r.input_id === 'y1').reason === 'source:youtube' && rows.every((r) => r.rule_ver === 'cm-v1'))
  t('계획: 이미 1 · 제외 1 · 판정 있음 1', stats.alreadyTagged === 1 && stats.excludedByHuman === 1 && stats.withVerdict === 1)
  t('계획: 보류 1건(c1) · 절감 = 1 × $0.0028', stats.held === 1 && stats.savingsUsd === 0 && stats.queueBefore === 3 && stats.queueAfter === 2)
  t('계획: 소비재 영역 1곳 · MARKETPLACE_SELLER 1곳', stats.consumerProjects === 1 && stats.marketplaceSeller === 1)
  const big = planTags({ projects, inputs: Array.from({ length: 16240 }, (_, i) => ({ id: `b${i}`, project_id: 'pc', source_key: 'danawa' })), judged: new Set(), tagged: new Set() })
  t('절감: 16,240 × $0.0028 = $45.47', big.stats.savingsUsd === 45.47 && big.stats.held === 16240)
}

function port({ tagged = new Set(['c3']), missing = false } = {}) {
  const inserted = []
  return {
    inserted,
    loadProjects: async () => projects,
    loadInputs: async () => inputs,
    loadJudged: async () => new Set(['c2']),
    loadTagged: async () => (missing ? null : tagged),
    loadTexts: async () => [
      { id: 'c4', project_id: 'pc', source_key: 'hackernews', raw_text: 'pricing page is confusing' },
      { id: 'c1', project_id: 'pc', source_key: 'danawa', raw_text: '향이 좋아요' },
      { id: 's2', project_id: 'ps', source_key: 'appstore', raw_text: '배송이 늦어요' },
    ],
    insertTags: async (rows) => { inserted.push(...rows); return rows.length },
  }
}
{
  const silent = { log: () => {} }
  const dry = port()
  await main([], { port: dry, ...silent })
  t('드라이런(기본): 쓰기 0', dry.inserted.length === 0)
  const ap = port()
  const res = await main(['--apply'], { port: ap, ...silent })
  t('--apply: 새 태그만 쓴다(이미 태그 c3 제외)', ap.inserted.length === 4 && !ap.inserted.some((r) => r.input_id === 'c3') && res.inserted === 4)
  const again = port({ tagged: new Set(['c1', 'c2', 'c3', 'c4', 'y1']) })
  await main(['--apply'], { port: again, ...silent })
  t('멱등: 다 태그된 뒤 다시 돌리면 쓰기 0', again.inserted.length === 0)
  const miss = port({ missing: true })
  let threw = false
  try { await main(['--apply'], { port: miss, ...silent }) } catch { threw = true }
  t('표 없음 + --apply → 중단 · 쓰기 0', threw && miss.inserted.length === 0)
  const out = []
  const b = await main(['--boundary'], { port: port(), log: (m) => out.push(m) })
  t('경계: A(c4 — 창업가 소스) · B(s2 — SaaS 안 소비재 낱말) · c1 은 아님', b.boundary.A === 1 && b.boundary.B === 1 && out.some((l) => l.startsWith('A\tc4')) && out.some((l) => l.startsWith('B\ts2')))
}
t('경계 정의: 그 밖 영역은 null', boundaryKindOf({ area_code: '2', business_model: null }, { source_key: 'youtube', raw_text: '배송' }, ['hackernews']) === null)

console.log(`consumer-material selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
