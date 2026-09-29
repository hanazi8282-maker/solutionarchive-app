// 즉시발행 셀프테스트 — Threads 게시 4단계(가짜 fetch) + notes 파서 + 초안 한 건 판정. 네트워크·DB 없음.
//   node scripts/threads-publish-selftest.mjs
import { publishTextPost, THREADS_TEXT_MAX } from '../lib/threads/publish.ts'
import { parseStageNotes, parseSelfReply, instantGateForPost } from '../lib/threads/instant-gate.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${g}\n      want=${w}`) } }
const creds = { accessToken: 'tok', userId: 'u1' }
const res = (status, body) => ({ ok: status < 400, status, json: async () => body })

/** URL 패턴별 응답 큐. 호출 순서를 기록한다. */
function fakeFetch(script) {
  const calls = []
  const f = async (url, init) => {
    const kind = url.includes('/threads_publish') ? 'publish' : url.endsWith('/threads') ? 'container' : url.includes('fields=status') ? 'status' : 'fetch'
    calls.push(`${kind}${init?.method === 'POST' ? ':POST' : ''}`)
    const q = script[kind] ?? []
    return q.length ? q.shift() : res(200, {})
  }
  return { f, calls }
}
const noSleep = async () => {}

// 정상 경로
{
  const g = fakeFetch({ container: [res(200, { id: 'c1' })], status: [res(200, { status: 'FINISHED' })], publish: [res(200, { id: 'p1' })], fetch: [res(200, { permalink: 'https://www.threads.net/@x/post/p1', timestamp: '2026-09-25T12:00:00+0000' })] })
  const r = await publishTextPost(creds, '본문 42자 실측', { fetchImpl: g.f, sleep: noSleep })
  t('정상: ok·id·permalink', [r.ok, r.id, r.permalink], [true, 'p1', 'https://www.threads.net/@x/post/p1'])
  t('정상: 순서 container → status → publish → fetch', g.calls, ['container:POST', 'status', 'publish:POST', 'fetch'])
}
// 처리 대기 후 FINISHED
{
  const g = fakeFetch({ container: [res(200, { id: 'c1' })], status: [res(200, { status: 'IN_PROGRESS' }), res(200, { status: 'FINISHED' })], publish: [res(200, { id: 'p2' })] })
  const r = await publishTextPost(creds, 'x', { fetchImpl: g.f, sleep: noSleep })
  t('IN_PROGRESS 뒤 FINISHED → 발행', [r.ok, g.calls.filter((c) => c === 'status').length], [true, 2])
}
// 컨테이너 ERROR → 발행 안 함
{
  const g = fakeFetch({ container: [res(200, { id: 'c1' })], status: [res(200, { status: 'ERROR', error_message: 'bad' })], publish: [res(200, { id: 'p3' })] })
  const r = await publishTextPost(creds, 'x', { fetchImpl: g.f, sleep: noSleep })
  t('컨테이너 ERROR → ok=false stage=status', [r.ok, r.stage], [false, 'status'])
  t('컨테이너 ERROR → publish 호출 없음', g.calls.includes('publish:POST'), false)
}
// 처리 지연 초과 → 발행 안 함
{
  const g = fakeFetch({ container: [res(200, { id: 'c1' })], status: Array.from({ length: 3 }, () => res(200, { status: 'IN_PROGRESS' })) })
  const r = await publishTextPost(creds, 'x', { fetchImpl: g.f, sleep: noSleep, maxPolls: 3 })
  t('maxPolls 초과 → ok=false, publish 없음', [r.ok, r.stage, g.calls.includes('publish:POST')], [false, 'status', false])
}
// 컨테이너 생성 실패(권한)
{
  const g = fakeFetch({ container: [res(400, { error: { message: '(#10) Application does not have permission' } })] })
  const r = await publishTextPost(creds, 'x', { fetchImpl: g.f, sleep: noSleep })
  t('컨테이너 400 → stage=container, 사유에 메시지', [r.ok, r.stage, /permission/.test(r.reason)], [false, 'container', true])
}
// 발행 실패 → creationId 남김
{
  const g = fakeFetch({ container: [res(200, { id: 'c9' })], status: [res(200, { status: 'FINISHED' })], publish: [res(500, { error: { message: 'boom' } })] })
  const r = await publishTextPost(creds, 'x', { fetchImpl: g.f, sleep: noSleep })
  t('발행 500 → stage=publish, creationId 보존', [r.ok, r.stage, r.creationId], [false, 'publish', 'c9'])
}
// 검증
{
  const g = fakeFetch({})
  t('빈 본문 → validate', (await publishTextPost(creds, '  ', { fetchImpl: g.f, sleep: noSleep })).stage, 'validate')
  t('501자 → validate', (await publishTextPost(creds, '가'.repeat(THREADS_TEXT_MAX + 1), { fetchImpl: g.f, sleep: noSleep })).stage, 'validate')
  t('검증 실패 시 네트워크 0회', g.calls.length, 0)
}
// notes 파서
{
  const notes = '케이스 hoka-specialty-retail-awareness-engine / case_moves 5f2c8a0e-1d3b-4c2a-9e7f-0a1b2c3d4e5f (AWARENESS · CHANNEL · 등급 A · positive)\n\n판정 로그 LOG-1\n\nBP: 독점수치=true · 전이=true'
  t('parseStageNotes: moveId·slug·등급', parseStageNotes(notes), { moveId: '5f2c8a0e-1d3b-4c2a-9e7f-0a1b2c3d4e5f', slug: 'hoka-specialty-retail-awareness-engine', gradeAtStage: 'A' })
  t('parseStageNotes: 없음', parseStageNotes('메모'), { moveId: null, slug: null, gradeAtStage: null })
  // 초안 한 건 판정
  const body = '지난달 우리 전환율이 2.1%에서 3.4%로 올랐다. 당신 페이지에서도 첫 문장 하나를 바꿔 보라.'
  const mvA = [{ fact_check_grade: 'A', lever: 'CHANNEL', slug: 'x', brand_name: 'X', pmf_grade: 'A', evidence_grade: 'A' }]
  t('무브 A + BP 선언 → pass', instantGateForPost({ body, notes }, mvA).status, 'pass')
  t('무브 없음(못 읽음) → needs_human', instantGateForPost({ body, notes }, null).status, 'needs_human')
  const mvC = [{ fact_check_grade: 'C', lever: 'CHANNEL', slug: 'x', brand_name: 'X브랜드', pmf_grade: 'B', evidence_grade: 'B' }]
  // 2026-09-29 UPD-20260929-01 — CG-1 은 본문이 아니라 notes 의 자기답글 블록에서 "자사 공시" 를 본다.
  const withReply = (reply) => `${notes}\n\n자기답글(고정 댓글, ${[...reply].length}자):\n${reply}\n\n⛔ 미발행. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).`
  t('parseSelfReply: 블록을 잘라 낸다', parseSelfReply(withReply('전환율 3.4% — 자사 공시.\n독립 집계 없음.')), '전환율 3.4% — 자사 공시.\n독립 집계 없음.')
  t('parseSelfReply: 블록 없으면 null', parseSelfReply(notes), null)
  t('사실확인 C 인용인데 자기답글 블록 없음 → 확인 불가 needs_human(fail 도 pass 도 아님)', instantGateForPost({ body, notes }, mvC).status, 'needs_human')
  t('사실확인 C + 자기답글에 자사 공시 없음 → CG 미통과 fail', instantGateForPost({ body, notes: withReply('출처 https://x.com') }, mvC).status, 'fail')
  t('사실확인 C + 자기답글 "자사 공시" → pass(본문 귀속 없이)', instantGateForPost({ body, notes: withReply('전환율 3.4% — https://x.com, 자사 공시.') }, mvC).status, 'pass')
  // 2026-09-29 — 원문 링크가 있는 제3자 출처도 통과(자사 공시 없이). 링크 없는 제3자 언급은 여전히 fail.
  t('사실확인 C + 제3자 출처 + 원문 링크 → pass', instantGateForPost({ body, notes: withReply('제3자 매체 보도 https://techcrunch.com/x.') }, mvC).status, 'pass')
  t('사실확인 C + 링크 없는 "제3자에 따르면" → fail', instantGateForPost({ body, notes: withReply('제3자에 따르면 그렇다.') }, mvC).status, 'fail')
  t('사실확인 A 는 자기답글 블록 없어도 pass', instantGateForPost({ body, notes }, mvA).status, 'pass')
  // 2026-09-29 2축 확정: 게이트의 등급은 인사이트(insight_grade ?? evidence_grade)다. pmf_grade 는 보지 않는다.
  const mvD = [{ fact_check_grade: 'A', lever: 'CHANNEL', slug: 'x', brand_name: 'X', pmf_grade: 'A', evidence_grade: 'D' }]
  t('인사이트 등급 D → fail (PMF A 여도)', instantGateForPost({ body, notes }, mvD).status, 'fail')
  const mvPmfD = [{ fact_check_grade: 'A', lever: 'CHANNEL', slug: 'x', brand_name: 'X', pmf_grade: 'D', evidence_grade: 'A' }]
  t('PMF D 는 게이트 축이 아니다 → pass', instantGateForPost({ body, notes }, mvPmfD).status, 'pass')
  const mvInsD = [{ fact_check_grade: 'A', lever: 'CHANNEL', slug: 'x', brand_name: 'X', insight_grade: 'D', evidence_grade: 'A' }]
  t('insight_grade 가 레거시보다 먼저 → fail', instantGateForPost({ body, notes }, mvInsD).status, 'fail')
  t('BP 선언 없는 notes → needs_human', instantGateForPost({ body, notes: '케이스 s / case_moves 5f2c8a0e-1d3b-4c2a-9e7f-0a1b2c3d4e5f (A · B · 등급 A · positive)' }, mvA).status, 'needs_human')
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('즉시발행이 미완료 컨테이너를 게시하거나, 게이트가 미판정을 통과로 접는다.'); process.exit(1) }
console.log('즉시발행 정상 — FINISHED 뒤에만 publish, 실패는 단계별로 사유, 게이트는 DB 무브 기준.')
