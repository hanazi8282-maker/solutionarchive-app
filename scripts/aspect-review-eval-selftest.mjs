#!/usr/bin/env node
// 소구점 검수 평가 하네스 셀프테스트 — 가짜 DB·가짜 1차/2차 판정. 네트워크·실제 DB·LLM 없음.
//   node scripts/aspect-review-eval-selftest.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  FIELDS, MIN_INTERPRETABLE_N, REVIEW_SYSTEM_PROMPT, ASPECT_DEFINITIONS, bandOf, buildUserPrompt, loadTargets, normalizeJudgement,
  quoteTexts, runJudgements, scoreAspectEval, wilson,
} from '../lib/analysis/aspect-review-eval.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`) } }
const near = (a, b) => a !== null && Math.abs(a - b) < 1e-4

// ── 가짜 DB: select 체인만 흉내, 쓰기 메서드가 불리면 기록 ──
const writes = []
function fakeDb(tables, { missingLlm = false } = {}) {
  return {
    from(table) {
      const st = { table, cols: '', filters: [] }
      const q = {
        select(c) { st.cols = c; return q },
        eq(k, v) { st.filters.push((r) => r[k] === v); return q },
        in(k, vs) { st.filters.push((r) => vs.includes(r[k])); return q },
        order() { return q }, range() { return q },
        then(res, rej) {
          if (missingLlm && st.cols.includes('llm_')) return Promise.resolve({ data: null, error: { code: '42703', message: 'column llm_importance does not exist' } }).then(res, rej)
          const cols = st.cols.split(',').map((x) => x.trim())
          const data = (tables[table] ?? []).filter((r) => st.filters.every((f) => f(r))).map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
          return Promise.resolve({ data, error: null }).then(res, rej)
        },
      }
      for (const w of ['insert', 'update', 'upsert', 'delete', 'rpc']) q[w] = () => { writes.push(`${table}.${w}`); return q }
      return q
    },
    rpc() { writes.push('rpc'); return Promise.resolve({ data: null, error: null }) },
  }
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aspect = (n, over = {}) => ({
  id: id(n), project_id: 'p1', name: `속성${n}`, human_confirmed: true,
  aspect_layer: 'PRODUCT', importance: 8, satisfaction: 3, attribution: 'PRODUCT_FAULT', pain_timing: 'POST_PURCHASE',
  evidence_quotes: [{ text: `원문 ${n} 번 문장이 여기 있다`, source_type: 'review' }],
  llm_importance: 8, llm_aspect_layer: 'PRODUCT', llm_satisfaction: 3, llm_attribution: 'PRODUCT_FAULT', llm_pain_timing: 'POST_PURCHASE',
  ...over,
})
const tables = {
  analysis_aspects: [
    aspect(1), aspect(2, { llm_satisfaction: 7 }), aspect(3, { evidence_quotes: [] }), aspect(4, { evidence_quotes: [{ text: '  ' }] }),
    aspect(5, { human_confirmed: false }), aspect(6, { attribution: null, llm_attribution: null }),
  ],
  analysis_projects: [{ id: 'p1', product_elevator_pitch: '탈모 샴푸' }],
}

// ── 대상 읽기 ──
const L = await loadTargets(fakeDb(tables))
ok(L.confirmed === 5 && L.noQuotes === 2 && L.targets.length === 3, `확정 5 · 근거 없음 2 · 대상 3 (실제 ${L.confirmed}·${L.noQuotes}·${L.targets.length})`)
ok(L.llmColumns === 'present' && L.targets[0].llm.importance === 8 && L.targets[0].pitch === '탈모 샴푸', '원값·제품 설명을 읽는다')
const L2 = await loadTargets(fakeDb(tables, { missingLlm: true }))
ok(L2.llmColumns === 'absent' && L2.targets.every((t) => t.llm === null) && L2.targets.length === 3, '원값 컬럼 없음(42703) → 빼고 다시 읽는다, llm=null')
let threw = false
try { await loadTargets(fakeDb({ ...tables, analysis_projects: [] })) } catch { threw = true }
ok(threw, '프로젝트 건수 불일치 → throw(§7.1)')
ok(quoteTexts([{ text: 'a b' }, 'c', { x: 1 }, null]).join('|') === 'a b|c' && quoteTexts('x').length === 0, 'quoteTexts: 객체·문자열 둘 다, 빈 것 버림')

// ── 프롬프트 ──
ok(ASPECT_DEFINITIONS.includes('importance(0~10)') && ASPECT_DEFINITIONS.includes('pain_timing') && !ASPECT_DEFINITIONS.includes('Stage2'), '추출 프롬프트의 속성 정의를 그대로 잘라 싣는다')
ok(REVIEW_SYSTEM_PROMPT.includes(UNTRUSTED_INPUT_NOTICE) && REVIEW_SYSTEM_PROMPT.includes(ASPECT_DEFINITIONS), '프롬프트 = NOTICE + 정의')
const up = buildUserPrompt(L.targets[0])
ok(up.includes('원문 1 번 문장이 여기 있다') && !/PRODUCT_FAULT|POST_PURCHASE|\b8\b/.test(up), '블라인드: 사용자 프롬프트에 사람값이 없다')

// ── 정규화·띠 ──
const nj = normalizeJudgement({ aspect_layer: 'PRODUCT', importance: '7', satisfaction: 11, attribution: 'NONE', pain_timing: 'BOGUS', reason: 'r' })
ok(nj.importance === 7 && nj.satisfaction === null && nj.attribution === 'NONE' && nj.pain_timing === null, '정규화: 범위·허용값 밖은 판정 불가(null)')
ok(normalizeJudgement('x') === null && normalizeJudgement([1]) === null, '객체 아님 → null(호출 실패 취급)')
ok(bandOf('importance', 6) === 'HIGH' && bandOf('importance', 5.5) === 'LOW' && bandOf('satisfaction', 2.9) === 'LOW' && bandOf('satisfaction', 3) === 'MID' && bandOf('satisfaction', 4) === 'MID' && bandOf('satisfaction', 5) === 'HIGH' && bandOf('satisfaction', 6) === 'HIGH', '띠 = VERDICT_CUT')
ok(bandOf('attribution', null, { human: true }) === 'NONE' && bandOf('attribution', null) === null && bandOf('pain_timing', null, { human: true }) === null, '사람 attribution null = NONE, 판정자 null = 판정 불가')

// ── Wilson(알려진 값) ──
const w1 = wilson(8, 10), w2 = wilson(0, 10), w3 = wilson(10, 10)
ok(near(w1[0], 0.4902) && near(w1[1], 0.9433), `Wilson 8/10 = [0.4902, 0.9433] (실제 ${w1})`)
ok(w2[0] === 0 && near(w2[1], 0.2775), `Wilson 0/10 = [0, 0.2775] (실제 ${w2})`)
ok(near(w3[0], 0.7225) && w3[1] === 1, `Wilson 10/10 = [0.7225, 1] (실제 ${w3})`)
ok(wilson(0, 0) === null, 'Wilson n=0 → null')

// ── 채점 ──
const J = (o = {}) => ({ aspect_layer: 'PRODUCT', importance: 8, satisfaction: 3, attribution: 'PRODUCT_FAULT', pain_timing: 'POST_PURCHASE', reason: '', ...o })
const [t1, t2, t6] = L.targets
const r = scoreAspectEval([
  { target: t1, first: J(), second: J() },                                                     // 5필드 완전 동의 ∧ 사람과 같음
  { target: t2, first: J({ aspect_layer: 'PROCESS' }), second: J({ aspect_layer: 'PROCESS', satisfaction: null, pain_timing: 'PRE_PURCHASE' }) },
  // t2: layer 완전동의·사람과 다름(오류) · satisfaction 판정 불가 · pain_timing 엇갈림 · importance/attribution 적중
  { target: t6, first: J({ attribution: 'NONE' }), second: null },                              // 2차 없음 → unjudged
])
ok(r.unjudged === 1 && r.n_aspects === 3, `unjudged 1 (실제 ${r.unjudged})`)
ok(r.overall.known === 10 && r.overall.n_agree === 8 && r.overall.hits === 7 && r.overall.errors === 1, `전체 known 10 · 완전동의 8 · 적중 7 · 오류 1 (실제 ${JSON.stringify(r.overall)})`)
ok(near(r.overall.precision, 7 / 8) && near(r.overall.recall, 7 / 10), '정밀도 7/8 · 재현율 7/10')
ok(r.overall.undecidable === 1 && r.overall.split === 1, '판정 불가 1 · 엇갈림 1 은 완전 동의에서 빠진다')
ok(r.by_field.aspect_layer.n_agree === 2 && r.by_field.aspect_layer.hits === 1 && near(r.by_field.aspect_layer.precision, 0.5), '필드별: layer 1/2')
ok(r.by_field.satisfaction.n_agree === 1 && r.by_field.satisfaction.known === 2 && near(r.by_field.satisfaction.recall, 0.5), '필드별: 만족도 판정 불가는 재현율 분모에만')
ok(r.by_field.pain_timing.n_agree === 1 && r.by_field.pain_timing.split === 1, '필드별: 인지시점 엇갈림')
ok(r.overall.small && r.overall.precision_ci !== null, `분모 < ${MIN_INTERPRETABLE_N} → 해석 불가 표시`)
// 고친/안 고친: t2 는 llm_satisfaction 7 → 사람 3 = 고침
ok(r.by_edit.edited.known === 1 && r.by_edit.unedited.known === 9 && r.by_edit.no_original.known === 0, `수정 분해 edited 1 · unedited 9 (실제 ${r.by_edit.edited.known}·${r.by_edit.unedited.known})`)
const noOrig = scoreAspectEval(L2.targets.map((t) => ({ target: t, first: J(), second: J() })))
ok(noOrig.by_edit.no_original.known === noOrig.overall.known && noOrig.by_edit.edited.known === 0, '원값 컬럼 없음 → 전부 no_original')
// t6: 사람·원값 attribution 둘 다 null(칭찬) → 안 고침, 판정자 NONE 이면 적중
const r6 = scoreAspectEval([{ target: t6, first: J({ attribution: 'NONE' }), second: J({ attribution: 'NONE' }) }])
ok(r6.by_field.attribution.hits === 1 && r6.items.find((x) => x.field === 'attribution').edit === 'unedited', '칭찬(attribution null) = NONE 로 적중·안 고침')

// 분모 0 → 지어내지 않는다
const z = scoreAspectEval([{ target: t1, first: J({ aspect_layer: null, importance: null, satisfaction: null, attribution: null, pain_timing: null }), second: J() }])
ok(z.overall.n_agree === 0 && z.overall.precision === null && z.overall.precision_ci === null && z.overall.known === 5 && z.overall.recall === 0, '완전 동의 0 → 정밀도 해당 없음(null), 재현율 0/5')
const bothNull = scoreAspectEval([{ target: t1, first: J({ satisfaction: null }), second: J({ satisfaction: null }) }])
ok(bothNull.by_field.satisfaction.n_agree === 0 && bothNull.by_field.satisfaction.undecidable === 1, '둘 다 판정 불가도 완전 동의가 아니다')
const e = scoreAspectEval([])
ok(e.overall.precision === null && e.overall.recall === null && e.overall.recall_ci === null, '빈 입력 → 전부 해당 없음')
// 사람값 비면(attribution 외) 비교에서 뺀다
const gm = scoreAspectEval([{ target: { ...t1, human: { ...t1.human, pain_timing: null } }, first: J(), second: J() }])
ok(gm.gold_missing === 1 && gm.overall.known === 4, '사람 pain_timing null → gold_missing, 분모에서 제외')
// 큰 표본이면 경고 해제
const big = scoreAspectEval(Array.from({ length: 6 }, () => ({ target: t1, first: J(), second: J() })))
ok(!big.overall.small && big.overall.n_agree === 30, '분모 30 이상이면 경고 없음')

// ── 판정 루프: 독립성·재개·한도 중단 ──
const seen = []
const judge = (tag, stopAt = null) => async (t) => {
  seen.push(`${tag}:${t.id}`)
  if (stopAt === t.id) return { ok: false, stop: true, reason: '429 한도' }
  return { ok: true, judgement: J(), model: tag, raw: '{}' }
}
const caches = { first: new Map(), second: new Map() }
const saved = []
const run1 = await runJudgements(L.targets, caches, { first: judge('A'), second: judge('B', t2.id) }, (k) => saved.push(k))
ok(run1.calls.first === 3 && run1.calls.second === 2 && run1.stopped.second === '429 한도' && run1.stopped.first === null, `한도: 2차는 2번째에서 멈추고 1차는 끝까지 (실제 ${JSON.stringify(run1.calls)})`)
ok(caches.first.size === 3 && caches.second.size === 1 && !caches.second.has(t2.id), '실패 건은 캐시하지 않는다')
ok(!seen.includes(`B:${t6.id}`), '한도 뒤로는 부르지 않는다')
seen.length = 0
const run2 = await runJudgements(L.targets, caches, { first: judge('A'), second: judge('B') }, () => {})
ok(run2.calls.first === 0 && run2.calls.second === 2 && seen.join(',') === `B:${t2.id},B:${t6.id}`, `재개: 캐시에 없는 것만 부른다 (실제 ${seen})`)
const soft = await runJudgements(L.targets, { first: new Map(), second: new Map() }, { first: async (t) => (t.id === t1.id ? { ok: false, stop: false, reason: 'x' } : { ok: true, judgement: J(), model: 'A', raw: '' }) }, () => {})
ok(soft.calls.first === 3 && soft.failures.length === 1 && soft.stopped.first === null, '단건 실패(stop=false)는 건너뛰고 계속')
ok(writes.length === 0, `DB 쓰기 호출 0 (실제 ${writes.join(',')})`)

// ── 배선(정적) ──
const h = readFileSync(`${ROOT}scripts/aspect-review-eval.mjs`, 'utf8')
const lib = readFileSync(`${ROOT}lib/analysis/aspect-review-eval.ts`, 'utf8')
ok(!/\.(update|upsert|insert|delete|rpc)\(/.test(h) && !/\.(update|upsert|insert|delete|rpc)\(/.test(lib), '하네스·부품은 DB 에 쓰지 않는다')
ok(!/auto_approv/.test(h + lib), '자동승인 컬럼·로직 없음')
ok(h.includes("const run = args.includes('--run')") && h.includes("if (!run) { console.log('드라이런"), '기본 드라이런 — --run 없으면 호출 전에 끝난다')
ok(h.indexOf("if (!run)") < h.indexOf('runJudgements('), '드라이런 종료가 판정 루프보다 앞')
ok(h.includes('callGeminiRotating(') && h.includes("'claude-cli'") && h.includes('CLAUDE_CLI_DEFAULT_MODEL'), '1차 claude-cli Sonnet 고정 · 2차 공용 Gemini 순환 헬퍼')
ok(h.includes('--resume') && h.includes('이전 판정 캐시'), '캐시가 있는데 --resume 없으면 멈춘다(덮어쓰지 않는다)')
ok(h.includes("'ops/state/aspect-review-eval'") && h.includes("path.join('reports', date, 'aspect-review-eval.md')"), '출력 = ops/state/ · reports/ (화이트리스트)')
ok(FIELDS.length === 5 && FIELDS.includes('pain_timing'), '다섯 필드, 인지시점 = pain_timing')

console.log(`\n${fail ? '❌' : '✅'} 소구점 검수 평가 하네스 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
