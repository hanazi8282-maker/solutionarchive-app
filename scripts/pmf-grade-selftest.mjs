#!/usr/bin/env node
// PMF 등급축 셀프테스트 — 네트워크·DB 없음. 입력은 리포에 있는 **실제 초안 JSON**이다.
//
// 무엇을 고정하나
//   1. 설계 표(reports/2026-09-23/pmf-grade-axis-design.md §4)의 대표 15행을 같은 입력으로
//      돌려 등급을 비교한다. 표는 **사람이 손으로 채점한 값**이고 설계 자신이 "코드로
//      옮기면 경계에서 4~6개는 달라질 수 있다"고 적어 뒀다(§4 마지막 줄). 그래서 이
//      테스트는 표를 정답으로 두지 않는다 — **코드 결과를 pin 하고, 표와의 차이를 목록으로
//      출력한다.** 산식을 표에 맞춰 억지로 구부리는 것이 이 파일의 목적이 아니다.
//   2. 산식의 불변식(표와 무관하게 틀리면 버그인 것):
//      · S0 → 반드시 D.  · 사람이 S 를 안 고르면 반드시 잠정.
//      · 투입 지표는 S2 상한.  · 전제 미기재(T0)는 D 로도 A 로도 가지 않는다(C + 잠정).
//      · `transferability` 사람 판정이 있으면 전제 낱말을 보지 않는다.
//
// 왜 초안 JSON 을 읽나: 전제 문장·수치를 손으로 옮겨 적으면 그 순간 "코드가 실제 데이터에서
// 어떻게 판정하나"를 확인하는 테스트가 아니게 된다(§7.1 — 검사 방법이 주장과 같아야 한다).
// 초안이 바뀌면 이 테스트가 빨간불이 되는 게 맞다. 그때 pin 을 다시 본다.
//
// 종료 코드: 0 통과 / 1 불변식 위반

import fs from 'node:fs'
import path from 'node:path'
import { pmfGrade, suggestSignal, transferScore } from '../lib/cases/draft.ts'

const DRAFTS = path.join(process.cwd(), 'drafts', 'cases')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 대표 15행 ─────────────────────────────────────────────────
//
// table = 설계 §4 표의 손채점 등급(S/T 포함).  code = 지금 산식의 결과(pin).
// kind  = 사람이 채점 카드에서 고를 `metric_kind`. 표가 "(투입)" 이라고 적은 행에만 준다 —
//         그 필드는 사람 입력이라, 안 주고 비교하면 산식이 아니라 빈 필드를 테스트하게 된다.
// trans = DB 에 들어 있는 `transferability` 사람 판정(41개 중 3개뿐).
//
// ⚠️ everlane · zenefits · elf · gopro · hims · oatly · peloton · ritual · homejoy · fab 중
//    일부는 이 리포의 `drafts/cases/` 에 파일이 없다(DB 에만 있다). 없는 것을 손으로 지어
//    넣지 않는다 — 파일이 있는 15행으로 고정하고, 빠진 행은 보고서에 적는다.
const ROWS = [
  { slug: 'blue-apron-paid-acquisition-treadmill', move: 0, table: 'A', tableST: 'S3T3', code: 'A' },
  { slug: 'blue-apron-paid-acquisition-treadmill', move: 2, table: 'A', tableST: 'S3T2', code: 'B', kind: 'input' },
  { slug: 'convertkit-concierge-migration-conversion', move: 0, table: 'A', tableST: 'S3T3', code: 'A', trans: 'HIGH' },
  { slug: 'dr-squatch-humor-video-natural-soap', move: 0, table: 'B', tableST: 'S3T1', code: 'B' },
  { slug: 'figma-non-designer-distribution', move: 0, table: 'A', tableST: 'S2T3', code: 'B' },
  { slug: 'figma-non-designer-distribution', move: 1, table: 'B', tableST: 'S2T2', code: 'B' },
  { slug: 'lactofit-mass-price-probiotics', move: 1, table: 'D', tableST: 'S0T2', code: 'D' },
  { slug: 'native-deodorant-reformulation-reorder', move: 0, table: 'A', tableST: 'S3T2', code: 'A' },
  { slug: 'native-deodorant-reformulation-reorder', move: 1, table: 'D', tableST: 'S0T3', code: 'D' },
  { slug: 'notion-template-gallery', move: 0, table: 'A', tableST: 'S2T3', code: 'B', kind: 'input' },
  { slug: 'pets-com-mass-awareness-negative-margin', move: 0, table: 'A', tableST: 'S3T3', code: 'A' },
  { slug: 'purple-innovation-capacity-scaleup', move: 0, table: 'C', tableST: 'S2T1', code: 'B' },
  { slug: 'tuft-and-needle-amazon-review-trust', move: 2, table: 'A', tableST: 'S2T3', code: 'B' },
  { slug: 'slack-bottom-up-conversion', move: 0, table: 'B', tableST: 'S2T2', code: 'A' },
  { slug: 'zapier-integration-page-seo-distribution', move: 0, table: 'A', tableST: 'S2T3', code: 'B', kind: 'input' },
]

const load = (slug) => JSON.parse(fs.readFileSync(path.join(DRAFTS, `${slug}.json`), 'utf8'))

const diffs = []
const tally = { A: 0, B: 0, C: 0, D: 0 }

for (const row of ROWS) {
  const d = load(row.slug)
  const m = d.moves[row.move]
  ok(`${row.slug} #${row.move} 무브가 초안에 있다`, Boolean(m))
  if (!m) continue
  const move = {
    ...m,
    outcome_status: d.outcome_status,
    ...(row.kind ? { metric_kind: row.kind } : {}),
    ...(row.trans ? { transferability: row.trans } : {}),
  }
  const ev = (d.evidence ?? []).filter((e) => e.move === row.move)
  const r = pmfGrade(move, ev)
  const label = `${d.slug} ${m.lever}`

  // pin — 산식이 조용히 바뀌면 여기서 빨간불이 난다.
  t(`${label}: 코드 등급`, r.grade, row.code)
  tally[r.grade]++

  // 불변식 1 — S0 은 무조건 D.
  if (r.signal === 0) t(`${label}: S0 은 D`, r.grade, 'D')
  // 불변식 2 — 사람이 S 를 고르지 않았으면 잠정이다.
  ok(`${label}: S 미지정이면 잠정`, r.provisional === true)
  // 불변식 3 — 투입 지표는 S2 상한.
  if (row.kind === 'input') ok(`${label}: 투입 지표 S≤2`, r.signal <= 2)

  if (r.grade !== row.table) {
    diffs.push(`${label} — 표 ${row.table}(${row.tableST}) / 코드 ${r.grade}(S${r.signal}T${r.transfer})`)
  }
}

// ── 불변식 (표와 무관) ───────────────────────────────────────
const base = {
  lever: 'PRICING', claim: '가격을 절반으로 내렸다',
  transfer_note: '내일 주력 1개만 가격표를 바꿔 본다',
  preconditions: '월별 매출과 원가를 항목별로 나눠 볼 수 있어야 한다',
  outcome_direction: 'positive',
  metric_name: '매출', metric_before: 100, metric_after: 300, metric_unit: '백만원',
}
const ev1 = [{ url: 'https://sec.gov/x', source_tier: 'primary', is_regulatory_filing: true, observation_key: 'x-10k' }]

t('S: 3배 변화 → 3', suggestSignal(base, ev1).signal, 3)
t('S: 투입 지표는 2 상한', suggestSignal({ ...base, metric_kind: 'input' }, ev1).signal, 2)
// 규칙 ③(비율은 pp)과 S3 조항("감소는 ≤½")은 OR 다. 설계가 ConvertKit 이탈
// 5.5→1.5%(4pp 지만 1/3.7 로 줄었다)를 S3 예로 들었다 — pp 만 보면 그게 S1 이 된다.
t('S: 비율 지표라도 절반 이하로 줄면 3 (ConvertKit 이탈 5.5→1.5%)',
  suggestSignal({ ...base, metric_unit: '%', metric_before: 5.5, metric_after: 1.5 }, ev1).signal, 3)
t('S: 비율 지표 5pp 미만 · 2배 미만 → 1 (39.4→44.1%)',
  suggestSignal({ ...base, metric_unit: '%', metric_before: 39.4, metric_after: 44.1 }, ev1).signal, 1)
t('S: 비율 지표 5~10pp → 2 (14.8→21%)',
  suggestSignal({ ...base, metric_unit: '%', metric_before: 14.8, metric_after: 21 }, ev1).signal, 2)
t('S: 부호가 뒤집히면 3 (이익 → 손실)',
  suggestSignal({ ...base, metric_before: 5, metric_after: -3 }, ev1).signal, 3)
t('S: 비율 지표 10pp 이상 → 3',
  suggestSignal({ ...base, metric_unit: '%', metric_before: 14.8, metric_after: 24.8 }, ev1).signal, 3)
t('S: 단일 시점은 1 (벤치마크는 코드가 모른다)',
  suggestSignal({ ...base, metric_before: null }, ev1).signal, 1)
t('S: 수치 없으면 0', suggestSignal({ ...base, metric_after: null }, []).signal, 0)
t('S: 0 → 값이 생기면 3', suggestSignal({ ...base, metric_before: 0 }, ev1).signal, 3)
t('S: 실패 확정(negative+shutdown)은 3',
  suggestSignal({ ...base, outcome_direction: 'negative', outcome_status: 'shutdown', metric_before: 100, metric_after: 95 }, ev1).signal, 3)
t('S: 실패 확정이어도 투입 지표는 2',
  suggestSignal({ ...base, outcome_direction: 'negative', outcome_status: 'shutdown', metric_kind: 'input' }, ev1).signal, 2)

t('T: 사람 판정 HIGH → 3', transferScore({ ...base, transferability: 'HIGH' }).transfer, 3)
ok('T: 사람 판정은 잠정이 아니다', transferScore({ ...base, transferability: 'LOW' }).provisional === false)
t('T: 미판정 + 전제가 데이터뿐 → 3', transferScore(base).transfer, 3)
t('T: 미판정 + 전제에 공장 → 1',
  transferScore({ ...base, preconditions: '자체 공장이 있어야 한다' }).transfer, 1)
t('T: 미판정 + 전제에 현금 → 2',
  transferScore({ ...base, preconditions: '한 달 버틸 현금이 있어야 한다' }).transfer, 2)
t('T: 전제 미기재는 0 (LOW 가 아니다)', transferScore({ ...base, preconditions: null }).transfer, 0)
ok('T: 낱말 폴백은 잠정', transferScore(base).provisional === true)

// 합성표 §3-3
const at = (signal, preconditions) => pmfGrade({ ...base, preconditions }, ev1, { signal }).grade
const PRE = { 3: '월 매출을 볼 수 있어야 한다', 2: '위탁 생산 관계가 있어야 한다', 1: '자체 공장이 필요하다' }
t('합성 S3·T3 → A', at(3, PRE[3]), 'A')
t('합성 S3·T2 → A', at(3, PRE[2]), 'A')
t('합성 S3·T1 → B', at(3, PRE[1]), 'B')
t('합성 S2·T3 → A', at(2, PRE[3]), 'A')
t('합성 S2·T2 → B', at(2, PRE[2]), 'B')
t('합성 S2·T1 → C', at(2, PRE[1]), 'C')
t('합성 S1·T3 → B', at(1, PRE[3]), 'B')
t('합성 S1·T2 → C', at(1, PRE[2]), 'C')
t('합성 S1·T1 → C', at(1, PRE[1]), 'C')
t('합성 S0 → D (T 와 무관)', at(0, PRE[3]), 'D')
t('합성 T0(전제 미기재) → C', pmfGrade({ ...base, preconditions: null }, ev1, { signal: 3 }).grade, 'C')
ok('합성 T0 은 잠정', pmfGrade({ ...base, preconditions: null }, ev1, { signal: 3 }).provisional === true)

// 사람이 S 를 고르고 이식성도 사람 판정이면 확정이다 — 그때만 잠정이 꺼진다.
const confirmed = pmfGrade({ ...base, transferability: 'HIGH' }, ev1, { signal: 3 })
t('확정: 사람 S + 사람 이식성 → A', confirmed.grade, 'A')
ok('확정: 잠정 아님', confirmed.provisional === false)
ok('확정: 사유에 S·T 가 남는다', /S3·T3/.test(confirmed.reason))
// 범위 밖 S 는 사람 값으로 취급하지 않는다 — 조용히 쓰면 등급이 사라진다.
ok('S=4 는 무시하고 제안값으로 (잠정)',
  pmfGrade({ ...base, transferability: 'HIGH' }, ev1, { signal: 4 }).provisional === true)
// 실패 케이스도 A 가 될 수 있다 (남헌 2026-09-23). 방향은 배지 아이콘이 가른다.
t('실패 케이스도 A 가능',
  pmfGrade({ ...base, outcome_direction: 'negative', outcome_status: 'shutdown', transferability: 'HIGH' }, ev1).grade, 'A')

// ── 설계 표와의 차이 ─────────────────────────────────────────
console.log(`\n대표 ${ROWS.length}행 코드 집계 — A${tally.A} · B${tally.B} · C${tally.C} · D${tally.D}`)
if (diffs.length === 0) {
  console.log('설계 §4 손채점과 전부 일치.')
} else {
  console.log(`\n⚠️ 설계 §4 손채점과 다른 판정 ${diffs.length}/${ROWS.length}건 — 표가 정답이 아니라 손채점이다(§4 마지막 줄).`)
  for (const d of diffs) console.log(`  · ${d}`)
  console.log('  차이의 뿌리 셋 — 전부 "사람이 채울 자리를 코드가 보수적으로 메운" 자국이다:')
  console.log('   (1) 단일 시점 수치를 코드는 S1 로 둔다. 표는 벤치마크를 알고 S2 를 줬다(NPS 76·비디자이너 66%).')
  console.log('       → 채점 카드에서 사람이 S 를 고르면 이 차이는 사라진다(남헌 2026-09-23: S 는 사람이 고른다).')
  console.log('   (2) 투입 지표 상한(규칙 ②)을 코드는 예외 없이 건다. 표는 일부 행에서 S3 를 줬다(blue-apron 시설 2→0).')
  console.log('   (3) T 낱말 폴백은 부정문·맥락을 못 읽는다("즉시 전환 채널이 아니다" 의 \'채널\').')
  console.log('       → `transferability` 사람 판정을 채우면 낱말을 아예 안 본다.')
}

console.log(`\n${fail ? `❌ 실패 ${fail}건 / 통과 ${pass}건` : `✅ 통과 ${pass}건 — S·T 산식 · 합성표 9칸 · T0/S0 경계 · 잠정 플래그 · 실제 초안 ${ROWS.length}행 pin`}`)
process.exit(fail ? 1 : 0)
