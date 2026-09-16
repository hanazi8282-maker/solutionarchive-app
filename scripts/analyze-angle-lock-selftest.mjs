#!/usr/bin/env node
// 앵글 생성 낙관적 락 셀프테스트 (진단 1-1). 네트워크·DB 없음.
//
// 고정하는 것:
//   1. 조건부 UPDATE 가 0행이면 409 (두 번째 요청을 LLM 앞에서 끊는다).
//   2. 락에 쓰는 상태값이 **실제 DB CHECK 제약에 들어 있는 값**인지.
//      — 마이그레이션 적용은 사람이 한다(CLAUDE.md §10.1). 코드가 먼저 새 상태값을
//      쓰기 시작하면 적용 전까지 앵글 생성이 CHECK 위반으로 통째로 죽는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lockVerdict, CLAIMED_STATUS, RELEASE_STATUS } from '../lib/analysis/angle-lock.ts'

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) pass++
  else {
    fail++
    console.log(`❌ ${name}`)
  }
}

// ── 1) lockVerdict ───────────────────────────────────────────────
ok('락: 1행 갱신되면 획득', lockVerdict([{ id: 'x' }], null).ok === true)
ok('락: 0행이면 획득 실패', lockVerdict([], null).ok === false)
ok('락: 0행은 409 (500 아님 — 실패가 아니라 경합)', lockVerdict([], null).status === 409)
ok('락: null 도 409', lockVerdict(null, null).status === 409)
ok('락: DB 오류는 500', lockVerdict(null, { message: 'boom' }).status === 500)
ok('락: DB 오류 원인이 메시지에 남는다', lockVerdict(null, { message: 'boom' }).error.includes('boom'))
ok('락: 409 문구는 사용자용 한국어', /이미|잠시/.test(lockVerdict([], null).error))

// ── 2) 상태값이 CHECK 제약 안에 있는가 ───────────────────────────
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.includes('rollback')).sort()
  let allowed = null
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf-8')
    // 이름 붙은 제약(나중에 DROP/ADD 로 넓힌 것)이 우선. 없으면 CREATE TABLE 안의 인라인 CHECK.
    const named = [...sql.matchAll(/ADD CONSTRAINT analysis_projects_status_check[\s\S]{0,120}?status IN \(([\s\S]*?)\)\s*\)/g)].pop()
    let body = named?.[1]
    if (!body) {
      const create = /CREATE TABLE[^;]*?public\.analysis_projects[\s\S]*?;/.exec(sql)
      body = create ? /status\s+text[^\n]*?CHECK \(status IN \(([^)]*)\)\)/.exec(create[0])?.[1] : undefined
    }
    // 마지막으로 정의한 마이그레이션이 현재 허용값이다.
    if (body) allowed = [...body.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  }
  ok(`CHECK 허용값을 마이그레이션에서 읽었다 (${allowed?.length ?? 0}개)`, Array.isArray(allowed) && allowed.length > 0)
  ok(`락 상태값 '${CLAIMED_STATUS}' 이 CHECK 에 있다`, allowed?.includes(CLAIMED_STATUS))
  ok(`해제 상태값 '${RELEASE_STATUS}' 이 CHECK 에 있다`, allowed?.includes(RELEASE_STATUS))
}

// ── 3) 라우트가 LLM 호출 전에 잠그는가 ───────────────────────────
{
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'api', 'analyze', 'angle', 'route.ts'),
    'utf-8',
  )
  const lockAt = src.indexOf('lockVerdict(')
  const llmAt = src.indexOf('mapWithLimit(plans')
  ok('라우트가 락을 쓴다', lockAt > 0)
  ok('락이 LLM 배치 호출보다 앞에 있다', lockAt > 0 && llmAt > 0 && lockAt < llmAt)
  ok('실패 경로에서 락을 푼다', (src.match(/releaseLock\(\)/g) ?? []).length >= 3)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('앵글 락이 깨졌다. 더블클릭 한 번으로 LLM 배치가 두 벌 나간다(진단 1-1).')
  process.exitCode = 1
} else {
  console.log('앵글 락 정상 — 409 판정·CHECK 허용값·LLM 앞 잠금 확인.')
}
