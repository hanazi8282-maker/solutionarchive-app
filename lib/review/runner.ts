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
import {
  judgeHealth,
  classifyBlockedResponse,
  isWafChallenge,
  MAX_CONSECUTIVE_EMPTY,
  BOARD_MAX_CONSECUTIVE_EMPTY,
  PARSE_RATE_NUM,
  PARSE_RATE_DEN,
  type HealthVerdict,
  type RunStats,
} from './health.ts'
import type { Fingerprint, ParsedReview, ReviewRequest, ReviewSourceAdapter, TargetState } from './types.ts'
import { parseBoardRef, withSourceUrl } from './types.ts'

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

/**
 * 한 타깃에서 **연속으로** "삭제·없는 글"(ParseResult.missing)이 이만큼 나오면 이번 실행을 멈춘다(2026-09-30).
 * 지워진 글 하나는 건너뛰지만, 줄줄이 없다고 나오면 글이 지워진 게 아니라 사이트 구조 변경·차단을 의심한다.
 * 근거: 09-29 21:31Z 실행에서 velog 요청 57건 중 없는 글은 1건. 막 받은 목록의 글 3건이 연달아 지워질
 * 확률은 무시할 만하고, 3 이면 오판해도 큐에서 잃는 글은 실행당 2건이다(3번째는 큐에 남긴다).
 * 연속 0건 문턱(health.ts MAX_CONSECUTIVE_EMPTY=3)과 같은 크기다.
 */
export const MISSING_STREAK_TO_STOP = 3

export interface SourceConfig {
  key: string
  enabled: boolean
  minIntervalMs: number
  dailyRequestCap: number
  requestsToday: number
  /**
   * 소유자 robots 예외(남헌 2026-10-05·10-06, CLAUDE.md §7.1). review_sources.override ∈ OWNER_ROBOTS_OVERRIDES **이고**
   * robots_status === 'disallowed' 일 때만 true(isOwnerRobotsOverride) — store 가 DB 에서 읽는다. 못 읽으면 loadSource 가 던진다(막힌다).
   * true 여도 robots **disallowed** 판정만 통과한다. 확인 불가(unverified)·5xx 는 그대로 막힌다.
   */
  robotsOwnerOverride?: boolean
  /** review_sources.override 원값(NULL = 예외 없음). 판정에는 안 쓰고 실행 행 스냅샷(override_value)으로만 넘긴다. */
  overrideValue?: string | null
}

/**
 * 소유자 robots 예외를 여는 override 값 — 이 집합 밖의 값(오타·다른 날짜)은 예외가 아니다.
 *   owner_2026-10-05: 앱스토어 RSS(남헌 명시 예외) · owner_2026-10-06: 구글 플레이(남헌 결정, robots·약관 금지를 알고 켬)
 */
export const OWNER_ROBOTS_OVERRIDES: ReadonlySet<string> = new Set(['owner_2026-10-05', 'owner_2026-10-06'])

/** DB 행 → 소유자 예외 여부. robots_status 가 'disallowed' 로 기록된 행만 연다 — 'unverified' 로 적힌 행은 열지 않는다. */
export function isOwnerRobotsOverride(override: unknown, robotsStatus: unknown): boolean {
  return typeof override === 'string' && OWNER_ROBOTS_OVERRIDES.has(override) && robotsStatus === 'disallowed'
}

/** 사람 확인(캡차) 화면 표지. 엄격 모드(소유자 예외 요청·`abortOnChallenge` 어댑터)에서만 본다 — 다른 소스 본문 오탐 방지. */
const CHALLENGE_RE = /recaptcha|g-recaptcha|unusual traffic|captcha/i

/**
 * 엄격 모드 응답 검사: 2xx 인데 빈 본문·캡차 화면·구글 `/sorry/` 리다이렉트면 true(= 차단으로 보고 실행 중단).
 * 우회하지 않는다 — 멈추고 기록할 뿐이다.
 */
export function isStrictBlock(res: FetchOutcome): boolean {
  if (res.status === null || res.status < 200 || res.status >= 300) return false
  return !res.body.trim() || CHALLENGE_RE.test(res.body) || /\/sorry\//.test(res.finalUrl ?? '')
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
   *   cross-target : identity 는 처음인데 **같은 소스에 같은 본문이 이미 적재돼
   *                  있다**. 같은 글이 다른 타깃 경로로 들어온 것이다(2차 방어).
   *                  판정은 DB 를 보는 store 가 한다 — 러너는 세고 로그만 남긴다.
   */
  recordFingerprint(fp: Fingerprint): Promise<'new' | 'duplicate' | 'revised' | 'cross-target'>
  /** analysis_inputs 에 리뷰 1건 = 1행으로 적재하고 id 를 돌려준다. */
  appendInput(input: {
    projectId: string
    sourceKey: string
    text: string
    collectedAt: string
    /** 아래 셋은 analysis_inputs 새 컬럼(마이그 20261005000001). 컬럼이 없으면 store 가 빼고 넣는다. */
    rating?: number | null
    lang?: string | null
    sourceUrl?: string | null
  }): Promise<string>
  linkFingerprint(sourceKey: string, identityKey: string, analysisInputId: string): Promise<void>
  // ⛔ 건강도 저장(updateSourceHealth)은 없앴다(남헌 2026-09-30). 무인 러너가 review_sources 에 쓸 수 있는
  //    컬럼은 CLAUDE.md §10.1 대로 daily_request_cap 하나다(scripts/review-request-cap.mjs). 판정은 RunResult.health 로
  //    돌려주고, 기록은 review_collection_runs.health_after, 고장 보고는 scripts/review-source-health-report.mjs 가 한다.
  //    되살리면 scripts/review-source-health-selftest.mjs 가 실패한다.
}

export interface RunnerPorts {
  now(): Date
  sleep(ms: number): Promise<void>
  /** `init` 은 POST API·헤더 인증 GET API 어댑터만 쓴다(types.ts ReviewRequest). robots.txt 조회는 항상 init 없는 GET 이다. */
  fetchText(url: string, init?: ReviewRequest['init']): Promise<FetchOutcome>
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
  /**
   * robots 를 못 읽었는데 어댑터 `proceedWhenRobotsUnverified` 표식 **때문에만** 보낸 요청 수.
   * 정상으로 읽고 허용된 요청은 세지 않는다. 0 이면 "오늘은 표식이 필요 없었다"는 뜻이다.
   */
  robotsBypassed: number
  /** 표식으로 통과한 호스트 → 못 읽은 이유(예: "HTTP 403"). */
  robotsBypassedHosts: Record<string, string>
  /** robots 가 **금지**인데 소유자 예외(OWNER_ROBOTS_OVERRIDES)로만 보낸 요청 수. 0 이 아니면 요약·경고에 남긴다. */
  robotsOwnerOverride?: number
  /** 이 실행 시점 review_sources.override 스냅샷(SourceConfig.overrideValue). 건너뛴 실행은 없음. */
  overrideValue?: string | null
  perTarget: Array<{ targetId: string; productRef: string; outcome: string }>
  /** 삭제·없는 글이라 건너뛴 수(ParseResult.missing). 파싱 성공·실패 어느 쪽에도 안 센다. 요청 수에는 들어 있다. */
  missingSkipped: number
}

const emptyStats = (): RunStats => ({
  reviewsParsed: 0,
  parseFailures: 0,
  relevanceFiltered: 0,
  newReviews: 0,
  fallbackKeys: 0,
  crossTargetDuplicates: 0,
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
  /** 요약 줄용 짧은 이유(예: "HTTP 403"). */
  cause: string
  bypassable: boolean
}

/** 한 요청에 대한 robots 판정 + 그 호스트가 선언한 Crawl-delay. */
interface RobotsDecision {
  state: RobotsState
  reason: string
  /** robots 가 선언한 최소 간격(ms). 선언이 없으면 0. */
  crawlDelayMs: number
  /** true = 규칙을 못 읽었는데 소스 표식 때문에만 허용했다. 정상 허용과 가르는 유일한 표지다. */
  bypassed?: boolean
  /** bypassed 일 때 못 읽은 짧은 이유(예: "HTTP 403"). */
  unreadCause?: string
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
      return this.unverified(u.hostname, entry.reason, entry.cause, entry.bypassable, 0)
    }

    const crawlDelaySec = robotsCrawlDelaySec(entry, this.productToken)
    const crawlDelayMs = crawlDelaySec === null ? 0 : Math.round(crawlDelaySec * 1000)

    // ⚠️ SP-026 은 이번 범위 밖이다 — 여기 `u.search` 가 빠져 있어 쿼리 대상
    //    규칙(`Disallow: /*?page=`)은 여전히 판정에 안 걸린다. 이 PR 은
    //    "못 읽은 것을 통과시키는" 구멍만 막는다. 자세한 이유는 PR 설명과
    //    docs/strategy-principles.md 의 SP-026 행.
    const v = robotsVerdict(entry, u.pathname, this.productToken)
    if (v.state === 'unverified') {
      return this.unverified(u.hostname, v.reason, v.reason, true, crawlDelayMs)
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
    cause: string,
    bypassable: boolean,
    crawlDelayMs: number,
  ): RobotsDecision {
    if (bypassable && this.proceedHosts.has(hostname.toLowerCase())) {
      return {
        state: 'allowed',
        reason: `robots 확인 불가(${reason}) — 소스가 이 호스트를 명시 등재해 진행한다`,
        crawlDelayMs,
        bypassed: true,
        unreadCause: cause,
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
      return { reason: `robots.txt 요청 실패 — ${res.error}`, cause: '요청 실패', bypassable: false }
    }
    if (res.status >= 500) {
      return {
        reason: `robots.txt HTTP ${res.status} — 서버 오류라 규칙이 있는지조차 모른다`,
        cause: `HTTP ${res.status}`,
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
      // 405 가 AWS WAF CAPTCHA 화면이면 그렇게 적는다 — "robots 가 없다"와 "사람 확인 화면이 막았다"는 다른 사건이다.
      const waf = isWafChallenge(res.status, res.body) ? ' (AWS WAF 사람 확인 화면)' : ''
      return { reason: `robots.txt HTTP ${res.status}${waf} — 규칙을 읽지 못했다`, cause: `HTTP ${res.status}${waf}`, bypassable: true }
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
        cause: `${finalOrigin} 로 리다이렉트`,
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
      return { reason: 'robots.txt 자리에 HTML 이 왔다 — 규칙을 읽지 못했다', cause: 'HTML 응답', bypassable: true }
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
  let robotsBypassed = 0
  let robotsOwnerOverride = 0
  const robotsBypassedHosts: Record<string, string> = {}
  let targetsVisited = 0
  let missingSkipped = 0

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
      robotsBypassed: 0,
      robotsBypassedHosts: {},
      perTarget,
      missingSkipped: 0,
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
      robotsBypassed: 0,
      robotsBypassedHosts: {},
      perTarget,
      missingSkipped: 0,
    }
  }

  const robots = new RobotsCache(ports, adapter.proceedWhenRobotsUnverified ?? [])
  const pacer = new Pacer(ports, source.minIntervalMs)
  const budget = source.dailyRequestCap - source.requestsToday

  let aborted = false

  // 증분형 소스(hackernews q:)는 "끝까지 읽음"이 끝이 아니다 — 커서가 null 이어도
  // active 로 두고 다음 실행이 page 0 부터 새 댓글만 읽는다(types.ts incrementalOnly).
  const endStatus: TargetProgress['status'] = adapter.incrementalOnly ? 'active' : 'exhausted'

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
    let targetPages = 0
    let outcome = '진행'
    let status: TargetProgress['status'] = 'active'
    const targetMissing: string[] = []
    let missingStreak = 0

    for (let page = 0; page < MAX_PAGES_PER_TARGET; page++) {
      if (requests >= budget) {
        outcome = '일일 상한 도달'
        break
      }

      const req = adapter.nextRequest({ ...target, cursor })
      if (!req) {
        // ⚠️ 2026-09-24 까지 여기는 `incrementalOnly` 를 보지 않고 무조건 닫았다.
        //    그래서 **게시판 순회 어댑터가 커서 큐를 nextRequest 에서 비울 수 없었다** —
        //    큐를 다 읽고 null 을 내면 그 타깃이 첫 실행 뒤 영구히 닫혔다
        //    (되살리는 코드가 없다 — store.ts listDueTargets 는 active 만 본다).
        //    그 제약 때문에 어댑터들이 "끝은 반드시 nextCursor=null 로" 라는 우회를
        //    쓰고 있었고, 그 대가로 커서에 담아 둔 마지막 글 id 가 매 실행 날아갔다.
        //
        //    이제 `endStatus` 를 쓴다. 증분형 타깃은 여기서도 살아남고, **닫는 것은
        //    연속 0건 안전장치 한 곳**이다(아래 emptyClose). 잘못된 ref 로 요청을
        //    못 만드는 타깃도 그 규칙으로 3회 뒤에 닫힌다 — 그때까지 요청은 0건이라
        //    남의 서버에는 무해하다.
        outcome = adapter.incrementalOnly
          ? '다음 요청 없음 → 증분형이라 닫지 않는다(연속 0건 안전장치가 닫는다)'
          : '다음 요청 없음'
        status = endStatus
        break
      }

      const decided = await robots.decide(req.url)
      // 소유자 예외: robots 가 **금지**라고 읽힌 경우만, DB 가 예외를 확인해 준 소스만(SourceConfig.robotsOwnerOverride).
      // 확인 불가(unverified)는 여기서 열리지 않는다 — 금지인 줄 알고 연 것과 못 읽은 것은 다른 사건이다(§7.1).
      const ownerOverride = decided.state === 'disallowed' && source.robotsOwnerOverride === true
      const verdict = ownerOverride
        ? { ...decided, state: 'allowed' as const, reason: `robots 금지(${decided.reason}) — 소유자 예외(review_sources.override)로 진행` }
        : decided
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

      // 표식으로만 통과한 요청을 따로 센다 — 요약 줄에서 "정상 허용"과 구분돼야 한다(_principles.md §2).
      if (verdict.bypassed) {
        robotsBypassed++
        robotsBypassedHosts[new URL(req.url).hostname] = verdict.unreadCause ?? '이유 미상'
      }
      if (ownerOverride) robotsOwnerOverride++
      await pacer.wait(verdict.crawlDelayMs)
      const res = await ports.fetchText(req.url, req.init)
      requests++

      // 엄격 모드(소유자 예외 요청 · abortOnChallenge 어댑터): 2xx 빈 응답·캡차도 차단으로 보고 실행을 끊는다.
      const strictBlock = (ownerOverride || adapter.abortOnChallenge === true) && isStrictBlock(res)

      // 403/429 는 두 사건이 겹쳐 있다 — 차단과 쿼터 소진.
      //
      // 공식 API 는 일일 한도를 다 쓰면 403 을 준다. 그걸 차단으로 세면
      // **정상적인 한도 소진이 "차단당했다"로 기록되고 소스가 꺼진다.**
      // 표지를 못 읽으면 차단으로 본다(안전한 쪽). 근거는 health.ts.
      // AWS WAF 사람 확인 화면(202·405)도 차단이다 — 파서로 넘기면 "파싱 실패 → 구조 변경"으로 잘못 보고된다(health.ts isWafChallenge).
      const waf = res.status !== null && isWafChallenge(res.status, res.body)
      // 어댑터가 더 정한 차단 상태(카카오 400·401 — types.ts blockStatuses). 표지 검사 없이 차단으로 센다.
      const listed = res.status !== null && (adapter.blockStatuses ?? []).includes(res.status)
      if (res.status === 403 || res.status === 429 || waf || strictBlock || listed) {
        const kind = waf || strictBlock ? 'blocked' : classifyBlockedResponse(res.body, adapter.quotaMarkers)
        if (kind === 'quota') {
          stats.quotaExhaustedResponses++
          outcome = `쿼터 소진 ${res.status} — 오늘 몫을 다 썼다. 소스는 유지한다`
        } else {
          stats.blockedResponses++
          const why = waf ? ' (AWS WAF 사람 확인 화면 — 우회하지 않는다)' : strictBlock ? ' (빈 응답·캡차 — 우회하지 않는다)' : ''
          outcome = `차단 응답 ${res.status}${why} — 실행을 중단한다`
        }
        // 어느 쪽이든 더 두드리지 않는다. 차단이면 영구 차단에 가까워지고,
        // 쿼터면 어차피 오늘은 더 못 받는다.
        status = 'active'
        aborted = true
        break
      }

      // 404 는 어댑터가 "그 글이 없다"로 받아 건너뛸 수 있으면 건너뛴다(게시판 큐의 지워진 글). 못 받으면 예전대로 failed.
      const notFound =
        res.status === 404
          ? (adapter.skipNotFound?.({ productRef: target.productRef, cursor, lastReviewAt: baselineReviewAt }) ?? null)
          : null
      if (!notFound && (res.status === null || res.status >= 400)) {
        outcome = res.status === null ? `요청 실패 — ${res.error}` : `HTTP ${res.status}`
        status = 'failed'
        break
      }

      pagesFetched++
      targetPages++
      // ⚠️ 증분 기준선은 실행 시작 시점 값(baselineReviewAt)을 넘긴다. 진행 중에
      //    갱신되는 lastReviewAt 을 넘기면 파서가 방금 읽은 글보다 오래된 것을
      //    전부 "이미 본 것"으로 걸러 한 페이지만 읽고 멈춘다(위 baselineReviewAt 주석).
      const parsed = notFound ?? adapter.parse(res.body, {
        productRef: target.productRef,
        cursor,
        lastReviewAt: baselineReviewAt,
      })
      // 이 페이지 몫을 따로 남기려고 누적 전 값을 잡아 둔다(아래 파싱 고장 브레이크의 사유 문구).
      const pageBase = stats.reviewsParsed + stats.parseFailures
      const pageFailBase = stats.parseFailures
      stats.parseFailures += parsed.parseFailures
      // 순수 누적 카운터. 종료 조건·커서·STALE 판정 어디에도 안 쓴다.
      // filtered 를 안 내는 어댑터(danawa·appstore)는 여기서 0 이 더해진다.
      stats.relevanceFiltered += parsed.filtered ?? 0

      const pageResult = await ingestPage(
        parsed.reviews,
        {
          target,
          lastReviewAt: baselineReviewAt,
          sourceKey: adapter.key,
          productScopedExternalId: adapter.productScopedExternalId === true,
        },
        opts,
        ports,
        stats,
      )

      collected += pageResult.newCount
      staleStreak = pageResult.staleFromStart ? staleStreak + pageResult.staleRun : pageResult.staleRun
      if (pageResult.newestDate && (!lastReviewAt || pageResult.newestDate > lastReviewAt)) {
        lastReviewAt = pageResult.newestDate
      }

      const pageCursor = cursor
      cursor = parsed.nextCursor

      // 삭제·없는 글 건너뜀(ParseResult.missing). 조용한 성공이 아니다 — 세고, 연속이면 멈춘다(§7.2).
      const missing = parsed.missing ?? []
      missingSkipped += missing.length
      targetMissing.push(...missing)
      missingStreak = missing.length > 0 ? missingStreak + missing.length : 0
      if (missingStreak >= MISSING_STREAK_TO_STOP) {
        // 문턱을 넘긴 마지막 글은 큐에 남긴다 — 구조 변경이었으면 고친 뒤 다시 읽는다. 커서는 루프 뒤에서 저장된다.
        cursor = pageCursor
        targetMissing.pop()
        missingSkipped--
        outcome =
          `삭제·없는 글 연속 ${missingStreak}건(기준 ${MISSING_STREAK_TO_STOP}) — 글 삭제가 아니라 사이트 구조 변경·차단 의심,` +
          ` 같은 소스의 남은 요청도 멈춘다(마지막 ${missing[missing.length - 1].slice(0, 32)} 는 큐에 남김)`
        status = 'active'
        aborted = true
        break
      }

      // ⚠️ 페이지 하나마다 즉시 저장한다. 잡이 SIGKILL 로 죽어도 다음 실행이
      //    여기서 이어간다 — 재개를 위한 별도 복구 로직이 없는 이유다.
      if (!opts.dryRun) {
        await ports.store.saveTargetProgress({
          targetId: target.id,
          cursor,
          lastReviewAt,
          consecutiveEmpty: target.consecutiveEmpty,
          status: cursor === null ? endStatus : 'active',
          collectedDelta: pageResult.newCount,
        })
      }

      // 파싱 고장 브레이크(남헌 2026-09-30, 같은 날 "매 페이지"로 확장). **페이지마다** 파싱 직후, 이번 실행
      // 누적치가 broken(파싱 성공률 < 8/10, 표본 10 이상 — health.ts judgeHealth 그대로)이면 더 요청하지 않는다.
      // 표본 10 미만이면 judgeHealth 가 판정 보류(ok)라 걸리지 않는다.
      // 비용: judgeHealth 는 카운터 정수 비교뿐인 순수 함수다 — 페이지당 네트워크·DB·LLM 호출 0건.
      // 페이지 단독이 아니라 누적치를 보는 이유: 실행 끝 판정과 같은 숫자여야 "브레이크 ⇒ broken 보고"가 어긋나지 않는다.
      // 이전엔 파서가 깨져도 daily_request_cap 까지 두드렸다. 새 기준이 아니다: 여기서 걸리면 실행 끝의
      // judgeHealth(같은 stats)도 반드시 broken 이고, 그게 review-source-health-report.mjs 로 올라간다.
      // ⚠️ 정상 종료로 쓰지 않는다(§7.2) — outcome 에 수치를 남기고 aborted 로 같은 소스의 나머지 타깃도 멈춘다.
      //    이 블록을 지우면 scripts/review-runner-selftest.mjs 의 '파싱 브레이크' 가 실패한다.
      const early = judgeHealth({ stats, consecutiveEmptyBefore: 0 })
      if (early.health === 'broken') {
        const attempted = stats.reviewsParsed + stats.parseFailures
        outcome =
          `파싱 고장으로 ${targetPages}페이지째에서 중단(이번 실행 누적 파싱 ${attempted}건 중 실패 ${stats.parseFailures}건` +
          ` · 이 페이지 ${attempted - pageBase}건 중 실패 ${stats.parseFailures - pageFailBase}건 ·기준 ${PARSE_RATE_NUM}/${PARSE_RATE_DEN}) — 같은 소스의 남은 요청도 멈춘다` +
          // 무엇이 왔는지 남긴다 — 이게 없어서 09-30 inflearn 이 차단인지 구조 변경인지 로그로 못 갈랐다.
          ` · 마지막 응답 HTTP ${res.status} · ${res.body.length}B · title=${JSON.stringify(/<title[^>]*>([^<]{0,80})/i.exec(res.body)?.[1]?.trim() ?? null)}`
        status = 'active'
        aborted = true
        break
      }

      if (cursor === null) {
        // §7.2: 상한에 걸려 끝난 것을 "정상 종료"로 읽지 않게, 몇 페이지째인지와
        // 다음 실행의 증분 기준(마지막 리뷰 시각)을 함께 남긴다.
        outcome = adapter.incrementalOnly
          ? `끝까지 읽음(${page + 1}페이지째 — API 상한이거나 문서 끝) → 증분형이라 닫지 않는다` +
            `(active 유지 · 마지막 리뷰 시각 ${lastReviewAt ?? '없음'})`
          : '끝까지 읽음'
        status = endStatus
        break
      }
      // 이번 실행 몫은 끝났지만 **커서는 버리지 않는다**(types.ts ParseResult.pauseRun).
      //
      // `nextCursor: null` 로는 이걸 표현할 수 없다 — 그건 "끝 + 커서 폐기"라
      // 다음 실행이 처음부터 다시 읽는다. 게시판 순회는 "마지막으로 본 글 id"를
      // 다음 실행까지 들고 가야 같은 글을 매일 다시 받지 않는다.
      //
      // ⚠️ status 는 active 다. 닫는 판단은 위의 연속 0건 안전장치가 한다 —
      //    여기서 닫으면 "이번 실행 분량을 다 읽었다"가 "고갈됐다"로 기록된다.
      if (parsed.pauseRun) {
        outcome = `이번 실행 몫 종료(${page + 1}페이지째 · 커서 유지 — 다음 실행이 이어간다)`
        status = 'active'
        break
      }
      if (staleStreak >= STALE_STREAK_TO_STOP) {
        outcome = `이미 본 구간 도달(연속 ${staleStreak}건)`
        status = 'active'
        break
      }
    }

    const consecutiveEmpty = collected === 0 ? target.consecutiveEmpty + 1 : 0

    // ── 증분형 타깃의 종료 조건 ────────────────────────────────────
    //
    // `incrementalOnly` 는 "끝이 없다"는 선언이라 **아무도 이 타깃을 닫지 않았다.**
    // types.ts 가 그걸 "남은 구멍"으로 적어 뒀다: `consecutive_empty` 는 세지만
    // 러너는 기록만 하고 판정에 쓰지 않았다. 그래서 새 댓글이 영원히 안 달리는
    // 글도, 글이 지워진 글도, ref 가 잘못돼 요청조차 못 하는 타깃도 매 실행
    // 그대로 남아 일일 상한을 먹었다.
    //
    // 여기서 닫는다. 문턱은 건강도 판정과 **같은 상수**를 쓴다
    // (health.ts MAX_CONSECUTIVE_EMPTY) — 두 곳이 다른 숫자를 쓰면 소스는
    // degraded 인데 타깃은 안 닫히거나 그 반대가 된다.
    //
    // ⚠️ 닫을 때 수치를 남긴다(§7.2). "닫았다"만 적으면 사람이 그게 예상된
    //    것인지 판단할 수 없다.
    //
    // 세지 않는 경우:
    //   · dry-run — `ingestPage` 가 newCount 를 올리기 전에 빠져나가므로 collected 가
    //     **구조적으로** 항상 0 이다. 세면 dry-run 3회로 멀쩡한 타깃이 닫힌다.
    //   · aborted(403/429) · failed — 신규 0건이 아니라 차단·오류다. health.ts 가
    //     차단을 연속 0건과 다른 사건으로 다루는 것과 같은 이유다.
    // 게시판(board:)은 목록을 이번 실행에 실제로 읽었으면 게시판 문턱(30)으로 센다 — 느린 태그의
    // "새 글 0건"은 고갈이 아니다(health.ts BOARD_MAX_CONSECUTIVE_EMPTY). 요청을 못 만드는
    // 잘못된 board ref(targetPages=0)는 기존 문턱 3 으로 닫힌다.
    const closeAfter =
      parseBoardRef(target.productRef) && targetPages > 0 ? BOARD_MAX_CONSECUTIVE_EMPTY : MAX_CONSECUTIVE_EMPTY
    let emptyClose: string | null = null
    if (
      adapter.incrementalOnly &&
      !opts.dryRun &&
      !aborted &&
      status === 'active' &&
      consecutiveEmpty >= closeAfter
    ) {
      status = 'exhausted'
      emptyClose = `연속 ${consecutiveEmpty}회 0건 → 닫음(${consecutiveEmpty}/${closeAfter})`
    }

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
    const missingLabel = targetMissing.length
      ? ` · 삭제·없는 글 ${targetMissing.length}건 건너뜀(${targetMissing.map((p) => p.slice(0, 32)).join(', ')})`
      : ''

    perTarget.push({
      targetId: target.id,
      productRef: target.productRef,
      outcome: (emptyClose ? `${label} · ${newLabel} · ${emptyClose}` : `${label} · ${newLabel}`) + missingLabel,
    })
  }

  const health = judgeHealth({
    stats,
    // 소스 단위 연속 0건은 "이번 실행에서 아무 타깃도 신규를 못 냈는가"로 본다.
    consecutiveEmptyBefore: 0,
  })

  // ⛔ 판정을 review_sources 에 쓰지 않는다 — 고장이어도 enabled 는 그대로다(RunnerStore 주석). 사람이 끌 때까지
  //    다음 실행이 다시 돈다. 그 사실을 사람이 알게 하는 것이 review-collect.mjs → review-source-health-report.mjs 다.

  return {
    sourceKey: adapter.key,
    skipped: false,
    stats,
    health,
    targetsVisited,
    requests,
    pagesFetched,
    robotsSkips,
    robotsBypassed,
    robotsBypassedHosts,
    robotsOwnerOverride,
    overrideValue: source.overrideValue ?? null,
    perTarget,
    missingSkipped,
  }
}

/** 한 페이지분 리뷰를 지문 대조하고 적재한다. */
async function ingestPage(
  reviews: ParsedReview[],
  ctx: {
    target: TargetState
    lastReviewAt: string | null
    sourceKey: string
    productScopedExternalId: boolean
  },
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

    const fp = computeFingerprint(
      ctx.sourceKey,
      ctx.target.productRef,
      review,
      ctx.productScopedExternalId,
    )
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

    // 2차 방어: 키는 달랐지만 **같은 소스에 같은 본문이 이미 적재돼 있다**.
    // 같은 글이 다른 타깃 경로(`url:` ↔ `board:`)로 들어와 옛 키 행을 못 만난
    // 경우가 이것이다. 키 이행이 덜 끝난 상태에서도 중복 적재를 막는다.
    //
    // ⚠️ 0건과 구분해 따로 센다(§7.1). newReviews 에도 parseFailures 에도
    //    섞지 않는다 — 셋은 서로 다른 사건이다.
    if (verdict === 'cross-target') {
      stats.crossTargetDuplicates++
      continue
    }

    if (verdict === 'duplicate' || verdict === 'revised') {
      // 수정된 리뷰도 재적재하지 않는다. 이미 분석에 반영된 의견인데
      // 수정본을 또 넣으면 같은 사람 의견이 두 번 세어진다(설계 §4.5).
      continue
    }

    const inputId = await ports.store.appendInput({
      projectId: ctx.target.projectId,
      sourceKey: ctx.sourceKey,
      // 원문 주소 머리말은 여기서만 붙인다 — 지문은 위에서 머리말 없는 본문으로 이미 계산됐다(types.ts withSourceUrl).
      text: withSourceUrl(review.text, review.sourceUrl),
      collectedAt: ports.now().toISOString(),
      rating: review.rating,
      lang: review.lang ?? null,
      sourceUrl: review.sourceUrl ?? null,
    })
    await ports.store.linkFingerprint(ctx.sourceKey, fp.identityKey, inputId)

    newCount++
    stats.newReviews++
  }

  return { newCount, staleRun, staleFromStart, newestDate }
}
