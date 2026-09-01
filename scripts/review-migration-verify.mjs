#!/usr/bin/env node
// 마이그레이션 003/004 적용 확인 — 읽기 전용.
//
// 대시보드에서 SQL 을 실행한 뒤 이걸 돌리면 "실제로 반영됐는가"가 한 번에
// 나온다. 쓰기를 하지 않으므로 몇 번을 돌려도 안전하다.
//
// 사용:
//   node --env-file=.env.local scripts/review-migration-verify.mjs
//
// ⚠️ PostgREST 로는 제약·인덱스를 직접 볼 수 없다. 그래서 "컬럼을 select 해
//    보고 에러가 나는가"로 존재를 확인한다. 제약(NOT NULL 해제, CHECK 등)은
//    이 스크립트가 확인할 수 없으므로 마지막에 대시보드용 SQL 을 찍어 준다.

import { createClient } from '../lib/supabase/server.ts'

const supabase = await createClient()
if (!supabase) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
  process.exit(1)
}

let pass = 0
let fail = 0

const check = async (label, fn) => {
  try {
    const msg = await fn()
    pass++
    console.log(`  ✅ ${label}${msg ? ` — ${msg}` : ''}`)
  } catch (e) {
    fail++
    console.log(`  ❌ ${label} — ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * 테이블에서 지정 컬럼을 실제로 select 해 본다. 없으면 PostgREST 가 에러를 낸다.
 *
 * ⚠️ `head: true` 를 쓰면 안 된다. 테이블이 아예 없어도 **에러 없이 HTTP 204**
 *    를 돌려준다(실측). 검증기가 "확인할 수 없을 때 정상이라고 답하는" 형태가
 *    되어 거짓 통과를 낸다 — 검증기로서 가장 나쁜 실패다.
 *    실제로 이 스크립트의 첫 버전이 없는 테이블 4개를 ✅ 로 보고했다.
 */
const columns = (table, cols) => async () => {
  const { error, count, status } = await supabase
    .from(table)
    .select(cols, { count: 'exact' })
    .limit(1)

  if (error) throw new Error(`${error.code ?? '?'} ${error.message || '(메시지 없음)'}`)
  // 200 과 206 둘 다 정상이다. PostgREST 는 count=exact 와 limit 를 같이 쓰면
  // 일부만 돌려줄 때 206 Partial Content 를 낸다 — 행이 2개 이상인 테이블은
  // 항상 206 이다(실측: analysis_inputs 10행, content_items 21행이 206).
  // 200 만 통과시키면 컬럼이 전부 있는데도 실패로 찍혀 거짓 실패를 낸다.
  if (status !== 200 && status !== 206) throw new Error(`예상 밖 응답 status=${status}`)
  return `${count ?? 0}행`
}

console.log('# 마이그레이션 적용 확인\n')

console.log('## 003 — 리뷰 수집 계층\n')

await check(
  'review_sources',
  columns(
    'review_sources',
    'key, display_name, enabled, disabled_reason, disabled_at, health, health_detail, health_checked_at, min_interval_ms, daily_request_cap',
  ),
)
await check(
  'review_targets',
  columns(
    'review_targets',
    'id, project_id, source_key, product_ref, label, cursor, last_review_at, status, consecutive_empty, last_run_at, total_collected',
  ),
)
await check(
  'review_collection_runs',
  columns(
    'review_collection_runs',
    'id, source_key, started_at, finished_at, trigger, dry_run, status, targets_visited, requests, pages_fetched, reviews_parsed, parse_failures, new_reviews, duplicates, revisions, robots_skips, health_after, error',
  ),
)
await check(
  'review_fingerprints',
  columns(
    'review_fingerprints',
    'id, source_key, identity_key, content_hash, key_kind, product_ref, written_at, first_seen_at, last_seen_at, revision_count, analysis_input_id',
  ),
)
await check(
  'analysis_inputs 확장 3종',
  columns('analysis_inputs', 'id, source_key, collected_at, purged_at'),
)

await check('다나와 시드', async () => {
  const { data, error } = await supabase
    .from('review_sources')
    .select('key, enabled, health, min_interval_ms, daily_request_cap')
    .eq('key', 'danawa')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('danawa 행이 없다 — INSERT 가 안 돌았다')
  if (data.min_interval_ms < 1000) throw new Error(`간격이 너무 짧다: ${data.min_interval_ms}ms`)
  return `enabled=${data.enabled} health=${data.health} 간격=${data.min_interval_ms}ms 상한=${data.daily_request_cap}`
})

console.log('\n## 004 — 소재은행 proposed (미뤄도 되는 마이그레이션)\n')

await check(
  'content_items 확장 2종',
  columns('content_items', 'code, status, source_aspect_id, proposed_at'),
)
await check('status CHECK 에 proposed 가 들어갔는가', async () => {
  // 실제로 넣어 보고 되돌린다. CHECK 는 PostgREST 로 못 읽어서 이 방법뿐이다.
  const probe = `__migration_probe_${Date.now()}`
  const { error } = await supabase
    .from('content_items')
    .insert({ code: probe, tier: 9, title: '마이그레이션 확인용', status: 'proposed' })
  if (error) {
    if (/violates check constraint/i.test(error.message)) {
      throw new Error("'proposed' 가 CHECK 에 없다 — 004 가 아직 안 돌았다")
    }
    throw new Error(error.message)
  }
  await supabase.from('content_items').delete().eq('code', probe)
  return '통과(테스트 행은 지웠다)'
})

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)

console.log(`
---

## 스크립트가 확인할 수 없는 것 — 대시보드에서 직접 볼 것

PostgREST 로는 제약·인덱스를 읽을 수 없다. 아래를 SQL Editor 에 붙여 넣으면
003 의 핵심 제약 셋이 한 번에 나온다.

\`\`\`sql
-- 1) raw_text 의 NOT NULL 이 풀렸는가 (원문 30일 폐기의 전제)
--    is_nullable 이 YES 여야 한다.
select column_name, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'analysis_inputs'
   and column_name = 'raw_text';

-- 2) 지문 UNIQUE 와 폐기 추적 CHECK 가 걸렸는가
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conname in (
   'review_fingerprints_source_identity_key',
   'analysis_inputs_purge_trace_check',
   'review_sources_disabled_needs_reason',
   'review_sources_min_interval_check',
   'review_targets_project_source_product_key'
 )
 order by conname;

-- 3) 지문의 FK 가 SET NULL 인가 (프로젝트 삭제 시 지문이 살아남아야 한다)
--    confdeltype 이 'n' 이어야 한다. 'c' 면 CASCADE 라 잘못 걸린 것이다.
select conname, confdeltype
  from pg_constraint
 where conname = 'review_fingerprints_analysis_input_id_fkey';
\`\`\`

세 번째가 가장 중요하다. CASCADE 로 걸리면 프로젝트를 지웠을 때 지문까지
딸려 죽고, 다시 만들었을 때 이미 본 리뷰를 전부 다시 긁는다.
`)

process.exit(fail ? 1 : 0)
