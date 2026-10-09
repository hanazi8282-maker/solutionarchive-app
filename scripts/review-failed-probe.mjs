#!/usr/bin/env node
// 일회용 — failed 타깃(fmkorea 5 · devto 1)에 요청을 **한 번만** 보내 HTTP 응답 코드를 로그로 남긴다(CEO-staff v44 §5·§6 항목 4).
//
// ⛔ 초안이다. 사람·역할 세션(오케스트레이터)이 돌린다. 무인 루프·서브에이전트에 배선하지 않는다.
//
// 지키는 것:
//   - robots: 러너와 같은 RobotsCache(lib/review/runner.ts) 판정. allowed 가 아니면 요청하지 않는다(확인 불가 = 안 감, §7.1).
//     Crawl-delay·min_interval_ms 중 큰 값만큼 요청 사이를 띄운다.
//   - UA: 러너와 같은 USER_AGENT 고정. 위장·우회 헤더 없음. 리다이렉트는 따라가되 최종 URL 을 로그에 남긴다.
//   - 소스가 enabled=false 면 요청하지 않는다(source_disabled) — 꺼 둔 소스를 이 스크립트가 몰래 두드리지 않는다.
//   - 403·429 = 그 소스의 남은 타깃도 요청하지 않는다(같은 호스트를 더 두드리지 않음). 판정 'blocked_confirmed'.
//
// "되살린다"를 status 를 active 로 바꾸는 것으로 구현하지 않았다:
//   active 로 올리면 그 사이 야간 수집(nightly-review-collect)이 같은 타깃을 집어 가서 여러 번 두드릴 수 있다.
//   그래서 status 는 **처음부터 끝까지 failed 그대로**다(= 403/429 면 "다시 failed 로 닫는다"와 같은 결과, 그 사이 열린 순간이 없다).
//   이 스크립트는 DB 에 쓰지 않는다. 결과가 200 + 내용 표지면 사람이 status 를 active 로 바꿀지 판단한다.
//
// 사용(DB 읽기에 SUPABASE_SERVICE_ROLE_KEY 필요 — 오케스트레이터만):
//   node --env-file=.env.local scripts/review-failed-probe.mjs                 # 대상만 출력, 요청 0
//   node --env-file=.env.local scripts/review-failed-probe.mjs --run           # 요청 보냄(타깃당 1회)
//   node scripts/review-failed-probe.mjs --selftest                            # 판정 함수 자체 점검(네트워크·DB 없음)
// 로그: 표준출력 JSON 한 줄씩(타깃별). 남기려면 `> ops/state/failed-probe-YYYY-MM-DD.jsonl`.

import { pathToFileURL } from 'node:url'
import { RobotsCache, USER_AGENT } from '../lib/review/runner.ts'
import { fmkoreaAdapter } from '../lib/review/adapters/fmkorea.ts'
import { devtoAdapter } from '../lib/review/adapters/devto.ts'

/** 소스 → [어댑터, 이번 실행 최대 타깃 수]. 위임 범위(fmkorea 5 · devto 1) 밖으로 넓히지 않는다. */
export const PLAN = { fmkorea: [fmkoreaAdapter, 5], devto: [devtoAdapter, 1] }

/**
 * 응답 → 판정. 상태 코드만으로 "살아났다"고 하지 않는다(§7.1) — 200 은 marker 가 있어야 alive_candidate.
 *   blocked_confirmed — 403·429 · not_found — 404·410 · server_error — 5xx · network_error — 응답 없음
 *   alive_candidate — 2xx ∧ 파서가 리뷰 1건 이상 · empty_2xx — 2xx 인데 파싱 0건(로그인 벽·구조 변경 의심) · other_<code>
 */
export function classify(status, parsedCount) {
  if (status === null) return 'network_error'
  if (status === 403 || status === 429) return 'blocked_confirmed'
  if (status === 404 || status === 410) return 'not_found'
  if (status >= 500) return 'server_error'
  if (status >= 200 && status < 300) return parsedCount > 0 ? 'alive_candidate' : 'empty_2xx'
  return `other_${status}`
}

async function fetchText(url, init) {
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      body: init?.body,
      headers: { Accept: '*/*', ...(init?.headers ?? {}), 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    return { status: res.status, body: await res.text(), finalUrl: res.url }
  } catch (e) {
    return { status: null, body: '', error: e instanceof Error ? e.message : String(e) }
  }
}

const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }))

async function main(argv) {
  const run = argv.includes('--run')
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  for (const [key, [adapter, max]] of Object.entries(PLAN)) {
    const { data: src, error: se } = await sb.from('review_sources').select('key, enabled, min_interval_ms').eq('key', key).maybeSingle()
    if (se) throw new Error(`review_sources(${key}) 조회 실패: ${se.message}`)
    if (!src) { log({ source: key, verdict: 'source_missing' }); continue }
    if (src.enabled !== true) { log({ source: key, verdict: 'source_disabled', note: '꺼진 소스라 요청하지 않음' }); continue }

    const { data: targets, error: te } = await sb
      .from('review_targets')
      .select('id, project_id, source_key, product_ref, cursor, last_review_at, last_run_at')
      .eq('source_key', key)
      .eq('status', 'failed')
      .order('last_run_at', { ascending: false, nullsFirst: false })
      .limit(max)
    if (te) throw new Error(`review_targets(${key}) 조회 실패: ${te.message}`)

    const robots = new RobotsCache({ fetchText }, adapter.proceedWhenRobotsUnverified ?? [])
    let lastAt = 0
    for (const t of targets ?? []) {
      const base = { source: key, target_id: t.id, product_ref: t.product_ref, status_in_db: 'failed' }
      const req = adapter.nextRequest({
        id: t.id, projectId: t.project_id, sourceKey: key, productRef: t.product_ref,
        cursor: t.cursor, lastReviewAt: t.last_review_at, consecutiveEmpty: 0,
      })
      if (!req) { log({ ...base, verdict: 'no_request', note: '어댑터가 요청을 만들지 못함(ref 형식)' }); continue }
      const r = await robots.decide(req.url)
      if (r.state !== 'allowed' || r.bypassed) {
        log({ ...base, url: req.url, verdict: `robots_${r.bypassed ? 'unverified' : r.state}`, reason: r.reason })
        continue
      }
      if (!run) { log({ ...base, url: req.url, verdict: 'dry_run', robots: r.reason }); continue }

      const gap = Math.max(src.min_interval_ms ?? 0, r.crawlDelayMs) - (Date.now() - lastAt)
      if (gap > 0) await new Promise((ok) => setTimeout(ok, gap))
      const res = await fetchText(req.url, req.init)
      lastAt = Date.now()
      let parsed = 0
      if (res.status !== null && res.status >= 200 && res.status < 300) {
        try { parsed = adapter.parse(res.body, { productRef: t.product_ref, cursor: t.cursor, lastReviewAt: null }).reviews.length } catch { parsed = 0 }
      }
      const verdict = classify(res.status, parsed)
      log({ ...base, url: req.url, final_url: res.finalUrl ?? null, http: res.status, bytes: res.body.length, parsed, verdict, error: res.error ?? null })
      if (verdict === 'blocked_confirmed') {
        log({ source: key, verdict: 'blocked_confirmed', note: '403/429 — 이 소스의 남은 타깃은 요청하지 않는다. status 는 failed 그대로' })
        break
      }
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.includes('--selftest')) {
    const cases = [[403, 0, 'blocked_confirmed'], [429, 3, 'blocked_confirmed'], [404, 0, 'not_found'], [503, 0, 'server_error'],
      [null, 0, 'network_error'], [200, 2, 'alive_candidate'], [200, 0, 'empty_2xx'], [301, 0, 'other_301']]
    let bad = 0
    for (const [s, n, want] of cases) if (classify(s, n) !== want) { bad++; console.error(`❌ classify(${s}, ${n}) = ${classify(s, n)} ≠ ${want}`) }
    console.log(bad ? `review-failed-probe selftest: ${bad} failed` : `review-failed-probe selftest: ${cases.length} passed`)
    process.exit(bad ? 1 : 0)
  }
  main(process.argv.slice(2)).catch((e) => { console.error(`❌ ${e.message}`); process.exit(1) })
}
