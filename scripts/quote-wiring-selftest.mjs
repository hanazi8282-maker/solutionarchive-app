#!/usr/bin/env node
// 고객 화면 인용 배선(v23 5-b) 통합 경계 셀프테스트 — 네트워크·DB 없음(가짜 Supabase).
//   node scripts/quote-wiring-selftest.mjs
//
// 부품(checkQuote 등)은 signals-selftest 가 본다. 여기는 **붙인 자리**를 본다(§7.1 — 부품 테스트를 통합의 근거로 쓰지 않는다):
//   정책 맵 로더(스위치·실패) → 원문 후보 로더(조회 생략·실패·검색 패턴) → publicLines(정책별 경계·옛 인용·요약) → 요약 마크다운.
// 인사이트 화면 렌더 경계(판정 인용 포함)는 insights-evidence-selftest 가 본다.

import { QUOTE_BACKFILL_TAG, QUOTE_PENDING_NOTE, QUOTE_MAX_EN, QUOTE_MAX_KO, publicLines, quoteProbeTokens } from '../lib/analysis/evidence-quotes.ts'
import { planQuotes, prepareInputs } from '../lib/analysis/quote-backfill.ts'
import { loadQuotePolicies, loadQuoteSources, sourceGroupKey } from '../lib/analysis/quote-policy-db.ts'
import { QUOTE_POLICY_COLUMN_READY } from '../lib/signals/feed.ts'
import { buildSummaryMarkdown } from '../lib/cases/summary.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }
console.error = () => {}; console.warn = () => {}

// 가짜 Supabase — 호출을 기록하고 테이블별 행·오류를 돌려준다.
const fakeSb = (tables, failT = {}, log = []) => ({
  from(table) {
    const call = { table, ops: [] }
    log.push(call)
    const q = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          // failT[table]·tables[table] 가 함수면 호출(call)마다 다르게 — 묶음별 부분 실패를 흉내 낸다.
          const code = typeof failT[table] === 'function' ? failT[table](call) : failT[table]
          const rows = typeof tables[table] === 'function' ? tables[table](call) : tables[table]
          const res = code ? { data: null, error: { code, message: 'boom' } } : { data: rows ?? [], error: null }
          return (ok, ko) => Promise.resolve(res).then(ok, ko)
        }
        return (...args) => { call.ops.push([k, ...args]); return q }
      },
    })
    return q
  },
})

// ── 1) 정책 맵 로더 ────────────────────────────────────────────
t('스위치(QUOTE_POLICY_COLUMN_READY)는 이 PR 에서 그대로 false', QUOTE_POLICY_COLUMN_READY === false)
{
  const log = []
  t('스위치 꺼짐 → null(읽지도 않는다)', (await loadQuotePolicies(fakeSb({}, {}, log), 'test')) === null && log.length === 0)
  t('기본값은 스위치를 따른다', (await loadQuotePolicies(fakeSb({ review_sources: [{ key: 'a', quote_policy: 'full' }] }), 'test')) === null)
  t('컬럼 없음(42703) → null', (await loadQuotePolicies(fakeSb({}, { review_sources: '42703' }), 'test', true)) === null)
  t('조회 실패(500) → null', (await loadQuotePolicies(fakeSb({}, { review_sources: '500' }), 'test', true)) === null)
  const m = await loadQuotePolicies(fakeSb({ review_sources: [{ key: 'a', quote_policy: 'full' }, { key: 'b', quote_policy: null }] }), 'test', true)
  t('정상 → key→원값 맵(NULL 도 그대로 — 판정은 quotePolicyOf)', m instanceof Map && m.get('a') === 'full' && m.has('b') && m.get('b') === null)
}

// ── 2) 원문 후보 로더 ──────────────────────────────────────────
const POL = new Map([['full_src', 'full'], ['short_src', 'short_only'], ['none_src', 'none']])
const P = 'p1'
{
  const log = []
  const r = await loadQuoteSources(fakeSb({}, {}, log), [{ project_id: P, quotes: [{ text: '좋아요', source_key: 'full_src' }] }], null, 'test')
  t('정책 맵 없음 → 조회 안 함(빈 맵)', r instanceof Map && r.size === 0 && log.length === 0)
  const log2 = []
  await loadQuoteSources(fakeSb({}, {}, log2), [{ project_id: P, quotes: [{ text: 'x', source_key: 'none_src' }, { text: 'y' }, { text: 'z', source_key: 'nope' }] }], POL, 'test')
  t('none·옛 인용·맵에 없는 소스뿐 → 조회 안 함', log2.length === 0)
  const log3 = []
  const rows = [{ project_id: P, source_key: 'full_src', raw_text: 'a' }, { project_id: P, source_key: 'short_src', raw_text: 'b' }, { project_id: P, source_key: 'full_src', raw_text: null }]
  const ok = await loadQuoteSources(fakeSb({ analysis_inputs: rows }, {}, log3), [{ project_id: P, quotes: [{ text: '배송이 "빨라" (정말), 좋아요', source_key: 'full_src' }] }], POL, 'test')
  t('정상 → (프로젝트·소스) 묶음별 원문, NULL 원문은 뺀다', ok.get(sourceGroupKey(P, 'full_src'))?.join() === 'a' && ok.get(sourceGroupKey(P, 'short_src'))?.join() === 'b')
  const orArg = log3[0].ops.find((o) => o[0] === 'or')?.[1] ?? ''
  t('검색 패턴: 쉼표·괄호는 큰따옴표 안, 따옴표는 이스케이프', orArg === 'raw_text.ilike."%배송이%\\"빨라\\"%(정말),%좋아요%"')
  t('검색 범위: 프로젝트·소스 키로 좁힌다', log3[0].ops.some((o) => o[0] === 'in' && o[1] === 'project_id' && o[2].join() === P) && log3[0].ops.some((o) => o[0] === 'in' && o[1] === 'source_key' && o[2].join() === 'full_src'))
  t('조회가 전부 실패 → null', (await loadQuoteSources(fakeSb({}, { analysis_inputs: '57014' }), [{ project_id: P, quotes: [{ text: '좋아요', source_key: 'full_src' }] }], POL, 'test')) === null)
  const many = Array.from({ length: 45 }, (_, i) => ({ text: `리뷰 문장 번호 ${i}`, source_key: 'full_src' }))
  const log4 = []
  await loadQuoteSources(fakeSb({ analysis_inputs: [] }, {}, log4), [{ project_id: P, quotes: many }], POL, 'test')
  t('패턴 20개씩 나눠 조회(45 → 3회)', log4.length === 3)
}

t('검색 조각: 첫 … 앞, 공백으로 나눈 앞머리', quoteProbeTokens('  배송이\n빨라요 … 포장도 좋고').join('|') === '배송이|빨라요')
t('검색 조각: 문자열 아님 → 없음', quoteProbeTokens(null).length === 0)

// ── 3) publicLines — 정책별 경계 ───────────────────────────────
const src = (m) => (k) => m[k] ?? null
const ko130 = '가'.repeat(QUOTE_MAX_KO)
const ko131 = '가'.repeat(QUOTE_MAX_KO + 1)
const en240 = 'a'.repeat(QUOTE_MAX_EN)
const en241 = 'a'.repeat(QUOTE_MAX_EN + 1)
const raw = { full_src: [`앞 ${ko131} 뒤 ${en241}`], short_src: [`앞 ${ko131} 뒤 ${en241}`], none_src: [`앞 ${ko131}`] }
const run = (quotes, policies = POL, s = raw) => publicLines(quotes, policies, src(s))
for (const key of ['full_src', 'short_src']) {
  t(`${key}: 한국어 130자 통과`, run([{ text: ko130, source_type: 'review', source_key: key }]).lines[0]?.kind === 'quote')
  t(`${key}: 한국어 131자 거부(자르지 않는다)`, run([{ text: ko131, source_type: 'review', source_key: key }]).lines.length === 0)
  t(`${key}: 영어 240자 통과 · 241자 거부`, run([{ text: en240, source_key: key }]).lines.length === 1 && run([{ text: en241, source_key: key }]).lines.length === 0)
}
t('none: 원문이 있어도 인용 0건', run([{ text: ko130, source_key: 'none_src' }]).lines.length === 0)
t('none: 요약도 안 낸다(Q3-2 A)', run([{ text: ko130, source_key: 'none_src', summary: '요약문' }]).lines.length === 0)
t('맵에 없는 소스: none 으로', run([{ text: ko130, source_key: 'ghost' }]).hidden === 1)
t('원문 불일치(지어낸 문장) → 거부', run([{ text: '원문에 없는 문장', source_key: 'full_src' }]).lines.length === 0)
t('원문 후보 못 읽음(null) → 거부', publicLines([{ text: ko130, source_key: 'full_src' }], POL, () => null).lines.length === 0)
t('다른 소스의 원문으로는 대조하지 않는다', run([{ text: ko130, source_key: 'full_src' }], POL, { short_src: raw.short_src }).lines.length === 0)
const out = run([{ text: ko130, source_type: 'review', source_key: 'short_src' }]).lines[0]
t('출력에 소스 키·이름이 없다(short_only·full 공통)', out && !('source_key' in out) && JSON.stringify(run([{ text: ko130, source_key: 'full_src' }]).lines).indexOf('full_src') < 0)
t('index 는 원래 배열 위치(번역 짝)', run([{ text: 'x', source_key: 'none_src' }, { text: ko130, source_key: 'full_src' }]).lines[0]?.index === 1)

// ── 4) 정책 맵 실패·옛 인용 → 인용 0건 + 요약만 ──────────────────
const legacy = [{ text: ko130, source_type: 'review' }]
t('정책 맵 못 읽음 → 인용 0건, 가린 수 1', (() => { const r = publicLines([{ text: ko130, source_key: 'full_src' }], null, src(raw)); return r.lines.length === 0 && r.hidden === 1 })())
t('정책 맵 못 읽음 + 요약 → 요약만', (() => { const r = publicLines([{ text: ko130, source_key: 'full_src', summary: '줄인 말' }], null, src(raw)); return r.lines.length === 1 && r.lines[0].kind === 'summary' && r.lines[0].text === '줄인 말' })())
t('옛 인용(source_key 없음) → 원문 있어도 숨김', (() => { const r = run(legacy); return r.lines.length === 0 && r.hidden === 1 })())
t('옛 인용 + 요약 → 요약(kind=summary)', run([{ ...legacy[0], summary: '줄인 말' }]).lines[0]?.kind === 'summary')
t('요약도 글자 상한(131자 거부)', run([{ ...legacy[0], summary: ko131 }]).lines.length === 0)
t('인용 통과면 요약보다 인용이 먼저', run([{ text: ko130, source_key: 'full_src', summary: '줄인 말' }]).lines[0]?.kind === 'quote')
t('입력이 배열 아님 → 0건', publicLines(null, POL, src(raw)).lines.length === 0)

// ── 2b) 백필 검증(verified=full ∧ qb-v1) — 원문 조회 없이 정책만 (2026-10-06 57014 대응) ──
{
  const BF = { verified: 'full', backfill: QUOTE_BACKFILL_TAG }
  const log = []
  await loadQuoteSources(fakeSb({}, {}, log), [{ project_id: P, quotes: [{ text: '좋아요 정말', source_key: 'full_src', ...BF }] }], POL, 'test')
  t('백필 full 뿐 → 원문 조회 0회', log.length === 0)
  const others = [
    { text: '앞머리만 맞음', source_key: 'full_src', verified: 'prefix', backfill: QUOTE_BACKFILL_TAG },
    { text: '폐기된 원문', source_key: 'full_src', verified: 'purged', backfill: QUOTE_BACKFILL_TAG },
    { text: '어디에도 없음', source_key: 'full_src', verified: 'none', backfill: QUOTE_BACKFILL_TAG },
    { text: '새로 저장된 인용', source_key: 'full_src' },
    { text: '표식 없는 full', source_key: 'full_src', verified: 'full' },
    { text: '좋아요 정말', source_key: 'full_src', ...BF },
  ]
  const log2 = []
  await loadQuoteSources(fakeSb({}, {}, log2), [{ project_id: P, quotes: others }], POL, 'test')
  const orArg = log2[0]?.ops.find((o) => o[0] === 'or')?.[1] ?? ''
  t('prefix·purged·none·verified 없음·표식 없는 full → 조회 대상, 백필 full 은 빠진다',
    log2.length === 1 && orArg.split(',').length === 5 && !orArg.includes('좋아요'))

  // publicLines: 백필 full 은 sourcesOf 를 부르지 않는다.
  let calls = 0
  const counting = () => { calls++; return null }
  const r = publicLines([{ text: ko130, source_type: 'review', source_key: 'full_src', ...BF }], POL, counting)
  t('백필 full → 원문 조회 0회로 quote', r.lines[0]?.kind === 'quote' && r.lines[0].text === ko130 && calls === 0)
  t('백필 full + short_only → quote', publicLines([{ text: ko130, source_key: 'short_src', ...BF }], POL, counting).lines[0]?.kind === 'quote')
  t('백필 full 이어도 정책 none → 가림', publicLines([{ text: ko130, source_key: 'none_src', ...BF }], POL, counting).hidden === 1)
  t('백필 full 이어도 맵에 없는 소스 → 가림', publicLines([{ text: ko130, source_key: 'ghost', ...BF }], POL, counting).hidden === 1)
  t('백필 full 이어도 정책 맵 못 읽음 → 가림', publicLines([{ text: ko130, source_key: 'full_src', ...BF }], null, counting).hidden === 1)
  t('백필 full 이어도 source_key 없음 → 가림', publicLines([{ text: ko130, ...BF }], POL, counting).hidden === 1)
  t('백필 full 이어도 한국어 131자 → 거부(too_long)', publicLines([{ text: ko131, source_key: 'full_src', ...BF }], POL, counting).hidden === 1)
  t('백필 full 이어도 영어 241자 → 거부', publicLines([{ text: en241, source_key: 'full_src', ...BF }], POL, counting).hidden === 1)
  t('위 거부들도 원문 조회 0회', calls === 0)
  for (const v of ['prefix', 'purged', 'none', undefined]) {
    const q = { text: ko130, source_key: 'full_src', backfill: QUOTE_BACKFILL_TAG, ...(v ? { verified: v } : {}) }
    t(`verified=${v ?? '없음'} → 원문 못 읽으면 가림`, publicLines([q], POL, () => null).hidden === 1)
    t(`verified=${v ?? '없음'} → 원문 대조 통과하면 quote(조회 경로)`, publicLines([q], POL, src(raw)).lines[0]?.kind === 'quote')
  }
  t('verified=full 인데 표식 없음 → 신뢰 안 함(원문 못 읽으면 가림)', publicLines([{ text: ko130, source_key: 'full_src', verified: 'full' }], POL, () => null).hidden === 1)
  t('표식이 다른 값(qb-v0) → 신뢰 안 함', publicLines([{ text: ko130, source_key: 'full_src', verified: 'full', backfill: 'qb-v0' }], POL, () => null).hidden === 1)

  // 경계면: 백필(planQuotes)이 실제로 만든 항목을 그대로 publicLines 에 넣는다.
  const planned = planQuotes([{ text: '배터리가 금방 닳아요.', source_type: 'review' }],
    prepareInputs([{ source_key: 'full_src', source_type: 'review', raw_text: '이 제품은 배터리가 금방 닳아요. 아쉽다' }])).next
  t('백필 산출물 → 원문 조회 없이 quote', publicLines(planned, POL, () => { throw new Error('sourcesOf called') }).lines[0]?.text === '배터리가 금방 닳아요.')

  // 부분 실패: 25개 → 2묶음, 첫 묶음만 실패. 실패 묶음 인용은 가리고 나머지는 낸다.
  const qs = Array.from({ length: 25 }, (_, i) => ({ text: `문장${i}번 끝`, source_key: 'full_src' }))
  let n = 0
  const sb = fakeSb(
    { analysis_inputs: () => qs.slice(20).map((q) => ({ project_id: P, source_key: 'full_src', raw_text: `원문 ${q.text}` })) },
    { analysis_inputs: () => (n++ === 0 ? '57014' : null) },
  )
  const part = await loadQuoteSources(sb, [{ project_id: P, quotes: qs }], POL, 'test')
  const pl = publicLines(qs, POL, (k) => part?.get(sourceGroupKey(P, k)) ?? null)
  t('부분 실패 → 맵은 null 이 아니다', part instanceof Map)
  t('부분 실패 → 실패 묶음(0~19)은 가리고 성공 묶음(20~24)은 낸다',
    pl.hidden === 20 && pl.lines.length === 5 && pl.lines.every((l) => l.index >= 20))
}

// ── 5) 요약 마크다운(화면 밖 산출물) 붙인 자리 ──────────────────
const md = (aspectQuotes, quotes) => buildSummaryMarkdown({ project: null, pmf: null, aspects: [{ name: 'x', importance: 9, satisfaction: 2, opportunity_score: 16, evidence_quotes: aspectQuotes }], quotes })
t('요약본: 게이트 재료 없음 → 인용 0건 + 정리 중 문구', !md([{ text: ko130, source_key: 'full_src' }]).includes(`"${ko130}"`) && md([{ text: ko130, source_key: 'full_src' }]).includes(QUOTE_PENDING_NOTE))
t('요약본: 정책·원문 통과 → 따옴표 인용', md([{ text: ko130, source_key: 'full_src' }], { policies: POL, sourcesOf: src(raw) }).includes(`원문 인용: "${ko130}"`))
t('요약본: 요약 줄은 따옴표 없음', (() => { const s = md([{ text: 'x', summary: '줄인 말' }]); return s.includes('요약(원문을 줄여 쓴 문장, 인용 아님): 줄인 말') && !s.includes('"줄인 말"') })())
t('요약본: 인용이 아예 없으면 기존 문구', md([]).includes('인용 없음 — 재분석하면 채워진다'))

console.log(`\nquote-wiring-selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
