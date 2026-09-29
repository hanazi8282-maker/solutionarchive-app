#!/usr/bin/env node
// "본문 안 펼쳐도 칼럼 승인이 눌리는" 사고(2026-09-29) 재발 방지 — 정적 배선 검사.
//   node scripts/columns-approve-gate-selftest.mjs
//
// 이 리포에는 React 컴포넌트를 렌더해서 보는 하네스(jsdom·@testing-library/react)가 없다
// (package.json 확인) — 그래서 다른 클라이언트 컴포넌트 셀프테스트가 없다. 대신 이 리포의
// 기존 관행(column-style-selftest.mjs §6 "배선")을 따라 소스 문자열로 배선 3곳을 고정한다:
//   1. review-gate.tsx 가 details onToggle 로 열림을 기록해 DecisionForm 에 넘긴다.
//   2. decision-form.tsx 가 그 값으로 승인 버튼을 잠그고 히든 필드로 폼에 싣는다.
//   3. actions.ts 가 서버에서도 그 히든 필드를 본다(클라이언트 우회 최소 방어).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

let pass = 0
const fails = []
const ok = (name, cond) => { if (cond) pass++; else fails.push(name) }

const gate = read('app/columns/review-gate.tsx')
const form = read('app/columns/decision-form.tsx')
const actions = read('app/columns/actions.ts')
const page = read('app/columns/page.tsx')

ok('review-gate 가 details onToggle 로 opened 상태를 켠다', /onToggle=.*setOpened\(true\)/s.test(gate))
ok('review-gate 가 opened 를 DecisionForm 의 bodyOpened 로 넘긴다', /<DecisionForm id={id} bodyOpened={opened} \/>/.test(gate))
ok('decision-form 승인 버튼이 bodyOpened 로 잠긴다', /name="decision" value="approved"[\s\S]*?disabled={pending \|\| !bodyOpened}/.test(form))
ok('decision-form 반려 버튼은 여전히 note 로만 잠긴다(사유 필수 유지)', /name="decision" value="rejected"[\s\S]*?disabled={pending \|\| !note\.trim\(\)}/.test(form))
ok('decision-form 이 bodyOpened 를 히든 필드로 폼에 싣는다', /name="bodyOpened" value={bodyOpened \? '1' : ''}/.test(form))
ok('decision-form 이 안 펼쳤을 때 힌트를 보여준다', form.includes('본문을 펼쳐 읽어야 승인할 수 있다'))
ok('actions.ts 가 승인일 때 bodyOpened 를 서버에서도 본다', /decisionRaw === 'approved' && fd\.get\('bodyOpened'\) !== '1'/.test(actions))
ok('draft 카드가 ColumnReviewGate 를 쓴다(승인 버튼이 본문 없이 안 뜬다)', /review_status === 'draft'[\s\S]*?<ColumnReviewGate id={c\.id} body={c\.body}>/.test(page))

if (fails.length) {
  console.error(`❌ columns-approve-gate-selftest — ${pass} pass / ${fails.length} fail`)
  for (const f of fails) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`✅ columns-approve-gate-selftest — ${pass} pass / 0 fail`)
