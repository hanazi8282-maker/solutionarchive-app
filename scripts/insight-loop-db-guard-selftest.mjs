#!/usr/bin/env node
// 인사이트 루프의 DB 오류 가드 셀프테스트 (진단 2-3). 네트워크·DB 없음.
//
// 고정하는 것 두 가지:
//   1. must() 가 error 를 그대로 던지고, 성공은 결과를 돌려준다.
//   2. lib/insight/loop.ts 안의 모든 `await supabase` 호출이 error 를 받는다.
//      — 이 파일에서 실제로 난 사고가 "error 를 구조분해하지 않아 조회 실패가
//      '그런 행 없음'이 되고, 이어지는 INSERT 가 UNIQUE 로 죽는데 그것도 안 봐서
//      그날 밤 근거가 통째로 사라진 것"이다. 한 줄만 되돌아가도 같은 사고가 난다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { must } from '../lib/insight/loop.ts'

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) pass++
  else {
    fail++
    console.log(`❌ ${name}`)
  }
}

// ── 1) must() ────────────────────────────────────────────────────
{
  const r = await must('조회', Promise.resolve({ data: [1, 2], error: null }))
  ok('must: 성공하면 결과를 그대로 돌려준다', r.data.length === 2)
}
{
  let thrown = null
  try {
    await must('패턴 존재 확인(foo)', Promise.resolve({ data: null, error: { message: 'boom' } }))
  } catch (e) {
    thrown = e
  }
  ok('must: error 가 있으면 던진다', thrown instanceof Error)
  ok('must: 무엇이 실패했는지 메시지에 남는다', thrown?.message.includes('패턴 존재 확인(foo)'))
  ok('must: 원인도 남는다', thrown?.message.includes('boom'))
}
{
  // 조회 실패를 "없음"으로 접으면 안 된다 — data 가 null 이어도 error 가 있으면 실패다.
  let thrown = false
  try {
    await must('x', Promise.resolve({ data: null, error: { message: 'PGRST205' } }))
  } catch {
    thrown = true
  }
  ok('must: data=null + error → 음성이 아니라 실패', thrown)
}

// ── 2) loop.ts 전수 검사 ─────────────────────────────────────────
{
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'insight', 'loop.ts'),
    'utf-8',
  )
  const bare = src
    .split('\n')
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter((l) => l.line.includes('await supabase'))
    .filter((l) => !l.line.startsWith('*') && !l.line.startsWith('//')) // 주석 제외
    .filter((l) => !/\berror\b/.test(l.line)) // error 를 구조분해했으면 통과

  ok(
    `loop.ts: error 를 안 받는 supabase 호출 0건 (실제 ${bare.length}건)`,
    bare.length === 0,
  )
  if (bare.length) for (const b of bare) console.log(`   ${b.no}: ${b.line}`)
  // must() 로 감싼 호출은 `await must(` 로 시작하므로 위 필터에 안 걸린다. 그 수가 0 이면
  // 누군가 가드를 통째로 걷어낸 것이다.
  ok('loop.ts: must() 로 감싼 쓰기가 남아 있다', (src.match(/await must\(/g) ?? []).length >= 8)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('DB 오류 가드가 뚫렸다. 조회 실패가 "패턴 없음"으로 접히고 근거가 사라진다(진단 2-3).')
  process.exitCode = 1
} else {
  console.log('DB 오류 가드 정상 — must() 동작·loop.ts 전수 확인.')
}
