#!/usr/bin/env node
// 리뷰 관련성 판정 수기 채점 표본(T3) — 남헌이 손으로 채점할 표를 뽑는다.
//
//   node --env-file=.env.local scripts/relevance-grading-sample.mjs
//   node --env-file=.env.local scripts/relevance-grading-sample.mjs --n 10 --seed 42 --dry
//
// 왜 있나: 게이트를 넣으면 "무관 비율" 의 측정자와 필터가 같은 모델이 된다. 그 숫자로 정밀도를
// 주장할 수 없다(remedy-grading-sample.mjs 와 같은 이유). 그래서 모델이 관련/무관으로 판정한 것에서
// 반반 섞어 뽑고, 사람이 채점한 결과를 relevance-grading-import.mjs 로 되돌려 넣는다.
//
// ★ 이 스크립트는 아무것도 채점하지 않는다. 체크박스는 전부 비어 있다. LLM 을 부르지 않는다.
//   unknown 판정은 표본에 넣지 않는다 — 채점해도 모델 정밀도를 재지 못한다.
//
// 종료코드: 0 성공(모집단 0건 포함) · 2 환경·조회 실패 · 64 사용법 오류

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { impactFrequencyTags, pickGradingSample } from '../lib/analysis/relevance-judge.ts'
import { AUDIT_DAILY } from '../lib/analysis/auto-approval.ts'
import { RR39_NARROW_IRRELEVANT_INPUT_IDS } from '../lib/analysis/relevance-criteria.ts'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

const n = Number(opt('n') ?? 10)
// 자동 승인 감사 표본(CLAUDE.md §10.1 예외 조건 3) — 같은 표·같은 칸·같은 import 로 들어간다. 새 화면·새 테이블 없음.
const audit = Number(opt('audit') ?? AUDIT_DAILY)
if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(audit) || audit < 0) { console.error('사용법: [--n 10] [--audit 5] [--seed 42] [--recheck <eval.json>] [--out <경로.md>] [--dry]'); process.exit(64) }
const seed = Number(opt('seed') ?? 42)

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const outPath = opt('out') ?? `reports/${today}/${opt('recheck') ? 'relevance-recheck' : 'relevance-grading-sample'}.md`

// --recheck <eval.json>: t2-approval-eval.mjs 가 낸 재확인 목록으로 표를 만든다(모집단 표본 대신). 좁은 기준 8건은 항상 넣는다.
const recheckPath = opt('recheck')
let recheck = null
if (recheckPath) {
  try {
    const listed = JSON.parse(readFileSync(recheckPath, 'utf8')).recheck
    if (!Array.isArray(listed)) throw new Error('recheck 배열이 없다')
    recheck = new Map(listed.map((r) => [r.input_id, r.reason]))
  } catch (e) { console.error(`✗ --recheck 파일을 읽지 못했다(${recheckPath}): ${e.message}`); process.exit(64) }
  for (const id of RR39_NARROW_IRRELEVANT_INPUT_IDS) recheck.set(id, 'b')
}

const supabase = await createClient()
if (!supabase) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

// 모집단 = 아직 사람이 채점하지 않은 관련/무관 판정. 재확인 모드는 목록의 행 그대로(사람 채점이 있어도 — 다시 묻는 것이 목적이다).
let q = supabase
  .from('review_relevance_verdicts')
  // '*' — T2 라벨 컬럼(20260930000014)이 아직 없는 DB 에서도 죽지 않게 이름을 부르지 않는다.
  .select('*')
q = recheck ? q.in('input_id', [...recheck.keys()]) : q.in('verdict', ['relevant', 'irrelevant']).is('human_verdict', null)
const { data: verdicts, error } = await q
if (error) { console.error(`✗ 판정 조회 실패: ${error.code ?? ''} ${error.message}`); process.exit(2) }
if (recheck && (verdicts ?? []).length !== recheck.size) {
  const got = new Set((verdicts ?? []).map((v) => v.input_id))
  console.error(`✗ 재확인 ${recheck.size}건 중 판정 행 ${(verdicts ?? []).length}건만 읽힘 — 빠진 id: ${[...recheck.keys()].filter((id) => !got.has(id)).slice(0, 5).join(', ')}`)
  process.exit(2)
}

if (!verdicts || verdicts.length === 0) {
  console.log('모집단 0건 — 아직 채점할 판정이 없다(실패가 아니다). 먼저 scripts/relevance-judge-auto.mjs 를 돌려라.')
  process.exit(0)
}

// ⚠️ 2026-09-24: 판정이 780건이 되자 `.in('id', 전부)` 한 방이 PostgREST 에서 "Bad Request" 로
//    죽었다 — uuid 780개가 GET 쿼리스트링 상한을 넘긴다(남헌 실측). 200개씩 끊어 묻는다.
//    묶음 하나라도 실패하면 전체 실패로 보고한다 — 일부만 받아 놓고 "원문 없음"으로 접으면
//    그 행이 조용히 표본에서 빠진다(§7.1).
const IN_CHUNK = 200
const textById = new Map()
const allIds = verdicts.map((v) => v.input_id)
for (let i = 0; i < allIds.length; i += IN_CHUNK) {
  const ids = allIds.slice(i, i + IN_CHUNK)
  const { data: inputs, error: inputsError } = await supabase
    .from('analysis_inputs')
    .select('id, raw_text')
    .in('id', ids)
  if (inputsError) { console.error(`✗ 원문 조회 실패(${i + 1}~${i + ids.length}/${allIds.length}): ${inputsError.code ?? ''} ${inputsError.message}`); process.exit(2) }
  for (const row of inputs ?? []) textById.set(row.id, row.raw_text ?? '')
}

const { data: projects } = await supabase.from('analysis_projects').select('id, product_elevator_pitch')
const projectById = new Map((projects ?? []).map((p) => [p.id, p.product_elevator_pitch ?? '(소개 없음)']))

// 원문이 폐기된 행(raw_text null)은 채점할 게 없다.
const pool = verdicts
  .filter((v) => (textById.get(v.input_id) ?? '').trim().length > 0)
  .map((v) => ({
    input_id: v.input_id,
    verdict: v.verdict,
    reason: v.reason,
    tags: impactFrequencyTags(v),
    project: projectById.get(v.project_id) ?? '(프로젝트 미상)',
    text: textById.get(v.input_id),
    auto: Boolean(v.auto_approved_at),
  }))

const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*[\r\n]+\s*/g, ' ').trim()
const cut = (s, n2) => (String(s ?? '').length > n2 ? `${String(s).slice(0, n2)}…` : String(s ?? ''))
// 정보 열 두 칸(rr-v2 추가 질문) — 머리글 이름으로 import 가 찾는다(parseGradingMarkdown). 이름을 바꾸지 않는다.
const INFO_HOWTO = [
  '**정보 열**(자동 승인 추가 질문, 관련과 따로): 독자가 이 제품을 판단하는 데 쓸 구체 정보(장단점·비교·비용·수수료·요금제·기능 유무·쓰는/떠난 이유)가',
  '원문에 있으면 `정보있음`, 정보 없는 질문·이름만·제품이 도구로 지나가는 남의 이야기·자기소개면 `정보없음`. 경쟁·대체재 이야기도 정보다. 잘려서 모르면 둘 다 비운다.',
]

if (recheck) {
  const purged = verdicts.filter((v) => !(textById.get(v.input_id) ?? '').trim()).map((v) => v.input_id)
  if (purged.length) console.warn(`⚠️ 원문이 폐기돼 재확인할 수 없는 행 ${purged.length}건: ${purged.join(', ')}`)
  const rows = pool.slice().sort((a, b) => a.input_id.localeCompare(b.input_id))
  const body = [
    `# 관련성·정보 재확인 — ${today}`,
    '',
    `입력: ${recheckPath} · ${rows.length}장${purged.length ? ` (원문 폐기로 못 싣는 ${purged.length}건 제외)` : ''}.`,
    '사유 열: `a` = 정보 열이 비어 정답을 못 정한 행 · `b` = 09-28 에 좁은 기준(직접 써 본 경험)으로 무관이라 매긴 행.',
    '',
    '**b 행은 `관련`·`무관`·`모름` 도 넓은 기준(경쟁·대체재 포함, docs/t2-relevance-criteria.md)으로 다시 매긴다.** a 행은 관련 칸을 비워 두면 기존 사람 채점이 그대로 남는다.',
    ...INFO_HOWTO,
    '',
    `되돌려 넣기: \`node --env-file=.env.local scripts/relevance-grading-import.mjs ${outPath} --dry\` 로 먼저 본다.`,
    '',
    '| # | 프로젝트 | 리뷰 원문 | 관련 ☐ | 무관 ☐ | 모름 ☐ | 정보있음 ☐ | 정보없음 ☐ | 사유 | 키 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${md(cut(r.project, 30))} | ${md(cut(r.text, 600))} | ☐ | ☐ | ☐ | ☐ | ☐ | ${recheck.get(r.input_id)} | \`${r.input_id}\` |`),
    '',
  ].join('\n')
  if (dry) { console.log(body); console.log(`\n--dry: 파일을 쓰지 않았다. 쓸 자리는 ${outPath}`); process.exit(0) }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, body, 'utf8')
  console.log(`재확인 ${rows.length}장 → ${outPath} (체크박스는 전부 비어 있다)`)
  process.exit(0)
}

// 자동 승인 컬럼(20260930000027)이 없으면 감사할 것도 없다. 있음/없음을 가려 적는다(§7.1).
const autoColumn = verdicts.some((v) => 'auto_approved_at' in v)
// 신규 채점은 자동 승인되지 않은 행에서만 — 사람 시간은 기계가 못 정한 쪽에 쓴다. 감사는 자동 승인 행에서 따로.
const mainPick = pickGradingSample(pool.filter((r) => !r.auto), { n, seed })
const auditPick = audit > 0 ? pickGradingSample(pool.filter((r) => r.auto), { n: audit, seed: seed + 1 }) : []
// 채점자가 어느 줄이 감사인지 모르게 섞는다(uuid 순 = 사실상 무작위, 재현 가능). 표에도 표시하지 않는다.
const sample = [...mainPick, ...auditPick].sort((a, b) => a.input_id.localeCompare(b.input_id))
console.log(`신규 채점 ${mainPick.length}장 · 자동 승인 감사 ${auditPick.length}장${autoColumn ? '' : ' (자동 승인 컬럼 없음 — 마이그 20260930000027 미적용)'}`)
if (sample.length === 0) { console.log('모집단은 있으나 원문이 남은 것이 0건이다 — 채점할 것이 없다(실패가 아니다).'); process.exit(0) }

const lines = [
  `# 리뷰 목적 적합성 수기 채점 표본 — ${today}`,
  '',
  `모집단 ${pool.length}건(관련/무관 판정 중 사람 채점 전) 에서 ${sample.length}장. seed=${seed}.`,
  `내역: 모델이 관련이라 한 것 ${sample.filter((r) => r.verdict === 'relevant').length}장 · 무관이라 한 것 ${sample.filter((r) => r.verdict === 'irrelevant').length}장 (표에는 섞여 있다).`,
  '',
  `이 중 ${auditPick.length}장은 자동 승인된 행의 감사 표본이다(어느 줄인지는 표시하지 않는다 — 같은 기준으로 채점하면 된다).`,
  '',
  '**채점하는 법**: 기준은 docs/t2-relevance-criteria.md. 분석 재료로 쓸 만하면 `관련`, 다른 주제이거나 내용이 없으면 `무관` 에 `x` 를 넣는다.',
  '읽었는데 판단이 서지 않으면 `모름` 에 `x`. 못 읽고 넘기면 **셋 다 비워 둔다** — 빈 줄은 "안 봄" 이지 "무관" 이 아니다(CLAUDE.md §7.1).',
  ...INFO_HOWTO,
  '감사 줄은 관련·정보를 **둘 다** 매겨야 감사 1건으로 센다(rr-v2 킬스위치 — 한쪽만 채우면 창에 안 들어간다).',
  '모델 판정 열은 **채점 뒤에 보라**. 먼저 보면 그 답에 끌린다.',
  '',
  '마지막 열 `키` 는 채점을 `review_relevance_verdicts.human_verdict`·`human_product_informative` 로 되돌려 넣기 위한 것이다. 건드리지 않는다.',
  `되돌려 넣기: \`node --env-file=.env.local scripts/relevance-grading-import.mjs ${outPath} --dry\` 로 먼저 본다.`,
  '',
  '| # | 프로젝트 | 리뷰 원문 | 관련 ☐ | 무관 ☐ | 모름 ☐ | 정보있음 ☐ | 정보없음 ☐ | 모델 판정 | 키 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...sample.map((r, i) =>
    `| ${i + 1} | ${md(cut(r.project, 30))} | ${md(cut(r.text, 400))} | ☐ | ☐ | ☐ | ☐ | ☐ | ${r.verdict === 'relevant' ? '관련' : '무관'}${r.reason ? ` (${md(cut(r.reason, 60))})` : ''}${r.tags.map((g) => ` · ${g}`).join('')} | \`${r.input_id}\` |`,
  ),
  '',
]

const body = lines.join('\n')
if (dry) {
  console.log(body)
  console.log(`\n--dry: 파일을 쓰지 않았다. 쓸 자리는 ${outPath}`)
  process.exit(0)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, body, 'utf8')
console.log(`모집단 ${pool.length}건 → 표본 ${sample.length}장 (seed=${seed})`)
console.log(`  ${outPath}`)
console.log('체크박스는 전부 비어 있다 — 채점은 사람이 한다.')
