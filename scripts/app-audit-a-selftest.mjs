#!/usr/bin/env node
// 2026-10-12 앱 감사 A 묶음 셀프테스트 — 소비재 태그 제외(/voc) · 인용 단일 관문(publicExcerpt) · 아이디어 인계 · 승인 취소 메모.
//   node scripts/app-audit-a-selftest.mjs
// DB 접근 없음(가짜 클라이언트만). 포함하는 쪽 모듈은 Node 타입 스트리핑으로 직접 로드한다.

import { readFileSync } from 'node:fs'
import { publicExcerpt, QUOTE_MAX_KO, QUOTE_MAX_EN, checkSummary } from '../lib/analysis/evidence-quotes.ts'
import { consumerFilterState } from '../lib/analysis/consumer-material.ts'
import { loadFeed, loadColumns, loadCard, parseFeedQuery } from '../lib/signals/feed.ts'
import { IDEA_COOKIE, IDEA_MAX, IDEA_TTL_SEC, EXAMPLE_IDEA, ideaCookieOf, ideaOf, pickIdea, reportPathOf } from '../lib/cases/idea-handoff.ts'
import { QUERY_MAX } from '../lib/cases/search.ts'
import { SNIPPET_MAX } from '../lib/cases/draft.ts'
import { revertNote, REVERT_TAG } from '../lib/columns/revert.ts'

let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// ── 1) publicExcerpt — 인용 단일 관문 ───────────────────────────────
const ko = (n) => '가'.repeat(n)
const en = (n) => 'a'.repeat(n)
t('한국어 130자 통과', publicExcerpt(ko(QUOTE_MAX_KO), 'full').ok)
t('한국어 131자는 130자(…포함)로 잘려 나간다', (() => { const c = publicExcerpt(ko(QUOTE_MAX_KO + 1), 'full'); return c.ok && Array.from(c.text).length === QUOTE_MAX_KO && c.text.endsWith('…') })())
t('길어도 정책 none·모름이면 여전히 거부', publicExcerpt(ko(500), 'none').reason === 'policy_none' && publicExcerpt(ko(500), null).reason === 'policy_none')
t('strict(/voc 발췌)는 자르지 않고 가린다', publicExcerpt(ko(QUOTE_MAX_KO + 1), 'full', { strict: true }).reason === 'too_long')
t('영어 240자 통과', publicExcerpt(en(QUOTE_MAX_EN), 'full').ok)
t('영어 241자는 240자(…포함)로 잘린다', (() => { const c = publicExcerpt(en(QUOTE_MAX_EN + 1), 'full'); return c.ok && Array.from(c.text).length === QUOTE_MAX_EN && c.text.endsWith('…') })())
t('정책 none = 약관 금지 소스 → 거부', publicExcerpt('짧은 글', 'none').reason === 'policy_none')
t('정책 모름(null·모르는 값) → 거부(fail-closed)', publicExcerpt('짧은 글', null).reason === 'policy_none' && publicExcerpt('짧은 글', 'weird').reason === 'policy_none')
t('short_only 통과', publicExcerpt('짧은 글', 'short_only').ok)
t('빈 글 → empty(미기재와 가림을 가른다)', publicExcerpt('  ', 'full').reason === 'empty' && publicExcerpt(null, 'full').reason === 'empty')
t('수집기 머리말([SRC: URL])은 떼고 본문만', publicExcerpt('[SRC: https://x.test/a]\n본문 한 줄', 'full').text === '본문 한 줄')
t('머리말만 길어도 본문 기준으로 센다', publicExcerpt(`[SRC: https://x.test/${en(300)}]\n${ko(10)}`, 'full').ok)
t('case-pipeline 스니펫 상한 = 인용 상한 한국어 130', SNIPPET_MAX === QUOTE_MAX_KO)
t('스니펫 검증은 영어 240을 허용(too_long 아님)', checkSummary(en(240), 'full').reason !== 'too_long' && checkSummary(en(241), 'full').reason === 'too_long')

// ── 2) consumerFilterState — 3상태 ─────────────────────────────────
const fakeSb = (impl) => ({ from: (table) => ({ select: () => ({ limit: () => impl(table) }) }) })
t('on: 표 있음', await consumerFilterState(fakeSb(() => Promise.resolve({ data: [], error: null })), { enabled: true }) === 'on')
t('off: 스위치 off(조회 안 함)', await consumerFilterState(fakeSb(() => { throw new Error('호출되면 안 된다') }), { enabled: false }) === 'off')
t('off: 표 없음(PGRST205)', await consumerFilterState(fakeSb(() => Promise.resolve({ error: { code: 'PGRST205' } })), { enabled: true, warn: () => {} }) === 'off')
t('off: 표 없음(42P01)', await consumerFilterState(fakeSb(() => Promise.resolve({ error: { code: '42P01' } })), { enabled: true, warn: () => {} }) === 'off')
t('unknown: 그 밖 오류', await consumerFilterState(fakeSb(() => Promise.resolve({ error: { code: '500' } })), { enabled: true }) === 'unknown')
t('unknown: 예외', await consumerFilterState(fakeSb(() => { throw new Error('net') }), { enabled: true, warn: () => {} }) === 'unknown')

// ── 3) /voc 조회 — 태그 제외 anti-join 이 걸리고, 태그를 못 읽으면 닫힌다 ──
/** 모든 체인 메서드를 기록하는 가짜. consumer_material_tags 프로브는 mode 에 따라 답한다. */
function recorder(probe, data = []) {
  const log = []
  const sb = {
    from(table) {
      const rec = { table, select: '', is: [] }
      log.push(rec)
      const q = new Proxy({}, {
        get(_, k) {
          if (k === 'then') {
            if (table === 'consumer_material_tags') return (ok, ko2) => Promise.resolve(probe).then(ok, ko2)
            return (ok, ko2) => Promise.resolve({ data, error: null, count: 0 }).then(ok, ko2)
          }
          return (...a) => {
            if (k === 'select') rec.select = String(a[0])
            if (k === 'is') rec.is.push(a[0])
            return q
          }
        },
      })
      return q
    },
  }
  return { sb, log }
}
const f = parseFeedQuery({}).filters
const OK = { data: [], error: null }
{
  const { sb, log } = recorder(OK)
  const r = await loadFeed(sb, f)
  const verdictQs = log.filter((l) => l.table === 'review_relevance_verdicts')
  t('loadFeed(on): 상태 ok', r.status === 'ok')
  t('loadFeed(on): 목록·건수·소스칩 쿼리 전부 anti-join 임베드를 고른다', verdictQs.length >= 3 && verdictQs.every((l) => l.select.includes('consumer_material_tags!left(input_id)')))
  t('loadFeed(on): 전부 태그 없음만(.is analysis_inputs.consumer_material_tags null)', verdictQs.every((l) => l.is.includes('analysis_inputs.consumer_material_tags')))
}
{
  const { sb, log } = recorder({ error: { code: 'PGRST205' } })
  const r = await loadFeed(sb, f)
  const q = log.filter((l) => l.table === 'review_relevance_verdicts')
  t('loadFeed(표 없음): 원래대로 — 임베드·필터 없음', r.status === 'ok' && q.every((l) => !l.select.includes('consumer_material_tags') && !l.is.includes('analysis_inputs.consumer_material_tags')))
}
{
  const { sb, log } = recorder({ error: { code: '500', message: 'boom' } }, null)
  const errs = console.error; console.error = () => {}
  const a = await loadFeed(sb, f)
  const b = await loadColumns(sb, 'saas')
  const c = await loadCard(sb, '11111111-1111-4111-8111-111111111111')
  console.error = errs
  t('태그 확인 불가(fail-closed): 목록·3열·카드 모두 error', a.status === 'error' && b.status === 'error' && c.status === 'error')
  t('태그 확인 불가: 판정 표는 읽지도 않는다', log.every((l) => l.table !== 'review_relevance_verdicts'))
}
{
  const { sb, log } = recorder(OK)
  await loadColumns(sb, 'saas')
  const q = log.filter((l) => l.table === 'review_relevance_verdicts')
  t('loadColumns(on): 모든 쿼리 anti-join', q.length >= 4 && q.every((l) => l.select.includes('consumer_material_tags!left(input_id)') && l.is.includes('analysis_inputs.consumer_material_tags')))
}
{
  const { sb, log } = recorder(OK, null)
  await loadCard(sb, '11111111-1111-4111-8111-111111111111')
  const q = log.filter((l) => l.table === 'review_relevance_verdicts')
  t('loadCard(on): anti-join', q.length === 1 && q[0].is.includes('analysis_inputs.consumer_material_tags'))
}

// ── 4) 아이디어 인계 — 주소에 아이디어를 싣지 않는다 ───────────────────
t('IDEA_MAX = 검색 질의 상한', IDEA_MAX === QUERY_MAX)
t('ideaOf: 공백 정리·상한·빈 값', ideaOf('  안녕  ') === '안녕' && ideaOf('') === null && ideaOf(null) === null && ideaOf('가'.repeat(IDEA_MAX + 50)).length === IDEA_MAX)
t('쿠키: 경로 /cases/report · 30분 · 값 인코딩 · Secure 선택', (() => {
  const c = ideaCookieOf('50% 할인; 테스트', true)
  return c.startsWith(`${IDEA_COOKIE}=${encodeURIComponent('50% 할인; 테스트')};`) && c.includes('Path=/cases/report') && c.includes(`Max-Age=${IDEA_TTL_SEC}`) && c.includes('SameSite=Lax') && c.endsWith('; Secure')
    && !ideaCookieOf('x').includes('Secure')
})())
t('이동 주소: 아이디어 없음(saas 기본은 질의 자체 없음)', reportPathOf('saas') === '/cases/report' && reportPathOf(undefined) === '/cases/report')
t('이동 주소: kind=all 만 질의에, 이상한 값은 버린다', reportPathOf('all') === '/cases/report?kind=all' && reportPathOf('a&q=x') === '/cases/report' && !reportPathOf('all').includes('q='))
t('pickIdea: 쿠키가 정본', pickIdea('내 아이디어', undefined).q === '내 아이디어')
t('pickIdea: 고정 예시만 ?q= 인정', pickIdea(undefined, EXAMPLE_IDEA).q === EXAMPLE_IDEA)
t('pickIdea: 그 밖의 ?q= 는 매칭에 안 쓰고 legacy 로만(입력창 채우기)', (() => { const p = pickIdea(undefined, '남의 아이디어'); return p.q === undefined && p.legacy === '남의 아이디어' })())
t('pickIdea: ?q= 가 있어도 쿠키 아이디어가 이긴다(URL 로 매칭을 못 돌린다)', (() => { const p = pickIdea('쿠키', '주소'); return p.q === '쿠키' && p.legacy === '주소' })())

// ── 5) 배선 — 정적 확인 ─────────────────────────────────────────────
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const page = read('app/cases/report/page.tsx')
t('report 페이지: ?q= 를 parseSearchQuery 에 직접 넘기지 않는다', !/parseSearchQuery\(\{ q: sp\.q/.test(page) && page.includes('pickIdea('))
t('report 페이지: GET 폼 제거(method="get" 없음) · IdeaForm 사용', !page.includes('<form method="get"') && page.includes('<IdeaForm'))
t('report 입력칸에 name="q" 가 없다(JS 없이 제출돼도 ?q= 가 안 실린다)', !/<input name="q"/.test(page) && !/name="q"/.test(read('app/cases/report/idea-form.tsx')))
t('library 검색 폼이 /cases/report?q= GET 으로 가지 않는다', !read('app/library/page.tsx').includes('action="/cases/report"'))
t('voc/card 가 /cases/report?q= 링크를 만들지 않는다', !read('app/voc/card/page.tsx').includes('/cases/report?'))
t('pmf-panel 개인정보 문구: 없는 고지 페이지를 가리키지 않는다', !read('app/cases/report/pmf-panel.tsx').includes('자세한 내용은 개인정보 고지'))

// ── 6) 승인 취소 메모 · 컬럼 배선 ───────────────────────────────────
const note = revertNote({ by: 'a@b.c', at: '2026-10-12T00:00:00.000Z', reason: ' 오타 ', prev: '좋음' })
t('revertNote: 누가·언제·왜 + 이전 메모 보존', note.startsWith(REVERT_TAG) && note.includes('a@b.c') && note.includes('2026-10-12T00:00:00.000Z') && note.includes('오타') && note.endsWith('이전 메모: 좋음'))
t('revertNote: 사유·이전 메모가 없으면 그 사실을 적는다', revertNote({ by: 'a@b.c', at: 'T' }).endsWith('사유 미기재') )
const actions = read('app/columns/actions.ts')
const form = read('app/columns/decision-form.tsx')
t('revertColumn: 로그인 가드가 DB 접근보다 먼저', (() => { const i = actions.indexOf('export async function revertColumn'); const body = actions.slice(i); return body.indexOf('requireAllowedUser') >= 0 && body.indexOf('requireAllowedUser') < body.indexOf('createClient') })())
t("revertColumn: approved 에서만, 낙관적 락, draft 로", /\.eq\('review_status', 'approved'\)/.test(actions) && /review_status: 'draft'/.test(actions) && actions.includes('revertNote('))
t('승인 버튼에 확인 대화상자(승인하면 즉시 공개됩니다)', form.includes('승인하면 즉시 공개됩니다') && /window\.confirm/.test(form))
t('승인 취소 버튼 문구', form.includes('승인 취소(초안으로 되돌리기)') && read('app/columns/page.tsx').includes('<RevertForm'))

if (fail) { console.log(`실패 ${fail}건 / 통과 ${pass}건`); process.exit(1) }
console.log(`통과 ${pass}건 — 인용 관문 · 소비재 태그 3상태 · /voc anti-join·fail-closed · 아이디어 인계 · 승인 취소`)
