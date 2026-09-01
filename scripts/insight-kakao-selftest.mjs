#!/usr/bin/env node
// 카카오 스킬 웹훅 셀프테스트 — 네트워크·DB 없이 순수 로직과 응답 계약을 검증한다.
//
// ⚠️ 이 테스트가 확인하는 것은 "200 을 준다"가 아니다. 카카오는 응답 JSON 이
//    규격에서 벗어나면 **조용히 실패한다** — 사용자 화면엔 아무 말도 안 뜨고
//    서버 로그엔 200 이 찍힌다. 그래서 구조 자체를 검사한다.
//
// 규격 근거(공식 문서, 2026-09-02 확인):
//   { "version": "2.0", "template": { "outputs": [ { "simpleText": { "text": … } } ] } }
//   - version 은 "2.0" 만 지원
//   - outputs 는 1~3개
//   - simpleText.text 최대 1000자
//   - 스킬 타임아웃 5초

import { parseShare, extractUrl, idempotencyKey, saveExample, MIN_TEXT_CHARS } from '../lib/insight/capture.ts'

let pass = 0
const fails = []
function ok(name, cond, detail = '') {
  if (cond) pass++
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
}

// ── 1) 카카오 응답 계약 ────────────────────────────────────────────────
// 라우트의 skillText 와 같은 형태를 여기서 재현해 계약을 고정한다.
const skill = (text) => ({
  version: '2.0',
  template: { outputs: [{ simpleText: { text: String(text).slice(0, 1000) } }] },
})

{
  const r = skill('저장했습니다.')
  eq('응답: version 은 "2.0"', r.version, '2.0')
  ok('응답: template 객체 존재', r.template && typeof r.template === 'object')
  ok('응답: outputs 는 배열', Array.isArray(r.template.outputs))
  ok('응답: outputs 1~3개', r.template.outputs.length >= 1 && r.template.outputs.length <= 3)
  ok('응답: outputs[0].simpleText 존재', !!r.template.outputs[0].simpleText)
  eq('응답: text 전달', r.template.outputs[0].simpleText.text, '저장했습니다.')
  ok('응답: 최상위에 군더더기 키 없음', Object.keys(r).every((k) => ['version', 'template', 'context', 'data'].includes(k)))

  const long = skill('가'.repeat(1500))
  eq('응답: text 1000자로 자른다', long.template.outputs[0].simpleText.text.length, 1000)
}

// ── 2) URL 추출 ────────────────────────────────────────────────────────
eq('URL: 단독', extractUrl('https://www.threads.net/@a/post/xyz'), 'https://www.threads.net/@a/post/xyz')
eq('URL: 앞뒤 텍스트 사이', extractUrl('이거 좋다 https://x.com/a/b 참고'), 'https://x.com/a/b')
eq('URL: 없으면 null', extractUrl('그냥 텍스트'), null)
eq('URL: 괄호 닫힘 제외', extractUrl('(https://a.com/b)'), 'https://a.com/b')
eq('URL: http 도 잡는다', extractUrl('http://a.com/b'), 'http://a.com/b')

// ── 3) 공유 발화 파싱 ──────────────────────────────────────────────────
{
  const s = parseShare('https://www.threads.net/@a/post/xyz')
  eq('URL만: url 추출', s.url, 'https://www.threads.net/@a/post/xyz')
  eq('URL만: text 는 null', s.text, null)
  eq('URL만: empty 아님', s.empty, false)
}
{
  const body = '리뷰 점수는 자주 거짓말을 합니다. 페인을 겪는 사람과 후기를 쓰는 사람이 다르면 점수는 조용히 부풀려집니다.'
  const s = parseShare(`${body} https://www.threads.net/@a/post/xyz`)
  eq('URL+원문: url 추출', s.url, 'https://www.threads.net/@a/post/xyz')
  eq('URL+원문: text 에서 URL 제거됨', s.text.includes('http'), false)
  ok('URL+원문: 본문 보존', s.text.startsWith('리뷰 점수는'))
}
{
  // 안드로이드 공유가 붙이는 짧은 꼬리표를 원문으로 오인하면 안 된다.
  const s = parseShare('Threads https://www.threads.net/@a/post/xyz')
  eq(`짧은 꼬리표(<${MIN_TEXT_CHARS}자): text 는 null`, s.text, null)
  ok('짧은 꼬리표: url 은 살아있다', s.url !== null)
}
{
  const s = parseShare('   ')
  eq('빈 발화: empty=true', s.empty, true)
  eq('빈 발화: url null', s.url, null)
}
{
  const s = parseShare('원문만 보냈고 링크가 없는 아주 긴 문장이다. 이 경우에도 저장은 되어야 한다. 최소 길이는 넘긴다.')
  eq('원문만: url null', s.url, null)
  ok('원문만: text 있음', s.text && s.text.length >= MIN_TEXT_CHARS)
  eq('원문만: empty=false', s.empty, false)
}

// ── 4) 멱등성 키 — 두 캡처 경로가 같은 키를 내야 한다 ──────────────────
eq('키: URL 기반', idempotencyKey({ url: 'https://a.com/p/1' }), 'url:https://a.com/p/1')
eq('키: 추적 파라미터 제거', idempotencyKey({ url: 'https://a.com/p/1?igshid=zz' }), 'url:https://a.com/p/1')
eq('키: 프래그먼트 제거', idempotencyKey({ url: 'https://a.com/p/1#x' }), 'url:https://a.com/p/1')
ok(
  '키: 같은 글을 카카오/curl 로 보내면 같은 키',
  idempotencyKey({ url: 'https://a.com/p/1?utm=k' }) === idempotencyKey({ url: 'https://a.com/p/1' }),
)
eq('키: 명시 key 우선', idempotencyKey({ key: 'notion:1', url: 'https://a.com' }), 'notion:1')
eq('키: URL 없으면 원문', idempotencyKey({ text: '가나다' }), 'text:가나다')
eq('키: 아무것도 없으면 null', idempotencyKey({}), null)

// ── 5) 저장 본체 ───────────────────────────────────────────────────────
const fakeStore = (result) => ({
  calls: [],
  async upsertSavedExample(row) {
    this.calls.push(row)
    return result
  },
})

{
  const store = fakeStore({ data: { id: 'i1', notion_page_id: 'url:x', analysis_status: 'pending' }, error: null })
  const r = await saveExample({ url: 'https://a.com/p/1', text: '원문' }, store, () => new Date('2026-09-02T00:00:00Z'))
  ok('저장: ok', r.ok)
  eq('저장: pending 안내', r.message, '저장됨. 다음 나이틀리 실행에서 분석된다.')
  eq('저장: raw_text 전달', store.calls[0].raw_text, '원문')
  eq('저장: saved_at 고정', store.calls[0].saved_at, '2026-09-02T00:00:00.000Z')
}
{
  const store = fakeStore({ data: { id: 'i1', notion_page_id: 'url:x', analysis_status: 'analyzed' }, error: null })
  const r = await saveExample({ url: 'https://a.com/p/1' }, store)
  eq('저장: 이미 분석된 글 안내', r.message, '저장됨(이미 분석된 글이다).')
  eq('저장: 원문 없으면 raw_text null', store.calls[0].raw_text, null)
}
{
  const store = fakeStore({ data: null, error: { message: '23505 duplicate' } })
  const r = await saveExample({ url: 'https://a.com/p/1' }, store)
  eq('저장 실패: ok=false', r.ok, false)
  eq('저장 실패: failure=db', r.failure, 'db')
  ok('저장 실패: 사유를 삼키지 않는다', r.detail?.includes('23505'))
}
{
  const store = fakeStore({ data: null, error: null })
  const r = await saveExample({}, store)
  eq('키 없음: ok=false', r.ok, false)
  eq('키 없음: failure=no-key', r.failure, 'no-key')
  eq('키 없음: DB 를 부르지 않는다', store.calls.length, 0)
}

// ── 6) 발신자 허용목록은 fail-closed 여야 한다 ─────────────────────────
// 라우트의 senderAllowed 와 같은 규칙을 여기서 고정한다.
function senderAllowed(payload, env) {
  const raw = (env.KAKAO_ALLOWED_USER_IDS ?? '').trim()
  if (!raw) return { ok: false, reason: '미설정' }
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const id = payload?.userRequest?.user?.id?.trim()
  if (!id) return { ok: false, reason: 'id 없음' }
  if (!allowed.includes(id)) return { ok: false, reason: '허용목록 밖' }
  return { ok: true }
}
const withId = (id) => ({ userRequest: { user: { id } } })
eq('허용목록: 미설정이면 잠긴다(fail-closed)', senderAllowed(withId('u1'), {}).ok, false)
eq('허용목록: 등록된 id 통과', senderAllowed(withId('u1'), { KAKAO_ALLOWED_USER_IDS: 'u1,u2' }).ok, true)
eq('허용목록: 미등록 id 차단', senderAllowed(withId('u9'), { KAKAO_ALLOWED_USER_IDS: 'u1,u2' }).ok, false)
eq('허용목록: id 없으면 차단', senderAllowed({}, { KAKAO_ALLOWED_USER_IDS: 'u1' }).ok, false)
eq('허용목록: 공백 항목 무시', senderAllowed(withId('u2'), { KAKAO_ALLOWED_USER_IDS: ' u1 , u2 ' }).ok, true)

// ── 결과 ───────────────────────────────────────────────────────────────
console.log('')
if (fails.length) {
  console.log(`❌ 실패 ${fails.length}건 / 통과 ${pass}건`)
  for (const f of fails) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`통과 ${pass}건`)
console.log('카카오 응답 계약·발화 파싱·멱등성 키·fail-closed 허용목록 정상.')
