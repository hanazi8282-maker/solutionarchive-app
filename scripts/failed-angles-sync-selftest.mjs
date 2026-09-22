#!/usr/bin/env node
// parseFailedAnglesTable 셀프테스트. 네트워크·DB 없음.
// 정본 md 를 실제로 파싱하고, 형식 위반이 조용히 넘어가지 않는지(§7.1) 확인한다.

import fs from 'node:fs'
import { parseFailedAnglesTable } from './failed-angles-sync.mjs'
import { hasPainTerm, PAIN_TERM_LEGACY_KEYS } from '../lib/cases/draft.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)
const throws = (name, fn) => {
  try { fn(); fail++; console.log(`❌ ${name} — throw 했어야 하는데 안 함`) }
  catch { pass++ }
}

// ── 정본 md ──────────────────────────────────────────────────────
const rows = parseFailedAnglesTable(fs.readFileSync('docs/failed-angles.md', 'utf8'))
// 2026-09-21 남헌 결정: §13-2 콜드스타트 5~10행은 시작 기준이었고 09-12(PR #49)에 12행으로 늘린 것은 의도된 것.
//   이제는 원장 실제 행수를 고정한다 — 행을 더 넣으면 이 숫자를 같이 올려라.
//   2026-09-21 배치 3: DB 에만 있던 10건 중 is_estimate=false 4건 편입(12→16).
//   2026-09-21 배치 4: 남헌 승인으로 추정 6건 편입(16→22) — 출처 URL 재검증 뒤, 검증 안 된 수치(beautycounter SKU 수)는 뺐다.
//   2026-09-21 배치 5(처방 매칭 4라운드): 건기식·헤어케어 실패 2건 편입(22→24) — Care/of 폐업, Function of Beauty 공장 폐쇄. 둘 다 인과는 추정.
//   2026-09-22 배치 6(5라운드, 페인 낱말 규칙 도입): 뷰티 실패 4건 + 국내 유산균 함량 미달 2건 편입(24→30). 새 행은 전부 claimed_angle 에 페인 낱말 포함.
t('정본: 48행', rows.length, 48)
ok('정본: 규칙 후 신규 행은 전부 페인 낱말 포함', rows.every((r) => PAIN_TERM_LEGACY_KEYS.has(r.case_key) || hasPainTerm(r.claimed_angle)))
ok('정본: 전부 case_key 형식(소문자·숫자·하이픈)', rows.every((r) => /^[a-z0-9-]+$/.test(r.case_key)))
ok('정본: 전부 source_tier=공개 보도', rows.every((r) => r.source_tier === '공개 보도'))
ok('정본: is_estimate 전부 boolean', rows.every((r) => typeof r.is_estimate === 'boolean'))
ok('정본: 최소 1건은 is_estimate=true', rows.some((r) => r.is_estimate === true))
ok('정본: 최소 1건은 is_estimate=false', rows.some((r) => r.is_estimate === false))

const quibi = rows.find((r) => r.case_key === 'quibi-mobile-shortform')
ok('quibi 행 존재', quibi)
t('quibi product_category', quibi.product_category, '모바일 숏폼 스트리밍')
t('quibi is_estimate', quibi.is_estimate, false)

// ── 형식 위반은 throw (조용히 건너뛰지 않는다) ─────────────────────
const H = '| case_key | product_category | claimed_angle | outcome | evidence_source | source_tier | is_estimate |\n|---|---|---|---|---|---|---|\n'
// case_key 형식이 아닌 행(구분선·설명행)은 throw 가 아니라 조용히 건너뛴다
// (strategy-principles-sync.mjs 와 동일 패턴 — 헤더/구분선을 에러로 취급하지 않음).
{
  const r = parseFailedAnglesTable(
    H + '| valid-key | x | 가격 x | x | x | 공개 보도 | false |\n설명 문단, 표 아님\n',
  )
  t('구분선·설명행 섞여도 유효 행만 파싱', r.length, 1)
}

throws('product_category 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key |  | x | x | x | 공개 보도 | false |'))
throws('claimed_angle 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x |  | x | x | 공개 보도 | false |'))
throws('outcome 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | 가격 x |  | x | 공개 보도 | false |'))
throws('evidence_source 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | 가격 x | x |  | 공개 보도 | false |'))
throws('source_tier 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | 가격 x | x | x |  | false |'))
throws('is_estimate 가 true/false 아님 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | 가격 x | x | x | 공개 보도 | maybe |'))
throws('중복 case_key → throw', () =>
  parseFailedAnglesTable(H + '| dup-key | x | 가격 a | a | a | 공개 보도 | false |\n| dup-key | y | 가격 b | b | b | 공개 보도 | true |'))
throws('행이 0건 → throw', () => parseFailedAnglesTable(H))
// 2026-09-22 페인 낱말 규칙 — 새 키는 claimed_angle 에 페인 낱말이 없으면 throw, 규칙 전 키는 면제
throws('새 case_key + 페인 낱말 없음 → throw', () =>
  parseFailedAnglesTable(H + '| new-key-no-pain | x | 레이저로 대체 | x | x | 공개 보도 | false |'))
t('legacy 키는 페인 낱말 없어도 통과',
  parseFailedAnglesTable(H + '| quibi-mobile-shortform | x | 레이저로 대체 | x | x | 공개 보도 | false |').length, 1)

// 정상 최소 표는 통과
{
  const r = parseFailedAnglesTable(H + '| test-case-1 | 테스트 카테고리 | 가격 테스트 앵글 | 테스트 결과 | 테스트 출처 | 공개 보도 | true |')
  t('최소 표: 1행', r.length, 1)
  t('최소 표: is_estimate=true 파싱', r[0].is_estimate, true)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('표 파서가 틀렸다. 시드/동기화가 원장과 어긋난다.'); process.exitCode = 1 }
else console.log('표 파서 정상 — 정본 30행 + 형식 위반 전부 throw + 신규 행 페인 낱말 규칙.')
