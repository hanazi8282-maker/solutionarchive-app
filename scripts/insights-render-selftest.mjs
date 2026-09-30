#!/usr/bin/env node
// /insights 오프라인 렌더 셀프테스트 — 네트워크·DB·로그인 없음.
//   node scripts/insights-render-selftest.mjs
// 로그인후 화면은 로그인 없이 못 띄운다. 그래서 가짜 Supabase(로더 주입)로 loadInsightFeed 를 돌리고
// 그 결과를 InsightsView(서버 컴포넌트 본문)에 넣어 HTML 문자열을 검사한다 — 있음 · 0건 · 조회 실패 세 상태.
// 익명 nav 에 "인사이트" 링크가 없는지도 PubNav 를 email=null/있음 으로 렌더해 본다.
//
// .tsx 는 Node 가 못 읽으므로 로더 훅이 typescript.transpileModule 로 바꾼다(이미 devDependency).
// `@/` 별칭 → 리포 루트, next/link → <a> 스텁, .css → 빈 모듈.
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('../', import.meta.url).href
const TS = pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href
const HOOKS = `
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from ${JSON.stringify(TS)}
const ROOT = ${JSON.stringify(ROOT)}
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
    const src = await readFile(fileURLToPath(url), 'utf8')
    const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false }, fileName: fileURLToPath(url) })
    return { format: 'module', shortCircuit: true, source: out.outputText }
  }
  return next(url, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(HOOKS), pathToFileURL('./'))

const { createElement: h } = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { InsightsView } = await import(ROOT + 'app/insights/view.tsx')
const { PubNav } = await import(ROOT + 'app/_pub/components/PubNav.tsx')
const { loadInsightFeed, parseInsightQuery } = await import(ROOT + 'lib/insights/feed.ts')

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// 가짜 Supabase — 테이블별 행 또는 오류 코드.
const fakeSb = (tables, fail = {}) => ({
  from(table) {
    const rows = tables[table] ?? []
    const res = fail[table] ? { data: null, error: { code: fail[table], message: 'boom' }, count: null } : { data: rows, error: null, count: rows.length }
    const q = { select: () => q, range: () => q, then: (ok, ko) => Promise.resolve(res).then(ok, ko) }
    return q
  },
})
const A = (id, over = {}) => ({
  id, project_id: '11111111-1111-4111-8111-111111111111', aspect_id: 's1', angle_type: 'PAS', output_type: 'COPY', headline_draft: `문구 ${id}`,
  substantiation_verdict: 'SUBSTANTIATED', substantiation_reason: `사유 ${id}`, substantiation_evidence: `인용 ${id}`,
  headline_original: null, gate_rewritten: false, adaptation_suggestion: null, created_at: '2026-09-20T00:00:00Z', ...over,
})
const TABLES = {
  analysis_projects: [{ id: '11111111-1111-4111-8111-111111111111', product_elevator_pitch: '가짜 프로젝트', mode: 'forward', status: 'angled', created_at: '2026-09-01T00:00:00Z' }],
  analysis_aspects: [{ id: 's1', project_id: '11111111-1111-4111-8111-111111111111', name: '가짜 속성', quadrant: 'DIFFERENTIATOR' }],
  pmf_assessments: [{ target_project_id: '11111111-1111-4111-8111-111111111111', quadrant: 'PROVEN_DEMAND', match_status: 'matched', created_at: '2026-09-02T00:00:00Z' }],
  validated_angles_corpus: [{ angle_id: 'a1' }],
}
const render = async (sp, tables, failT = {}) => {
  const { query, errors } = parseInsightQuery(sp)
  const result = await loadInsightFeed(fakeSb(tables, failT), query)
  return renderToStaticMarkup(h(InsightsView, { query, errors, result }))
}
const count = (html, re) => (html.match(re) ?? []).length
const quiet = console.error; console.error = () => {}; console.warn = () => {}

// 1) 데이터 있음 — 통과 2 · 근거 없음 1 · 내부 메모 1
const withData = { ...TABLES, analysis_angles: [
  A('a1'),
  A('a2', { substantiation_verdict: 'EXPERIENTIAL', gate_rewritten: true, headline_original: '원래 문구 a2', created_at: '2026-09-21T00:00:00Z' }),
  A('u1', { substantiation_verdict: 'UNSUBSTANTIATED' }),
  A('i1', { output_type: 'PRODUCT_SPEC' }),
] }
const html = await render({}, withData)
t('있음: 카드 2장(article)', count(html, /<article class="pub-card"/g) === 2)
t('있음: 근거 없음·내부 메모 문구가 HTML 에 0', !html.includes('문구 u1') && !html.includes('문구 i1'))
t('있음: blockquote 는 SUBSTANTIATED 1장에만', count(html, /<blockquote class="pub-insight-quote">/g) === 1 && html.includes('인용 a1') && !html.includes('인용 a2'))
t('있음: 판정 칩 근거 있음(pos) · 체험 기반 · 순화됨(mix)', html.includes('pub-chip pub-chip--pos">근거 있음') && html.includes('>체험 기반<') && html.includes('pub-chip--mix'))
t('있음: 실전 채택 칩은 a1 에만', count(html, /실전 채택</g) === 1)
t('있음: 사분면 그룹 헤딩 = PMF 라벨 + 건수', html.includes('수요·선례 둘 다 있음') && /pub-libgroup-n">2건</.test(html))
t('있음: 카드 링크가 /analyze/{project}/angles', count(html, /href="\/analyze\/11111111-1111-4111-8111-111111111111\/angles"/g) === 2)
t('있음: Hero 캡션 = 통과 2 · 숨김 1', html.includes('게이트 통과 2건') && html.includes('근거 없음 1건 숨김'))
t('있음: 재작성 전 문구는 접힘 안에', html.includes('재작성 전: 원래 문구 a2'))
t('있음: 경고 패널 없음', !html.includes('확인 불가. 앵글 조회 실패'))
const allHtml = await render({ gate: 'all' }, withData)
t('gate=all: 근거 없음 카드가 negative 칩으로', allHtml.includes('문구 u1') && allHtml.includes('pub-chip pub-chip--neg">근거 없음') && !allHtml.includes('문구 i1'))

// 2) 0건 — 조회는 정상, 게이트 통과 0
const emptyHtml = await render({}, { ...TABLES, analysis_angles: [A('u1', { substantiation_verdict: 'UNSUBSTANTIATED' })] })
t('0건: 빈 상태 문구(문서 그대로)', emptyHtml.includes('게이트를 통과한 앵글이 아직 없다') && emptyHtml.includes('조회는 정상이다'))
t('0건: 숨긴 근거 없음 1건 + 전부 보기 링크', emptyHtml.includes('숨긴 근거 없음 1건') && emptyHtml.includes('href="/insights?gate=all"'))
t('0건: 카드 0 · 경고 패널 0', count(emptyHtml, /<article/g) === 0 && !emptyHtml.includes('확인 불가'))
const filteredEmpty = await render({ quadrant: 'PARK' }, withData)
t('필터 0건: "이 조건에 맞는 앵글이 없다" + 필터 없이 보기', filteredEmpty.includes('이 조건에 맞는 앵글이 없다') && filteredEmpty.includes('필터 없이 보기'))

// 3) 조회 실패 — "확인 불가", 0건 문구로 접지 않는다
for (const tb of ['analysis_angles', 'pmf_assessments']) {
  const errHtml = await render({}, withData, { [tb]: '500' })
  t(`실패(${tb}): 확인 불가 패널`, errHtml.includes('확인 불가. 앵글 조회 실패'))
  t(`실패(${tb}): 빈 상태·카드·필터 0`, !errHtml.includes('아직 없다') && count(errHtml, /<article/g) === 0 && !errHtml.includes('pub-facets'))
}
const valFail = await render({}, withData, { validated_angles_corpus: 'PGRST205' })
t('validated 만 실패: 카드는 나오고 "실전 채택 칩 확인 불가" 캡션', count(valFail, /<article/g) === 2 && valFail.includes('실전 채택 칩 확인 불가'))

// 4) nav — 익명엔 링크 없음, 로그인이면 있음
const anon = renderToStaticMarkup(h(PubNav, { email: null }))
const authed = renderToStaticMarkup(h(PubNav, { email: 'someone@example.com' }))
t('nav 익명: 인사이트 링크 0', !anon.includes('/insights') && !anon.includes('인사이트'))
t('nav 로그인: 5번째 링크 인사이트', /href="\/voc"[^]*href="\/insights"[^>]*>인사이트</.test(authed))
console.error = quiet

// 5) 판정색 글자 금지(I1-4): 카드 파일에 color 라는 낱말 0
const { readFileSync } = await import('node:fs')
t('PubInsightCard.tsx 에 "color" 0줄', !/color/i.test(readFileSync(new URL('../app/_pub/components/PubInsightCard.tsx', import.meta.url), 'utf8')))

console.log(`\ninsights-render-selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
