#!/usr/bin/env node
// 점진 해제 단계 통과 표본(v71dc·v71dl) — 그날(KST) rr-v2 로 자동 승인된 글에서 30건을 채점표 마크다운으로 쓴다. 읽기 전용.
//   배분(v71dl, gradual-release.ts quotaSample): 앱스토어 10 · 구글 플레이 6 · 나머지 소스 14(소스 비례·최소 1). 모자라면 다른 소스로 채워 총 30.
//
//   node --env-file=.env.local scripts/gradual-release-sample.mjs --stage 1 --since 2026-12-01 [--date 2026-12-02] [--seed 42] [--out <경로.md>] [--dry]
//     --stage  기본 env GRADUAL_RELEASE_STAGE · --since 기본 env GRADUAL_RELEASE_STAGE_SINCE(단계 시작 — KST 날짜 또는 ISO UTC 시각, 머리 주석·판정용)
//     --date   모집단 날짜(KST) 기본 오늘 — 모집단 = 그날 00:00~24:00 KST 에 rr-v2 로 승인되고 아직 사람이 안 본 글 전체
//
// 형식은 relevance-grading-sample.mjs 감사 표와 같다(모델 판정 가림 · 관련/무관/모름 + 정보있음/정보없음 · 키 = 전체 uuid).
// 채점 뒤 relevance-grading-import.mjs 로 그대로 되돌려 넣고, gradual-release-judge.mjs <이 파일> 로 통과를 판정한다.
// Notion 에 올리지 않는다(오케스트레이터 몫). "한국어 뜻" 칸도 오케스트레이터가 채운다.
//
// 종료코드: 0 성공(모집단 0건 포함) · 2 환경·조회 실패 · 64 사용법 오류

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { AUTO_APPROVAL_RULE } from '../lib/analysis/auto-approval.ts'
import { GRADUAL, countBySource, kstDayRange, parseStage, parseStageSince, quotaSample } from '../lib/analysis/gradual-release.ts'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
const dry = args.includes('--dry')
const today = kstDate()
const stage = parseStage(opt('stage') ?? process.env.GRADUAL_RELEASE_STAGE)
const since = opt('since') ?? process.env.GRADUAL_RELEASE_STAGE_SINCE ?? ''
const until = opt('date') ?? today
const seed = Number(opt('seed') ?? 42)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const sinceAt = parseStageSince(since, today, new Date())
// --date 는 날짜만(오늘 이후 불가). 단계 시작이 그날 끝 이후면 그날 승인분은 이 단계 것이 아니다.
if (stage === null || sinceAt === null || !DATE.test(until) || parseStageSince(until, today, new Date()) === null || sinceAt >= kstDayRange(until).end || !Number.isFinite(seed)) {
  console.error('사용법: --stage 1~5 --since YYYY-MM-DD|YYYY-MM-DDTHH:MM:SSZ [--date YYYY-MM-DD(≥since 날짜, ≤오늘)] [--seed 42] [--out 경로] [--dry]')
  process.exit(64)
}
const outPath = opt('out') ?? `reports/${today}/gradual-release-stage${stage}-sample.md`

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

// 모집단 = 그날(KST) rr-v2 로 승인되고 아직 사람이 안 본 글 전체(v71dl). 끝까지 읽는다(1000행 상한, §7.1).
const { start, end } = kstDayRange(until)
const approved = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('review_relevance_verdicts').select('input_id, project_id, auto_approved_at')
    .eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', start.toISOString()).lt('auto_approved_at', end.toISOString())
    .is('human_verdict', null).order('input_id').range(from, from + 999)
  if (error) { console.error(`✗ 승인 행 조회 실패: ${error.code ?? ''} ${error.message}`); process.exit(2) }
  approved.push(...data)
  if (data.length < 1000) break
}
if (approved.length === 0) { console.log(`단계 ${stage} (${until} KST) 에 채점 전 rr-v2 승인 글 0건 — 표본 없음(실패 아님).`); process.exit(0) }

const textById = new Map()
for (let i = 0; i < approved.length; i += 200) {
  const ids = approved.slice(i, i + 200).map((r) => r.input_id)
  const { data, error } = await sb.from('analysis_inputs').select('id, source_key, raw_text').in('id', ids)
  if (error) { console.error(`✗ 원문 조회 실패(${i + 1}~${i + ids.length}): ${error.message}`); process.exit(2) }
  for (const x of data ?? []) textById.set(x.id, x)
}
const { data: projects, error: pErr } = await sb.from('analysis_projects').select('id, product_elevator_pitch')
if (pErr) { console.error(`✗ 프로젝트 조회 실패: ${pErr.message}`); process.exit(2) }
const projectById = new Map((projects ?? []).map((p) => [p.id, p.product_elevator_pitch ?? '(소개 없음)']))

// 원문이 없는 행은 채점할 게 없다 — 몇 건인지 적는다(조용히 빼지 않는다).
const pool = approved
  .map((r) => ({ ...r, source_key: textById.get(r.input_id)?.source_key ?? '(소스 미상)', text: textById.get(r.input_id)?.raw_text ?? '' }))
  .filter((r) => r.text.trim().length > 0)
const dropped = approved.length - pool.length
const sample = quotaSample(pool, GRADUAL.sampleSize, GRADUAL.sampleQuotas, seed)

const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*[\r\n]+\s*/g, ' ').trim()
const cut = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n)}…` : String(s ?? ''))
const dist = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')
const body = [
  `<!-- gradual-release stage=${stage} since=${since} until=${until} seed=${seed} -->`,
  '<!-- 이 표본을 채점해 relevance-grading-import.mjs 로 넣으면 이 글들(전부 rr-v2 자동 승인)은 rr-v2 감사 창에 들어간다 —',
  '     킬스위치(창 50 · 오류 8건) 계산에도 그대로 쓰인다. 오류(무관 또는 정보없음)가 5건 이상이면 이 단계에서 멈춘다. -->',
  `# 점진 해제 ${stage}단계 통과 표본 — ${until} KST 승인분 (단계 시작 ${since})`,
  '',
  `모집단 ${pool.length}건(${until} KST rr-v2 자동 승인 ∧ 사람 채점 전${dropped ? ` · 원문 없음 ${dropped}건 제외` : ''}) 에서 ${sample.length}장 — 배분 앱스토어 ${GRADUAL.sampleQuotas.appstore} · 구글 플레이 ${GRADUAL.sampleQuotas.googleplay} · 나머지 소스 ${GRADUAL.sampleSize - GRADUAL.sampleQuotas.appstore - GRADUAL.sampleQuotas.googleplay}(모자라면 다른 소스로 채움). seed=${seed}.`,
  `모집단 소스 분포: ${dist(countBySource(pool))}`,
  `표본 소스 분포: ${dist(countBySource(sample))}`,
  '',
  '**채점하는 법**: 기준은 docs/t2-relevance-criteria.md. 분석 재료로 쓸 만하면 `관련`, 다른 주제이거나 내용이 없으면 `무관` 에 `x`. 판단이 안 서면 `모름`. 못 읽었으면 비워 둔다(빈칸 = 안 봄).',
  '**정보 열**: 독자가 이 제품을 판단하는 데 쓸 구체 정보(장단점·비교·비용·기능 유무·쓰는/떠난 이유)가 있으면 `정보있음`, 없으면 `정보없음`.',
  `관련·정보를 **둘 다** 매긴 줄만 1건으로 센다. ${GRADUAL.sampleSize}건 중 오류 ${GRADUAL.maxErrors}건 이하면 통과.`,
  '',
  '마지막 열 `키` 는 되돌려 넣기용 전체 uuid 다. 건드리지 않는다.',
  `되돌려 넣기: \`node --env-file=.env.local scripts/relevance-grading-import.mjs ${outPath} --dry\` → 판정: \`node --env-file=.env.local scripts/gradual-release-judge.mjs ${outPath}\``,
  '',
  '| # | 프로젝트 | 리뷰 원문 | 한국어 뜻 | 관련 ☐ | 무관 ☐ | 모름 ☐ | 정보있음 ☐ | 정보없음 ☐ | 소스 | 키 |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...sample.map((r, i) => `| ${i + 1} | ${md(cut(projectById.get(r.project_id) ?? '(프로젝트 미상)', 30))} | ${md(cut(r.text, 600))} | 한국어 뜻: (오케스트레이터가 채움) | ☐ | ☐ | ☐ | ☐ | ☐ | ${md(r.source_key)} | \`${r.input_id}\` |`),
  '',
].join('\n')

if (dry) { console.log(body); console.log(`\n--dry: 파일을 쓰지 않았다. 쓸 자리는 ${outPath}`); process.exit(0) }
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, body, 'utf8')
console.log(`단계 ${stage} 표본 ${sample.length}장 (모집단 ${pool.length}) → ${outPath}`)
