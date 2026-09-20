// 수집 러너 — 소스에 무관한 부분 전부.
//
// robots 판정 · 요청 간격 · 일일 상한 · 커서 전진 · 지문 대조 · 증분 종료 ·
// 건강도 집계가 여기 있다. 어댑터는 "다음 URL"과 "파싱"만 안다.
//
// ⚠️ 이 분리가 단일 소스 리스크에 대한 대비다. 다나와가 구조를 바꾸면
//    어댑터와 픽스처만 갈아끼운다. 이 파일은 건드리지 않는다.
//
// ⚠️ 외부 세계를 전부 포트로 주입받는다(네트워크·DB·시계·sleep).
//    DB 없이 가짜 포트로 전 경로를 테스트하기 위해서다. 마이그레이션 적용을
//    기다리지 않고 지금 검증할 수 있는 게 이 구조 덕이다.

import {
  looksLikeMarkup,
  parseRobots,
  robotsCrawlDelaySec,
  robotsVerdict,
  type RobotsGroup,
  type RobotsState,
} from './robots.ts'
import { computeFingerprint } from './fingerprint.ts'
import { judgeHealth, classifyBlockedResponse, type HealthVerdict, type RunStats } from './health.ts'
import type { Fingerprint, ParsedReview, ReviewSourceAdapter, TargetState } from './types.ts'

/** robots.txt 와 대조할 제품 토큰(RFC 9309 §2.2.1). UA 문자열 전체가 아니다. */
export const PRODUCT_TOKEN = 'solutionarchive-review-collector'

export const USER_AGENT = `${PRODUCT_TOKEN}/0.1 (+https://github.com/hanazi8282-maker/solutionarchive-app)`

/**
 * 증분 종료 조건.
 *
 * last_review_at 보다 오래된 리뷰를 **연속 이 횟수만큼** 만나면 그 타깃을
 * 그 실행에서 종료한다. "페이지 끝"이 아니라 이 조건을 쓰는 이유:
 * 정렬이 흔들리면 페이지 경계가 밀려 일부를 건너뛴다. 한두 개가 순서에서
 * 튀어도 조기 종료하지 않게 여유를 둔다.
 */
export const STALE_STREAK_TO_STOP = 5

/** 한 타깃에서 한 실행에 가져올 최대 페이지. 폭주 방지용 안전판이다. */
export const MAX_PAGES_PER_TARGET = 20

export interface SourceConfig {
  key: string
  enabled: boolean
  minIntervalMs: number
  dailyRequestCap: number
  requestsToday: number
}

export interface TargetProgress {
  targetId: string
  cursor: string | null
  lastReviewAt: string | null
  consecutiveEmpty: number
  status: 'active' | 'exhausted' | 'failed'
  collectedDelta: number
}

export type FetchOutcome =
  /**
   * `finalUrl` = 리다이렉트를 다 따라간 **실제로 읽은 URL**(`Response.url`).
   *
   * ⚠️ robots 캐시가 이걸 쓴다. `a.com/robots.txt` 가 `b.com/robots.txt` 로
   *    리다이렉트되면 우리가 읽은 건 **b 의 규칙**이다. 그걸 a 의 규칙으로
   *    캐시하면 한 호스트의 허용 규칙이 다른 호스트에 이식된다.
   *
   *    실측 반례가 SOOP 이다 — `.co.kr → .com` 리다이렉트인데
   *    `www`(`Allow: /`)와 `vod`(`Disallow: /api/`)의 규칙이 다르다.
   *
   * 옵셔널인 이유: 픽스처 포트(셀프테스트의 가짜 fetchText)는 리다이렉트를
   * 하지 않아 이 값이 없다. 없으면 "리다이렉트 없음"으로 본다. 실제 네트워크
   * 포트는 반드시 채운다 — `scripts/review-collect.mjs` 가 `res.url` 을 넣고,
   * 그게 들어 있는지를 `scripts/review-robots-fail-closed-selftest.mjs` 가 본다.
   */
  | { status: number; body: string; finalUrl?: string }
  | { status: null; body: ''; error: string }

export interface RunnerStore {
  loadSource(key: string): Promise<SourceConfig | null>
  listDueTargets(sourceKey: string, limit: number): Promise<TargetState[]>
  saveTargetProgress(p: TargetProgress): Promise<void>
  /**
   * 지문 기록. **삽입 시도가 곧 중복 검사다** — 조회 후 삽입이 아니라서
   * 동시 실행에도 안전하다.
   *   new       : 처음 보는 리뷰
   *   duplicate : identity 도 content 도 같음
   *   revised   : identity 는 같은데 content 가 다름(수정된 리뷰)
   */
  recordFingerprint(fp: Fingerprint): Promise<'new' | 'duplicate' | 'revised'>
  /** analysis_inputs 에 리뷰 1건 = 1행으로 적재하고 id 를 돌려준다. */
  appendInput(input: {
    projectId: string
    sourceKey: string
    text: string
    collectedAt: string
  }): Promise<string>
  linkFingerprint(sourceKey: string, identityKey: string, analysisInputId: string): Promise<void>
  updateSourceHealth(key: string, v: HealthVerdict): Promise<void>
}

export interface RunnerPorts {
  now(): Date
  sleep(ms: number): Promise<void>
  fetchText(url: string): Promise<FetchOutcome>
  store: RunnerStore
}

export interface RunOptions {
  dryRun: boolean
  /** 이 실행에서 훑을 최대 타깃 수. */
  targetLimit: number
}

export interface RunResult {
  sourceKey: string
  skipped: boolean
  skipReason?: string
  stats: RunStats
  health: HealthVerdict | null
  targetsVisited: number
  requests: number
  pagesFetched: number
  robotsSkips: number
  perTarget: Array<{ targetId: string; productRef: string; outcome: string }>
}

const emptyStats = (): RunStats => ({
  reviewsParsed: 0,
  parseFailures: 0,
  relevanceFiltered: 0,
  newReviews: 0,
  fallbackKeys: 0,
  blockedResponses: 0,
  quotaExhaustedResponses: 0,
})

/**
 * robots 를 못 읽은 상태. `bypassable` 은 "소스가 명시 표식을 달았으면 통과시켜도
 * 되는 종류인가"다.
 *
 * ⚠️ 가르는 기준은 **서버가 확정적으로 답했는가**다.
 *    404/403/HTML 은 서버가 "그런 규칙 파일 없다 / 안 준다"고 답한 것이라,
 *    사람이 실측 근거를 달면 진행 판단이 가능하다.
 *    5xx·타임아웃·네트워크 오류는 규칙이 있는지조차 모르는 상태다 — 어떤
 *    표식으로도 통과하지 못한다. 이건 2026-09-18 이전 동작을 그대로 유지한다.
 */
interface RobotsUnread {
  reason: string
  bypassable: boolean
}

/** 한 요청에 대한 robots 판정 + 그 호스트가 선언한 Crawl-delay. */
interface RobotsDecision {
  state: RobotsState
  reason: string
  /** robots 가 선언한 최소 간격(ms). 선언이 없으면 0. */
  crawlDelayMs: number
}

/**
 * 호스트별 robots 캐시. 한 실행 안에서 같은 호스트를 두 번 묻지 않는다.
 *
 * ⚠️ 캐시 키는 **robots.txt 를 실제로 읽은 최종 URL 의 origin** 이다.
 *    요청한 origin 으로 캐시하면 리다이렉트된 남의 규칙을 이식한다(아래 load 주석).
 */
export class RobotsCache {
  private readonly groups = new Map<string, RobotsGroup[] | RobotsUnread>()
  private readonly ports: Pick<RunnerPorts, 'fetchText'>
  /** robots 그룹 선택에 쓰는 우리 제품 토큰. 러너는 리뷰 수집기, 발굴 엔진은 자기 토큰을 넘긴다. */
  private readonly productToken: string
  /** 소스가 "robots 확인 불가여도 진행"을 명시 등재한 호스트들. */
  private readonly proceedHosts: Set<string>

  // ⚠️ 파라미터 프로퍼티(constructor(private x))를 쓰지 않는다. Node 의
  //    타입 스트리핑은 코드를 생성하는 TS 문법을 지원하지 않아서
  //    ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX 로 죽는다. 이 트리는 Next 빌드가
  //    아니라 Node 스크립트가 직접 로드한다.
  // ⚠️ 2026-09-20: export 했다. `scripts/discovery-run.mjs` 가 다나와 검색 앞에 같은 판정을
  //    쓴다(감사 1-1 — 발굴 엔진이 robots 없이 GET 하던 구멍). 판정 로직은 한 벌이어야 한다.
  constructor(
    ports: Pick<RunnerPorts, 'fetchText'>,
    proceedWhenUnverified: string[] = [],
    productToken: string = PRODUCT_TOKEN,
  ) {
    this.ports = ports
    this.proceedHosts = new Set(proceedWhenUnverified.map((h) => h.toLowerCase()))
    this.productToken = productToken
  }

  async decide(url: string): Promise<RobotsDecision> {
    const u = new URL(url)
    const entry = await this.load(u.origin)

    if (!Array.isArray(entry)) {
      return this.unverified(u.hostname, entry.reason, entry.bypassable, 0)
    }

    const crawlDelaySec = robotsCrawlDelaySec(entry, this.productToken)
    const crawlDelayMs = crawlDelaySec === null ? 0 : Math.round(crawlDelaySec * 1000)

    // ⚠️ SP-026 은 이번 범위 밖이다 — 여기 `u.search` 가 빠져 있어 쿼리 대상
    //    규칙(`Disallow: /*?page=`)은 여전히 판정에 안 걸린다. 이 PR 은
    //    "못 읽은 것을 통과시키는" 구멍만 막는다. 자세한 이유는 PR 설명과
    //    docs/strategy-principles.md 의 SP-026 행.
    const v = robotsVerdict(entry, u.pathname, this.productToken)
    if (v.state === 'unverified') {
      return this.unverified(u.hostname, v.reason, true, crawlDelayMs)
    }
    return { state: v.state, reason: v.reason, crawlDelayMs }
  }

  /**
   * 확인 불가를 어떻게 낼지. 표식이 있고 통과 가능한 종류면 허용으로 바꾸되
   * **사유에 그 사실을 남긴다** — 로그에서 "정상 허용"과 구분되어야 한다
   * (_principles.md §2).
   */
  private unverified(
    hostname: string,
    reason: string,
    bypassable: boolean,
    crawlDelayMs: number,
  ): RobotsDecision {
    if (bypassable && this.proceedHosts.has(hostname.toLowerCase())) {
      return {
        state: 'allowed',
        reason: `robots 확인 불가(${reason}) — 소스가 이 호스트를 명시 등재해 진행한다`,
        crawlDelayMs,
      }
    }
    return { state: 'unverified', reason, crawlDelayMs }
  }

  private async load(origin: string): Promise<RobotsGroup[] | RobotsUnread> {
    const hit = this.groups.get(origin)
    if (hit) return hit

    const res = await this.ports.fetchText(`${origin}/robots.txt`)
    const entry = this.classify(origin, res)
    this.groups.set(origin, entry)
    return entry
  }

  private classify(origin: string, res: FetchOutcome): RobotsGroup[] | RobotsUnread {
    // ⚠️ 읽지 못한 것을 "허용"으로 다루지 않는다. RFC 9309 는 5xx 를 전부
    //    금지로 보라고 하고, 네트워크 오류도 같게 다룬다. 상대 서버가 잠깐
    //    흔들린 틈에 금지 경로를 긁는 걸 막는다. **표식으로도 못 뚫는다.**
    if (res.status === null) {
      return { reason: `robots.txt 요청 실패 — ${res.error}`, bypassable: false }
    }
    if (res.status >= 500) {
      return {
        reason: `robots.txt HTTP ${res.status} — 서버 오류라 규칙이 있는지조차 모른다`,
        bypassable: false,
      }
    }

    // ⚠️ 여기가 구멍 ① 이었다. 2026-09-18 까지 4xx 를 `[]`(규칙 0개 = 허용)로
    //    캐시했다. RFC 9309 §2.3.1.3 은 4xx 를 "제약 없음"으로 정의하지만,
    //    실측에서 그 4xx 본문은 **robots 를 감춘 HTML** 이었다:
    //      킥스타터 403(Cloudflare 챌린지) · www.tistory.com 404 ·
    //      theqoo/todayhumor 404 · clien 은 우리 UA 에게만 404(SP-027).
    //    "규칙이 없다"와 "규칙을 안 보여 준다"를 같은 값으로 접으면, 사이트가
    //    실제로 건 규칙이 판정에 한 번도 반영되지 않는다(CLAUDE.md §7.2).
    //    그래서 확인 불가로 두고, 소스별 명시 표식만 통과시킨다.
    if (res.status !== 200) {
      return { reason: `robots.txt HTTP ${res.status} — 규칙을 읽지 못했다`, bypassable: true }
    }

    // ⚠️ 구멍 ② — 리다이렉트로 다른 호스트의 robots 를 읽었으면, 그건 우리가
    //    요청한 호스트의 규칙이 아니다. 읽은 쪽(finalOrigin)에 캐시해 두고,
    //    요청한 origin 은 확인 불가로 남긴다.
    const finalOrigin = this.finalOriginOf(res.finalUrl)
    if (finalOrigin && finalOrigin !== origin) {
      const groups = this.parsed(res.body)
      // 최종 호스트의 규칙으로는 유효하다. 그 호스트를 나중에 물으면 재요청 없이 쓴다.
      if (!this.groups.has(finalOrigin)) this.groups.set(finalOrigin, groups)
      return {
        reason: `robots.txt 가 ${finalOrigin} 로 리다이렉트됐다 — ${origin} 의 규칙을 읽은 게 아니다`,
        bypassable: true,
      }
    }

    return this.parsed(res.body)
  }

  /**
   * `finalUrl` 이 정말 robots.txt 를 읽은 주소인지 확인한 뒤 그 origin 을 준다.
   * 경로가 `/robots.txt` 가 아니면(에러 페이지로 보냈다) origin 비교로 쓰지 않는다 —
   * 그 경우는 본문 마크업 검사가 잡는다.
   */
  private finalOriginOf(finalUrl: string | undefined): string | null {
    if (!finalUrl) return null
    try {
      const f = new URL(finalUrl)
      return f.pathname === '/robots.txt' ? f.origin : null
    } catch {
      return null
    }
  }

  private parsed(body: string): RobotsGroup[] | RobotsUnread {
    // ⚠️ 200 인데 본문이 HTML 인 소프트 404. 상태 코드만 보면 못 잡는다(§7.1).
    if (looksLikeMarkup(body)) {
      return { reason: 'robots.txt 자리에 HTML 이 왔다 — 규칙을 읽지 못했다', bypassable: true }
    }
    return parseRobots(body)
  }
}

/**
 * 마지막 요청 이후 간격이 지나지 않았으면 그만큼 잔다.
 *
 * 간격은 **DB 의 min_interval_ms 와 robots 의 Crawl-delay 중 큰 쪽**이다.
 * 둘 중 작은 쪽을 쓰면 robots 를 읽는 의미가 없고, DB 값만 쓰면 사람이 손으로
 * 값을 맞춰 주지 않은 소스에서 조용히 robots 위반이 된다.
 */
class Pacer {
  private last = 0
  private readonly ports: RunnerPorts
  private readonly intervalMs: number

  constructor(ports: RunnerPorts, intervalMs: number) {
    this.ports = ports
    this.intervalMs = intervalMs
  }

  async wait(robotsCrawlDelayMs = 0): Promise<void> {
    const interval = Math.max(this.intervalMs, robotsCrawlDelayMs)
    const now = this.ports.now().getTime()
    const gap = now - this.last
    if (this.last > 0 && gap < interval) {
      await this.ports.sleep(interval - gap)
    }
    this.last = this.ports.now().getTime()
  }
}

export async function runCollection(
  adapter: ReviewSourceAdapter,
  opts: RunOptions,
  ports: RunnerPorts,
): Promise<RunResult> {
  const stats = emptyStats()
  const perTarget: RunResult['perTarget'] = []
  let requests = 0
  let pagesFetched = 0
  let robotsSkips = 0
  let targetsVisited = 0

  const source = await ports.store.loadSource(adapter.key)
  if (!source) {
    return {
      sourceKey: adapter.key,
      skipped: true,
      skipReason: '소스가 등록되어 있지 않다',
      stats,
      health: null,
      targetsVisited: 0,
      requests: 0,
      pagesFetched: 0,
      robotsSkips: 0,
      perTarget,
    }
  }

  // 사람이 대시보드에서 끈 소스는 건드리지 않는다. 이게 "즉시 중단"의 실질이다.
  if (!source.enabled) {
    return {
      sourceKey: adapter.key,
      skipped: true,
      skipReason: '소스가 비활성 상태다(review_sources.enabled=false)',
      stats,
      health: null,
      targetsVisited: 0,
      requests: 0,
      pagesFetched: 0,
      robotsSkips: 0,
      perTarget,
    }
  }

  const robots = new RobotsCache(ports, adapter.proceedWhenRobotsUnverified ?? [])
  const pacer = new Pacer(ports, source.minIntervalMs)
  const budget = source.dailyRequestCap - source.requestsToday

  let aborted = false

  const targets = await ports.store.listDueTargets(adapter.key, opts.targetLimit)

  for (const target of targets) {
    if (aborted) break
    if (requests >= budget) {
      perTarget.push({ targetId: target.id, productRef: target.productRef, outcome: '일일 상한 도달' })
      continue
    }

    targetsVisited++

    let cursor = target.cursor

    // ⚠️ 증분 기준선은 **실행 시작 시점 값으로 고정**한다. 이걸 진행하면서
    //    갱신하면, 첫 실행(baseline=null)에서 1페이지를 읽고 그 최신 날짜를
    //    기준으로 삼는 순간 2페이지의 과거 리뷰가 전부 "이미 본 것"이 되어
    //    한 페이지만 긁고 멈춘다. 과거를 훑어야 하는 첫 실행이 가장 크게
    //    망가진다. 통합 테스트가 이걸 잡았다.
    const baselineReviewAt = target.lastReviewAt

    // 저장용은 따로 둔다. 이번 실행에서 본 가장 최신 리뷰 날짜다.
    let lastReviewAt = target.lastReviewAt
    let staleStreak = 0
    let collected = 0
    let outcome = '진행'
    let status: TargetProgress['status'] = 'active'

    for (let page = 0; page < MAX_PAGES_PER_TARGET; page++) {
      if (requests >= budget) {
        outcome = '일일 상한 도달'
        break
      }

      const req = adapter.nextRequest({ ...target, cursor })
      if (!req) {
        outcome = '다음 요청 없음'
        status = 'exhausted'
        break
      }

      const verdict = await robots.decide(req.url)
      if (verdict.state !== 'allowed') {
        // ⛔ 요청 자체를 보내지 않는다. "차단됐다"가 아니라 "규칙상 안 간다"다.
        //
        // ⚠️ 금지(disallowed)와 확인 불가(unverified)를 **다른 문장으로 남긴다.**
        //    앞은 사이트가 막은 것이고, 뒤는 우리가 규칙을 못 읽은 것이다.
        //    다음 행동이 정반대다 — 앞은 경로를 빼야 하고, 뒤는 robots 를 왜
        //    못 읽었는지 실측해야 한다(_principles.md §1).
        robotsSkips++
        outcome =
          verdict.state === 'disallowed'
            ? `robots 금지 — ${verdict.reason}`
            : `robots 확인 불가 — ${verdict.reason}. 요청하지 않았다(fail-closed)`
        status = 'exhausted'
        break
      }

      await pacer.wait(verdict.crawlDelayMs)
      const res = await ports.fetchText(req.url)
      requests++

      // 403/429 는 두 사건이 겹쳐 있다 — 차단과 쿼터 소진.
      //
      // 공식 API 는 일일 한도를 다 쓰면 403 을 준다. 그걸 차단으로 세면
      // **정상적인 한도 소진이 "차단당했다"로 기록되고 소스가 꺼진다.**
      // 표지를 못 읽으면 차단으로 본다(안전한 쪽). 근거는 health.ts.
      if (res.status === 403 || res.status === 429) {
        const kind = classifyBlockedResponse(res.body, adapter.quotaMarkers)
        if (kind === 'quota') {
          stats.quotaExhaustedResponses++
          outcome = `쿼터 소진 ${res.status} — 오늘 몫을 다 썼다. 소스는 유지한다`
        } else {
          stats.blockedResponses++
          outcome = `차단 응답 ${res.status} — 실행을 중단한다`
        }
        // 어느 쪽이든 더 두드리지 않는다. 차단이면 영구 차단에 가까워지고,
        // 쿼터면 어차피 오늘은 더 못 받는다.
        status = 'active'
        aborted = true
        break
      }

      if (res.status === null || res.status >= 400) {
        outcome = res.status === null ? `요청 실패 — ${res.error}` : `HTTP ${res.status}`
        status = 'failed'
        break
      }

      pagesFetched++
      const parsed = adapter.parse(res.body, { productRef: target.productRef, cursor })
      stats.parseFailures += parsed.parseFailures
      // 순수 누적 카운터. 종료 조건·커서·STALE 판정 어디에도 안 쓴다.
      // filtered 를 안 내는 어댑터(danawa·appstore)는 여기서 0 이 더해진다.
      stats.relevanceFiltered += parsed.filtered ?? 0

      const pageResult = await ingestPage(
        parsed.reviews,
        { target, lastReviewAt: baselineReviewAt, sourceKey: adapter.key },
        opts,
        ports,
        stats,
      )

      collected += pageResult.newCount
      staleStreak = pageResult.staleFromStart ? staleStreak + pageResult.staleRun : pageResult.staleRun
      if (pageResult.newestDate && (!lastReviewAt || pageResult.newestDate > lastReviewAt)) {
        lastReviewAt = pageResult.newestDate
      }

      cursor = parsed.nextCursor

      // ⚠️ 페이지 하나마다 즉시 저장한다. 잡이 SIGKILL 로 죽어도 다음 실행이
      //    여기서 이어간다 — 재개를 위한 별도 복구 로직이 없는 이유다.
      if (!opts.dryRun) {
        await ports.store.saveTargetProgress({
          targetId: target.id,
          cursor,
          lastReviewAt,
          consecutiveEmpty: target.consecutiveEmpty,
          status: cursor === null ? 'exhausted' : 'active',
          collectedDelta: pageResult.newCount,
        })
      }

      if (cursor === null) {
        outcome = '끝까지 읽음'
        status = 'exhausted'
        break
      }
      if (staleStreak >= STALE_STREAK_TO_STOP) {
        outcome = `이미 본 구간 도달(연속 ${staleStreak}건)`
        status = 'active'
        break
      }
    }

    const consecutiveEmpty = collected === 0 ? target.consecutiveEmpty + 1 : 0

    if (!opts.dryRun) {
      await ports.store.saveTargetProgress({
        targetId: target.id,
        cursor,
        lastReviewAt,
        consecutiveEmpty,
        status,
        collectedDelta: 0,
      })
    }

    // ⚠️ dry-run 의 신규 건수는 0 이 아니라 **측정 안 함**이다. ingestPage 가
    //    `if (opts.dryRun) continue` 를 newCount++ 앞에서 하므로 구조상 항상 0이다.
    //    "새 게 없다"와 "세지 않았다"를 같은 글자로 찍으면 안 된다(§7.1).
    //
    // ⚠️ outcome 이 '진행' 으로 남았다는 것은 20페이지 루프가 break 없이
    //    완주했다는 뜻이다 = 상한에 걸려 잘렸다. 그 사실이 이름에 안 드러나면
    //    "정상 진행"으로 읽힌다. 안전장치가 걸린 것을 정상으로 읽지 마라(§7.2).
    const capped = outcome === '진행'
    const label = capped ? `페이지 상한 ${MAX_PAGES_PER_TARGET} 도달 — 다음 실행에서 이어 읽는다` : outcome
    const newLabel = opts.dryRun ? '신규 —(dry-run 은 판정하지 않음)' : `신규 ${collected}건`

    perTarget.push({
      targetId: target.id,
      productRef: target.productRef,
      outcome: `${label} · ${newLabel}`,
    })
  }

  const health = judgeHealth({
    stats,
    // 소스 단위 연속 0건은 "이번 실행에서 아무 타깃도 신규를 못 냈는가"로 본다.
    consecutiveEmptyBefore: 0,
  })

  if (!opts.dryRun) {
    await ports.store.updateSourceHealth(adapter.key, health)
  }

  return {
    sourceKey: adapter.key,
    skipped: false,
    stats,
    health,
    targetsVisited,
    requests,
    pagesFetched,
    robotsSkips,
    perTarget,
  }
}

/** 한 페이지분 리뷰를 지문 대조하고 적재한다. */
async function ingestPage(
  reviews: ParsedReview[],
  ctx: { target: TargetState; lastReviewAt: string | null; sourceKey: string },
  opts: RunOptions,
  ports: RunnerPorts,
  stats: RunStats,
): Promise<{ newCount: number; staleRun: number; staleFromStart: boolean; newestDate: string | null }> {
  let newCount = 0
  let staleRun = 0
  let staleFromStart = true
  let newestDate: string | null = null

  for (const review of reviews) {
    stats.reviewsParsed++

    const fp = computeFingerprint(ctx.sourceKey, ctx.target.productRef, review)
    if (!fp) {
      // 지문을 만들 수 없다 = 정체성 재료가 전부 비었다. 파서가 이미
      // 실패로 세는 상황과 같지만, 여기서 한 번 더 센다 — 어댑터가 놓쳐도
      // 러너가 잡는다.
      stats.parseFailures++
      continue
    }
    if (fp.kind === 'composite') stats.fallbackKeys++

    if (review.writtenAt && (!newestDate || review.writtenAt > newestDate)) {
      newestDate = review.writtenAt
    }

    // 증분 판정: 기준일보다 오래된 리뷰가 연속으로 나오는지 센다.
    const isStale = Boolean(
      ctx.lastReviewAt && review.writtenAt && review.writtenAt < ctx.lastReviewAt,
    )
    if (isStale) {
      staleRun++
    } else {
      staleRun = 0
      staleFromStart = false
    }

    if (opts.dryRun) continue

    const verdict = await ports.store.recordFingerprint(fp)
    if (verdict === 'duplicate' || verdict === 'revised') {
      // 수정된 리뷰도 재적재하지 않는다. 이미 분석에 반영된 의견인데
      // 수정본을 또 넣으면 같은 사람 의견이 두 번 세어진다(설계 §4.5).
      continue
    }

    const inputId = await ports.store.appendInput({
      projectId: ctx.target.projectId,
      sourceKey: ctx.sourceKey,
      text: review.text,
      collectedAt: ports.now().toISOString(),
    })
    await ports.store.linkFingerprint(ctx.sourceKey, fp.identityKey, inputId)

    newCount++
    stats.newReviews++
  }

  return { newCount, staleRun, staleFromStart, newestDate }
}
