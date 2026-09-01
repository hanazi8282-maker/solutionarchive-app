#!/usr/bin/env node
// 원문 폐기 배치 — analysis_inputs.raw_text 를 30일 뒤 비운다.
//
// 설계: docs/review-collection-design.md §9
//
// ⚠️ 이 트랙에서 유일하게 되돌릴 수 없는 동작이다. 그래서:
//    - **기본이 dry-run 이다.** 실제로 지우려면 `--apply` 를 명시해야 한다
//    - 판정 불가 행은 지우지 않고 경보로 올린다
//    - 판정 로직은 lib/review/purge.ts 의 순수 함수다. 여기서 다시 판단하지 않는다
//
// 사용:
//   node scripts/review-purge.mjs            # dry-run (기본)
//   node scripts/review-purge.mjs --apply    # 실제 폐기
//   node scripts/review-purge.mjs --limit=500
//
// 환경변수: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { planPurge, purgePatch, purgeLine, RETENTION_DAYS } from '../lib/review/purge.ts'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limitArg = args.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 1000

const out = []
const say = (s) => {
  out.push(s)
  console.log(s)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다')
  process.exit(1)
}
const supabase = createClient(url, key)

const now = new Date()
say(`## 원문 폐기 ${apply ? '' : '(dry-run — 지우지 않음)'}`)
say('')

// 후보만 좁혀 읽는다. analysis_inputs_purgeable_idx 가 이 경로를 위해 있다.
//
// ⚠️ collected_at 조건을 SQL 에 넣지 않는다. 나이 판정을 순수 함수 한 곳에서만
//    하기 위해서다. SQL 과 TS 에 같은 공식을 두 벌 두면 언젠가 어긋나고,
//    그때 테스트는 통과하는데 실제 값이 다르다(§12 의 O_k 공식과 같은 함정).
const { data, error } = await supabase
  .from('analysis_inputs')
  .select('id, source_key, collected_at, raw_text, purged_at')
  .not('source_key', 'is', null)
  .not('raw_text', 'is', null)
  .order('collected_at', { ascending: true, nullsFirst: true })
  .limit(LIMIT)

if (error) {
  say(`- ❌ 후보 조회 실패: ${error.message}`)
  await flush()
  // process.exit 을 쓰지 않는 이유는 파일 끝 주석 참조(종료코드 127 사고).
  process.exitCode = 1
  throw new Error(`후보 조회 실패: ${error.message}`)
}

const rows = data ?? []
const plan = planPurge(rows, now)

say(`- 후보 ${rows.length}건 · 폐기 대상 ${plan.purge.length}건 · 보존 ${plan.keep}건 · 판정 불가 ${plan.unjudgeable.length}건`)
say(`- 보존 기간 ${RETENTION_DAYS}일 · 상한 ${LIMIT}건`)

// 판정 불가는 조용히 넘기지 않는다. 수집기가 collected_at 을 안 넣는 경로가
// 생겼다는 뜻일 수 있고, 그러면 그 행들은 영영 폐기되지 않는다.
if (plan.unjudgeable.length > 0) {
  say('')
  say('### ⚠️ 판정 불가 — 지우지 않았다')
  for (const u of plan.unjudgeable.slice(0, 10)) say(`- \`${u.id}\` — ${u.reason}`)
  if (plan.unjudgeable.length > 10) say(`- … 외 ${plan.unjudgeable.length - 10}건`)
}

let purged = 0
let failed = 0
const failures = []

if (apply && plan.purge.length > 0) {
  const patch = purgePatch(now)
  // 한 번에 다 지우지 않고 나눠서 넣는다. 중간에 실패해도 어디까지 됐는지
  // 남고, 되돌릴 수 없는 작업이라 한 방에 터지는 경로를 만들지 않는다.
  const CHUNK = 100
  for (let i = 0; i < plan.purge.length; i += CHUNK) {
    const ids = plan.purge.slice(i, i + CHUNK).map((p) => p.id)
    const { data: updated, error: upErr } = await supabase
      .from('analysis_inputs')
      .update(patch)
      .in('id', ids)
      .select('id')

    if (upErr) {
      failed += ids.length
      failures.push(upErr.message)
      continue
    }

    // ⚠️ 응답이 에러가 아니라는 것과 실제로 지워졌다는 것은 다르다.
    //    돌아온 행 수를 세어 요청한 수와 맞는지 본다(§7.1).
    const n = (updated ?? []).length
    purged += n
    if (n !== ids.length) {
      failures.push(`요청 ${ids.length}건 중 ${n}건만 갱신됨`)
    }
  }
}

say('')
if (!apply) {
  say(`**지우지 않았다.** 실제 폐기는 \`--apply\` 를 붙여 실행한다.`)
} else {
  say(`- 실제 폐기 ${purged}건${failed ? ` · 실패 ${failed}건` : ''}`)
  for (const f of failures.slice(0, 5)) say(`  - ⚠️ ${f}`)
}

const line = purgeLine(plan, !apply)
if (line) {
  say('')
  say(line)
}

await flush()

// 판정 불가나 폐기 실패가 있으면 실패로 끝낸다. 잡이 초록불이면 아무도 안 본다.
//
// ⚠️ `process.exit()` 를 쓰지 않는다. Supabase 클라이언트가 핸들을 열어 둔
//    상태에서 강제 종료하면 libuv 가 어서션으로 죽고(`UV_HANDLE_CLOSING`,
//    윈도우에서 실측) **종료코드가 127 로 나온다.** 성공 실행이 실패로
//    보고되는 경로다. exitCode 만 세우고 이벤트 루프가 스스로 비도록 둔다.
process.exitCode = failed > 0 || plan.unjudgeable.length > 0 ? 1 : 0

async function flush() {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n')
  }
}
