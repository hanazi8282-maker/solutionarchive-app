// 검수 교정 diff 리포트 — "로직이 뭘 틀리는가"를 숫자로 본다.
//
// analysis_aspects 의 llm_*(추출 원본) 과 실제 컬럼(사람 교정본)을 대조해
//   1) 필드별 교정 발생률
//   2) 중요도/만족도의 평균 오차 크기와 방향 (과대평가 경향인가)
//   3) attribution 오분류 매트릭스 (LLM 이 뭐라 했는데 사람이 뭐로 고쳤나)
// 를 출력한다. 읽기 전용 — 아무것도 쓰지 않는다.
//
// 실행:  node --env-file=.env.local scripts/review-diff-report.mjs
// 옵션:  --project <uuid>   특정 프로젝트만
//        --min <n>          집계 최소 표본 수 (기본 1)
//        --json             사람이 읽는 표 대신 JSON 출력
//
// 전제: 20260820000001_analysis_aspect_llm_baseline.sql 적용 후 추출된 행만
//   llm_* 가 채워진다. 그 이전 행은 llm_* 가 null 이고 "교정 없음"이 아니라
//   "원본을 알 수 없음"이므로 집계에서 제외한다. 이 둘을 섞으면 교정률이
//   실제보다 낮게 나온다.

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  console.error('node --env-file=.env.local scripts/review-diff-report.mjs')
  process.exit(1)
}

const args = process.argv.slice(2)
const projectId = args.includes('--project') ? args[args.indexOf('--project') + 1] : null
const minN = args.includes('--min') ? Number(args[args.indexOf('--min') + 1]) : 1
const asJson = args.includes('--json')

// 비교 대상: [실제 컬럼, llm_ 원본 컬럼, 표시 이름]
const FIELDS = [
  ['importance', 'llm_importance', '중요도'],
  ['satisfaction', 'llm_satisfaction', '만족도'],
  ['attribution', 'llm_attribution', '귀인'],
  ['aspect_layer', 'llm_aspect_layer', '레이어'],
  ['pain_timing', 'llm_pain_timing', '인지시점'],
  ['persona_role', 'llm_persona_role', '페르소나'],
  ['proxy_consumption', 'llm_proxy_consumption', '대리소비'],
  ['is_segmentation_axis', 'llm_is_segmentation_axis', '세그먼트축'],
]

const SELECT = ['id', 'project_id', 'name', 'human_confirmed', 'reviewed_at']
  .concat(FIELDS.flatMap(([actual, llm]) => [actual, llm]))
  .join(',')

async function fetchAspects() {
  const params = new URLSearchParams({ select: SELECT })
  // llm_importance 가 null 이면 마이그레이션 이전 행이다.
  // (추출 경로가 8개 llm_* 를 한 payload 로 함께 쓰므로 하나로 판별해도 된다.)
  params.set('llm_importance', 'not.is.null')
  if (projectId) params.set('project_id', `eq.${projectId}`)

  const res = await fetch(`${URL_BASE}/rest/v1/analysis_aspects?${params}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`조회 실패 ${res.status}: ${await res.text()}`)
  return res.json()
}

// 값 비교. null/undefined 는 같은 것으로 본다.
// 숫자는 numeric 이 문자열("7.5")로 오므로 Number 로 맞춘 뒤 비교한다.
function differs(actual, llm) {
  if (actual == null && llm == null) return false
  if (actual == null || llm == null) return true
  if (typeof llm === 'boolean' || typeof actual === 'boolean') return Boolean(actual) !== Boolean(llm)
  const na = Number(actual), nl = Number(llm)
  if (Number.isFinite(na) && Number.isFinite(nl)) return na !== nl
  return String(actual) !== String(llm)
}

function pct(n, d) {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`
}

function pad(s, w) {
  // 한글은 폭 2로 세어 표 정렬을 맞춘다.
  const width = [...String(s)].reduce((acc, ch) => acc + (/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? 2 : 1), 0)
  return String(s) + ' '.repeat(Math.max(0, w - width))
}

const rows = await fetchAspects()

// 검수를 거친 행만 교정 여부를 말할 수 있다.
// 아직 확인 안 한 행은 "안 고침"이 아니라 "아직 안 봄"이다.
const reviewed = rows.filter(r => r.human_confirmed === true)

const result = {
  scope: projectId ?? '전체',
  aspects_with_baseline: rows.length,
  reviewed: reviewed.length,
  fields: {},
  score_error: {},
  attribution_matrix: {},
}

// ── 1. 필드별 교정 발생률 ────────────────────────────────────
for (const [actual, llm, label] of FIELDS) {
  const applicable = reviewed.filter(r => r[llm] != null || r[actual] != null)
  const changed = applicable.filter(r => differs(r[actual], r[llm]))
  result.fields[label] = {
    n: applicable.length,
    changed: changed.length,
    rate: applicable.length ? changed.length / applicable.length : null,
  }
}

// ── 2. I/S 오차 크기와 방향 ──────────────────────────────────
// error = llm - human. 양수면 LLM 이 사람보다 높게 매긴 것 = 과대평가.
for (const [actual, llm, label] of [FIELDS[0], FIELDS[1]]) {
  const pairs = reviewed
    .map(r => [Number(r[llm]), Number(r[actual])])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  const errs = pairs.map(([l, h]) => l - h)
  const n = errs.length
  if (n === 0) { result.score_error[label] = { n: 0 }; continue }
  const mean = errs.reduce((s, e) => s + e, 0) / n
  const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / n
  const over = errs.filter(e => e > 0).length
  const under = errs.filter(e => e < 0).length
  result.score_error[label] = {
    n,
    mean_error: mean,          // 부호 있는 평균 = 편향(bias)
    mae,                       // 절대 오차 평균 = 크기
    over, under, same: n - over - under,
    max_over: Math.max(...errs),
    max_under: Math.min(...errs),
  }
}

// ── 3. attribution 오분류 매트릭스 ───────────────────────────
for (const r of reviewed) {
  const from = r.llm_attribution ?? '(null)'
  const to = r.attribution ?? '(null)'
  result.attribution_matrix[from] ??= {}
  result.attribution_matrix[from][to] = (result.attribution_matrix[from][to] ?? 0) + 1
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

// ── 출력 ─────────────────────────────────────────────────────
console.log(`\n검수 교정 diff 리포트  (대상: ${result.scope})`)
console.log(`원본 보존된 속성 ${result.aspects_with_baseline}건 / 그중 검수 완료 ${result.reviewed}건`)

if (result.reviewed === 0) {
  console.log('\n검수 완료된 속성이 없어 교정 통계를 낼 수 없습니다.')
  console.log('(llm_* 가 채워진 행은 마이그레이션 적용 이후 추출분뿐입니다.)')
  process.exit(0)
}

console.log('\n[1] 필드별 교정 발생률')
for (const [label, f] of Object.entries(result.fields)) {
  if (f.n < minN) continue
  const bar = '█'.repeat(Math.round((f.rate ?? 0) * 20))
  console.log(`  ${pad(label, 12)} ${pad(`${f.changed}/${f.n}`, 9)} ${pad(pct(f.changed, f.n), 8)} ${bar}`)
}

console.log('\n[2] 점수 오차 (error = LLM − 사람. 양수 = LLM 과대평가)')
for (const [label, s] of Object.entries(result.score_error)) {
  if (!s.n) { console.log(`  ${pad(label, 12)} 표본 없음`); continue }
  const dir = s.mean_error > 0.05 ? '과대평가 경향' : s.mean_error < -0.05 ? '과소평가 경향' : '편향 거의 없음'
  console.log(`  ${pad(label, 12)} n=${s.n}`)
  console.log(`    평균오차(편향) ${s.mean_error >= 0 ? '+' : ''}${s.mean_error.toFixed(2)}  →  ${dir}`)
  console.log(`    평균 절대오차  ${s.mae.toFixed(2)}`)
  console.log(`    높게 매김 ${s.over}건 / 낮게 매김 ${s.under}건 / 일치 ${s.same}건`)
  console.log(`    최대 과대 +${s.max_over} · 최대 과소 ${s.max_under}`)
}

console.log('\n[3] attribution 오분류 매트릭스 (행 = LLM 원본, 열 = 사람 교정본)')
const keys = [...new Set([
  ...Object.keys(result.attribution_matrix),
  ...Object.values(result.attribution_matrix).flatMap(v => Object.keys(v)),
])].sort()
if (keys.length === 0) {
  console.log('  표본 없음')
} else {
  console.log(`  ${pad('LLM \\ 사람', 16)}${keys.map(k => pad(k, 16)).join('')}`)
  for (const from of keys) {
    const row = result.attribution_matrix[from] ?? {}
    const cells = keys.map(to => {
      const v = row[to] ?? 0
      return pad(v === 0 ? '·' : from === to ? `${v}` : `${v} ←오분류`, 16)
    })
    console.log(`  ${pad(from, 16)}${cells.join('')}`)
  }
  const total = Object.values(result.attribution_matrix).flatMap(v => Object.values(v)).reduce((a, b) => a + b, 0)
  const correct = keys.reduce((s, k) => s + (result.attribution_matrix[k]?.[k] ?? 0), 0)
  console.log(`\n  대각선(일치) ${correct}/${total} = ${pct(correct, total)}`)
}
console.log('')
