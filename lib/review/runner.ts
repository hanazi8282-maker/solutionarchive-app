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

import { parseRobots, robotsVerdict, type RobotsGroup } from './robots.ts'
import { computeFingerprint } from './fingerprint.ts'
import { judgeHealth, type HealthVerdict, type RunStats } from './health.ts'
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
  | { status: number; body: string }
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
  newReviews: 0,
  fallbackKeys: 0,
  blockedResponses: 0,
})

/** 호스트별 robots 캐시. 한 실행 안에서 같은 호스트를 두 번 묻지 않는다. */
class RobotsCache {
  private readonly groups = new Map<string, RobotsGroup[] | 'unreadable'>()
  private readonly ports: RunnerPorts

  // ⚠️ 파라미터 프로퍼티(constructor(private x))를 쓰지 않는다. Node 의
  //    타입 스트리핑은 코드를 생성하는 TS 문법을 지원하지 않아서
  //    ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX 로 죽는다. 이 트리는 Next 빌드가
  //    아니라 Node 스크립트가 직접 로드한다.
  constructor(ports: RunnerPorts) {
    this.ports = ports
  }

  async allows(url: string): Promise<{ allowed: boolean; reason: string }> {
    const u = new URL(url)
    const origin = u.origin

    if (!this.groups.has(origin)) {
      const res = await this.ports.fetchText(`${origin}/robots.txt`)
      if (res.status === null || res.status >= 500) {
        // ⚠️ 읽지 못한 것을 "허용"으로 다루지 않는다. RFC 9309 는 5xx 를
        //    전부 금지로 보라고 하고, 네트워크 오류도 같게 다룬다. 상대
        //    서버가 잠깐 흔들린 틈에 금지 경로를 긁는 걸 막는다.
        this.groups.set(origin, 'unreadable')
      } else if (res.status === 200) {
        this.groups.set(origin, parseRobots(res.body))
      } else {
        // 404 등 4xx = 규칙 없음 = 허용(RFC 9309). 403 은 그 자체가 차단
        // 신호지만, 그 판단은 실제 요청 결과가 내린다.
        this.groups.set(origin, [])
      }
    }

    const cached = this.groups.get(origin)!
    if (cached === 'unreadable') {
      return { allowed: false, reason: 'robots.txt 를 읽지 못해 요청하지 않음' }
    }
    return robotsVerdict(cached, u.pathname, PRODUCT_TOKEN)
  }
}

/** 마지막 요청 이후 min_interval 이 지나지 않았으면 그만큼 잔다. */
class Pacer {
  private last = 0
  private readonly ports: RunnerPorts
  private readonly intervalMs: number

  constructor(ports: RunnerPorts, intervalMs: number) {
    this.ports = ports
    this.intervalMs = intervalMs
  }

  async wait(): Promise<void> {
    const now = this.ports.now().getTime()
    const gap = now - this.last
    if (this.last > 0 && gap < this.intervalMs) {
      await this.ports.sleep(this.intervalMs - gap)
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

  const robots = new RobotsCache(ports)
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

      const verdict = await robots.allows(req.url)
      if (!verdict.allowed) {
        // ⛔ 요청 자체를 보내지 않는다. "차단됐다"가 아니라 "규칙상 안 간다"다.
        robotsSkips++
        outcome = `robots 금지 — ${verdict.reason}`
        status = 'exhausted'
        break
      }

      await pacer.wait()
      const res = await ports.fetchText(req.url)
      requests++

      // 차단은 재시도하지 않는다. 두드릴수록 영구 차단에 가까워진다.
      if (res.status === 403 || res.status === 429) {
        stats.blockedResponses++
        outcome = `차단 응답 ${res.status} — 실행을 중단한다`
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

      const pageResult = await ingestPage(
        parsed.reviews,
        { target, lastReviewAt, sourceKey: adapter.key },
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

    perTarget.push({
      targetId: target.id,
      productRef: target.productRef,
      outcome: `${outcome} · 신규 ${collected}건`,
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
