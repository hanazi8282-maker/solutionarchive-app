#!/usr/bin/env node
// [v71cu S7 v2] 제품 발굴 복구 — 언급(mention) 통로 + 스토어 순위(chart) 통로. (검색 통로는 product-discover.mjs 그대로.)
//   mention: 최근 수집 글(analysis_inputs) → extractMentions(전환·대안 문맥 이름) → 일반어 거름 → 서로 다른 글 ≥3 → iTunes 검색으로 시험
//            (이름 머리 일치 · 평가 50+ · 미등록) → 통과하면 discovery_candidates(origin='mention', accepted) + 임시 타깃(kr·us).
//   chart  : 주 1회(월, UTC) 공개 차트 피드(rss.marketingtools.apple.com) kr·us·jp 상위 → 응답 안 하면 건너뛰고 보고 → lookup 으로 장르(Business/Productivity/Finance)·평가 50+
//            → 분야 판정 → 일반어 거름 → origin='chart' 로 같은 등록.
// 한도: 하루 새 임시 타깃 30(분야당 10, 검색 통로와 합산), 검색 요청 100(검색 통로와 별개로 이 스크립트는 40). 403·429 즉시 중단. 시험 실패 80%↑(10건 이상) 이면 그날 중단.
// 기존 mention unverified 행은 건드리지 않는다(INSERT 만). 후보→타깃 연결 수는 discovery_run_log 에 남긴다(테이블 없으면 로그만 — 마이그 20261120000001).
// 사용: node --env-file=.env.local scripts/product-discover-v2.mjs [--mode=mention|chart|all] [--dry] [--force-chart]
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import { extractMentions } from '../lib/discovery/mention-loop.ts'
import { collect as collectChart } from './appstore-chart-dictionary.mjs'
import { lookupBatches } from './new-product-candidates.mjs'
import { normKey } from './product-name-candidates.mjs'
import { USER_AGENT } from '../lib/review/runner.ts'
import { DAILY_MAX, PER_AREA, aggregateMentions, capPerArea, matchStoreApp, pickChart, registerCandidate, shouldStop, slugOf } from '../lib/discovery/product-discover-shared.mjs'

const GAP = 3500, MENTION_REQ_MAX = 40, POST_DAYS = 14, POST_MAX = 3000

/** mention 시험: 후보마다 iTunes search 1회(한글이면 kr, 아니면 us). 차단이면 stopped. fetchFn·sleep 주입 가능(셀프테스트). */
export async function probeMentions(cands, { fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxReq = MENTION_REQ_MAX, log = () => {} } = {}) {
  const accepted = []
  let probed = 0, failed = 0, req = 0, stopped = null
  for (const c of cands) {
    if (req >= maxReq) { stopped = `요청 상한 ${maxReq}`; break }
    if (shouldStop(probed, failed)) { stopped = `시험 실패 ${failed}/${probed} ≥ 80% — 그날 중단`; break }
    const cc = /[가-힣]/.test(c.surface) ? 'kr' : 'us'
    req++
    const r = await fetchFn(`https://itunes.apple.com/search?term=${encodeURIComponent(c.surface)}&country=${cc}&entity=software&limit=5`, { headers: { accept: 'application/json', 'user-agent': USER_AGENT } }).catch(() => null)
    if (!r) { failed++; probed++; continue }
    if (r.status === 429 || r.status === 403) { stopped = `HTTP ${r.status} — 즉시 중단(우회 없음)`; break }
    probed++
    let j = null
    try { j = r.ok ? await r.json() : null } catch { /* 못 읽음 = 시험 실패(통과 아님) */ }
    const app = matchStoreApp(c.key, j?.results)
    const slug = app && slugOf(app.trackName, app.description)
    if (!app || !slug) { failed++; log(`탈락 ${c.surface} ${app ? '(분야 밖)' : '(스토어에 같은 이름 앱 없음/평가 부족)'}`) } else accepted.push({ slug, cc, id: String(app.trackId), name: app.trackName, url: app.sellerUrl ?? app.trackViewUrl, ratings: app.userRatingCount, cand: c })
    await sleep(GAP)
  }
  return { accepted, probed, failed, requests: req, stopped }
}

async function pages(q, max) {
  const out = []
  for (let from = 0; out.length < max; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const mode = arg('mode') ?? 'all', DRY = process.argv.includes('--dry')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const today = new Date().toISOString().slice(0, 10)
  const BATCH = `prov_${today.replace(/-/g, '')}`
  const { count: usedToday } = await sb.from('discovery_candidates').select('id', { count: 'exact', head: true }).gte('created_at', today).in('origin', ['search', 'mention', 'chart'])
  let remaining = DAILY_MAX - (usedToday ?? 0)
  console.log(`오늘 이미 ${usedToday ?? 0}건 · 남은 한도 ${remaining}`)

  const known = new Set()
  const knownNames = new Set()
  for (const r of await pages(() => sb.from('review_targets').select('product_ref').eq('source_key', 'appstore'), 50000)) known.add(String(r.product_ref).split(':')[1])
  for (const r of await pages(() => sb.from('discovery_candidates').select('name, probe_ref, probe_source_key'), 50000)) { knownNames.add(normKey(r.name)); if (r.probe_source_key === 'appstore') known.add(String(r.probe_ref).split(':')[1]) }

  const log = { mention: null, chart: null }
  const finish = async (channel, o) => {
    console.log(channel, JSON.stringify(o))
    log[channel] = o
    if (DRY) return
    const { error } = await sb.from('discovery_run_log').insert({ channel, candidates: o.candidates, linked: o.linked, rejected_generic: o.rejectedGeneric ?? 0, requests: o.requests ?? 0, stopped: o.stopped ?? null, detail: o.detail ?? null })
    if (error) console.log('discovery_run_log 기록 실패(마이그 20261120000001 미적용?):', error.message)
  }

  if ((mode === 'mention' || mode === 'all') && remaining > 0) {
    const since = new Date(Date.now() - POST_DAYS * 86400e3).toISOString()
    const posts = await pages(() => sb.from('analysis_inputs').select('id, raw_text').is('purged_at', null).gte('created_at', since).order('created_at', { ascending: false }), POST_MAX)
    const { cands, rejectedGeneric } = aggregateMentions(posts, extractMentions)
    const fresh = cands.filter((c) => !knownNames.has(c.key))
    console.log(`[mention] 글 ${posts.length} · 후보 ${cands.length} · 일반어 제외 ${rejectedGeneric} · 신규 ${fresh.length}`)
    const pr = await probeMentions(fresh, { log: console.log })
    const picked = capPerArea(pr.accepted.filter((a) => !known.has(a.id)), PER_AREA, remaining)
    let linked = 0
    if (!DRY) for (const m of picked) if (await registerCandidate(sb, m, { origin: 'mention', batch: BATCH, why: `언급 루프: 글 ${m.cand.ids.length}건 · 표면 ${m.cand.surfaces.slice(0, 3).join('/')} · 앱스토어 ${m.cc} 평가 ${m.ratings}`, extra: { post_count: m.cand.ids.length, evidence_input_ids: m.cand.ids.slice(0, 20), mention_count: m.cand.ids.length } })) { linked++; known.add(m.id) }
    remaining -= DRY ? 0 : linked
    await finish('mention', { candidates: pr.accepted.length, linked, rejectedGeneric, requests: pr.requests, stopped: pr.stopped, detail: { posts: posts.length, probed: pr.probed, failed: pr.failed, picked: picked.length } })
  }

  if ((mode === 'chart' || mode === 'all') && remaining > 0) {
    if (mode === 'all' && new Date().getUTCDay() !== 1 && !process.argv.includes('--force-chart')) console.log('[chart] 주 1회(월) — 오늘은 건너뜀')
    else {
      const { entries, skipped, stopped } = await collectChart({ limit: 100, countries: ['kr', 'us', 'jp'], log: console.log })
      const uniq = [...new Map(entries.filter((e) => !known.has(e.id)).map((e) => [`${e.country}:${e.id}`, e])).values()]
      let o = { candidates: 0, linked: 0, requests: 0, stopped: stopped ?? null, detail: { feeds_skipped: skipped, entries: entries.length } }
      if (!entries.length) o.stopped = o.stopped ?? '차트 피드 무응답 — 건너뜀(보고)'
      else if (!stopped) {
        const lk = await lookupBatches(uniq, { log: () => {} })
        o.requests = lk.requests; o.stopped = lk.stopped
        const { cands, rejectedGeneric, outOfArea } = pickChart(uniq, lk.out, known)
        const picked = capPerArea(cands, PER_AREA, remaining)
        let linked = 0
        if (!DRY) for (const m of picked) if (await registerCandidate(sb, m, { origin: 'chart', batch: BATCH, why: `스토어 순위(${m.cc}) 상위 · 평가 ${m.ratings}` })) linked++
        o = { ...o, candidates: cands.length, linked, rejectedGeneric, detail: { ...o.detail, outOfArea, picked: picked.length } }
      }
      await finish('chart', o)
    }
  }
  console.log(DRY ? 'dry — DB 쓰기 없음' : '완료')
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
