#!/usr/bin/env node
// /cases/report `#pmf` PMF 판정(자가진단) 오프라인 렌더 셀프테스트(P4) — 네트워크·DB·로그인 없음.
//   node scripts/idea-pmf-render-selftest.mjs            # 검사
//   node scripts/idea-pmf-render-selftest.mjs --mutate   # 소스를 일부러 망가뜨린 변이 5개가 **각각 실패해야** 통과
//
// 서버 섹션(pmf-section.tsx)을 익명/로그인으로 그려 서버 절단을 확인하고, 클라이언트 패널의 상태 조각
// (PmfDone·PmfNoMatch·PmfFailure·BottleneckBadge)을 가짜 실행 행으로 renderToStaticMarkup 한다.
// 로더 훅은 insights-render-selftest.mjs 와 같다(.tsx → typescript.transpileModule, `@/` 별칭, next/link 스텁).
// 변이는 로더가 소스 문자열을 바꿔 적용한다 — 셀프테스트 대상 코드에 변이 플래그를 넣지 않는다.
import { createRequire, register } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ROOT = new URL('../', import.meta.url).href
const SELF = fileURLToPath(import.meta.url)

/** 변이: [파일 끝부분, 찾을 문자열, 바꿀 문자열]. 찾을 문자열이 없으면 변이가 헛돈 것이라 실패로 친다. */
const MUTANTS = {
  gate: ['app/cases/report/pmf-section.tsx', 'if (!signedIn) {', 'if (false) {'],
  label: ['app/cases/report/pmf-panel.tsx', 'label={PMF_DEMAND_LABEL}', 'label="수요축"'],
  zero: ['app/cases/report/pmf-panel.tsx', 'if (d === null || p === null || quad === null) {', 'if (false) {'],
  limited: ['app/cases/report/pmf-panel.tsx', "kind === 'limited' ? '확인 불가. 사용 한도에 걸렸다'", "kind === 'limited' ? '확인 불가. 판정이 끝나지 못했다'"],
  advice: ['app/cases/report/pmf-panel.tsx', '{PMF_QUADRANT_ADVICE[quad]}', "{'선례 무브를 옮겨 붙여라'}"],
}

if (process.argv.includes('--mutate')) {
  let bad = 0
  for (const [name, [file, find]] of Object.entries(MUTANTS)) {
    if (!readFileSync(fileURLToPath(ROOT + file), 'utf8').includes(find)) { console.log(`❌ 변이 ${name}: 대상 문자열이 소스에 없다(변이가 헛돈다)`); bad++; continue }
    const r = spawnSync(process.execPath, [SELF, `--mutant=${name}`], { encoding: 'utf8' })
    if (r.status === 0) { console.log(`❌ 변이 ${name}: 통과해 버렸다 — 검사가 이 고장을 못 잡는다`); bad++ } else console.log(`✅ 변이 ${name}: 실패(기대대로)`)
  }
  console.log(bad ? `\n변이 ${bad}건이 살아남았다` : `\n변이 ${Object.keys(MUTANTS).length}건 전부 잡힘`)
  process.exit(bad ? 1 : 0)
}

const mutantName = process.argv.find((a) => a.startsWith('--mutant='))?.slice(9) ?? null
const mutant = mutantName ? MUTANTS[mutantName] : null
if (mutantName && !mutant) { console.log(`모르는 변이: ${mutantName}`); process.exit(2) }

const TS = pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href
const HOOKS = `
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from ${JSON.stringify(TS)}
const ROOT = ${JSON.stringify(ROOT)}
const MUT = ${JSON.stringify(mutant)}
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
  if (url === 'stub:nav') return { format: 'module', shortCircuit: true, source: 'export function redirect(u) { throw new Error("redirect " + u) } export const usePathname = () => "/cases/report"; export const useRouter = () => ({ push() {}, refresh() {} })' }
  if (url === 'stub:css') return { format: 'module', shortCircuit: true, source: '' }
  if (/\\.tsx?$/.test(url) && url.startsWith(ROOT)) {
    let src = await readFile(fileURLToPath(url), 'utf8')
    if (MUT && url === ROOT + MUT[0]) src = src.split(MUT[1]).join(MUT[2])
    const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false }, fileName: fileURLToPath(url) })
    return { format: 'module', shortCircuit: true, source: out.outputText }
  }
  return next(url, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(HOOKS), pathToFileURL('./'))

const { createElement: h } = await import('react')
const { renderToStaticMarkup } = await import('react-dom/server')
const { PmfSection, PMF_LOCK } = await import(ROOT + 'app/cases/report/pmf-section.tsx')
const { PmfDone, PmfNoMatch, PmfFailure, BottleneckBadge, PMF_AI_BADGE, PMF_AI_NOTE } = await import(ROOT + 'app/cases/report/pmf-panel.tsx')
const { PMF_DEMAND_LABEL, PMF_CAPTION } = await import(ROOT + 'lib/cases/idea-pmf.ts')
const { PMF_QUADRANT_LABELS, PMF_QUADRANT_ADVICE, quadrantOf } = await import(ROOT + 'lib/cases/match.ts')

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }
const html = (el) => renderToStaticMarkup(el)
const count = (s, needle) => s.split(needle).length - 1
/** React 가 텍스트에 거는 이스케이프(& < > " '). 문구 바이트 동일 비교용. */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

const ANCHORS = { 'm-1': { slug: 'secret-anchor-slug', brand: '앵커브랜드' } }
const RUN = (over = {}) => ({
  run_id: '11111111-1111-4111-8111-111111111111', status: 'done', kind: 'saas',
  bottleneck: 'TRUST', bottleneck_source: 'llm', bottleneck_confidence: 'high', bottleneck_reason: '처음 보는 팀이라 결제를 못 맡긴다',
  match_status: 'matched', match_reason: 'TRUST 승인 무브 3건 · 케이스 2곳', matched_case_move_ids: ['m-1'],
  salient: [{ factor: '결제 신뢰', why: '선례는 환불 보장으로 첫 결제를 열었다', anchor_move_id: 'm-1' }],
  questions: [{ id: 'q1', factor: '결제 신뢰', question: '첫 결제 불안을 어떻게 낮추나', anchor_move_id: 'm-1' }, { id: 'q2', factor: '대안 격차', question: '엑셀 대비 무엇이 빠른가', anchor_move_id: null }],
  precedent_axis: 0.8, demand_axis: 0.65, is_self_reported: true, quadrant: 'PROVEN_DEMAND',
  answers: [
    { question_id: 'q1', factor: '결제 신뢰', question: '첫 결제 불안을 어떻게 낮추나', anchor_move_id: 'm-1', answer_text: '첫 달은 무료로 쓰고 해지하면 바로 환불한다.', importance: 8, satisfaction: 3, opportunity_score: 13, evidence_quote: '첫 달은 무료로 쓰고 해지하면 바로 환불한다.', notes: '구체적', is_self_reported: true },
    { question_id: 'q2', factor: '대안 격차', question: '엑셀 대비 무엇이 빠른가', anchor_move_id: null, answer_text: null, importance: null, satisfaction: null, opportunity_score: null, evidence_quote: null, notes: null, is_self_reported: true },
  ],
  llm_calls: 3, models: ['claude-sonnet-5-5'], cost_usd: 0.1, cache_read_tokens: null, error: null,
  created_at: '2026-10-01T00:00:00Z', started_at: '2026-10-01T00:00:00Z', answered_at: '2026-10-01T00:01:00Z', finished_at: '2026-10-01T00:01:30Z',
  ...over,
})

// ── 1. 서버 절단: 익명은 잠금 줄 한 줄, 패널·폼·앵커·실행 데이터 0 ──
const anon = html(h(PmfSection, { signedIn: false, q: '프리랜서 인보이스', kind: 'saas', next: '/cases/report?q=x', anchors: ANCHORS }))
t('익명: id="pmf" 1회', count(anon, 'id="pmf"') === 1)
t('익명: 잠금 문장', anon.includes(esc(PMF_LOCK)))
t('익명: 로그인 버튼(next 유지)', anon.includes('href="/login?next=%2Fcases%2Freport%3Fq%3Dx"') && anon.includes('>로그인<'))
t('익명: 패널 0', !anon.includes('pub-pmf-panel'))
t('익명: 입력 필드 0', !anon.includes('core_feature') && !anon.includes('<form') && !anon.includes('<input'))
t('익명: 앵커 슬러그 0', !anon.includes('secret-anchor-slug'))
t('익명: 수요축 라벨 0', !anon.includes('수요축'))

// ── 2. 로그인: 패널 S0 입력 폼(자동 시작 없음) ──
const member = html(h(PmfSection, { signedIn: true, q: '프리랜서 인보이스', kind: 'saas', next: '/cases/report?q=x', anchors: ANCHORS }))
t('로그인: id="pmf" 1회', count(member, 'id="pmf"') === 1)
t('로그인: 패널 1', count(member, 'class="pub-pmf-panel"') === 1)
for (const k of ['core_feature', 'customer', 'price', 'alternative', 'bottleneck_override']) t(`로그인: 필드 ${k}`, member.includes(`name="${k}"`))
t('로그인: 필수 2칸만 required', count(member, 'required=""') === 2)
t('로그인: 병목 선택 7어휘 + 기본', count(member, '<option') === 8 && member.includes('AI 가 읽게 두기'))
t('로그인: 시작 버튼', member.includes('PMF 판정 시작'))
t('로그인: 잠금 줄 0', !member.includes(esc(PMF_LOCK)))
t('로그인: 개인정보 캡션', member.includes('Anthropic'))

// ── 3. S5 완료: 수요축 라벨·사분면 문구 원문·고정 캡션·건너뜀 ──
const run = RUN()
const done = html(h(PmfDone, { run }))
const expectQ = quadrantOf(run.demand_axis, run.precedent_axis).quadrant
t('완료: quadrantOf 와 행 사분면 일치(픽스처 점검)', expectQ === run.quadrant)
t('완료: 라벨 정확히 "수요축 (자가진단)"', PMF_DEMAND_LABEL === '수요축 (자가진단)' && done.includes(`>${PMF_DEMAND_LABEL}<`))
t('완료: 수요축 값 0.65', done.includes('>0.65<'))
t('완료: 선례축 값 0.80', done.includes('>0.80<'))
t('완료: 사분면 라벨 원문', done.includes(esc(PMF_QUADRANT_LABELS[expectQ])))
t('완료: 권고 원문(바이트 동일)', done.includes(esc(PMF_QUADRANT_ADVICE[expectQ])))
t('완료: 고정 캡션', done.includes(esc(PMF_CAPTION)))
t('완료: 건너뜀 표시', done.includes('건너뜀 · 점수 없음'))
t('완료: 인용(내 답변 문장)', done.includes('“첫 달은 무료로 쓰고 해지하면 바로 환불한다.”'))
t('완료: 기회 13', done.includes('기회 13'))
t('완료: 종합 점수·합격 표현 0', !/총점|종합 점수|합격|확정/.test(done))
t('완료: 계측 줄', done.includes('호출 3회'))

// ── 4. 완료인데 축이 비었다 → 확인 불가, 0 으로 그리지 않는다 ──
for (const over of [{ demand_axis: null }, { precedent_axis: null }, { quadrant: null }]) {
  const k = Object.keys(over)[0]
  const x = html(h(PmfDone, { run: RUN(over) }))
  t(`완료·${k} 비어 있음: 확인 불가`, x.includes('확인 불가'))
  t(`완료·${k} 비어 있음: 0.00 없음`, !x.includes('0.00'))
  t(`완료·${k} 비어 있음: 사분면 권고 없음`, !Object.values(PMF_QUADRANT_ADVICE).some((a) => x.includes(esc(a))))
}

// ── 5. 확인 불가 3종(실패·한도·기록 못 읽음)은 제목이 서로 다르다 ──
const fails = ['failed', 'limited', 'lookup'].map((kind) => html(h(PmfFailure, { kind, error: '사유 한 줄' })))
const titles = fails.map((s) => s.match(/<h3[^>]*>([^<]*)<\/h3>/)?.[1] ?? s.match(/확인 불가[^<]*/)?.[0] ?? '')
t('확인 불가 3종: 전부 "확인 불가"', fails.every((s) => s.includes('확인 불가')))
t('확인 불가 3종: 제목 3개가 서로 다르다', new Set(titles).size === 3 && titles.every(Boolean))
t('확인 불가 3종: 숫자 칸 없음', fails.every((s) => !s.includes('pub-stat')))
t('기록 못 읽음: "없다는 뜻이 아니다"', fails[2].includes('판정 결과가 없다는 뜻이 아니다'))

// ── 6. 해당 없음(no_match): 사분면·수요축 없이 사유와 병목 ──
const nm = html(h(PmfNoMatch, { run: RUN({ status: 'no_match', match_status: 'no_match', match_reason: '조회는 정상인데 SUPPLY 선례가 0건이다', demand_axis: null, quadrant: null, precedent_axis: 0, questions: [], answers: [] }), onChange: () => {} }))
t('해당 없음: 제목', nm.includes('해당 없음. 비슷한 사례가 없다'))
t('해당 없음: 사유', nm.includes('조회는 정상인데 SUPPLY 선례가 0건이다'))
t('해당 없음: 사분면·수요축 0', !nm.includes('수요축') && !Object.values(PMF_QUADRANT_LABELS).some((l) => nm.includes(esc(l))))
t('해당 없음: 다른 병목 선택', nm.includes('name="bottleneck_change"'))

// ── 7. 병목 배지: 출처·확신 ──
const low = html(h(BottleneckBadge, { run: RUN({ bottleneck_confidence: 'low' }) }))
t('배지: 병목 AI 판독 · 확신 낮음', low.includes(`${PMF_AI_BADGE} · 확신 낮음`) && low.includes('확신 낮음. 병목을 직접 골라'))
t('배지: AI 판독 안내 한 줄(v10)', low.includes(PMF_AI_NOTE) && PMF_AI_BADGE === '병목 AI 판독')
const mine = html(h(BottleneckBadge, { run: RUN({ bottleneck_source: 'user', bottleneck_confidence: null }) }))
t('배지: 내가 고름 · AI 판독 표시 0', mine.includes('내가 고름') && !mine.includes(PMF_AI_BADGE) && !mine.includes(PMF_AI_NOTE))

// ── 8. 페이지 배선(정적): 섹션·목차·앵커는 로그인후만 ──
const page = readFileSync(fileURLToPath(ROOT + 'app/cases/report/page.tsx'), 'utf8')
t('페이지: <PmfSection 1회', count(page, '<PmfSection') === 1)
t('페이지: 익명 TOC 에도 pmf(잠금 줄 자리, v10)', /const TOC = \[[^\n]*\['pmf', 'PMF 사분면'\]/.test(page))
t('페이지: TOC_MEMBER 에 pmf', /TOC_MEMBER = \[[^\n]*\['pmf', 'PMF 사분면'\]/.test(page))
t('페이지: 앵커는 if (signedIn) 안에서만 채운다', /if \(signedIn\) \{\s*for \(const m of corpora\.moves/.test(page) && page.includes('anchors={signedIn ? pmfAnchors : undefined}'))
const panelSrc = readFileSync(fileURLToPath(ROOT + 'app/cases/report/pmf-panel.tsx'), 'utf8')
t('패널: 글자색 코드 0', !/color/i.test(panelSrc))
t('패널: 점수 낱말은 opportunity_score 뿐', (panelSrc.match(/score/gi) ?? []).length === (panelSrc.match(/opportunity_score/g) ?? []).length)

console.log(`${mutantName ? `[변이 ${mutantName}] ` : ''}${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
