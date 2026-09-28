#!/usr/bin/env node
// lib/relevance-feedback/sample.ts 셀프테스트 — 네트워크·DB·env 없음.
//
// 고정하는 것:
//   1. 층 가르기(A rr-v2 / B 관련·정보 부족 / C 불일치 / D 둘 다 무관)와 컬럼 3상태(있음·없음·모름)
//   2. 배분(6·4·3·2) · 빈 층 보충 · 같은 날 같은 묶음(결정성) · 이미 본 행 제외(오늘 본 것은 남김)
//   3. 컬럼 없는 층은 "확인 불가"(available=false)이고 0 건으로 접지 않는다 — 나머지 층으로 채운다
//   4. 층별 일치율(A 정밀도·D 놓침·C 1차/2차 편·모름은 분모 제외)
//   5. 채점 입력 검증(서버 액션이 쓰는 readRelevanceSubmission)
//   6. 채점 전 카드에 모델 판정이 실리지 않는다(정적)

import fs from 'node:fs'
import {
  BATCH_SIZE, DEFAULT_QUOTA, columnAvailability, dailyTrend, disagreements, pickBatch, readRelevanceSubmission, stratumOf, stratumStats,
} from '../lib/relevance-feedback/sample.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${w}\n   실제 ${g}`) }
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let seq = 0
const mk = (v1, v2, i1, i2, extra = {}) => ({ input_id: uuid(++seq), project_id: 'p', verdict: v1, second_verdict: v2, product_informative: i1, second_product_informative: i2, human_verdict: null, human_graded_at: null, human_product_informative: null, ...extra })
const full = { second: true, informative: true }

// 1) 층
t('A = 둘 다 relevant ∧ 둘 다 정보있음', stratumOf(mk('relevant', 'relevant', true, true), full), 'A')
t('B = 둘 다 relevant, 한쪽만 정보있음', stratumOf(mk('relevant', 'relevant', true, false), full), 'B')
t('B = 둘 다 relevant, 정보성 null', stratumOf(mk('relevant', 'relevant', null, null), full), 'B')
t('C = 1차·2차 다름', stratumOf(mk('relevant', 'irrelevant', null, null), full), 'C')
t('C = unknown 섞임도 불일치', stratumOf(mk('unknown', 'relevant', null, null), full), 'C')
t('D = 둘 다 irrelevant', stratumOf(mk('irrelevant', 'irrelevant', null, null), full), 'D')
t('판정 하나뿐 → 층 없음', stratumOf(mk('relevant', null, null, null), full), null)
t('둘 다 unknown → 층 없음', stratumOf(mk('unknown', 'unknown', null, null), full), null)
t('정보성 컬럼 없음 → 둘 다 relevant 는 층 없음(A·B 확인 불가)', stratumOf(mk('relevant', 'relevant', true, true), { second: true, informative: false }), null)
t('정보성 컬럼 없음 → D 는 그대로', stratumOf(mk('irrelevant', 'irrelevant', null, null), { second: true, informative: false }), 'D')
t('2차 컬럼 없음 → 전부 층 없음', stratumOf(mk('irrelevant', 'irrelevant', null, null), { second: false, informative: false }), null)

// 컬럼 3상태
t('컬럼 있음', columnAvailability([{ second_verdict: null, product_informative: null, second_product_informative: null }]), full)
t('000031 없음', columnAvailability([{ second_verdict: null }]), { second: true, informative: false })
t('행 0 → 모름(null), 없음으로 접지 않는다', columnAvailability([]), { second: null, informative: null })

// 2) 배분·보충·결정성
const pool = [
  ...Array.from({ length: 20 }, () => mk('relevant', 'relevant', true, true)),
  ...Array.from({ length: 20 }, () => mk('relevant', 'relevant', false, true)),
  ...Array.from({ length: 20 }, () => mk('relevant', 'irrelevant', null, null)),
  ...Array.from({ length: 20 }, () => mk('irrelevant', 'irrelevant', null, null)),
]
const today = '2026-09-28'
const b1 = pickBatch(pool, { today })
const count = (b) => Object.fromEntries(['A', 'B', 'C', 'D'].map((s) => [s, b.items.filter((i) => i.stratum === s).length]))
t('기본 배분 6·4·3·2 = 15', [count(b1), b1.items.length], [DEFAULT_QUOTA, BATCH_SIZE])
t('같은 날 같은 묶음', pickBatch(pool, { today }).items.map((i) => i.row.input_id), b1.items.map((i) => i.row.input_id))
t('입력 순서가 달라도 같은 묶음', pickBatch([...pool].reverse(), { today }).items.map((i) => i.row.input_id), b1.items.map((i) => i.row.input_id))
t('다른 날은 다른 묶음', pickBatch(pool, { today: '2026-09-29' }).items.map((i) => i.row.input_id).join() !== b1.items.map((i) => i.row.input_id).join(), true)

const noA = pool.filter((r) => stratumOf(r, full) !== 'A')
const b2 = pickBatch(noA, { today })
t('A 가 비면 다른 층에서 채워 15장', [b2.items.length, count(b2).A, b2.strata.A.available, b2.strata.A.pool], [15, 0, true, 0])
t('작은 모집단은 있는 만큼', pickBatch(pool.slice(0, 3), { today }).items.length, 3)

// 이미 본 행
const seenOld = mk('relevant', 'relevant', true, true, { human_verdict: 'relevant', human_graded_at: '2026-09-20T01:00:00Z' })
const seenToday = mk('irrelevant', 'irrelevant', null, null, { human_verdict: 'irrelevant', human_graded_at: '2026-09-28T02:00:00Z' })
const seenNoTime = mk('irrelevant', 'irrelevant', null, null, { human_verdict: 'relevant', human_graded_at: null })
const b3 = pickBatch([seenOld, seenToday, seenNoTime], { today })
t('예전에 본 행 제외 · 시각 없는 채점 제외 · 오늘 본 행은 남김(묶음 고정)', b3.items.map((i) => i.row.input_id), [seenToday.input_id])
t('exclude(원문 없음) 제외', pickBatch([seenToday], { today, exclude: new Set([seenToday.input_id]) }).items.length, 0)

// 3) 컬럼 없음 → 확인 불가 + 나머지로 채움
const legacy = pool.map(({ product_informative, second_product_informative, ...r }) => r)
const b4 = pickBatch(legacy, { today })
t('000031 없음: A·B 확인 불가, C·D 로 15장', [b4.strata.A.available, b4.strata.B.available, b4.strata.C.available, b4.items.length, count(b4).A + count(b4).B], [false, false, true, 15, 0])
const noSecond = legacy.map(({ second_verdict, ...r }) => r)
const b5 = pickBatch(noSecond, { today })
t('000027 없음: 전 층 확인 불가, 0장', [['A', 'B', 'C', 'D'].map((s) => b5.strata[s].available), b5.items.length], [[false, false, false, false], 0])
t('행 0: 확인 불가(모름)', pickBatch([], { today }).strata.D.available, false)

// 4) 일치율
const g = (v1, v2, i1, i2, h, hi = null, at = '2026-09-28T03:00:00Z') => mk(v1, v2, i1, i2, { human_verdict: h, human_product_informative: hi, human_graded_at: at })
const graded = [
  g('relevant', 'relevant', true, true, 'relevant', true),
  g('relevant', 'relevant', true, true, 'relevant'),
  g('relevant', 'relevant', true, true, 'irrelevant'),
  g('relevant', 'relevant', true, true, 'unknown'),
  g('irrelevant', 'irrelevant', null, null, 'irrelevant'),
  g('irrelevant', 'irrelevant', null, null, 'relevant'),
  g('relevant', 'irrelevant', null, null, 'relevant'),
  g('relevant', 'irrelevant', null, null, 'irrelevant'),
  g('irrelevant', 'relevant', null, null, 'relevant'),
]
const st = stratumStats(graded, full)
t('A 정밀도 2/3, 모름은 분모 제외', [st.A.graded, st.A.agree, Math.round(st.A.rate * 1000), st.A.humanUnknown, st.A.informativeTrue], [3, 2, 667, 1, 1])
t('D 놓침 1/2', [st.D.graded, st.D.graded - st.D.agree], [2, 1])
t('C 1차 편 1 / 2차 편 2, 기대값 없음', [st.C.graded, st.C.firstRight, st.C.secondRight, st.C.agree, st.C.rate], [3, 1, 2, null, null])
t('B 채점 0 → rate null(0% 아님)', [st.B.graded, st.B.rate], [0, null])
t('컬럼 없으면 A 확인 불가', stratumStats(graded, { second: true, informative: false }).A.available, false)
t('어긋난 사례 = A 1 + D 1 + C 3', disagreements(graded, full).map((d) => d.stratum).sort().join(''), 'ACCCD')
const tr = dailyTrend(graded, { today, days: 3 }, full)
t('추이: 3일 칸, 오늘 A 2/3', [tr.length, tr[0].date, tr[0].strata.A], [3, today, { graded: 3, agree: 2 }])

// 5) 입력 검증
const ok = readRelevanceSubmission({ inputId: uuid(1), verdict: 'relevant', informative: 'false', note: '  기준이 가격 언급을 놓친다 ' })
t('정상 입력', ok.value, { inputId: uuid(1), verdict: 'relevant', informative: false, note: '기준이 가격 언급을 놓친다' })
t('정보성·메모 비움 → null', readRelevanceSubmission({ inputId: uuid(1), verdict: 'unknown', informative: null, note: '' }).value, { inputId: uuid(1), verdict: 'unknown', informative: null, note: null })
t('판정 빈칸 거절(안 봄 ≠ 무관)', readRelevanceSubmission({ inputId: uuid(1), verdict: null, informative: null, note: null }).value, null)
t('어휘 밖 판정 거절', readRelevanceSubmission({ inputId: uuid(1), verdict: 'maybe', informative: null, note: null }).value, null)
t('uuid 아님 거절', readRelevanceSubmission({ inputId: 'x; drop', verdict: 'relevant', informative: null, note: null }).value, null)
t('정보성 이상값 거절', readRelevanceSubmission({ inputId: uuid(1), verdict: 'relevant', informative: 'yes', note: null }).value, null)
t('메모 1000자 초과 거절', readRelevanceSubmission({ inputId: uuid(1), verdict: 'relevant', informative: null, note: 'x'.repeat(1001) }).value, null)

// 6) 끌림 방지 — 채점 전 카드에 모델 판정·층이 props 로 가지 않는다
const page = fs.readFileSync(new URL('../app/relevance/grade/page.tsx', import.meta.url), 'utf8')
const card = fs.readFileSync(new URL('../app/relevance/grade/relevance-card.tsx', import.meta.url), 'utf8')
t('공개는 채점된 행에만', /revealed=\{row\.human_verdict != null \? reveal\(row, stratum\) : null\}/.test(page), true)
t('카드 props 에 판정 필드 없음', /verdict|stratum/.test(card.slice(card.indexOf('export function RelevanceCard'), card.indexOf('}) {'))), false)
const action = fs.readFileSync(new URL('../app/relevance/actions.ts', import.meta.url), 'utf8')
t('층은 서버에서 다시 계산(폼 값 아님)', /fd\.get\('stratum'\)/.test(action) === false && /stratumOf\(r, avail\)/.test(action), true)

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 층 가르기·배분·보충·결정성·본 행 제외·컬럼 3상태·일치율·입력 검증·끌림 방지`)
process.exit(fail ? 1 : 0)
