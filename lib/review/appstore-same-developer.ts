// 앱스토어 "같은 개발사 앱" 연결 고리 → 후보 생성기(lib/discovery/candidate-generator.ts) 입력. v71ad §5(e).
//
// 공식 공개 경로만 쓴다: iTunes Search API 의 lookup(https://performance-partners.apple.com/search-api).
//   ① GET https://itunes.apple.com/lookup?id=<앱ID>&country=<cc>                    → 그 앱의 artistId(개발사)·장르
//   ② GET https://itunes.apple.com/lookup?id=<artistId>&entity=software&country=<cc>&limit=200 → 그 개발사의 앱 목록
//   실측(2026-10-17, 우리 UA, 2요청): Canva(us:897446215) → artistId 897446218 → 앱 3개(Canva·Canva Create·Canva Configurator). 키·로그인 없음.
//
// robots(itunes.apple.com/robots.txt, 2026-10-17 실측 · lib/review/robots.ts 판정):
//   `/lookup?id=…`(루트, 국가는 파라미터)      → allowed("일치하는 규칙 없음")
//   `/kr/lookup?id=…`(국가 경로)               → disallowed(`Disallow: /*/lookup?`)  ← 이 꼴은 쓰지 않는다
//   `/search?…`                                → disallowed(`Disallow: /search*`)   ← 검색은 쓰지 않는다
//   ⚠️ 문자상 허용이지만 국가 경로 lookup 을 막은 취지와 가깝다 — 남헌 판단 항목으로 보고서에 올렸다. 실행 전 robots 를 다시 읽어
//      allowed 가 아니면 0요청으로 멈춘다(§7.1 — 못 읽은 규칙은 허용이 아니다).
// 하지 않는 것: 앱스토어 웹(apps.apple.com)의 'You Might Also Like'·'이 개발자의 다른 앱' 페이지 스크래핑. apps.apple.com robots 는
//   `/api/*`·`/v1/*`·`*/search?*` 를 막고 앱 페이지 자체는 열지만, Apple 웹사이트 이용 약관이 자동 수집을 막는다 — 보고만 한다.
//
// 이 파일은 DB 를 만지지 않는다. 네트워크는 호출자가 넘긴 fetchText 로만, 간격·상한·차단 중단을 여기서 건다.
// 결과는 candidate-generator 의 Candidate[] 그대로 — filterCandidates(중복·영역·소스 정책)·pickDaily 가 다음 단계다.

import type { Candidate } from '../discovery/candidate-generator.ts'
import { parseProductRef } from './adapters/appstore.ts'
import { parseRobots, robotsVerdict } from './robots.ts'
import { areaOf } from './target-supply.ts'

export const LOOKUP_HOST = 'https://itunes.apple.com'
/** Apple 안내: 분당 약 20회. 4초 간격 = 분당 15회. */
export const LOOKUP_INTERVAL_MS = 4000
/** 한 실행 요청 상한(앵커 1개 = 2요청). */
export const LOOKUP_MAX_REQUESTS = 40
/** 평점 수가 이보다 적으면 후보로 내지 않는다 — 0건 타깃(현재 앱스토어 41%)을 늘리지 않으려고. */
export const MIN_RATINGS = 20
/**
 * 기대 수확 = min(500, 평점 수 × 이 비율). RSS 는 글 리뷰 최근 500건까지 준다.
 * ponytail: 5%(평점 중 글 리뷰 비율)는 실측 전 가정값 [추정]. 기존 앱스토어 타깃의 total_collected ÷ 평점 수로 보정하라(보고서 읽기 SQL).
 */
export const WRITTEN_RATIO = 0.05
/** 앵커와 장르가 달라도 받는 장르 — 업무 도구는 개발사가 다른 장르로 내도 같은 영역일 공산이 크다. */
export const WORK_GENRES: ReadonlySet<string> = new Set(['Business', 'Productivity'])

export type Anchor = { country: string; appId: string; area: string; label: string }
export type FetchText = (url: string) => Promise<{ status: number | null; body: string }>

export const appLookupUrl = (appId: string, country: string) => `${LOOKUP_HOST}/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(country)}`
export const developerLookupUrl = (artistId: number, country: string) =>
  `${LOOKUP_HOST}/lookup?id=${artistId}&entity=software&country=${encodeURIComponent(country)}&limit=200`

/** 앱스토어 타깃 행 → 앵커(앱 id 당 하나, 영역 ①~⑤ 만). 같은 앱 여러 국가면 첫 행만 — 국가 창문은 window 갈래 몫이다. */
export function anchorsFrom(targets: Array<{ source_key: string; product_ref: string; label?: string | null }>): Anchor[] {
  const seen = new Set<string>()
  const out: Anchor[] = []
  for (const t of targets) {
    if (t.source_key !== 'appstore') continue
    const ref = parseProductRef(t.product_ref)
    const area = areaOf(t.label)
    if (!ref || !/^[1-5]$/.test(area) || seen.has(ref.appId)) continue
    seen.add(ref.appId)
    out.push({ ...ref, area, label: String(t.label ?? '') })
  }
  return out
}

type LookupItem = { wrapperType?: unknown; kind?: unknown; trackId?: unknown; artistId?: unknown; trackName?: unknown; primaryGenreName?: unknown; userRatingCount?: unknown }

/** lookup 응답 → results 배열. JSON 이 아니거나 results 가 없으면 null(= 실패, 0건 아님 — §7.1). */
export function parseLookup(body: string): LookupItem[] | null {
  try {
    const j = JSON.parse(body) as { results?: unknown }
    return Array.isArray(j?.results) ? (j.results as LookupItem[]) : null
  } catch {
    return null
  }
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app'

/** 개발사 앱 목록 → 후보. 앵커 자신·다른 장르(업무 장르 제외)·평점 MIN_RATINGS 미만은 뺀다. */
export function candidatesFrom(anchor: Anchor, anchorGenre: string | null, items: LookupItem[]): { candidates: Candidate[]; skipped: Record<string, number> } {
  const candidates: Candidate[] = []
  const skipped: Record<string, number> = {}
  const skip = (k: string) => (skipped[k] = (skipped[k] ?? 0) + 1)
  for (const it of items) {
    if (it.wrapperType !== 'software') continue // artist 행
    const id = typeof it.trackId === 'number' && Number.isSafeInteger(it.trackId) ? String(it.trackId) : null
    const name = typeof it.trackName === 'string' ? it.trackName.trim() : ''
    if (!id || !name) { skip('malformed'); continue }
    if (id === anchor.appId) continue
    const genre = typeof it.primaryGenreName === 'string' ? it.primaryGenreName : ''
    if (genre !== anchorGenre && !WORK_GENRES.has(genre)) { skip('genre'); continue }
    const ratings = typeof it.userRatingCount === 'number' ? it.userRatingCount : 0
    if (ratings < MIN_RATINGS) { skip('low_ratings'); continue }
    candidates.push({
      generator: 'similar_app',
      source_key: 'appstore',
      product_ref: `${anchor.country}:${id}`,
      label: `${anchor.area}:${anchor.country}|${slug(name)}`,
      expected_yield: Math.min(500, Math.floor(ratings * WRITTEN_RATIO)),
      evidence: `same_developer of ${anchor.country}:${anchor.appId} · ${genre} · ratings=${ratings} [추정 ×${WRITTEN_RATIO}]`,
    })
  }
  return { candidates, skipped }
}

export type SameDeveloperRun = { candidates: Candidate[]; requests: number; stopped: string | null; skipped: Record<string, number> }

/**
 * 앵커들 → 같은 개발사 후보. robots 를 먼저 읽고 루트 lookup 이 allowed 가 아니면 0요청.
 * 403·429·5xx·null(네트워크)·JSON 아님 → 즉시 중단(stopped 에 사유, 우회·재시도 없음). 요청 상한 maxRequests.
 */
export async function collectSameDeveloper(
  anchors: Anchor[],
  io: { fetchText: FetchText; sleep: (ms: number) => Promise<void>; productToken: string },
  opts: { maxRequests?: number; intervalMs?: number } = {},
): Promise<SameDeveloperRun> {
  const max = opts.maxRequests ?? LOOKUP_MAX_REQUESTS
  const gap = opts.intervalMs ?? LOOKUP_INTERVAL_MS
  const out: SameDeveloperRun = { candidates: [], requests: 0, stopped: null, skipped: {} }
  const rb = await io.fetchText(`${LOOKUP_HOST}/robots.txt`)
  if (rb.status !== 200) return { ...out, stopped: `robots 확인 불가(HTTP ${rb.status ?? 'null'}) — 0요청` }
  const v = robotsVerdict(parseRobots(rb.body), '/lookup?id=1&country=us', io.productToken)
  if (v.state !== 'allowed') return { ...out, stopped: `robots ${v.state} — ${v.reason} — 0요청` }

  const get = async (url: string): Promise<LookupItem[] | null> => {
    if (out.requests > 0) await io.sleep(gap)
    out.requests++
    const r = await io.fetchText(url)
    if (r.status !== 200) {
      out.stopped = `HTTP ${r.status ?? 'null'} — 중단(우회 없음)`
      return null
    }
    const items = parseLookup(r.body)
    if (!items) out.stopped = '응답이 lookup JSON 이 아니다 — 중단(§7.1)'
    return items
  }
  for (const a of anchors) {
    if (out.requests + 2 > max) break
    const app = await get(appLookupUrl(a.appId, a.country))
    if (!app) break
    const me = app.find((x) => x.wrapperType === 'software')
    const artistId = typeof me?.artistId === 'number' ? me.artistId : null
    if (artistId === null) { out.skipped.no_artist = (out.skipped.no_artist ?? 0) + 1; continue }
    const dev = await get(developerLookupUrl(artistId, a.country))
    if (!dev) break
    const r = candidatesFrom(a, typeof me?.primaryGenreName === 'string' ? me.primaryGenreName : null, dev)
    out.candidates.push(...r.candidates)
    for (const [k, n] of Object.entries(r.skipped)) out.skipped[k] = (out.skipped[k] ?? 0) + n
  }
  return out
}
