#!/usr/bin/env node
// /insights 카드의 근거 인용·유사 해결사례 오프라인 셀프테스트 — 네트워크·DB·로그인·LLM 없음.
//   node scripts/insights-evidence-selftest.mjs            # 검사
//   node scripts/insights-evidence-selftest.mjs --mutate   # 뮤테이션마다 자식 프로세스로 돌려 "실패해야 통과"
//   node scripts/insights-evidence-selftest.mjs --print    # 카드 1장 HTML(PR 본문 예시용)
//
// 가짜 Supabase 로 loadInsightFeed + loadInsightEvidence 를 돌리고 InsightsView HTML 을 검사한다.
// 로더 훅은 insights-render-selftest.mjs 와 같다(typescript.transpileModule) — 여기에 뮤테이션 치환만 더했다.
import { createRequire, register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const MUTATIONS = {
  // 연결 고리를 끊는다: 카드의 aspect_id 대신 아무 속성의 근거를 붙인다.
  'link-cut': ['app/insights/view.tsx', 'evidence?.get(it.aspect_id)', 'evidence?.values().next().value'],
  // 번역 기본 표시를 원문으로 바꾼다.
  'ko-off': ['app/_pub/components/PubInsightEvidence.tsx', 'if (q.ko) {', 'if (false) {'],
  // not_run 을 no_match 로 접는다.
  'fold-not-run': ['app/_pub/components/PubInsightEvidence.tsx', '<Chip>처방 미실행</Chip> {r.reason}.', '<Chip>유사 해결사례 없음</Chip> 관련 사례 없음 — 억지로 끼워 맞추지 않는다.'],
  // 조회 실패를 "사례 없음" 으로 접는다.
  'fold-unknown': ['lib/insights/evidence.ts', "if (c.projects === null) return { state: 'unknown', reason: '프로젝트 조회 실패' }", "if (c.projects === null) return { state: 'not_run', reason: '프로젝트 조회 실패', verdictLabel: '' }"],
  // 카드마다 조회한다(N+1).
  'n-plus-1': ['lib/insights/evidence.ts', 'return buildInsightEvidence(aspectIds, { aspects, projects, corpora, verdicts }, { policies, sources }, angles)', 'for (const id of aspectIds) await loadAspects(sb, [id], where)\n  return buildInsightEvidence(aspectIds, { aspects, projects, corpora, verdicts }, { policies, sources }, angles)'],
  // 인용 게이트를 끊는다: 정책·원문 대조 없이 저장된 인용을 그대로 낸다.
  'gate-off': ['lib/insights/evidence.ts', "const pub = publicLines(a.evidence_quotes, g.policies,", "const pub = { hidden: 0, lines: (a.evidence_quotes ?? []).map((q, index) => ({ kind: 'quote', text: q.text, source_type: q.source_type, index })) } ?? publicLines(a.evidence_quotes, g.policies,"],
  // 판정 인용을 원본 그대로 그린다(놓치기 쉬운 경로).
  'judged-raw': ['app/_pub/components/PubInsightCard.tsx', "const judged = item.evidence ? evidence?.judged[item.id] : undefined", "const judged = item.evidence ? { state: 'ok' as const, text: item.evidence } : undefined"],
  // 요약을 인용 모양으로 그린다(허위 표시).
  'summary-as-quote': ['app/_pub/components/PubInsightEvidence.tsx', "if (l.kind === 'quote') return <QuoteItem q={l} />", "if (l.kind === 'quote' || true) return <QuoteItem q={{ ko: null, untranslated: false, source_type: null, ...l }} />"],
}

if (process.argv.includes('--mutate')) {
  let bad = 0
  for (const name of Object.keys(MUTATIONS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, INSIGHTS_EVIDENCE_MUTATE: name }, encoding: 'utf8' })
    const caught = r.status !== 0
    if (!caught) bad++
    console.log(`${caught ? '✅ 잡힘' : '❌ 못 잡음'}  ${name}${caught ? `  (${(r.stdout.match(/❌ .*/g) ?? []).length}건 실패)` : ''}`)
  }
  console.log(`\ninsights-evidence-selftest --mutate: ${Object.keys(MUTATIONS).length - bad}/${Object.keys(MUTATIONS).length} 잡힘`)
  process.exit(bad ? 1 : 0)
}

const ROOT = new URL('../', import.meta.url).href
const TS = pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href
const MUT = process.env.INSIGHTS_EVIDENCE_MUTATE ? MUTATIONS[process.env.INSIGHTS_EVIDENCE_MUTATE] : null
const HOOKS = `
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from ${JSON.stringify(TS)}
const ROOT = ${JSON.stringify(ROOT)}
const MUT = ${JSON.stringify(MUT)}
const exists = async (u) => { try { return (await stat(fileURLToPath(u))).isFile() } catch { return false } }
export async function resolve(spec, ctx, next) {
  if (ctx.parentURL?.startsWith('stub:')) ctx = { ...ctx, parentURL: ROOT + 'package.json' }
  if (spec === 'next/link') return { url: 'stub:link', shortCircuit: true }
  if (spec === 'next/navigation') return { url: 'stub:nav', shortCircuit: true }
  if (spec.endsWith('.css')) return { url: 'stub:css', shortCircuit: true }
  let base = null
  if (spec.startsWith('@/')) base = ROOT + spec.slice(2)
  else if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:')) base = new URL(spec, ctx.parentURL).href
  if (base) for (const ext of ['', '.tsx', '.ts', '/index.ts']) if (/\\.(tsx?|mjs|js)$/.test(base + ext) && await exists(base + ext)) return { url: base + ext, shortCircuit: true }
  return next(spec, ctx)
}
export async function load(url, ctx, next) {
  if (url === 'stub:link') return { format: 'module', shortCircuit: true, source: "import { createElement } from 'react'; export default function Link({ href, children, prefetch, ...p }) { return createElement('a', { href, ...p }, children) }" }
  if (url === 'stub:nav') return { format: 'module', shortCircuit: true, source: 'export function redirect(u) { throw new Error("redirect " + u) } export const usePathname = () => "/insights"; export const useRouter = () => ({ push() {}, refresh() {} })' }
  if (url === 'stub:css') return { format: 'module', shortCircuit: true, source: '' }
  if (/\\.tsx?$/.test(url) && url.startsWith(ROOT)) {
    let src = (await readFile(fileURLToPath(url), 'utf8')).replace(/\\r\\n/g, '\\n')
    // 인용 정책 스위치를 켠 상태(컬럼 적용 뒤)를 흉내 낸다 — 꺼진 상태는 quote-wiring-selftest 가 본다.
    if (url === ROOT + 'lib/signals/feed.ts') src = src.replace('export const QUOTE_POLICY_COLUMN_READY = false', 'export const QUOTE_POLICY_COLUMN_READY = true')
    if (MUT && url === ROOT + MUT[0]) {
      if (!src.includes(MUT[1])) throw new Error('mutation anchor missing: ' + MUT[1])
      src = src.replace(MUT[1], MUT[2])
    }
    const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false }, fileName: fileURLToPath(url) })
    return { format: 'module', shortCircuit: true, source: out.outputText }
  }
  return next(url, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(HOOKS), pathToFileURL('./'))

const { createElement: h } = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { InsightsView } = await import(ROOT + 'app/insights/view.tsx')
const { loadInsightFeed, parseInsightQuery } = await import(ROOT + 'lib/insights/feed.ts')
const { loadInsightEvidence, buildInsightEvidence } = await import(ROOT + 'lib/insights/evidence.ts')
const { quoteLines } = await import(ROOT + 'lib/analysis/quote-display.ts')
const { VERDICT_LABEL } = await import(ROOT + 'lib/analysis/aspect-verdict.ts')
const { buildRemedies, fixLine, gateCaption, remedyStatusLine } = await import(ROOT + 'lib/cases/remedy.ts')
const { cardFingerprint } = await import(ROOT + 'lib/cases/remedy-gate.ts')

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// ── 가짜 Supabase: .in() 을 실제로 거르고, from() 호출을 센다 ───────────
const fakeSb = (tables, { fail: failT = {}, missingKo = false, ignoreIn = false } = {}, log = []) => ({
  from(table) {
    log.push(table)
    let rows = tables[table] ?? []
    let cols = ''
    const q = {
      select: (c) => { cols = c; return q },
      // or(ilike 후보 검색)·limit 은 거르지 않는다 — 후보가 더 와도 원문 일치는 checkQuote 가 다시 본다.
      range: () => q, eq: () => q, order: () => q, maybeSingle: () => q, or: () => q, limit: () => q,
      in: (col, vals) => { if (!ignoreIn) rows = rows.filter((r) => vals.includes(r[col])); return q },
      then: (ok, ko) => {
        const res = failT[table] ? { data: null, error: { code: failT[table], message: 'boom' }, count: null }
          : missingKo && table === 'analysis_aspects' && cols.includes('evidence_quotes_ko')
            ? { data: null, error: { code: '42703', message: 'column analysis_aspects.evidence_quotes_ko does not exist' }, count: null }
            // 고르지 않은 번역 칸은 돌려주지 않는다(실제 PostgREST 처럼).
            : { data: table === 'analysis_aspects' && !cols.includes('evidence_quotes_ko') ? rows.map(({ evidence_quotes_ko, ...r }) => r) : rows, error: null, count: rows.length }
        return Promise.resolve(res).then(ok, ko)
      },
    }
    return q
  },
})

const P = '11111111-1111-4111-8111-111111111111'
const project = { id: P, product_elevator_pitch: '두피 진정 샴푸', market: '탈모 샴푸', business_model: null, mode: 'forward', status: 'angled', created_at: '2026-09-01T00:00:00Z' }
// no_match 용 두 번째 프로젝트 — 시장·설명이 코퍼스와 안 겹쳐야 속성 카드가 0건이 된다.
const P2 = '22222222-2222-4222-8222-222222222222'
const project2 = { ...project, id: P2, product_elevator_pitch: '택배 박스', market: null }
const asp = (id, name, I, S, notes, quotes, ko, pid = P) => ({ id, project_id: pid, name, quadrant: 'DIFFERENTIATOR', notes, importance: I, satisfaction: S, evidence_quotes: quotes, evidence_quotes_ko: ko })
// 인용은 source_key 가 붙은 새 인용(2026-10-05~)이고, 그 소스(danawa)는 정책 full, 원문은 analysis_inputs 에 있다.
const Q = (text) => ({ text, source_type: 'review', source_key: 'danawa' })
const ASPECTS = [
  // PUSH — 코퍼스와 겹친다 → matched. 번역 3건(길이 일치), 3건이라 1건은 접힌다.
  asp('s1', '가려움', 9, 2, '두피 가려움 불만이 반복된다', [Q('My scalp itches all day'), Q('Itchy after one wash'), Q('Still itchy, refunded')], ['하루 종일 두피가 가렵다', '한 번 감고 나서 가렵다', '여전히 가려워서 환불했다']),
  // PUSH — 코퍼스와 안 겹친다 → no_match. 번역 NULL.
  asp('s2', '배송', 9, 1, '배송 지연', [Q('Shipping took two weeks'), Q('Box arrived crushed')], null, P2),
  // TABLE_STAKES — 처방 대상 아님 → not_run. 번역 길이 불일치.
  asp('s3', '향', 8, 8, '향 호평', [Q('Smells lovely'), Q('Nice scent')], ['향이 좋다']),
  // 카드가 없는 속성 — 인용이 어디에도 나오면 안 된다.
  asp('s9', '용기', 9, 2, '용기 가려움', [Q('OTHER-ASPECT-QUOTE')], ['다른속성인용']),
]
const studies = [{ id: 'cs1', slug: 'acme', brand_name: '두피랩', bottleneck: 'TRUST', business_model: 'D2C', buyer_type: 'B2C', price_band: 'MID', review_status: 'approved' }]
const moves = [
  { id: 'm1', case_study_id: 'cs1', lever: 'CONTENT', claim: '두피 가려움 리뷰를 상세페이지에 그대로 붙였다', evidence_grade: 'A', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm2', case_study_id: 'cs1', lever: 'OFFER', claim: '가려움 개선 안 되면 환불', evidence_grade: 'B', fact_check_grade: 'C', outcome_direction: 'positive', review_status: 'approved' },
]
const failedAngles = [{ case_key: 'f1', product_category: '샴푸', claimed_angle: '가려움 즉시 사라짐', outcome: '과장광고로 제재', evidence_source: 'x', source_tier: 'primary', is_estimate: true }]
const principles = [{ sp_id: 'SP-001', tags: ['가려움', '샴푸', 'seller'], statement: '가려움은 증상이지 원인이 아니다', evidence_grade: 'A', evidence_grade_note: null, source_ref: 'docs' }]

// 저장된 재검사 판정: s1 의 m2 카드 = 무관(0) → 빠져야 한다. m1 = 직접(2). 나머지는 행 없음 → 미검증.
const corpora = { principles, studies, moves, failedAngles }
const s1Card = buildRemedies({ aspects: [ASPECTS[0]], project, corpora }).cards[0]
const fp = (id) => cardFingerprint('case_move', fixLine(s1Card.fixes.find((f) => f.case_move_id === id)))
const VERDICTS = [
  { aspect_id: 's1', card_kind: 'case_move', card_id: 'm1', card_fingerprint: fp('m1'), verdict: 2, human_verdict: null },
  { aspect_id: 's1', card_kind: 'case_move', card_id: 'm2', card_fingerprint: fp('m2'), verdict: 0, human_verdict: null },
]

const A = (id, aspect_id, over = {}) => ({
  id, project_id: P, aspect_id, angle_type: 'PAS', output_type: 'COPY', headline_draft: `문구 ${id}`,
  substantiation_verdict: 'EXPERIENTIAL', substantiation_reason: null, substantiation_evidence: null,
  headline_original: null, gate_rewritten: false, adaptation_suggestion: null, created_at: `2026-09-2${id.slice(1)}T00:00:00Z`, ...over,
})
const TABLES = {
  analysis_angles: [A('a1', 's1'), A('a2', 's2', { project_id: P2 }), A('a3', 's3'), A('a4', 's1')],
  analysis_projects: [project, project2],
  analysis_aspects: ASPECTS,
  pmf_assessments: [{ target_project_id: P, quadrant: 'PROVEN_DEMAND', match_status: 'matched', created_at: '2026-09-02T00:00:00Z' }],
  validated_angles_corpus: [],
  case_studies: studies, case_moves: moves, strategy_principles: principles, failed_angles: failedAngles,
  remedy_verdicts: VERDICTS,
  review_sources: [{ key: 'danawa', quote_policy: 'full' }],
  analysis_inputs: [
    { project_id: P, source_key: 'danawa', raw_text: 'My scalp itches all day.\nItchy after one wash. Still itchy, refunded!\nSmells lovely. Nice scent. OTHER-ASPECT-QUOTE' },
    { project_id: P2, source_key: 'danawa', raw_text: 'Shipping took two weeks and the Box arrived crushed' },
  ],
}

const quietErr = console.error; const quietWarn = console.warn
console.error = () => {}; console.warn = () => {}

/** 피드는 정상 가짜로, 근거는 opts 가짜로. 카드별 HTML 을 문구로 찾는다. */
const render = async (opts = {}, tables = TABLES, log = []) => {
  const { query, errors } = parseInsightQuery({})
  const result = await loadInsightFeed(fakeSb(tables), query)
  const items = result.status === 'ok' ? result.groups.flatMap((g) => g.items) : []
  const evidence = await loadInsightEvidence(fakeSb(tables, opts, log), items)
  const html = renderToStaticMarkup(h(InsightsView, { query, errors, result, evidence }))
  const cards = Object.fromEntries(html.split('<article').slice(1).map((c) => [(c.match(/문구 (a\d)/) ?? [])[1], c]))
  return { html, cards }
}

// ── 1) 3상태 — 모양·문구가 다르다 ────────────────────────────────
const { html, cards } = await render()
t('카드 4장', Object.keys(cards).length === 4)
const m = cards.a1, nm = cards.a2, nr = cards.a3
t('matched: 3그룹 모두', m.includes('이렇게 보완한 사례') && m.includes('이렇게 갔다가 막힌 사례') && m.includes('>원칙<'))
t('matched: 보완 사례 링크 /library/acme', m.includes('href="/library/acme"'))
t('matched: 판정 라벨은 VERDICT_LABEL.PUSH', m.includes(`>${VERDICT_LABEL.PUSH}<`))
t('matched: 재검사 무관(0) 카드 m2 는 빠진다', !m.includes('가려움 개선 안 되면 환불'))
t('matched: 재검사 캡션(1 통과 · 1 제외 · 나머지 미검증)', /재검사: 1장 통과 · 1장 제외 · \d장 미검증/.test(m))
t('matched: 판정 없는 카드는 "미검증" 칩으로 남는다', m.includes('>미검증<'))
t('matched: 추정 칩', m.includes('>추정<'))
t('matched: 매칭 근거 접힘', m.includes('매칭 근거'))
t('no_match: "유사 해결사례 없음" + 엔진 문장', nm.includes('유사 해결사례 없음') && nm.includes('관련 사례 없음 — 억지로 끼워 맞추지 않는다.'))
t('no_match: 3그룹 없음', !nm.includes('이렇게 보완한 사례'))
t('not_run: "처방 미실행" + 판정 라벨(기본기) + 대상 라벨', nr.includes('처방 미실행') && nr.includes(`“${VERDICT_LABEL.TABLE_STAKES}”`) && nr.includes(`“${VERDICT_LABEL.PUSH}”·“${VERDICT_LABEL.WATCH}”`))
t('not_run 은 "사례 없음" 으로 접히지 않는다', !nr.includes('유사 해결사례 없음') && !nr.includes('관련 사례 없음'))
t('세 상태 어디에도 "확인 불가" 없음(조회 정상)', !m.includes('확인 불가') && !nm.includes('확인 불가') && !nr.includes('확인 불가'))
t('같은 속성 카드 두 장(a1·a4)은 같은 근거', cards.a4.includes('href="/library/acme"') && cards.a4.includes('하루 종일 두피가 가렵다'))

// ── 2) 인용·번역 ────────────────────────────────────────────────
t('번역 있음: 한국어가 기본 표시', m.includes('“하루 종일 두피가 가렵다”'))
t('번역 있음: 원문은 <details> "원문 보기" 안', /<details[^>]*><summary>.*?원문 보기<\/summary><blockquote[^>]*lang="und">“My scalp itches all day”/.test(m))
t('번역 있음: "번역 전" 없음', !m.includes('번역 전'))
// 접힘 글자는 '{n}건 더' — 접힌 줄에 요약이 섞일 수 있어 '인용' 이라 부르지 않는다(v23 5-b).
t('상위 2건만 펴고 1건은 접힘', m.includes('>1건 더<') && /1건 더<\/summary><div class="pub-fold-body">.*여전히 가려워서 환불했다/.test(m))
t('번역 NULL: 원문 + "번역 전"', nm.includes('“Shipping took two weeks”') && nm.includes('번역 전') && !nm.includes('원문 보기'))
t('번역 길이 불일치: 원문 + "번역 전"(번역 버림)', nr.includes('“Smells lovely”') && nr.includes('번역 전') && !nr.includes('향이 좋다'))
t('인용은 카드 속성의 것만(s1 인용이 s2 카드에 없음)', !nm.includes('Itchy') && !nr.includes('Itchy') && !m.includes('Shipping'))
t('카드 없는 속성(s9) 인용은 어디에도 없음', !html.includes('OTHER-ASPECT-QUOTE') && !html.includes('다른속성인용'))
const loose = await render({ ignoreIn: true })
t('DB 가 더 많은 행을 줘도(.in 무시) 카드 속성 것만', !loose.html.includes('OTHER-ASPECT-QUOTE') && loose.cards.a2.includes('Shipping') && !loose.cards.a2.includes('Itchy'))
const noKoCol = await render({ missingKo: true })
t('번역 칸 없음(42703): 재조회해서 원문 + 번역 전', noKoCol.cards.a1.includes('“My scalp itches all day”') && noKoCol.cards.a1.includes('번역 전') && !noKoCol.html.includes('확인 불가'))

// quoteLines 순수 규칙(검수 화면과 공용)
t('quoteLines: 길이 일치 → ko', quoteLines([Q('a'), Q('b')], ['가', '나'])[1].ko === '나')
t('quoteLines: NULL → untranslated', quoteLines([Q('a')], null)[0].untranslated === true)
t('quoteLines: 길이 불일치 → 전부 untranslated', quoteLines([Q('a'), Q('b')], ['가']).every((l) => l.untranslated && l.ko === null))
t('quoteLines: 번역 = 원문(이미 한국어) → ko null, 번역 전 아님', (() => { const l = quoteLines([Q('좋다')], ['좋다'])[0]; return l.ko === null && !l.untranslated })())
t('quoteLines: 인용 NULL → []', quoteLines(null, null).length === 0)

// ── 3) 조회 실패 → "확인 불가" 만 ────────────────────────────────
const aspFail = await render({ fail: { analysis_aspects: '500' } })
t('속성 조회 실패: 카드마다 확인 불가(인용·처방)', ['a1', 'a2', 'a3'].every((k) => (aspFail.cards[k].match(/확인 불가 — 속성 조회 실패/g) ?? []).length === 2))
t('속성 조회 실패: 사례 없음·미실행·번역 전으로 접지 않음', !/유사 해결사례 없음|처방 미실행|번역 전|추출이 인용을/.test(aspFail.html))
const projFail = await render({ fail: { analysis_projects: '500' } })
t('프로젝트 조회 실패: 처방 대상은 확인 불가', projFail.cards.a1.includes('확인 불가 — 프로젝트 조회 실패') && projFail.cards.a2.includes('확인 불가 — 프로젝트 조회 실패'))
t('프로젝트 조회 실패: 인용은 그대로', projFail.cards.a1.includes('하루 종일 두피가 가렵다'))
// 엔진(advise)은 세 코퍼스 중 하나라도 붙으면 matched 라, 셋 다 실패해야 not_run 이 된다.
const corpFail = await render({ fail: { case_moves: '500', strategy_principles: '500', failed_angles: '500' } })
t('코퍼스 조회 실패: 엔진 not_run → "확인 불가 — …" (결과 화면 라벨 그대로)', corpFail.cards.a1.includes(remedyStatusLine({ status: 'not_run', reason: '판정 불가 — 선례: case_studies / case_moves 조회 실패' })))
t('코퍼스 조회 실패: 사례 없음으로 접지 않음', !corpFail.cards.a1.includes('유사 해결사례 없음'))
const verFail = await render({ fail: { remedy_verdicts: '500' } })
t('판정 조회 실패: 카드는 남고 전부 미검증 + 사유 캡션', verFail.cards.a1.includes('href="/library/acme"') && verFail.cards.a1.includes('재검사 기록을 읽지 못해') && verFail.cards.a1.includes('가려움 개선 안 되면 환불'))

// ── 4) N+1 없음: 조회 횟수가 카드 수와 무관 ─────────────────────
const log4 = []; await render({}, TABLES, log4)
const one = { ...TABLES, analysis_angles: [A('a1', 's1')] }
const log1 = []; await render({}, one, log1)
t(`조회 횟수 카드 4장 = 1장 (${log4.length} = ${log1.length})`, log4.length === log1.length && log4.length > 0)
t('속성·판정 조회는 각 1회', log4.filter((x) => x === 'analysis_aspects').length === 1 && log4.filter((x) => x === 'remedy_verdicts').length === 1)

// ── 5) 공용화한 문장이 결과 화면 옛 문장과 같다(remedy-section 회귀) ──
t('gateCaption 문장 불변', gateCaption({ judged: 3, removed: 1, unverified: 2 }) === '재검사: 2장 통과 · 1장 제외 · 2장 미검증')
t('gateCaption 0장이면 null', gateCaption({ judged: 0, removed: 0, unverified: 0 }) === null && gateCaption(undefined) === null)
t('remedyStatusLine no_match 문장 불변', remedyStatusLine({ status: 'no_match', reason: 'x' }) === '관련 사례 없음 — 억지로 끼워 맞추지 않는다.')
t('remedyStatusLine not_run 문장 불변', remedyStatusLine({ status: 'not_run', reason: 'y' }) === '확인 불가 — y')

// ── 6) 순수 빌더: 요청한 id 만 ────────────────────────────────
const map = buildInsightEvidence(['s2'], { aspects: ASPECTS, projects: [project], corpora, verdicts: [] })
t('buildInsightEvidence: 요청한 aspect_id 만 키', [...map.keys()].join() === 's2')

// ── 7) 인용 게이트 경계(v23 5-b) — 정책 맵·원문 대조·옛 인용·요약·판정 인용 ──────────
const PENDING = '인용 정리 중'
const polFail = await render({ fail: { review_sources: '500' } })
t('정책 맵 못 읽음: 인용 0건(원문·번역 어디에도 없음)', !/My scalp|하루 종일|Shipping|Smells/.test(polFail.html))
t('정책 맵 못 읽음: 빈칸 대신 "정리 중"', polFail.cards.a1.includes(PENDING) && polFail.cards.a2.includes(PENDING))
t('정책 맵 못 읽음: 처방은 그대로', polFail.cards.a1.includes('href="/library/acme"'))
const polNone = await render({}, { ...TABLES, review_sources: [{ key: 'danawa', quote_policy: 'none' }] })
t('정책 none: 인용 0건 + 정리 중', !/My scalp|Shipping/.test(polNone.html) && polNone.cards.a1.includes(PENDING))
const polUnknown = await render({}, { ...TABLES, review_sources: [{ key: 'danawa', quote_policy: 'weird' }] })
t('정책 모르는 값: none 으로(인용 0건)', !/My scalp|Shipping/.test(polUnknown.html))
const polShort = await render({}, { ...TABLES, review_sources: [{ key: 'danawa', quote_policy: 'short_only' }] })
t('정책 short_only: 인용은 나오고 소스 키(danawa)는 HTML 에 없다', polShort.cards.a1.includes('하루 종일 두피가 가렵다') && !polShort.html.includes('danawa'))
t('정책 full 도 소스 키는 HTML 에 없다(D안)', !html.includes('danawa'))
const noRaw = await render({}, { ...TABLES, analysis_inputs: [] })
t('원문 없음(폐기·미일치): 인용 0건 + 정리 중', !/My scalp|Shipping/.test(noRaw.html) && noRaw.cards.a1.includes(PENDING))
const rawFail = await render({ fail: { analysis_inputs: '500' } })
t('원문 조회 실패: 인용 0건 + 정리 중', !/My scalp|Shipping/.test(rawFail.html) && rawFail.cards.a1.includes(PENDING))
const tooLong = 'x'.repeat(300)
const longT = { ...TABLES, analysis_aspects: ASPECTS.map((a) => (a.id === 's3' ? { ...a, evidence_quotes: [Q(tooLong), Q('Smells lovely')], evidence_quotes_ko: null } : a)), analysis_inputs: [...TABLES.analysis_inputs, { project_id: P, source_key: 'danawa', raw_text: tooLong }] }
const longR = await render({}, longT)
t('글자 상한(영어 240) 초과: 그 인용만 빠지고 나머지는 나온다', !longR.cards.a3.includes(tooLong) && longR.cards.a3.includes('“Smells lovely”') && longR.cards.a3.includes('1건은 인용 정리 중'))
const legacyT = { ...TABLES, analysis_aspects: ASPECTS.map((a) => (a.id === 's3' ? { ...a, evidence_quotes: [{ text: 'Smells lovely', source_type: 'review' }, { text: 'Nice scent', source_type: 'review', summary: '향이 좋다는 평이 많다' }] } : a)) }
const legacy = await render({}, legacyT)
t('옛 인용(source_key 없음): 원문이 있어도 인용으로 안 낸다', !legacy.cards.a3.includes('Smells lovely') && !legacy.cards.a3.includes('Nice scent'))
t('옛 인용 + 요약: 요약은 "요약" 칩, 따옴표·인용 블록 없음', /<span class="pub-chip">요약<\/span> 향이 좋다는 평이 많다/.test(legacy.cards.a3) && !legacy.cards.a3.includes('“향이 좋다는') && !/<blockquote[^>]*>[^<]*향이 좋다는/.test(legacy.cards.a3))
t('옛 인용: 가린 1건은 "정리 중" 으로 센다', legacy.cards.a3.includes('1건은 인용 정리 중'))
const judgedT = { ...TABLES, analysis_angles: [
  A('a1', 's1', { substantiation_verdict: 'SUBSTANTIATED', substantiation_evidence: 'Itchy after one wash' }),
  A('a4', 's1', { substantiation_verdict: 'SUBSTANTIATED', substantiation_evidence: 'Invented sentence never in any review' }),
] }
const judged = await render({}, judgedT)
t('판정 인용: 속성 인용과 겹치고 원문 일치 → blockquote', /<blockquote class="pub-insight-quote">Itchy after one wash<\/blockquote>/.test(judged.cards.a1))
t('판정 인용: 출처 모름(겹치는 인용 없음) → 숨김 + 정리 중', !judged.html.includes('Invented sentence') && /<p class="pub-caption">인용 정리 중/.test(judged.cards.a4))
const judgedFail = await render({ fail: { review_sources: '500' } }, judgedT)
t('판정 인용: 정책 맵 못 읽음 → 숨김', !judgedFail.cards.a1.includes('<blockquote class="pub-insight-quote">Itchy'))

console.error = quietErr; console.warn = quietWarn
if (process.argv.includes('--print')) console.log((html.match(/<article(?:(?!<article)[\s\S])*?문구 a1[\s\S]*?<\/article>/) ?? [''])[0])
console.log(`\ninsights-evidence-selftest: ${pass} pass / ${fail} fail${MUT ? ` (mutation ${process.env.INSIGHTS_EVIDENCE_MUTATE})` : ''}`)
process.exit(fail ? 1 : 0)
