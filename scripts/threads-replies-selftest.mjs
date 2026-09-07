// lib/threads/replies.ts 의 planReplyUpserts 자체 검증. 네트워크·DB 없이 돈다.
//
//   node scripts/threads-replies-selftest.mjs
//
// 이 레포에는 테스트 러너가 없다. 답글 수집기가 조용히 틀리는 지점은 전부
// planReplyUpserts 다 — 중첩 판별(parent_id)을 놓치면 트리가 납작해지고,
// 삭제 감지(missingIds)가 새면 관측 기록이 소리 없이 사라진다. 둘 다 에러를 안 낸다.
// threads-collect-selftest.mjs 와 같은 방식.

import { planReplyUpserts } from '../lib/threads/replies.ts'

let passed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)
}

const POST = 'post-uuid-1'
const ROOT = '18125457721793275' // 원글 media id

// ── 1) 신규 답글 INSERT + 필드 매핑 ─────────────────────────────
{
  const fetched = [
    { id: 'r1', text: '좋은 글이네요', username: 'someone', timestamp: '2026-09-07T11:00:00+0000',
      permalink: 'https://threads.com/x', replied_to: { id: ROOT }, is_reply_owned_by_me: false, hide_status: 'NOT_HUSHED' },
  ]
  const plan = planReplyUpserts(POST, ROOT, fetched, [])
  eq('신규 1건 insert', plan.inserts.length, 1)
  eq('updates 0', plan.updates.length, 0)
  eq('touch 0', plan.touchIds.length, 0)
  eq('missing 0', plan.missingIds.length, 0)
  const r = plan.inserts[0]
  eq('  id', r.id, 'r1')
  eq('  post_id', r.post_id, POST)
  eq('  parent_id (원글 직속 → null)', r.parent_id, null)
  eq('  is_own', r.is_own, false)
  eq('  text', r.text, '좋은 글이네요')
  eq('  replied_at', r.replied_at, '2026-09-07T11:00:00+0000')
  eq('  hide_status', r.hide_status, 'NOT_HUSHED')
}

// ── 2) 중첩 답글 — parent_id 가 원글이 아니라 다른 답글 ─────────
{
  const fetched = [
    { id: 'r1', text: '질문 있어요', replied_to: { id: ROOT } },
    { id: 'r2', text: '답변 드립니다', replied_to: { id: 'r1' }, is_reply_owned_by_me: true },
  ]
  const plan = planReplyUpserts(POST, ROOT, fetched, [])
  eq('중첩: insert 2', plan.inserts.length, 2)
  eq('  r1.parent_id null', plan.inserts.find(x => x.id === 'r1').parent_id, null)
  eq('  r2.parent_id = r1', plan.inserts.find(x => x.id === 'r2').parent_id, 'r1')
  eq('  r2.is_own (내 후속 답글)', plan.inserts.find(x => x.id === 'r2').is_own, true)
}

// ── 3) 본문 수정 → UPDATE / 그대로 → touch ─────────────────────
{
  const existing = [
    { id: 'r1', text: '오타 있던 원문', hide_status: 'NOT_HUSHED' },
    { id: 'r2', text: '안 바뀐 답글', hide_status: 'NOT_HUSHED' },
  ]
  const fetched = [
    { id: 'r1', text: '오타 고친 본문', replied_to: { id: ROOT }, hide_status: 'NOT_HUSHED' },
    { id: 'r2', text: '안 바뀐 답글', replied_to: { id: ROOT }, hide_status: 'NOT_HUSHED' },
  ]
  const plan = planReplyUpserts(POST, ROOT, fetched, existing)
  eq('수정된 것만 update', plan.updates.length, 1)
  eq('  update 대상 r1', plan.updates[0]?.id, 'r1')
  eq('안 바뀐 건 touch', plan.touchIds.length, 1)
  eq('  touch 대상 r2', plan.touchIds[0], 'r2')
  eq('insert 0', plan.inserts.length, 0)
}

// ── 4) 숨김 상태 변경도 UPDATE ────────────────────────────────
{
  const existing = [{ id: 'r1', text: '스팸성 답글', hide_status: 'NOT_HUSHED' }]
  const fetched = [{ id: 'r1', text: '스팸성 답글', replied_to: { id: ROOT }, hide_status: 'HUSHED' }]
  const plan = planReplyUpserts(POST, ROOT, fetched, existing)
  eq('hide_status 변경 → update', plan.updates.length, 1)
  eq('  새 hide_status', plan.updates[0]?.hide_status, 'HUSHED')
}

// ── 5) 삭제 감지 — 기존에 있었는데 이번 응답에 없음 ────────────
{
  const existing = [
    { id: 'r1', text: '남아있는 답글', hide_status: null },
    { id: 'r2', text: '삭제된 답글', hide_status: null },
  ]
  const fetched = [{ id: 'r1', text: '남아있는 답글', replied_to: { id: ROOT }, hide_status: null }]
  const plan = planReplyUpserts(POST, ROOT, fetched, existing)
  eq('missing 1건', plan.missingIds.length, 1)
  eq('  missing = r2', plan.missingIds[0], 'r2')
  eq('  v1 은 지우지 않는다 (updates/inserts 에 안 들어감)',
    plan.updates.some(x => x.id === 'r2') || plan.inserts.some(x => x.id === 'r2'), false)
  eq('r1 은 touch', plan.touchIds.length, 1)
}

// ── 6) text 없는 답글(이미지 전용 등) → null, 크래시 없음 ──────
{
  const plan = planReplyUpserts(POST, ROOT, [{ id: 'r1', replied_to: { id: ROOT } }], [])
  eq('text 없음 → null', plan.inserts[0]?.text, null)
  eq('username 없음 → null', plan.inserts[0]?.author_username, null)
}

// ── 7) id 없는 항목은 조용히 건너뛴다 ─────────────────────────
{
  const plan = planReplyUpserts(POST, ROOT, [{ text: 'id 없음' }, { id: 'r1', text: 'ok', replied_to: { id: ROOT } }], [])
  eq('id 없는 건 무시, 나머지만 insert', plan.inserts.length, 1)
  eq('  살아남은 id', plan.inserts[0]?.id, 'r1')
}

// ── 결과 ─────────────────────────────────────────────────────
console.log(`\n통과 ${passed} / 실패 ${failures.length}`)
if (failures.length) {
  console.log('\n실패:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✅ planReplyUpserts 자체 검증 통과')
