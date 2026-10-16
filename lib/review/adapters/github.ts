// GitHub 공개 이슈 어댑터 — REST Search API(`/search/issues`), **무토큰**. v71ad §5(d).
//
// 왜 Search 인가(2026-10-17 실측, 우리 UA, 무토큰):
//   GET /repos/<r>/issues?state=all&sort=created → 200 · 그런데 PR 이 섞여 온다. twentyhq/twenty 는 30건 중 **30건이 PR**(이슈 0),
//     kimai 27/30·postiz 25/30 이 PR. 같은 요청 수로 이슈를 거의 못 받는다.
//   GET /search/issues?q=repo:<r>+is:issue&sort=created&order=desc&per_page=50 → 200 · PR 0 · 본문(body) 포함 → 이슈 1페이지 = 1요청.
//   한도: 무토큰 Search 는 **분당 10회**(응답 헤더 X-RateLimit-Resource: search · Limit 10), core(시간당 60)와 별개 버킷.
//     러너 간격 min_interval_ms ≥ 7000(소스 행)이면 분당 ≤ 8.6회 — 한도 안. 하루 상한은 review_sources.daily_request_cap 이 건다.
//   robots: api.github.com/robots.txt → **404 JSON**(확인 불가). 공식 API 호스트라 규칙이 없는 것이 정상 → 아래 표식으로만 통과(youtube 와 같은 처리).
//   Discussions 는 **GraphQL 만** 있고 GraphQL 은 인증이 필수다 → 무토큰 설계로는 못 한다(안 함, 보고서 참조).
//
// 차단: quotaMarkers 를 두지 않는다 — 한도 초과 403 "API rate limit exceeded"·429 도 **차단**으로 세고 즉시 멈춘다(우회·재시도 없음, v71ad 지시).
//   200 인데 JSON 객체가 아니면(점검 화면·챌린지 HTML) 역시 차단(abortOnChallenge + isChallenge).
//
// 타깃: `board:<slug>` 만. slug → 저장소는 아래 REPOS 표(상수 — product_ref 에서 호스트·경로를 받지 않는다, SSRF 방지).
// 커서: {last: 마지막으로 본 이슈 번호, page, top}. 첫 실행은 최신부터 BACKFILL_PAGES 페이지(≤250건)를 한 실행에 읽고,
//   그 뒤 실행은 1페이지에서 last 보다 큰 번호만. 한 페이지가 전부 새 이슈면(폭주) 다음 페이지도 읽는다(같은 상한).
//
// 작성자: 저장하지 않는다(authorMasked=null). user.type(Bot 여부)·author_association(내부자 여부)은 **거르는 데만** 읽고 남기지 않는다.
//   본문 @멘션은 @user 로 치환(v70 §10, discourse 와 같은 규약). 이슈 템플릿 주석·코드 블록·이미지는 걷어낸다(로그·스택트레이스는 VOC 가 아니다).
// 개발 버그 위주 제외: 메인테이너(OWNER·MEMBER·COLLABORATOR)가 쓴 이슈는 내부 작업 메모라 버린다(filtered). 사용자가 쓴 버그 리포트는
//   불편의 증거라 남긴다 — 관련성 판정(T2)이 최종으로 거른다.
// ponytail: 이슈 본문만 받는다. 댓글은 저장소 전체 댓글 엔드포인트가 PR 대화와 섞여 와서 이슈 번호로 다시 걸러야 한다 — 필요해지면 두 번째 요청을 붙여라.
//
// 약관/robots 라벨은 소스 행(review_sources)이 가진다. 어댑터는 판정하지 않는다.

import type { ParseContext, ParseResult, ParsedReview, ReviewSourceAdapter, TargetState } from '../types.ts'
import { parseBoardRef } from '../types.ts'
import { kstDate } from './velog.ts'

export const HOST = 'https://api.github.com'
export const WEB = 'https://github.com'
export const PER_PAGE = 50
/** 첫 실행(또는 폭주) 때 한 실행에 읽는 최대 페이지. Search 는 1,000건까지 준다. */
export const BACKFILL_PAGES = 5
/** 이슈 본문 저장 상한(자). 템플릿·로그가 긴 이슈가 많다(실측 평균 2~3천 자). */
export const MAX_CHARS = 4000
/** 메인테이너 계열 — 내부 작업 이슈라 VOC 가 아니다. */
const INTERNAL = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

/**
 * slug → 저장소. 영역 ①~⑤ 의 **사용자가 직접 쓰는 도구**만(라이브러리·SDK 제외). 2026-10-17 실측 사용자 이슈/일 = 괄호.
 * 실측 근거: 보고서 reports/2026-10-17/explosive-collection-plan.md (d).
 */
export const REPOS: Record<string, string> = {
  // ① 회의·통화 기록
  meetily: 'Zackriya-Solutions/meetily', // (0.48)
  vexa: 'Vexa-ai/vexa', // (0.94)
  'jitsi-meet': 'jitsi/jitsi-meet', // (0.54)
  // ② 영업(CRM)
  twenty: 'twentyhq/twenty', // (4.37)
  'frappe-crm': 'frappe/crm', // (0.52)
  espocrm: 'espocrm/espocrm', // (0.53)
  'krayin-crm': 'krayin/laravel-crm', // (0.38)
  suitecrm: 'SuiteCRM/SuiteCRM', // (0.33)
  // ③ 마케팅
  postiz: 'gitroomhq/postiz-app', // (0.93)
  mautic: 'mautic/mautic', // (8.35 — 5일에 50건, 일시 폭주일 수 있다)
  listmonk: 'knadh/listmonk', // (0.69)
  // ④ 인사 운영(근태·급여)
  kimai: 'kimai/kimai', // (0.36)
  'frappe-hrms': 'frappe/hrms', // (0.84)
  // ⑤ 글쓰기
  languagetool: 'languagetool-org/languagetool', // (0.24)
  appflowy: 'AppFlowy-IO/AppFlowy', // (1.44)
  affine: 'toeverything/AFFiNE', // (1.66)
}

const REPO_RE = /^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/

interface GhCursor {
  last: number | null
  page: number | null
  top: number | null
}

export function decodeCursor(c: string | null): GhCursor {
  if (!c) return { last: null, page: null, top: null }
  try {
    const o = JSON.parse(c) as Record<string, unknown>
    const n = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null)
    return { last: n(o?.last), page: n(o?.page), top: n(o?.top) }
  } catch {
    return { last: null, page: null, top: null }
  }
}
const encode = (c: GhCursor) => JSON.stringify({ last: c.last, page: c.page, top: c.top })

/** @멘션 → @user. 이메일(`a@b.com`)·경로(`/@x`)·코드(`` `@x` ``)는 건드리지 않는다. */
export function maskMentions(s: string): string {
  return s.replace(/(^|[^\w.`/@])@[A-Za-z0-9][A-Za-z0-9-]{0,38}(?![\w-])/g, '$1@user')
}

/** 이슈 본문 정리: 템플릿 주석·코드 블록·이미지 제거, 멘션 치환, 길이 상한. */
export function cleanBody(s: string): string {
  return maskMentions(
    s
      .replace(/\r/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/```[\s\S]*?(```|$)/g, '[코드 생략]')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '[이미지]')
      .replace(/<img\b[^>]*>/gi, '[이미지]'),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS)
}

function searchUrl(repo: string, page: number): string {
  const q = encodeURIComponent(`repo:${repo} is:issue`)
  return `${HOST}/search/issues?q=${q}&sort=created&order=desc&per_page=${PER_PAGE}&page=${page}`
}

function parsePage(body: string, repo: string, cur: GhCursor): ParseResult {
  let j: unknown
  try {
    j = JSON.parse(body)
  } catch {
    j = null
  }
  const items = (j as { items?: unknown } | null)?.items
  // 목록 모양이 아니다 = 에러 JSON·HTML. "새 이슈 0건"이 아니다(§7.1). 커서는 그대로 두고 이번 실행은 멈춘다.
  if (!Array.isArray(items)) return { reviews: [], nextCursor: encode(cur), parseFailures: 1, pauseRun: true }

  const page = cur.page ?? 1
  const last = cur.last ?? 0
  const reviews: ParsedReview[] = []
  let parseFailures = 0
  let filtered = 0
  let top = cur.top ?? 0
  let minNum = Infinity
  for (const it of items as Array<Record<string, unknown>>) {
    const num = typeof it?.number === 'number' && Number.isSafeInteger(it.number) && it.number > 0 ? it.number : null
    if (num === null || typeof it.title !== 'string') {
      parseFailures++
      continue
    }
    top = Math.max(top, num)
    minNum = Math.min(minNum, num)
    if (num <= last) continue // 이미 본 이슈
    const user = it.user as { type?: unknown } | null | undefined
    if (it.pull_request || user?.type === 'Bot' || INTERNAL.has(String(it.author_association ?? ''))) {
      filtered++
      continue
    }
    const title = maskMentions(it.title.trim())
    const text = [title, typeof it.body === 'string' ? cleanBody(it.body) : ''].filter(Boolean).join('\n\n')
    if (!text) continue
    reviews.push({
      externalId: `issue:${repo.toLowerCase()}#${num}`,
      text,
      rating: null,
      seller: null,
      authorMasked: null,
      writtenAt: kstDate(it.created_at),
      sourceUrl: `${WEB}/${repo}/issues/${num}`,
    })
  }
  // 이 페이지가 꽉 찼고 전부 새것이면(첫 실행·폭주) 다음 페이지 — 상한 BACKFILL_PAGES. 아니면 last 를 올리고 이번 실행은 끝.
  const more = items.length === PER_PAGE && minNum > last && page < BACKFILL_PAGES
  const next: GhCursor = more ? { last: cur.last, page: page + 1, top: top || null } : { last: top || cur.last, page: null, top: null }
  return { reviews, nextCursor: encode(next), parseFailures, filtered, pauseRun: !more }
}

export const githubAdapter: ReviewSourceAdapter = {
  key: 'github_issues',
  displayName: 'GitHub 공개 이슈 (REST Search, 무토큰)',
  // 게시판처럼 끝이 없다 — 연속 0건 문턱(board: 30)으로만 닫힌다.
  incrementalOnly: true,
  // api.github.com/robots.txt = 404 JSON (2026-10-17 실측) → 확인 불가. 공식 API 호스트. 5xx·타임아웃은 이 표식으로도 통과하지 않는다.
  proceedWhenRobotsUnverified: ['api.github.com'],
  abortOnChallenge: true,
  isChallenge: (body: string) => !body.trimStart().startsWith('{'),

  nextRequest(target: TargetState): { url: string } | null {
    const slug = parseBoardRef(target.productRef)
    const repo = slug ? REPOS[slug] : undefined
    if (!repo || !REPO_RE.test(repo)) return null
    return { url: searchUrl(repo, decodeCursor(target.cursor).page ?? 1) }
  },

  parse(body: string, ctx: ParseContext): ParseResult {
    const slug = parseBoardRef(ctx.productRef)
    const repo = slug ? REPOS[slug] : undefined
    if (!repo) return { reviews: [], nextCursor: null, parseFailures: 1 }
    return parsePage(body, repo, decodeCursor(ctx.cursor))
  },
  // quotaMarkers 없음 = 한도 초과 403/429 도 차단으로 보고 멈춘다(v71ad: 429 즉시 중단·보고).
}

export const __internal = { parsePage, searchUrl }
