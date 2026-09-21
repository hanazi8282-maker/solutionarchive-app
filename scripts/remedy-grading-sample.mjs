#!/usr/bin/env node
// 처방 카드 수기 채점 표본 만들기 — 남헌이 손으로 채점할 표를 뽑는다.
//
//   node --env-file=.env.local scripts/remedy-grading-sample.mjs --n 30
//   node --env-file=.env.local scripts/remedy-grading-sample.mjs --n 30 --seed 42 --out reports/2026-09-22/remedy-grading-sample.md
//
// 왜 있나: 게이트를 넣으면 "무관 비율"의 측정자와 필터가 같은 모델이 된다. 그 숫자로 10% 를 주장할 수 없다
// (docs/review-sources-and-remedy-roadmap-2026-09-21.md §3-6 마지막 줄 — 최종 판정은 사람 표본으로).
// 그래서 게이트를 통과한(또는 미검증으로 남은) 카드에서 무작위 표본을 뽑아 빈 체크박스 표로 낸다.
//
// ★ 이 스크립트는 아무것도 채점하지 않는다. 체크박스는 전부 비어 있다.
//   LLM 을 호출하지 않는다(읽기만 한다). 표본은 --seed 로 재현된다.
//
// 종료코드: 0 성공 · 2 환경·조회 실패 · 64 사용법 오류

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { buildProjectRemedies, loadVerdicts } from '../lib/cases/remedy-db.ts'
import { applyGate, CARD_KINDS, cardIdOf, cardLine } from '../lib/cases/remedy-gate.ts'

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

const n = Number(opt('n') ?? 30)
if (!Number.isFinite(n) || n <= 0) { console.error('사용법: --n <표본 수> [--seed 42] [--out <경로.md>]'); process.exit(64) }
const seed = Number(opt('seed') ?? 42)

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const outPath = opt('out') ?? `reports/${today}/remedy-grading-sample.md`
const csvPath = outPath.replace(/\.md$/i, '.csv')

// 재현 가능한 난수(mulberry32). Math.random 을 쓰면 같은 --seed 로 같은 표가 안 나온다.
function rng(s) {
  let a = s >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const supabase = await createClient()
if (!supabase) { console.error('✗ DB 연결 실패 — SUPABASE_URL/SERVICE_ROLE_KEY 확인'); process.exit(2) }

const { data: projects, error } = await supabase
  .from('analysis_projects')
  .select('id, product_elevator_pitch, analysis_aspects(id)')
  .order('created_at', { ascending: true })
if (error) { console.error(`✗ 프로젝트 조회 실패: ${error.message}`); process.exit(2) }

const targets = (projects ?? []).filter((p) => (p.analysis_aspects ?? []).length > 0)
console.log(`속성이 있는 프로젝트 ${targets.length}건에서 표본을 모은다`)

// 모집단: 게이트를 통과했거나(kept) 판정을 못 받은(unverified) 카드. 무관으로 빠진 카드는 화면에 없으니 제외다.
const pool = []
for (const p of targets) {
  const remedies = await buildProjectRemedies(supabase, p.id, 'remedy-grading-sample')
  if (!remedies || remedies.status === 'not_run') {
    console.warn(`  ! ${p.id} 건너뜀 — ${remedies?.reason ?? '프로젝트 없음'}`)
    continue
  }
  const verdicts = await loadVerdicts(supabase, 'remedy-grading-sample', remedies.cards.map((c) => c.aspect_id))
  if (verdicts === null) console.warn(`  ! ${p.id} 판정 캐시를 읽지 못했다 — 이 프로젝트 카드는 전부 "미검증" 으로 들어간다`)
  const gated = applyGate(remedies, verdicts ?? [])

  for (const card of gated.cards) {
    const lists = { case_move: card.fixes, failed_angle: card.failures, principle: card.principles }
    for (const kind of CARD_KINDS) {
      for (const c of lists[kind]) {
        pool.push({
          project: (p.product_elevator_pitch ?? '(소개 없음)').slice(0, 30),
          aspect: card.aspect_name,
          aspect_id: card.aspect_id,
          card_kind: kind,
          card_id: cardIdOf(kind, c),
          gate: c.gate,
          text: cardLine(kind, c),
        })
      }
    }
  }
}

if (pool.length === 0) { console.error('✗ 표본 모집단이 0장이다 — 뽑을 카드가 없다(채점할 것이 없다는 뜻이지 실패가 아니다)'); process.exit(0) }

// 균등 무작위 비복원 추출(Fisher-Yates 앞 n장). 프로젝트·속성별 가중치를 주지 않는다 — 카드 한 장이 한 표다.
const random = rng(seed)
const shuffled = pool.slice()
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1))
  ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
}
const sample = shuffled.slice(0, Math.min(n, shuffled.length))

const md = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const csv = (s) => `"${String(s).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`

const lines = [
  `# 처방 카드 수기 채점 표본 — ${today}`,
  '',
  `모집단 ${pool.length}장(게이트 통과 + 미검증) 중 무작위 ${sample.length}장. seed=${seed}.`,
  '',
  '**채점하는 법**: 카드 문장이 그 속성의 문제를 푸는 데 쓸 만하면 `관련`, 낱말만 겹친 것이면 `무관` 에 `x` 를 넣는다.',
  '판단이 서지 않으면 **둘 다 비워 둔다** — 빈 줄은 "판정 불가" 이지 "무관" 이 아니다(CLAUDE.md §7.1).',
  '부분 관련(같은 페인 유형인데 도메인이 다름)은 `관련` 로 센다 — 화면에서 빼지 않는 카드이기 때문이다.',
  '',
  '마지막 열 `키` 는 나중에 이 채점을 `remedy_verdicts.human_verdict` 로 되돌려 넣기 위한 것이다. 건드리지 않는다.',
  '',
  '| # | 프로젝트 | 속성 | 카드 문장 | 관련 ☐ | 무관 ☐ | 키 |',
  '|---|---|---|---|---|---|---|',
  // 키의 구분자 | 는 이스케이프한다 — 코드 스팬 안이어도 마크다운 표는 | 를 먼저 자른다.
  ...sample.map((r, i) =>
    `| ${i + 1} | ${md(r.project)} | ${md(r.aspect)} | ${md(r.text)} | ☐ | ☐ | \`${md(`${r.aspect_id}|${r.card_kind}|${r.card_id}`)}\` |`,
  ),
  '',
  `게이트 상태 내역: 통과 ${sample.filter((r) => r.gate === 'kept').length}장 · 미검증 ${sample.filter((r) => r.gate === 'unverified').length}장`,
  '',
]

const csvLines = [
  '번호,프로젝트,속성,카드문장,관련,무관,키',
  ...sample.map((r, i) => [i + 1, csv(r.project), csv(r.aspect), csv(r.text), '', '', csv(`${r.aspect_id}|${r.card_kind}|${r.card_id}`)].join(',')),
]

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, lines.join('\n'), 'utf8')
writeFileSync(csvPath, csvLines.join('\n'), 'utf8')

console.log(`모집단 ${pool.length}장 → 표본 ${sample.length}장 (seed=${seed})`)
console.log(`  ${outPath}`)
console.log(`  ${csvPath}`)
console.log('체크박스는 전부 비어 있다 — 채점은 사람이 한다.')
