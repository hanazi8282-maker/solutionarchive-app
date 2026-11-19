#!/usr/bin/env node
// [v71cu E2] story flow 콘텐츠 가치 평가 — 채점 응답 JSON 들 + 정답 표(key.json) → 합격 판정.
//   node scripts/story-flow-eval-score.mjs --key <dir>/key.json --responses <opus.json> <fable.json> [--agree] [--out <result.json>]
// 합격선은 아래 PASS 한 곳에 고정이다. CLI 인자로 바꿀 수 없다(모르는 인자는 사용법 오류 64).
// 응답 형식이 틀리거나 칸이 빠진 응답은 "확인 불가" → 그 회차 무효(점수로 접지 않는다, §7.1). 대조군 신뢰 검사 실패도 그 회차 무효.
// 종료 코드: 0 = 모든 변형 합격 · 1 = 불합격·무효 · 2 = 파일을 못 읽음 · 64 = 사용법.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** 합격선 — 남헌 확정, CC 변경 금지. (값을 바꾸려면 남헌 결정 뒤 이 파일을 고치는 PR 로만. 셀프테스트가 값을 고정한다.) */
export const PASS = Object.freeze({
  MEAN_ALL_MIN: 3.8,          // 항목 6개 평균 ≥ 3.8
  ITEM_MEAN_MIN: 3.5,         // 항목별 평균 ≥ 3.5
  SAMPLE_ITEM_MIN: 3.0,       // 어느 샘플(채점자 × 진단)에서도 3.0 미만 항목 없음
  TEST1_WIN_OR_TIE_MIN: 0.70, // 시험 ① 새 경로가 이기거나 비기는 비율 ≥ 70%
  TEST2_CONCRETE_MIN: 0.80,   // 시험 ② 행동 구체성 통과 ≥ 80%
  NO_REGRESSION: true,        // 기존 결론서 평균 대비 후퇴 없음(새 경로 6항목 평균 ≥ 기존)
  BAD_CONTROL_BELOW: 3.0,     // 대조군 신뢰: 나쁜 결론서 6항목 평균 < 3.0
})
/** 대조군 신뢰: 좋은 결론서 6항목 평균 하한. 지시는 "높은 점수"뿐이라 CC 해석값(항목별 하한과 같은 3.5) — 남헌 확인 전. 나쁜 것보다 높아야 하는 조건도 함께 건다. */
export const GOOD_CONTROL_MIN = 3.5
export const SCORE_ITEMS = ['same_situation', 'specificity', 'actionability', 'novelty', 'decision_help', 'readability']

const r4 = (x) => Math.round(x * 1e4) / 1e4 // 부동소수 경계(3.8 이 3.7999…로 떨어지는 것) 방지 — 비교는 반올림 값으로
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const mean6 = (s) => mean(SCORE_ITEMS.map((k) => s[k]))
const labelOf = (kd, kind) => Object.entries(kd.panels).find(([, k]) => k === kind)?.[0]

/** 응답 하나 구조 검사. 칸 하나라도 빠지거나 틀리면 ok=false(확인 불가). */
export function parseResponse(resp, key) {
  const errors = [], data = new Map()
  if (!resp || typeof resp !== 'object') return { ok: false, errors: ['JSON 객체가 아님'], grader: '?', data }
  const grader = String(resp.grader ?? '').trim() || '?'
  if (resp.packet_id !== key.packet_id) errors.push(`packet_id 불일치(${resp.packet_id} ≠ ${key.packet_id})`)
  if (grader === '?') errors.push('grader 가 비었음')
  const byId = new Map((Array.isArray(resp.diagnoses) ? resp.diagnoses : []).map((d) => [String(d?.id), d]))
  for (const id of byId.keys()) if (!key.diagnoses.some((k) => k.id === id)) errors.push(`${id} 는 패킷에 없는 진단`)
  for (const kd of key.diagnoses) {
    const d = byId.get(kd.id)
    if (!d) { errors.push(`${kd.id} 응답 없음`); continue }
    const panels = {}, test1 = {}
    for (const label of Object.keys(kd.panels)) {
      const p = d.panels?.[label]
      if (!p) { errors.push(`${kd.id}/${label} 채점 없음`); continue }
      const badItem = SCORE_ITEMS.filter((k) => !(Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 5))
      if (badItem.length) errors.push(`${kd.id}/${label} 0~5 정수가 아님: ${badItem.join(',')}`)
      if (typeof p.tomorrow_action !== 'string' || !p.tomorrow_action.trim()) errors.push(`${kd.id}/${label} tomorrow_action 비었음`)
      if (typeof p.action_concrete !== 'boolean') errors.push(`${kd.id}/${label} action_concrete 는 true/false`)
      panels[label] = p
    }
    const t1 = new Map((Array.isArray(d.test1) ? d.test1 : []).map((x) => [x?.pair_id, x?.choice]))
    for (const [pid, pr] of Object.entries(kd.pairs)) {
      const c = t1.get(pid)
      if (![pr.variant_label, pr.legacy_label, 'tie'].includes(c)) errors.push(`${kd.id}/${pid} 시험① 선택이 "${c}" — ${pr.legacy_label}·${pr.variant_label}·tie 중 하나`)
      test1[pid] = c
    }
    data.set(kd.id, { panels, test1 })
  }
  return { ok: !errors.length, errors, grader, round: resp.round ?? '', data }
}

/** 대조군 신뢰 검사(구조가 맞는 응답만). 나쁜 것 평균 < 3.0, 좋은 것 평균 ≥ GOOD_CONTROL_MIN 이고 나쁜 것보다 높음. 좋은 대조군이 한 건도 없으면 확인 불가 = 실패. */
export function controlCheck(parsed, key) {
  const failures = []
  let goodSeen = 0
  for (const kd of key.diagnoses) {
    const p = parsed.data.get(kd.id), bl = labelOf(kd, 'bad'), gl = labelOf(kd, 'good')
    if (!bl) { failures.push(`${kd.id} 나쁜 대조군 없음`); continue }
    const b = r4(mean6(p.panels[bl]))
    if (!(b < PASS.BAD_CONTROL_BELOW)) failures.push(`${kd.id} 나쁜 대조군 ${b} (≥ ${PASS.BAD_CONTROL_BELOW})`)
    if (gl) {
      goodSeen++
      const g = r4(mean6(p.panels[gl]))
      if (!(g >= GOOD_CONTROL_MIN && g > b)) failures.push(`${kd.id} 좋은 대조군 ${g} (< ${GOOD_CONTROL_MIN} 이거나 나쁜 것 ${b} 이하)`)
    }
  }
  if (!goodSeen) failures.push('좋은 대조군이 한 건도 없음 — 확인 불가')
  return { ok: !failures.length, failures }
}

/** 한 경로(kind)의 통계 — 유효 응답만. */
function stats(key, valid, kind) {
  const perDiag = [], raw = []
  for (const kd of key.diagnoses) {
    const l = labelOf(kd, kind)
    if (!l) continue
    const rs = valid.map((v) => v.data.get(kd.id).panels[l])
    raw.push(...rs)
    perDiag.push(Object.fromEntries(SCORE_ITEMS.map((k) => [k, mean(rs.map((s) => s[k]))])))
  }
  const item = Object.fromEntries(SCORE_ITEMS.map((k) => [k, perDiag.length ? r4(mean(perDiag.map((s) => s[k]))) : null]))
  return { n_diag: perDiag.length, n_raw: raw.length, mean_all: perDiag.length ? r4(mean(perDiag.map(mean6))) : null, item_means: item,
    min_item: raw.length ? Math.min(...raw.flatMap((s) => SCORE_ITEMS.map((k) => s[k]))) : null,
    concrete: raw.length ? r4(raw.filter((s) => s.action_concrete).length / raw.length) : null }
}

/** 표본 상관(Pearson). 분산 0 이거나 2쌍 미만이면 null(확인 불가). */
export function pearson(a, b) {
  if (a.length !== b.length || a.length < 2) return null
  const ma = mean(a), mb = mean(b), da = a.map((x) => x - ma), db = b.map((x) => x - mb)
  const den = Math.sqrt(da.reduce((s, x) => s + x * x, 0) * db.reduce((s, x) => s + x * x, 0))
  return den ? r4(da.reduce((s, x, i) => s + x * db[i], 0) / den) : null
}
/** 두 채점자 일치도 — 같은 (진단, 결론서) 칸 전부(대조군 포함)로 항목별 상관·평균 차이(a−b)·평균 절대 차이. */
export function agreement(key, a, b) {
  const out = {}
  for (const k of SCORE_ITEMS) {
    const xs = [], ys = []
    for (const kd of key.diagnoses) for (const l of Object.keys(kd.panels)) {
      const x = a.data.get(kd.id)?.panels[l]?.[k], y = b.data.get(kd.id)?.panels[l]?.[k]
      if (Number.isInteger(x) && Number.isInteger(y)) { xs.push(x); ys.push(y) }
    }
    out[k] = { n: xs.length, r: pearson(xs, ys), mean_diff: xs.length ? r4(mean(xs.map((x, i) => x - ys[i]))) : null, mean_abs_diff: xs.length ? r4(mean(xs.map((x, i) => Math.abs(x - ys[i])))) : null }
  }
  return { a: a.grader, b: b.grader, items: out }
}

/** 합격 계산(순수). */
export function evaluate(key, responses, { agree = false } = {}) {
  const parsed = responses.map((r) => parseResponse(r, key))
  const rounds = parsed.map((p) => {
    const cc = p.ok ? controlCheck(p, key) : { ok: false, failures: [] }
    return { grader: p.grader, round: p.round, valid: p.ok && cc.ok, structure_errors: p.errors, control_failures: cc.failures,
      status: !p.ok ? '무효(확인 불가 — 응답 형식)' : !cc.ok ? '무효(대조군 신뢰 검사 실패)' : '유효' }
  })
  const valid = parsed.filter((_, i) => rounds[i].valid)
  const legacy = stats(key, valid, 'legacy'), variants = {}
  for (const v of key.variants) {
    const s = stats(key, valid, v)
    let win = 0, tie = 0, n = 0
    for (const r of valid) for (const kd of key.diagnoses) for (const [pid, pr] of Object.entries(kd.pairs)) {
      if (pr.variant !== v) continue
      const c = r.data.get(kd.id).test1[pid]; n++
      if (c === pr.variant_label) win++; else if (c === 'tie') tie++
    }
    const t1 = n ? r4((win + tie) / n) : null
    const chk = (value, min, cmp = '>=') => ({ value, min, pass: value != null && min != null && (cmp === '>=' ? value >= min : value > min) })
    const checks = {
      mean_all: chk(s.mean_all, PASS.MEAN_ALL_MIN),
      item_means: { value: s.item_means, min: PASS.ITEM_MEAN_MIN, pass: SCORE_ITEMS.every((k) => s.item_means[k] != null && s.item_means[k] >= PASS.ITEM_MEAN_MIN) },
      sample_min_item: chk(s.min_item, PASS.SAMPLE_ITEM_MIN),
      test1_win_or_tie: { ...chk(t1, PASS.TEST1_WIN_OR_TIE_MIN), win, tie, loss: n - win - tie, n },
      test2_concrete: chk(s.concrete, PASS.TEST2_CONCRETE_MIN),
      no_regression: chk(s.mean_all, legacy.mean_all),
    }
    const pass = valid.length > 0 && Object.values(checks).every((c) => c.pass)
    variants[v] = { verdict: !valid.length ? '무효(유효 회차 없음)' : pass ? '합격' : '불합격', pass, stats: s, checks }
  }
  const agreements = []
  if (agree) {
    const ok = parsed.filter((p) => p.ok)
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) if (ok[i].grader !== ok[j].grader) agreements.push(agreement(key, ok[i], ok[j]))
    if (!agreements.length) agreements.push({ note: '서로 다른 채점자의 형식이 맞는 응답이 2개 미만 — 일치도 확인 불가' })
  }
  return { packet_id: key.packet_id, thresholds: { ...PASS, GOOD_CONTROL_MIN }, rounds, valid_rounds: valid.length, legacy: { stats: legacy }, variants, ...(agree ? { agreements } : {}),
    all_pass: valid.length > 0 && key.variants.every((v) => variants[v].pass) }
}

export function summary(res) {
  const f = (x) => (x == null ? '확인 불가' : x)
  return [
    `packet ${res.packet_id} · 유효 회차 ${res.valid_rounds}/${res.rounds.length}`,
    ...res.rounds.map((r) => `- ${r.grader}${r.round ? `(${r.round})` : ''}: ${r.status}${[...r.structure_errors, ...r.control_failures].length ? ` — ${[...r.structure_errors, ...r.control_failures].slice(0, 5).join(' / ')}` : ''}`),
    `기존 경로 6항목 평균 ${f(res.legacy.stats.mean_all)}`,
    ...Object.entries(res.variants).flatMap(([v, x]) => [`[${v}] ${x.verdict}`,
      ...Object.entries(x.checks).map(([k, c]) => `  ${c.pass ? '✓' : '✗'} ${k}: ${typeof c.value === 'object' && c.value ? Object.entries(c.value).map(([a, b]) => `${a} ${f(b)}`).join(', ') : f(c.value)} (기준 ${f(c.min)})${k === 'test1_win_or_tie' ? ` 승 ${c.win}·무 ${c.tie}·패 ${c.loss}` : ''}`)]),
    ...(res.agreements ?? []).map((a) => (a.note ? `일치도: ${a.note}` : `일치도 ${a.a}↔${a.b}: ${Object.entries(a.items).map(([k, s]) => `${k} r=${f(s.r)} Δ=${f(s.mean_diff)}`).join(' · ')}`)),
    res.all_pass ? '→ 전부 합격' : '→ 합격 아님',
  ].join('\n')
}

async function main() {
  const argv = process.argv.slice(2)
  let keyPath, out, agree = false
  const responses = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--key') keyPath = argv[++i]
    else if (a === '--out') out = argv[++i]
    else if (a === '--agree') agree = true
    else if (a === '--responses') while (argv[i + 1] && !argv[i + 1].startsWith('--')) responses.push(argv[++i])
    else { console.error(`모르는 인자 "${a}" — 합격선은 인자로 바꿀 수 없다.\n사용법: --key <key.json> --responses <a.json> [b.json …] [--agree] [--out <result.json>]`); process.exit(64) }
  }
  if (!keyPath || !responses.length) { console.error('사용법: --key <key.json> --responses <a.json> [b.json …] [--agree] [--out <result.json>]'); process.exit(64) }
  let key, rs
  try { key = JSON.parse(readFileSync(keyPath, 'utf8')); rs = responses.map((p) => JSON.parse(readFileSync(p, 'utf8'))) } catch (e) { console.error(`파일을 못 읽음: ${e.message}`); process.exit(2) }
  const res = evaluate(key, rs, { agree })
  if (out) writeFileSync(out, JSON.stringify(res, null, 2) + '\n')
  console.log(summary(res))
  process.exitCode = res.all_pass ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
