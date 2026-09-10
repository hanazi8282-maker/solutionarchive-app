#!/usr/bin/env node
// parseFailedAnglesTable 셀프테스트. 네트워크·DB 없음.
// 정본 md 를 실제로 파싱하고, 형식 위반이 조용히 넘어가지 않는지(§7.1) 확인한다.

import fs from 'node:fs'
import { parseFailedAnglesTable } from './failed-angles-sync.mjs'

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
ok('정본: 5~10행 사이(§13-2 지시)', rows.length >= 5 && rows.length <= 10)
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
    H + '| valid-key | x | x | x | x | 공개 보도 | false |\n설명 문단, 표 아님\n',
  )
  t('구분선·설명행 섞여도 유효 행만 파싱', r.length, 1)
}

throws('product_category 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key |  | x | x | x | 공개 보도 | false |'))
throws('claimed_angle 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x |  | x | x | 공개 보도 | false |'))
throws('outcome 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | x |  | x | 공개 보도 | false |'))
throws('evidence_source 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | x | x |  | 공개 보도 | false |'))
throws('source_tier 비어있음 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | x | x | x |  | false |'))
throws('is_estimate 가 true/false 아님 → throw', () =>
  parseFailedAnglesTable(H + '| valid-key | x | x | x | x | 공개 보도 | maybe |'))
throws('중복 case_key → throw', () =>
  parseFailedAnglesTable(H + '| dup-key | x | a | a | a | 공개 보도 | false |\n| dup-key | y | b | b | b | 공개 보도 | true |'))
throws('행이 0건 → throw', () => parseFailedAnglesTable(H))

// 정상 최소 표는 통과
{
  const r = parseFailedAnglesTable(H + '| test-case-1 | 테스트 카테고리 | 테스트 앵글 | 테스트 결과 | 테스트 출처 | 공개 보도 | true |')
  t('최소 표: 1행', r.length, 1)
  t('최소 표: is_estimate=true 파싱', r[0].is_estimate, true)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('표 파서가 틀렸다. 시드/동기화가 원장과 어긋난다.'); process.exitCode = 1 }
else console.log('표 파서 정상 — 정본 5~10행 + 형식 위반 전부 throw.')
