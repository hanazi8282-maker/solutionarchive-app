#!/usr/bin/env node
// 처방 카드 관련성 판정 백필 CLI — 라우트 `/api/analyze/remedy/judge` 와 같은 한 벌을 돈다.
//
//   node --env-file=.env.local scripts/remedy-judge.mjs --project <uuid>
//   node --env-file=.env.local scripts/remedy-judge.mjs --all
//   node --env-file=.env.local scripts/remedy-judge.mjs --all --dry     # LLM 호출·저장 없이 프롬프트만 본다
//
// 왜 있나: 판정은 보통 extract 끝에서 자동으로 돈다. 하지만 이미 분석이 끝난 프로젝트가 26건 있고,
// 코퍼스에 사례가 추가되면 그 카드들도 다시 판정해야 한다. 그때 세션 없이 부를 자리가 필요하다
// (라우트는 Google 허용목록 로그인 뒤에 있다).
//
// 이미 판정이 있고 카드 문장이 그대로인 카드는 건너뛴다 — 재실행이 공짜가 되게.
//
// ⚠️ --dry 가 아니면 LLM 을 호출한다(비용). Gemini 무료 티어는 extract 와 RPM 을 공유한다.
// ⚠️ 서브에이전트에 서비스키를 넘기지 않는다(CLAUDE.md §10.1) — 오케스트레이터가 직접 돌린다.
//
// 종료코드: 0 성공 · 2 환경·조회 실패 · 64 사용법 오류

import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { withLlmBudget } from '../lib/analysis/budget.ts'
import { judgeProjectRemedies } from '../lib/cases/remedy-db.ts'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

const projectId = opt('project')
const all = flag('all')
const dry = flag('dry')
if (!projectId && !all) { console.error('사용법: --project <uuid> | --all [--dry]'); process.exit(64) }

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (!dry && requiredKey && !process.env[requiredKey]) {
  console.error(`✗ ${requiredKey} 가 없다(provider=${provider}). .env.local 을 확인하라.`)
  process.exit(2)
}
if (!dry && provider === 'mock') {
  // 여기서 멈추지 않으면 "판정했다" 는 로그만 남고 캐시는 전부 NULL 이 된다(§7.1).
  console.error('✗ LLM_PROVIDER=mock 이다. mock 은 판정을 흉내내지 않으므로 백필에 쓰지 않는다.')
  process.exit(2)
}

const supabase = await createClient()
if (!supabase) { console.error('✗ DB 연결 실패 — SUPABASE_URL/SERVICE_ROLE_KEY 확인'); process.exit(2) }

let targets = []
if (projectId) {
  targets = [{ id: projectId, product_elevator_pitch: null }]
} else {
  // 속성이 있는 프로젝트만 대상이다 — 처방 대상 선별은 (중요도, 만족도)로 하므로 속성이 없으면 카드가 0장이다.
  const { data, error } = await supabase
    .from('analysis_projects')
    .select('id, product_elevator_pitch, analysis_aspects(id)')
    .order('created_at', { ascending: true })
  if (error) { console.error(`✗ 프로젝트 조회 실패: ${error.message}`); process.exit(2) }
  targets = (data ?? []).filter((p) => (p.analysis_aspects ?? []).length > 0)
}

console.log(`provider=${provider} dry=${dry} 대상 ${targets.length}건`)

let totals = { candidates: 0, cached: 0, judged: 0, irrelevant: 0, unverified: 0, upserted: 0 }
for (const p of targets) {
  const result = dry
    ? await judgeProjectRemedies(supabase, p.id, { dry: true })
    : await withLlmBudget(() => judgeProjectRemedies(supabase, p.id))

  const sum = (k) => result.aspects.reduce((n, a) => n + a[k], 0)
  const line = result.aspects.length === 0
    ? `${result.status}${result.reason ? ` — ${result.reason}` : ''}`
    : `속성 ${result.aspects.length}건 · 후보 ${sum('candidates')}장 · 캐시 ${sum('cached')}장 · 판정 ${sum('judged')}장(무관 ${sum('irrelevant')}) · 미검증 ${sum('unverified')}장 · 적립 ${result.upserted}행`
  console.log(`- ${p.id} ${p.product_elevator_pitch ? `(${String(p.product_elevator_pitch).slice(0, 24)})` : ''} ${line}`)

  if (dry) {
    for (const a of result.aspects) {
      if (!a.prompt) continue
      console.log(`  ┌ 속성 "${a.name}" — 후보 ${a.candidates}장 중 ${a.candidates - a.cached}장 판정 대상`)
      console.log(a.prompt.split('\n').map((l) => `  │ ${l}`).join('\n'))
      console.log('  └')
    }
  }

  totals = {
    candidates: totals.candidates + sum('candidates'),
    cached: totals.cached + sum('cached'),
    judged: totals.judged + sum('judged'),
    irrelevant: totals.irrelevant + sum('irrelevant'),
    unverified: totals.unverified + sum('unverified'),
    upserted: totals.upserted + result.upserted,
  }
}

const ratio = totals.judged > 0 ? `${((totals.irrelevant / totals.judged) * 100).toFixed(1)}%` : '측정 불가(판정 0장)'
console.log(`\n합계 후보 ${totals.candidates}장 · 캐시 ${totals.cached}장 · 판정 ${totals.judged}장 · 미검증 ${totals.unverified}장 · 적립 ${totals.upserted}행`)
// 무관 비율은 **이번에 판정한 것** 기준이다. 미검증은 분모에 넣지 않는다 — 못 잰 것을 잰 것처럼 세지 않는다(§7.1).
console.log(`이번 판정 기준 무관 비율 ${ratio} (미검증 ${totals.unverified}장은 분모에서 뺐다)`)
