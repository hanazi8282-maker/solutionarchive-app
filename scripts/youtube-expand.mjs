#!/usr/bin/env node
// [v71cu S8-2] 유튜브 q:·ch: 타깃 확장 — 검색어/채널 → 새 영상(댓글 30+) → v: 타깃 등록. 댓글 수집은 기존 러너가 v: 로 한다.
// 플래그: YT_EXPAND_ON=1 이 아니면 아무것도 하지 않는다(기본 OFF). --dry 는 DB 쓰기·쿼터 기록 없이 호출 계획만 출력한다(API 는 부른다).
// 쿼터: YT_SEARCH_DAILY(60) · YT_UNITS_DAILY(2000) − YT_COMMENT_RESERVE(200). 호출 직전 api_quota_log 예약, 초과 시 중단.
// 사용: node --env-file=.env.local scripts/youtube-expand.mjs [--dry] [--max-q N] [--max-ch N] [--max-new N]
import { createClient } from '@supabase/supabase-js'
import { expand, makeQuota, COMMENT_RESERVE_DEFAULT, SEARCH_CAP_DEFAULT, UNITS_CAP_DEFAULT } from '../lib/review/youtube-expand.ts'

if (process.env.YT_EXPAND_ON !== '1') { console.log('YT_EXPAND_ON != 1 — 꺼져 있음(기본 OFF). 종료'); process.exit(0) }
const DRY = process.argv.includes('--dry')
const arg = (n, d) => Number(process.argv[process.argv.indexOf(n) + 1]) || d
const KEY = process.env.YOUTUBE_API_KEY
if (!KEY) { console.error('YOUTUBE_API_KEY 없음 — needs_key'); process.exit(3) }
const num = (v, d) => (v && Number.isFinite(Number(v)) ? Number(v) : d)
const SEARCH_CAP = num(process.env.YT_SEARCH_DAILY, SEARCH_CAP_DEFAULT)
const OTHER_CAP = Math.max(0, num(process.env.YT_UNITS_DAILY, UNITS_CAP_DEFAULT) - num(process.env.YT_COMMENT_RESERVE, COMMENT_RESERVE_DEFAULT))
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const today = new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 10) // 구글 할당량은 태평양 자정 초기화(youtube-discover 와 같은 식)
const BATCH = `yt_${today.replace(/-/g, '')}`

const store = {
  async get(bucket) { const { data, error } = await sb.from('api_quota_log').select('used').eq('date', today).eq('api', 'youtube').eq('bucket', bucket).maybeSingle(); if (error) throw new Error(`api_quota_log 읽기 실패 — 중단: ${error.message}`); return data?.used ?? 0 },
  async set(bucket, used, limit) { const { error } = await sb.from('api_quota_log').upsert({ date: today, api: 'youtube', bucket, used, limit }, { onConflict: 'date,api,bucket' }); if (error) throw new Error(`api_quota_log 쓰기 실패 — 중단: ${error.message}`) },
}
// DRY: 읽기만, 쓰기 없음(예약은 메모리에서만 올린다).
const mem = { search: 0, other: 0 }
const dryStore = { async get(b) { return (await store.get(b)) + mem[b] }, async set(b) { mem[b]++ } }
const quota = makeQuota(DRY ? dryStore : store, { search: SEARCH_CAP, other: OTHER_CAP })

const load = async (layer, limit) => (await sb.from('review_targets').select('id,project_id,product_ref,label').eq('source_key', 'youtube').eq('status', 'active').eq('layer', layer).order('last_run_at', { ascending: true, nullsFirst: true }).limit(limit)).data ?? []
const rows = [...(await load('yt_query', arg('--max-q', 12))), ...(await load('yt_channel', arg('--max-ch', 6)))]
const targets = rows.map((t) => ({ id: t.id, projectId: t.project_id, productRef: t.product_ref, label: t.label }))
console.log(`오늘(${today}) 대상 q:/ch: ${targets.length}개 · 한도 search ${SEARCH_CAP} · other ${OTHER_CAP}${DRY ? ' · DRY' : ''}`)

const res = await expand(targets, {
  quota,
  maxNewVideos: arg('--max-new', 40),
  log: (s) => console.log(s),
  fetchJson: async (url) => { const r = await fetch(`${url}&key=${KEY}`); let json = null; try { json = await r.json() } catch {} return { status: r.status, json } },
  existing: async (refs) => new Set(((await sb.from('review_targets').select('product_ref').eq('source_key', 'youtube').in('product_ref', refs)).data ?? []).map((x) => x.product_ref)),
  register: async (v) => {
    if (DRY) { console.log('후보', `v:${v.videoId}`); return true }
    const { error } = await sb.from('review_targets').insert({ project_id: v.projectId, source_key: 'youtube', product_ref: `v:${v.videoId}`, label: v.label, status: 'active', onboard_batch: BATCH, layer: 'video' })
    if (error) { console.log('v: 등록 실패', error.message); return false }
    return true
  },
})
if (!DRY && res.touched.length) await sb.from('review_targets').update({ last_run_at: new Date().toISOString() }).in('id', res.touched)
console.log(`호출 search ${res.calls.search} · other ${res.calls.other} · 등록 v: ${res.registered} · 중복 ${res.skippedDup} · 댓글<30·꺼짐 ${res.skippedFewComments} · 중단: ${res.stopped ?? '없음'}`)
if (res.stopped && /HTTP/.test(res.stopped)) process.exitCode = 2
