#!/usr/bin/env node
// v71cg 블록 D 게이트 시험(합성 500건) — 조건부 참조집단 추정기가 "알고 있는 정답"을 복원하는지 본다.
//   node scripts/refgroup-synth.mjs
// ⚠️ 합성 자료로 추정기 코드의 정확성을 보는 시험이지, 실제 사례은행에 대한 통과가 아니다. 실제 자료 게이트(κ·백테스트)는 별도 — 통과 전까지 화면 통계는 닫혀 있다.
import { wilson, nTier, estimate, kappa, timeSplit, gateOpen, similarity } from '../lib/consult/refgroup.ts'

let seed = 20261112
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const BILL = ['월구독', '건당', '무료+광고'], CUST = ['소상공인', '중견', '개인'], TAGS = ['알림', '근태', '정산', '채팅', '리포트', '연동']
// 참 성공률은 구조 특성만으로 정해진다(월구독·소상공인이 유리). 표면 태그는 잡음.
const trueP = (s) => 0.25 + (s.billing === '월구독' ? 0.25 : 0) + (s.cust === '소상공인' ? 0.15 : 0)
const cases = Array.from({ length: 500 }, (_, i) => {
  const structure = { billing: pick(BILL), cust: pick(CUST) }
  return { structure, surface: [pick(TAGS), pick(TAGS)], outcome: rnd() < trueP(structure) ? 1 : 0, year: 2018 + Math.floor((i / 500) * 8) }
})
let fail = 0
const t = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

// 1) 복구 시험: 구조 층별 추정이 참값 ±0.12 안에 들어오는 층의 비율
let hit = 0, tot = 0
for (const b of BILL) for (const c of CUST) {
  const e = estimate({ structure: { billing: b, cust: c }, surface: [] }, cases, 60)
  tot++; if (Math.abs(e.p - trueP({ billing: b, cust: c })) <= 0.12) hit++
}
t('복구: 9개 층 중 참값 ±0.12 이내', hit >= 8, `${hit}/${tot}`)

// 2) 구간 포함: Wilson 95% 가 참값을 포함하는 비율(≥85%)
let cov = 0
for (const b of BILL) for (const c of CUST) {
  const e = estimate({ structure: { billing: b, cust: c }, surface: [] }, cases, 60), tp = trueP({ billing: b, cust: c })
  if (e.ci && e.ci.lo <= tp && tp <= e.ci.hi) cov++
}
t('Wilson 포함률 ≥ 85%', cov / 9 >= 0.85, `${cov}/9`)

// 3) κ: 두 번째 판정자(10% 잡음)가 정답 라벨과 얼마나 일치하나 — 게이트 κ ≥ 0.61
const truth = cases.map((c) => c.outcome), noisy = truth.map((y) => (rnd() < 0.1 ? 1 - y : y))
const k = kappa(truth, noisy)
t('κ ≥ 0.61 (잡음 10% 판정자)', k >= 0.61, k.toFixed(2))

// 4) 시간분할 Brier: 추정기가 "이전 전체 성공률" 기준선보다 낫다
const ts = timeSplit(cases, 2024, 60)
t('시간분할 Brier < 기준선', ts.brier < ts.baseline, `${ts.brier.toFixed(3)} < ${ts.baseline.toFixed(3)} (n=${ts.n})`)

// 5) 민감도: 표면 가중을 바꿔도(k 30→90) 결론이 같은 방향 — 월구독 층 > 건당 층
const hi = (kk) => estimate({ structure: { billing: '월구독', cust: '소상공인' }, surface: [] }, cases, kk).p
const lo = (kk) => estimate({ structure: { billing: '건당', cust: '개인' }, surface: [] }, cases, kk).p
t('민감도: k 30/60/90 에서 순서 불변', [30, 60, 90].every((kk) => hi(kk) > lo(kk)))

// 6) n 임계값·구간 단위 시험
t('n 등급 경계(9→숨김 10→참고 29→참고 30→기저율)', nTier(9) === 'hidden' && nTier(10) === 'ref' && nTier(29) === 'ref' && nTier(30) === 'base')
t('Wilson 0/0 은 null, 5/10 은 0.5 중심', wilson(0, 0) === null && Math.abs(wilson(5, 10).p - 0.5) < 1e-9)
t('구조가 하나라도 다르면 유사도 상한 0.3 이하(표면만 같음)', similarity({ structure: { a: 'x', b: 'y' }, surface: ['t'] }, { structure: { a: 'x', b: 'z' }, surface: ['t'] }) <= 0.7 * 0.5 + 0.3)

// 게이트: 합성 시험 통과 ≠ 실제 게이트. 실제 자료 κ 와 백테스트가 없어 닫아 둔다.
const open = gateOpen({ recovery: true, kappa: false, brier: false, sensitivity: true, nMin: false })
t('게이트는 실제 자료 시험 전까지 닫혀 있다', open === false)
console.log(fail ? `실패 ${fail}건` : '통과')
process.exitCode = fail ? 1 : 0
