#!/usr/bin/env node
// v71ad §5(d) 공식 API 어댑터 셀프테스트 — github_issues(REST Search, 무토큰) · stackexchange(API 2.3, 무키). 네트워크·DB 없음.
// 합성 응답으로 돈다(공개 리포라 실제 이슈 본문·작성자를 픽스처로 남기지 않는다). 응답 모양은 2026-10-17 실측과 같은 필드만 쓴다.
// 보는 것: URL·SSRF 경계 · PR/봇/메인테이너 거름 · 작성자 미저장·@멘션 치환 · 코드/주석 제거 · 증분(last)·백필 페이지 상한 ·
//          §7.1(목록 모양 아님 = 실패, 0건 아님) · 러너와 붙인 경계면(실제 runCollection: 403/429/400/HTML → 요청 1건 뒤 차단 중단, robots 404 표식 통과).

import { runCollection } from '../lib/review/runner.ts'
import { BACKFILL_PAGES, PER_PAGE, REPOS, cleanBody, decodeCursor, githubAdapter as G, maskMentions } from '../lib/review/adapters/github.ts'
import { BOARDS as SE_BOARDS, stackexchangeAdapter as S } from '../lib/review/adapters/stackexchange.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ctx = (productRef, cursor = null) => ({ productRef, cursor, lastReviewAt: null })
const target = (key, ref, cursor = null) => ({ id: 't1', projectId: 'p1', sourceKey: key, productRef: ref, cursor, consecutiveEmpty: 0, lastReviewAt: null, lastRunAt: null })

// ── GitHub ───────────────────────────────────────────────────────
const issue = (n, o = {}) => ({ number: n, title: `Issue ${n}`, body: `body ${n}`, created_at: '2026-10-16T01:00:00Z', author_association: 'NONE', user: { login: 'someone', type: 'User' }, ...o })
const page = (items) => JSON.stringify({ total_count: 999, incomplete_results: false, items })

{
  const u = new URL(G.nextRequest(target('github_issues', 'board:twenty')).url)
  t('gh: 호스트 api.github.com · search/issues', `${u.origin}${u.pathname}`, 'https://api.github.com/search/issues')
  t('gh: q = repo + is:issue · 생성순 · 50 · 1페이지', [u.searchParams.get('q'), u.searchParams.get('sort'), u.searchParams.get('order'), u.searchParams.get('per_page'), u.searchParams.get('page')], ['repo:twentyhq/twenty is:issue', 'created', 'desc', '50', '1'])
  t('gh: 모르는 slug · board 아님 → 요청 안 함(SSRF·0요청)', [G.nextRequest(target('github_issues', 'board:evil')), G.nextRequest(target('github_issues', 'url:https://x.y'))], [null, null])
  t('gh: 커서 page 3 → page=3', new URL(G.nextRequest(target('github_issues', 'board:twenty', JSON.stringify({ last: null, page: 3, top: 900 }))).url).searchParams.get('page'), '3')
  t('gh: 표의 저장소는 전부 owner/repo 형식', Object.values(REPOS).every((r) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r)), true)
  t('gh: target-ref 가 표 slug 만 받는다', [buildProductRef('github_issues', 'board:kimai')?.productRef, buildProductRef('github_issues', 'board:nope')?.ok], ['board:kimai', false])
}
{
  t('mention: @handle → @user · 이메일·경로·코드 그대로', maskMentions('hi @octo-cat and (@bob), mail a@b.com, /@x, `@y`'), 'hi @user and (@user), mail a@b.com, /@x, `@y`')
  t('clean: 템플릿 주석·코드 블록·이미지 제거', cleanBody('<!-- tpl -->Steps\n```\nstack trace @leak\n```\n![s](https://x/y.png) done'), 'Steps\n[코드 생략]\n[이미지] done')
}
{
  const r = G.parse(page([
    issue(105, { body: 'cc @maintainer please' }),
    issue(104, { pull_request: { url: 'x' } }),
    issue(103, { user: { login: 'dependabot[bot]', type: 'Bot' } }),
    issue(102, { author_association: 'MEMBER' }),
    issue(101, { author_association: 'CONTRIBUTOR', body: null }),
    { title: 'no number' },
  ]), ctx('board:twenty'))
  t('gh: PR·봇·메인테이너 거름(filtered 3) · 번호 없음 실패 1 · 2건', [r.reviews.length, r.filtered, r.parseFailures], [2, 3, 1])
  t('gh: externalId · sourceUrl · 날짜(KST)', [r.reviews[0].externalId, r.reviews[0].sourceUrl, r.reviews[0].writtenAt], ['issue:twentyhq/twenty#105', 'https://github.com/twentyhq/twenty/issues/105', '2026-10-16'])
  t('gh: 작성자 미저장 · 로그인 이름이 결과에 없다 · 멘션 치환', [r.reviews.every((x) => x.authorMasked === null), JSON.stringify(r.reviews).includes('someone'), r.reviews[0].text], [true, false, 'Issue 105\n\ncc @user please'])
  t('gh: body null 이면 제목만', r.reviews[1].text, 'Issue 101')
  t('gh: 덜 찬 페이지 → last=최대 번호 · pauseRun', [decodeCursor(r.nextCursor), r.pauseRun], [{ last: 105, page: null, top: null }, true])
}
{
  const full = (from) => page(Array.from({ length: PER_PAGE }, (_, i) => issue(from - i)))
  const p1 = G.parse(full(1000), ctx('board:twenty'))
  t('gh: 첫 실행 꽉 찬 페이지 → 다음 페이지(같은 실행) · top 기억', [decodeCursor(p1.nextCursor), p1.pauseRun, p1.reviews.length], [{ last: null, page: 2, top: 1000 }, false, 50])
  const p5 = G.parse(full(800), ctx('board:twenty', JSON.stringify({ last: null, page: BACKFILL_PAGES, top: 1000 })))
  t(`gh: 백필 상한 ${BACKFILL_PAGES}페이지 → last=top 으로 닫고 멈춤`, [decodeCursor(p5.nextCursor), p5.pauseRun], [{ last: 1000, page: null, top: null }, true])
  const inc = G.parse(full(1010), ctx('board:twenty', JSON.stringify({ last: 1000, page: null, top: null })))
  t('gh: 다음 실행 — last 보다 큰 10건만 · 이미 본 것은 버림 · last 1010', [inc.reviews.length, decodeCursor(inc.nextCursor).last, inc.pauseRun], [10, 1010, true])
  const bad = G.parse('{"message":"Validation Failed"}', ctx('board:twenty', JSON.stringify({ last: 1000 })))
  t('gh: 목록 모양 아님 = 실패 1 · 커서 유지 · 멈춤(§7.1)', [bad.parseFailures, decodeCursor(bad.nextCursor).last, bad.pauseRun], [1, 1000, true])
  t('gh: isChallenge — HTML·빈 응답 true · JSON false', [G.isChallenge('<html>'), G.isChallenge(''), G.isChallenge('{"items":[]}')], [true, true, false])
  t('gh: quotaMarkers 없음(한도 초과도 차단으로 멈춤)', G.quotaMarkers, undefined)
}

// ── Stack Exchange ───────────────────────────────────────────────
const q = (id, o = {}) => ({ question_id: id, title: `How to &amp; ${id}`, body: `<p>Need help @alice</p><pre><code>x</code></pre>`, creation_date: 1792000000, owner: { display_name: 'Alice' }, ...o })
{
  const u = new URL(S.nextRequest(target('stackexchange', 'board:su-teams')).url)
  t('se: 호스트·경로·파라미터', [u.origin + u.pathname, u.searchParams.get('site'), u.searchParams.get('tagged'), u.searchParams.get('sort'), u.searchParams.get('filter'), u.searchParams.has('key')], ['https://api.stackexchange.com/2.3/questions', 'superuser', 'microsoft-teams', 'creation', 'withbody', false])
  t('se: 모르는 slug → 요청 안 함', S.nextRequest(target('stackexchange', 'board:x')), null)
  t('se: 표의 사이트는 전부 웹 호스트가 있다 · stackoverflow 없음', Object.values(SE_BOARDS).every((b) => b.site !== 'stackoverflow'), true)
  const r = S.parse(JSON.stringify({ items: [q(12), q(11), { title: 'x' }], has_more: true, quota_max: 300, quota_remaining: 290 }), ctx('board:su-teams', JSON.stringify({ last: 10 })))
  t('se: 새 질문 2 · 실패 1 · last 12 · 멈춤', [r.reviews.length, r.parseFailures, JSON.parse(r.nextCursor).last, r.pauseRun], [2, 1, 12, true])
  t('se: 엔티티·태그 정리 · 멘션 치환 · 작성자 미저장', [r.reviews[0].text, r.reviews[0].authorMasked, JSON.stringify(r.reviews).includes('Alice')], ['How to & 12\n\nNeed help @user\nx', null, false])
  t('se: externalId · sourceUrl', [r.reviews[0].externalId, r.reviews[0].sourceUrl], ['q:superuser:12', 'https://superuser.com/q/12'])
  const old = S.parse(JSON.stringify({ items: [q(9)] }), ctx('board:su-teams', JSON.stringify({ last: 10 })))
  t('se: 이미 본 id 는 버림 · last 유지', [old.reviews.length, JSON.parse(old.nextCursor).last], [0, 10])
  const err = S.parse('{"error_id":502,"error_name":"throttle_violation"}', ctx('board:su-teams', JSON.stringify({ last: 10 })))
  t('se: 에러 JSON(200) = 실패 1 · 커서 유지', [err.parseFailures, JSON.parse(err.nextCursor).last], [1, 10])
  t('se: 400(스로틀) 은 차단 상태', S.blockStatuses, [400])
}

// ── 러너와 붙인 경계면 ──────────────────────────────────────────
async function run(A, key, ref, respond) {
  const log = { fetched: [], saves: [] }
  let clock = Date.parse('2026-10-17T03:00:00Z')
  const seen = new Set()
  const ports = {
    now: () => new Date(clock),
    async sleep(ms) { clock += ms },
    async fetchText(url) {
      log.fetched.push(url)
      clock += 10
      const u = new URL(url)
      // 실측: 두 API 호스트 모두 robots.txt 가 없다(github 404 · stackexchange 400) → 확인 불가 → 표식으로 통과해야 한다.
      if (u.pathname === '/robots.txt') return { status: u.hostname === 'api.github.com' ? 404 : 400, body: '{"message":"Not Found"}', finalUrl: url }
      const r = respond(u, log.fetched.length)
      return { finalUrl: url, ...r }
    },
    store: {
      async loadSource() { return { key, enabled: true, minIntervalMs: 7000, dailyRequestCap: 100, requestsToday: 0 } },
      async listDueTargets() { return [target(key, ref)] },
      async saveTargetProgress(p) { log.saves.push(p) },
      async recordFingerprint(fp) { if (seen.has(fp.identityKey)) return 'duplicate'; seen.add(fp.identityKey); return 'new' },
      async appendInput() { return 'in' },
      async linkFingerprint() {},
      async updateSourceHealth() {},
    },
  }
  const r = await runCollection(A, { dryRun: false, targetLimit: 5 }, ports)
  return { r, log }
}
{
  const { r, log } = await run(G, 'github_issues', 'board:twenty', (u) => {
    const p = Number(u.searchParams.get('page'))
    return { status: 200, body: page(Array.from({ length: p < 3 ? PER_PAGE : 7 }, (_, i) => issue(1000 - (p - 1) * PER_PAGE - i))) }
  })
  const apiCalls = log.fetched.filter((x) => !x.endsWith('/robots.txt')).length
  t('러너+gh: robots 404 표식 통과 · 첫 실행 백필 3페이지 · 107건 · 실패 0 · active · last 1000', [apiCalls, r.stats.newReviews, r.stats.parseFailures, log.saves.at(-1).status, decodeCursor(log.saves.at(-1).cursor).last], [3, 107, 0, 'active', 1000])
}
for (const [status, body, name] of [[403, '{"message":"API rate limit exceeded for 1.2.3.4."}', '403 한도 초과'], [429, '{}', '429'], [200, '<html>maintenance</html>', '200 HTML']]) {
  const { r } = await run(G, 'github_issues', 'board:twenty', () => ({ status, body }))
  t(`러너+gh: ${name} → 요청 1건 뒤 차단 중단(쿼터로 접지 않는다)`, [r.requests, r.stats.blockedResponses, r.stats.quotaExhaustedResponses], [1, 1, 0])
}
{
  const { r } = await run(S, 'stackexchange', 'board:su-teams', () => ({ status: 400, body: '{"error_id":502,"error_name":"throttle_violation"}' }))
  t('러너+se: 400 스로틀 → 요청 1건 뒤 차단 중단', [r.requests, r.stats.blockedResponses], [1, 1])
  const ok = await run(S, 'stackexchange', 'board:su-teams', () => ({ status: 200, body: JSON.stringify({ items: [q(5), q(4)] }) }))
  t('러너+se: robots 400 표식 통과 · 2건 · active', [ok.r.stats.newReviews, ok.log.saves.at(-1).status], [2, 'active'])
}

console.log(`review-official-api-selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
