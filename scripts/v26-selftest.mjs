#!/usr/bin/env node
// v71dm v2.6 판정 기준 **후보** 셀프테스트(운영 미적용) — 가짜 LLM 만(네트워크·DB 없음).
//   node scripts/v26-selftest.mjs
//
// 지키는 것: (e) v2.6 은 추가 전용 — v2.4 이하·t2d 해시 불변, relevance-judge.ts 운영 선택 무변경, 예시는 지어낸 것
// (f) v26-compare: 입력 검증·--dry 통계·가짜 호출로 뒤집힘 출력  (g) 변이 — 일부러 깨면 위 검사가 잡는다

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const AREAS = ['① 회의록·통화 요약', '③ 마케팅 콘텐츠·광고 소재', '⑧ 업무관리']

async function checks(V) {
  const fails = []
  let pass = 0
  const ok = (c, name) => { if (c) pass++; else fails.push(name) }
  const a = AREAS
  const C = await import('../lib/analysis/relevance-criteria.ts')
  const v24 = C.relevanceCriteriaV24(a), v26 = V.relevanceCriteriaV26(a)
  ok(V.RELEVANCE_V26_VERSION === 'v26-2026-11-23' && v26.includes(`## 판정 기준 v2.6 (기준 버전 ${V.RELEVANCE_V26_VERSION})`), '(e) v2.6 버전 태그')
  const back = v26.replace(`기준 버전 ${V.RELEVANCE_V26_VERSION}`, `기준 버전 ${C.RELEVANCE_V24_VERSION}`).replace('## 판정 기준 v2.6', '## 판정 기준 v2.4')
  ok(back === v24 + V.RELEVANCE_V26_BLOCK, '(e) 머리글만 되돌리면 v2.4 본문 + v2.6 블록뿐(추가 전용)')
  ok([v26.indexOf('(17)'), v26.indexOf('(21) 개발자·관리자'), v26.indexOf('(22) 지나가는 언급'), v26.indexOf('(23) 약한 정보도 정보다')].every((x, i, xs) => x > 0 && (i === 0 || x > xs[i - 1])), '(e) (21)~(23) 이 (17) 뒤에 순서대로')
  const B = V.RELEVANCE_V26_BLOCK
  ok(['버그 리포트', '소스 코드', '플러그인 제작자', '자가 설치·운영', 'info=false', 'info=true', '오류가 아니다', '앱스토어·구글 플레이'].every((s) => B.includes(s)), '(e) 블록에 세 규칙의 요소(개발자 대상 4종·지나가는 언급·약한 정보·후기 면제)')
  ok(!/https?:|[0-9a-f]{8}-[0-9a-f]{4}-|mautic|suitecrm|obsidian|hacker\s?news/i.test(B), '(e) 블록에 URL·uuid·실제 소스/제품 이름 없음(지어낸 예시만)')
  const { buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  const P = { product_elevator_pitch: 'p', business_model: 'saas' }, R = [{ input_id: 'x', text: 't' }]
  const sys24 = buildRelevancePrompt(P, R, [], { criteria: 'v24', areas: a }).system
  const sys26 = V.systemV26FromV24(sys24, a)
  const { UNTRUSTED_INPUT_NOTICE } = await import('../lib/llm/untrusted-input.ts')
  ok(sys26.includes(UNTRUSTED_INPUT_NOTICE), '(e) v2.6 system 도 외부 입력 경고 문구를 그대로 싣는다')
  ok(sys26.includes('아래 판정 기준 v2.6 로') && !sys26.includes('판정 기준 v2.4') && sys26.replace(v26, v24).replace('아래 판정 기준 v2.6 로', '아래 판정 기준 v2.4 로') === sys24, '(e) v2.6 system = v2.4 system 에서 기준 블록·한 줄만 바뀜')
  let threw = false; try { V.systemV26FromV24(buildRelevancePrompt(P, R, [], { criteria: 'v22' }).system, a) } catch { threw = true }
  ok(threw, '(e) v2.4 프롬프트가 아니면 던진다(조용히 v2.4 로 판정하지 않음)')
  return { pass, fails }
}

let total = 0, fail = 0
const sh = (c, n) => { if (c) total++; else { fail++; console.error(`✗ ${n}`) } }
const r = await checks(await import('../lib/analysis/relevance-criteria-v26.ts'))
total += r.pass; fail += r.fails.length
for (const f of r.fails) console.error(`✗ ${f}`)

// (e) v2.6 이 운영을 안 바꾼다 — 해시(analyze-relevance-selftest 와 같은 값) + 운영 선택 로직에 v26 없음
{
  const C = await import('../lib/analysis/relevance-criteria.ts')
  const S = await import('../lib/analysis/second-opinion.ts')
  const { buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  const h = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16)
  const a = AREAS
  const P = { product_elevator_pitch: 'p', business_model: 'saas' }, R = [{ input_id: 'x', text: 't' }]
  const frozen = {
    t2d: h(C.RELEVANCE_CRITERIA), info: h(C.PRODUCT_INFORMATIVE_CRITERIA), ver: C.RELEVANCE_CRITERIA_VERSION,
    v21: h(C.RELEVANCE_CRITERIA_V21), v22: h(C.RELEVANCE_CRITERIA_V22), v23: h(C.relevanceCriteriaV23(a)), v24: h(C.relevanceCriteriaV24(a)),
    sys24: h(buildRelevancePrompt(P, R, [], { criteria: 'v24', areas: a }).system), sec24: h(S.secondOpinionInstructionsV24(a)),
  }
  const want = { t2d: '03e8b059cd199d7f', info: 'c8d44049eb77d351', ver: 't2d-2026-09-28', v21: '4891de61b3afef7d', v22: 'a543abb21bc52814', v23: '198e8bec6b80b6d9', v24: '0b14c02f2ddfb851', sys24: 'c0600c2717900365', sec24: 'f2bd5d96769ab518' }
  sh(JSON.stringify(frozen) === JSON.stringify(want), `(e) v2.4 이하·t2d·운영 v24 system·2차 지시문 해시 불변 ${JSON.stringify(frozen) === JSON.stringify(want) ? '' : JSON.stringify(frozen)}`)
  sh(!/v26|V26|relevance-criteria-v26/.test(read('lib/analysis/relevance-judge.ts') + read('lib/analysis/relevance-criteria.ts') + read('lib/analysis/second-opinion.ts')), '(e) 운영 판정 파일(relevance-judge·criteria·second-opinion)에 v26 이 없다')
  sh(!/v26/.test(['nightly-relevance.yml', 'relevance-approve-only.yml'].map((f) => read(`.github/workflows/${f}`)).join('\n')), '(e) 워크플로가 v26 을 켜지 않는다')
  sh(/^\s+- run: node scripts\/v26-selftest\.mjs\s*$/m.test(read('.github/workflows/build-check.yml')), '(e) build-check 에 이 셀프테스트가 등록돼 있다')
}

// (f) v26-compare
{
  const X = await import('./v26-compare.mjs')
  const a = AREAS
  const rows = [
    { input_id: 'k1', text: 'X 는 검색이 느려서 답답하다', project_purpose: '노트 앱 기획', source_key: 'forum_a' },
    { key: 'k2', text: 'Your software\nMy Acme version is: 4.1.0\nThe scheduler does nothing.', project: { pitch: 'p1', business_model: 'saas' }, source_key: 'forum_b', gold: { verdict: 'irrelevant', informative: false } },
    { key: 'k3', text: 'crash only', project: { pitch: 'p2', business_model: 'saas' }, source_key: 'forum_c' },
  ]
  const vr = X.validateRows(rows)
  sh(vr.errors.length === 0 && vr.rows.map((r) => r.key).join() === 'k1,k2,k3', '(f) 입력: input_id·project_purpose·gold 없음도 받는다(v25 입력 모양도)')
  sh(X.validateRows([rows[0], { ...rows[0] }]).errors.length === 1 && X.validateRows([{ key: 'z', text: 't' }]).errors.length === 1 && X.validateRows([{ ...rows[1], gold: { verdict: 'unknown', informative: 1 } }]).errors.length === 2 && X.validateRows([]).errors.length === 1 && X.validateRows({}).rows.length === 0, '(f) 중복 키·목적 없음·gold 형식 오류·빈 입력 거부')
  const st = X.promptStats(vr.rows, a)
  sh(st.v24.prompt_version === 'v24-2026-10-27' && st.v26.prompt_version === 'v26-2026-11-23' && st.v26.system_chars > st.v24.system_chars && st.v24.batches === 3, '(f) --dry 통계: 버전·system 길이·묶음 수(호출 없음)')
  const seen = []
  const call = async (system, user) => {
    seen.push(system)
    const on26 = system.includes('아래 판정 기준 v2.6 로')
    const labels = user.match(/^R\d+\./gm).map((l) => l.slice(0, -1))
    if (on26 && user.includes('crash only')) throw new Error('boom')
    return { model: 'fake', text: JSON.stringify(labels.map((id) => ({ id, rel: on26 && user.includes('My Acme') ? 'irrelevant' : 'relevant', info: !(on26 && user.includes('My Acme')), why: on26 ? 'v26' : 'v24' }))) }
  }
  const prev = process.env.LLM_PROVIDER
  process.env.LLM_PROVIDER = 'gemini'
  let res
  try { res = await X.runCompare(vr.rows, a, { call }) } finally { if (prev === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = prev }
  const { buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  sh(seen.length === 6 && seen.filter((s) => s.includes('아래 판정 기준 v2.6 로')).length === 3 && seen.filter((s) => s.includes('아래 판정 기준 v2.4 로')).length === 3, '(f) v24·v26 각 묶음 수만큼 호출, 기준이 맞게 실린다')
  sh(seen.slice(0, 3).every((s) => s === buildRelevancePrompt({ purpose: null, product_elevator_pitch: 'p1', business_model: 'saas' }, [{ input_id: 'k2', text: 'y' }], [], { criteria: 'v24', areas: a }).system), '(f) v24 쪽은 운영 v24 system 그대로')
  const k2 = res.rows.find((x) => x.key === 'k2')
  sh(res.flipped.join() === 'k2' && k2.v24.rel === 'relevant' && k2.v26.rel === 'irrelevant', `(f) 뒤집힘 = k2 만 ${JSON.stringify(res.flipped)}`)
  sh(res.rows.find((x) => x.key === 'k3').v26.rel === null && !res.flipped.includes('k3') && res.summary.v26.judged_with_gold === 1, '(f) 호출 오류는 rel=null — 뒤집힘으로 세지 않는다')
  const cs = read('scripts/v26-compare.mjs')
  sh(!/supabase|SERVICE_ROLE/i.test(cs.replace(/^\/\/.*$/gm, '')) && cs.includes("if (!run) {") && cs.includes("{ criteria: 'v24', areas }"), '(f) DB·서비스 키 없음 · --run 이 있어야만 부른다 · 운영 v24 경로로 부른다')
}

// (g) 변이 — 후보 모듈을 임시 폴더에 복사해 한 곳만 바꾼다(다른 import 는 진짜 lib 로).
const LIB = join(ROOT, 'lib/analysis')
const libUrl = pathToFileURL(LIB + '/').href
const FILE = 'relevance-criteria-v26.ts'
const orig = readFileSync(join(LIB, FILE), 'utf8')
const base = mkdtempSync(join(tmpdir(), 'v26-mut-'))
const mutants = [
  ['규칙 (23) 빠짐', "  '(23) 약한 정보도 정보다", "  '(23x) 빠짐"],
  ['v2.4 아닌 프롬프트도 받음', "if (out.includes('판정 기준 v2.4') || !out.includes('(23) 약한 정보도 정보다') || !out.includes('아래 판정 기준 v2.6 로')) throw", 'if (false) throw'],
  ['실제 소스 이름 예시 섞임', '지어낸 예: "회의 끝나고', '지어낸 예: "mautic 회의 끝나고'],
]
const mut = []
for (const [i, [name, from, to]] of mutants.entries()) {
  if (!orig.includes(from)) { fail++; console.error(`✗ (g) 변이 지점 없음: ${name}`); continue }
  const dir = join(base, `m${i}`)
  mkdirSync(dir)
  writeFileSync(join(dir, FILE), orig.replace(from, to).replace(/from '\.\/([^']+)'/g, (m, dep) => `from '${libUrl}${dep}'`))
  let m
  try { m = await checks(await import(pathToFileURL(join(dir, FILE)).href)) } catch (e) { m = { fails: [`예외 ${e.message}`] } }
  mut.push({ 변이: name, 잡힌검사: m.fails.length })
  sh(m.fails.length > 0, `(g) 변이 "${name}" 를 검사가 잡는다(${m.fails.length}건 실패)`)
}
console.table(mut)

console.log(`v26 selftest: ${total} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
