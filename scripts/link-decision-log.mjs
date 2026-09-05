// 발행 글 ↔ 판정 로그 엔트리 연결 (prediction-schema.md §7-3).
//
//   node scripts/link-decision-log.mjs <threads-media-id|permalink> <LOG-코드> [role]
//   node scripts/link-decision-log.mjs 18095695849695895 LOG-20260910-01 primary
//
// **왜 발행 라우트가 아니라 별도 CLI 인가.**
// `app/api/threads/publish` 가 다루는 테이블은 `thread_posts`(초안 큐)인데,
// `post_decision_link.post_id` 가 가리키는 건 `posts`(발행 실측 테이블)다.
// 그리고 `posts` 행은 발행 직후가 아니라 매처(`/api/threads/match-posts`)가
// 돌아야 생긴다. 즉 **발행 시점에는 붙일 대상 행이 아직 없다.**
// 초안에 판정 로그 코드를 실어 나르려면 `thread_posts` 에 컬럼이 필요한데,
// 그건 별도 판정이라 여기서 임의로 만들지 않았다. 그때까지는 이 CLI 로 잇는다.
//
// ⚠️ post_decision_link 테이블이 아직 없다. 지금 실행하면 exit 2 로 멈춘다.
//    "연결 0건"이 아니라 "연결을 시도하지 않았다"다.

import { createClient } from '@supabase/supabase-js'
import { linkDecisionLog, readLinks, LINK_TABLE_READY, LOG_CODE_RE } from '../lib/predictions/link.ts'

const [rawTarget, code, role = 'primary'] = process.argv.slice(2)

if (!rawTarget || !code) {
  console.error('사용법: node scripts/link-decision-log.mjs <media-id|permalink> <LOG-코드> [primary|paired_control|paired_variant]')
  process.exit(1)
}
if (!LOG_CODE_RE.test(code)) {
  console.error(`✗ 판정 로그 코드 형식이 아니다: ${code}  (예: LOG-20260910-01)`)
  process.exit(1)
}
if (!['primary', 'paired_control', 'paired_variant'].includes(role)) {
  console.error(`✗ 알 수 없는 role: ${role}`)
  process.exit(1)
}

// permalink 로 줘도 받는다 — 사람이 실제로 손에 쥐고 있는 건 보통 URL 이다.
const mediaId = /^\d+$/.test(rawTarget)
  ? rawTarget
  : (/\/t\/([^/?#]+)/.exec(rawTarget)?.[1] ?? rawTarget)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Supabase 환경변수 없음 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(2)
}
const supabase = createClient(url, key)

// posts.external_id 가 Threads 미디어 id 다 (UNIQUE).
const { data, error } = await supabase
  .from('posts')
  .select('id, published_at, body')
  .eq('external_id', mediaId)
  .maybeSingle()

if (error) {
  console.error(`✗ posts 조회 실패: ${error.message}`)
  process.exit(2)
}
if (!data) {
  // ★ "그 글은 없다"가 아니라 "아직 posts 에 안 들어왔다"일 수 있다.
  console.error(`✗ posts 에 external_id=${mediaId} 인 행이 없다.
   매처(/api/threads/match-posts)가 아직 안 돌았을 수 있다. 확인 불가로 둔다 — 없다고 단정하지 마라.`)
  process.exit(2)
}

console.log(`대상: ${data.id}  (${data.published_at})`)
console.log(`  ${String(data.body).slice(0, 60).replace(/\s+/g, ' ')}...`)

const out = await linkDecisionLog(supabase, { postId: data.id, decisionLogCode: code, role })

switch (out.status) {
  case 'linked': console.log(`✓ 연결됨: ${code} / role=${role}`); break
  case 'exists': console.log(`= 이미 연결돼 있음: ${code} / role=${role}`); break
  case 'skipped':
    console.error(`\n✗ 연결하지 않았다 (실패가 아니라 시도 안 함): ${out.reason}`)
    process.exit(2)
  case 'failed':
    console.error(`✗ 연결 실패: ${out.reason}`)
    process.exit(1)
}

if (LINK_TABLE_READY) {
  const links = await readLinks(supabase, code)
  console.log(`\n${code} 에 붙은 발행 글 ${links?.length ?? '확인 불가'}건`)
}
