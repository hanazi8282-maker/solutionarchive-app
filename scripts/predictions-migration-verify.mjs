#!/usr/bin/env node
// 20260905000001(post_decision_link) / 20260905000002(metric_snapshots.clicks)
// 적용 확인.
//
// 사용:
//   node --env-file=.env.local scripts/predictions-migration-verify.mjs
//   node --env-file=.env.local scripts/predictions-migration-verify.mjs --probe
//
// 기본은 **읽기 전용**이다. `--probe` 를 주면 CHECK 제약을 확인하려고 실제
// INSERT 를 한 번 하고 즉시 지운다 (PostgREST 로는 제약을 읽을 방법이 없다).
//
// ⚠️ `review-migration-verify.mjs` 와 같은 이유로 `head: true` 를 쓰지 않는다.
//    없는 테이블에도 에러 없이 204 를 돌려줘서 거짓 통과가 난다(실측).
//
// §7.1 — 이 스크립트는 세 상태를 구분해서 찍는다.
//    ✅ 양성(있다)  /  ❌ 음성(확인해보니 없다)  /  ⚠️ 확인 불가(판정 못 함)
//    셋째를 첫째로 접지 않는다. 확인 불가가 하나라도 있으면 exit 2 다.

import { createClient } from '../lib/supabase/server.ts'

const PROBE = process.argv.includes('--probe')

const supabase = await createClient()
if (!supabase) {
  console.error('⚠️ 확인 불가 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
  console.error('   "적용 안 됐다"가 아니라 "확인을 못 했다"다.')
  process.exit(2)
}

let positive = 0
let negative = 0
let unknown = 0

/** fn 은 문자열(양성) 을 돌려주거나, Verdict 를 throw 한다. */
class Verdict extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind }
}
const absent = (m) => new Verdict('absent', m)
const unsure = (m) => new Verdict('unknown', m)

const check = async (label, fn) => {
  try {
    const msg = await fn()
    positive++
    console.log(`  ✅ ${label}${msg ? ` — ${msg}` : ''}`)
  } catch (e) {
    if (e instanceof Verdict && e.kind === 'absent') {
      negative++
      console.log(`  ❌ ${label} — 확인해보니 없다: ${e.message}`)
    } else {
      unknown++
      console.log(`  ⚠️ ${label} — 확인 불가: ${e.message}`)
    }
  }
}

/** PostgREST 에러 코드를 "없음"과 "모름"으로 가른다. */
const classify = (error) => {
  const code = error.code ?? ''
  const msg = error.message || '(메시지 없음)'
  // 42P01 undefined_table / 42703 undefined_column / PGRST205 스키마 캐시에 없음
  if (code === '42P01' || code === '42703' || code === 'PGRST205' || /does not exist/i.test(msg)) {
    return absent(`${code} ${msg}`)
  }
  return unsure(`${code} ${msg}`)
}

const columns = (table, cols) => async () => {
  const { error, count, status } = await supabase
    .from(table).select(cols, { count: 'exact' }).limit(1)
  if (error) throw classify(error)
  if (status !== 200 && status !== 206) throw unsure(`예상 밖 응답 status=${status}`)
  return `${count ?? 0}행`
}

console.log('# 폐쇄 학습 루프 마이그레이션 적용 확인\n')
console.log(`모드: ${PROBE ? '읽기 + 제약 프로브(INSERT 후 삭제)' : '읽기 전용'}\n`)

console.log('## 20260905000001 — post_decision_link\n')

await check(
  'post_decision_link 4컬럼',
  columns('post_decision_link', 'post_id, decision_log_code, role, created_at'),
)

console.log('\n## 20260905000002 — metric_snapshots.clicks\n')

await check('metric_snapshots.clicks', columns('metric_snapshots', 'id, clicks'))

await check('profile_clicks 가 그대로 남아 있는가 (덮어쓰지 않았는지)', async () => {
  const { error } = await supabase
    .from('metric_snapshots').select('profile_clicks').limit(1)
  if (error) throw classify(error)
  return '있다 — 미디어 clicks 와 분리 유지'
})

await check('기존 행의 clicks 가 0 이 아니라 NULL 인가 (미측정과 0 의 구분)', async () => {
  const { count: zero, error: e1 } = await supabase
    .from('metric_snapshots').select('id', { count: 'exact', head: false })
    .eq('clicks', 0).limit(1)
  if (e1) throw classify(e1)
  const { count: nul, error: e2 } = await supabase
    .from('metric_snapshots').select('id', { count: 'exact', head: false })
    .is('clicks', null).limit(1)
  if (e2) throw classify(e2)
  // DEFAULT 0 이 걸렸다면 과거 행이 전부 0 으로 채워졌을 것이다.
  if (nul === 0 && (zero ?? 0) > 0) {
    throw absent(`NULL 0행 / 0값 ${zero}행 — DEFAULT 0 이 걸린 것으로 보인다`)
  }
  // ★ 행이 아예 없으면 이 검사는 아무것도 검증하지 못한다. 통과로 찍으면
  //   "NULL/0 구분을 확인했다"는 거짓 초록불이 된다 (§7.1).
  if ((nul ?? 0) === 0 && (zero ?? 0) === 0) {
    throw unsure('metric_snapshots 가 비어 있어 NULL/0 구분을 검증하지 못했다')
  }
  return `NULL ${nul}행 / 0 ${zero}행`
})

// ────────────────────────────────────────────────────────────
// 제약 프로브 — 실제로 넣어 보고 되돌린다
// ────────────────────────────────────────────────────────────
if (PROBE) {
  console.log('\n## 제약 프로브 (양성 = 정상 INSERT / 음성 = 거절돼야 정상)\n')

  const PROBE_CODE = 'XUP-20991231-99' // 실재하지 않는 코드. 정본 로그와 안 겹친다.

  const { data: post, error: postErr } = await supabase
    .from('posts').select('id').limit(1).maybeSingle()

  if (postErr || !post) {
    unknown++
    console.log(`  ⚠️ 제약 프로브 — 확인 불가: posts 에 행이 없어 FK 를 만족시킬 수 없다 (${postErr?.message ?? '0행'})`)
    console.log('     "제약이 없다"가 아니다. 발행 글이 생긴 뒤 --probe 를 다시 돌려라.')
  } else {
    const cleanup = async () => {
      await supabase.from('post_decision_link').delete()
        .eq('post_id', post.id).eq('decision_log_code', PROBE_CODE)
    }
    await cleanup() // 이전 실행이 중간에 죽었을 수 있다

    await check("role CHECK 가 'variant' 를 막는가 (거절돼야 정상)", async () => {
      const { error } = await supabase.from('post_decision_link')
        .insert({ post_id: post.id, decision_log_code: PROBE_CODE, role: 'variant' })
      if (!error) {
        await cleanup()
        throw absent("role='variant' 가 들어갔다 — CHECK 가 안 걸려 있다")
      }
      if (!/check constraint/i.test(error.message)) throw classify(error)
      return `막았다 (${error.code})`
    })

    await check('decision_log_code 형식 CHECK 가 잘못된 코드를 막는가', async () => {
      const { error } = await supabase.from('post_decision_link')
        .insert({ post_id: post.id, decision_log_code: 'LOG-123', role: 'primary' })
      if (!error) {
        await supabase.from('post_decision_link').delete()
          .eq('post_id', post.id).eq('decision_log_code', 'LOG-123')
        throw absent("'LOG-123' 이 들어갔다 — 형식 CHECK 가 안 걸려 있다")
      }
      if (!/check constraint/i.test(error.message)) throw classify(error)
      return `막았다 (${error.code})`
    })

    await check("정상 role('paired_variant') 은 들어가는가", async () => {
      const { error } = await supabase.from('post_decision_link')
        .insert({ post_id: post.id, decision_log_code: PROBE_CODE, role: 'paired_variant' })
      if (error) throw classify(error)
      await cleanup()
      return '들어갔다 (테스트 행은 지웠다)'
    })

    // 지웠는지 확인한다. 지우기 실패를 조용히 넘기면 정본에 쓰레기가 남는다.
    const { count: left } = await supabase.from('post_decision_link')
      .select('post_id', { count: 'exact' })
      .eq('decision_log_code', PROBE_CODE).limit(1)
    if (left) {
      unknown++
      console.log(`  ⚠️ 프로브 행 ${left}건이 남아 있다 — decision_log_code='${PROBE_CODE}' 를 직접 지워라`)
    }
  }
}

console.log(`\n---\n양성 ${positive} / 음성 ${negative} / 확인 불가 ${unknown}`)

if (unknown) {
  console.log('\n⚠️ 확인 불가가 있다. 이걸 "적용됨"으로 읽지 마라 (CLAUDE.md §7.1).')
  process.exit(2)
}
if (negative) {
  console.log('\n❌ 미적용 항목이 있다. Supabase 대시보드 SQL Editor 에서 해당 마이그레이션을 실행하라 (§12-5).')
  process.exit(1)
}
console.log('\n✅ 전부 적용됐다. LINK_TABLE_READY / CLICKS_COLUMN_READY 를 true 로 둬도 된다.')
