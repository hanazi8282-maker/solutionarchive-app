#!/usr/bin/env node
// [v71cu S9] 새 커뮤니티 후보 매일 발굴 — 엔진 지문(Discourse·XenForo·phpBB·그누보드·XE/라이믹스·inSided/Khoros)으로 새 도메인을 찾아 source_candidates 에 추가 전용으로 적는다.
// ⛔ 켜지 않는다: review_sources·review_targets 에 쓰지 않는다(onboarded_source_key·onboard_batch 는 NULL). 켜기는 세션이 마이그로(CLAUDE.md §10.1 새 소스 갈래·§10.2).
// 씨앗: 등록 제품(analysis_projects.competitor_url)의 도메인 × 접두 추측(community./forum./discuss./forums.) + --hosts=a.com,b.com 수동 씨앗. 이미 시험한 도메인(source_probe_log·source_candidates)은 건너뛴다.
// 안전: 하루 새 도메인 10곳(COMMUNITY_PROBE_DAILY_MAX), 도메인당 요청 ≤5(robots·첫 화면·latest.json·약관), 호스트당 4초 간격, 로그인·검색·글 본문 요청 0.
//       403·빈 응답·챌린지 → 그 호스트 즉시 중단(blocked 로 적음), 429 → 실행 전체 즉시 중단. 우회 없음. robots 못 읽음 = 허용 아님(unverified, §7.1).
// 라벨(legal_label, 필수): forbids_automation(robots 금지 또는 약관 자동수집 금지 문구) · unverified(robots/약관 확인 불가) · allowed(robots 허용 ∧ 약관 금지 문구 없음).
// 사용: node --env-file=.env.local scripts/source-discover.mjs [--dry] [--hosts=a.com,b.com] [--max=10]
import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import { makeFetcher, tosVerdict } from './community-discovery.mjs'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN } from '../lib/review/runner.ts'

export const DAILY_MAX_HOSTS = Number(process.env.COMMUNITY_PROBE_DAILY_MAX ?? 10), MAX_REQ_PER_HOST = 5, GAP_MS = 4000
export const PREFIXES = ['community', 'forum', 'discuss', 'forums']
const SECOND_LEVEL = /^(co|or|ne|go|ac|com|org|net)$/

/** 엔진 지문. html(첫 화면)·host 로 판정. 없으면 null. */
export function fingerprint(html, host = '') {
  const h = String(html ?? '')
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']Discourse/i.test(h) || /data-discourse-setup|discourse-?\w*-?(?:setup|preloaded)/i.test(h)) return 'discourse'
  if (/<html[^>]*\bid=["']XF["']/i.test(h)) return 'xenforo'
  if (/phpBB|viewforum\.php\?f=/i.test(h)) return 'phpbb'
  if (/\/bbs\/board\.php\?bo_table=/i.test(h)) return 'gnuboard'
  if (/Rhymix|XpressEngine|[?&]mid=\w+/i.test(h)) return 'xe'
  if (/insided\.com|\binSided\b|khoros|lithium\.com|\/t5\/[\w-]+\/bd-p\//i.test(h) || /\.insided\.com$/i.test(host)) return /khoros|lithium|\/t5\//i.test(h) ? 'khoros' : 'insided'
  return null
}

/** robots 본문 → AI 수집 거부 신호 문자열(없으면 null). */
export function aiSignal(robotsText) {
  const t = String(robotsText ?? '')
  const names = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'CCBot', 'Google-Extended', 'PerplexityBot']
  const blocked = names.filter((n) => new RegExp(`user-agent:\\s*${n}\\s*[\\r\\n]+(?:[^\\r\\n]*[\\r\\n]+)*?\\s*disallow:\\s*/\\s*(?:[\\r\\n]|$)`, 'i').test(t))
  const out = []
  if (blocked.length) out.push(`AI 봇 이름 차단(${blocked.join('·')})`)
  if (/content-signal\s*:/i.test(t)) out.push('Content-Signal 있음')
  return out.length ? out.join(' / ') : null
}

/** 라벨: robots 금지·약관 금지 → forbids_automation · 확인 불가 하나라도 → unverified · 둘 다 깨끗 → allowed. */
export function legalLabel({ robots, tos }) {
  if (robots === 'disallowed' || tos === 'forbids_automation') return 'forbids_automation'
  if (robots === 'allowed' && tos === 'no_ban_found') return 'allowed'
  return 'unverified'
}

/** 약관 본문에서 자동수집 관련 문장 발췌(≤400자). 없으면 null. */
export function tosExcerpt(text) {
  const s = String(text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const m = /[^.。]{0,160}(automate access|web crawler|crawl(?:s|ing|er)?\b|scrap(?:e|es|ing)\b|spider|\bbots?\b)[^.。]{0,200}/i.exec(s)
  return m ? m[0].trim().slice(0, 400) : null
}

/** 홈페이지 주소 → 등록 도메인(co.kr 류 처리). 못 풀면 null. */
export function rootDomain(url) {
  try {
    const parts = new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '').split('.')
    if (parts.length < 2) return null
    return (parts.length >= 3 && SECOND_LEVEL.test(parts[parts.length - 2]) ? parts.slice(-3) : parts.slice(-2)).join('.')
  } catch { return null }
}

/** 제품 홈페이지들 + 수동 씨앗 → 시험할 호스트 목록(접두 순서대로, 이미 시험한 것 제외, 상한 max). */
export function planHosts({ homepages, manual = [], tried, max = DAILY_MAX_HOSTS }) {
  const done = new Set(tried), out = [...manual.map((h) => h.toLowerCase())]
  const roots = [...new Set(homepages.map(rootDomain).filter(Boolean))]
  for (const p of PREFIXES) for (const r of roots) out.push(`${p}.${r}`)
  return [...new Set(out)].filter((h) => !done.has(h)).slice(0, max)
}

const isBlock = (r) => r.status === 403 || r.status === 429 || (r.status === 200 && !String(r.text).trim())
const robotsState = (groups, path) => robotsVerdict(groups, path, PRODUCT_TOKEN).state

/** 호스트 하나 시험 — 요청 ≤5. get 은 makeFetcher 꼴({status,text}). 반환: {host, outcome, row?, requests, abort?}. */
export async function probeHost(get, host) {
  let requests = 0
  const hit = async (path) => { requests++; return get(`https://${host}${path}`) }
  const rb = await hit('/robots.txt')
  if (rb.status === 0) return { host, outcome: 'unreachable', requests }
  if (rb.status === 429) return { host, outcome: 'blocked', requests, abort: true }
  if (isBlock(rb)) return { host, outcome: 'blocked', requests, row: blockedRow(host, `robots.txt ${rb.status}`) }
  const rtext = rb.status === 200 ? rb.text : ''
  const groups = rb.status === 200 ? parseRobots(rtext) : []
  const robotsAll = rb.status === 200 ? robotsState(groups, '/') : 'unverified'
  if (robotsAll === 'disallowed') return { host, outcome: 'robots_disallowed', requests, row: rowOf({ host, engine: null, robots: 'disallowed', rtext, tos: 'unknown', reason: 'robots 가 / 금지 — 첫 화면도 안 읽음' }) }
  const root = await hit('/')
  if (root.status === 429) return { host, outcome: 'blocked', requests, abort: true }
  if (root.status === 0) return { host, outcome: 'unreachable', requests }
  if (isBlock(root)) return { host, outcome: 'blocked', requests, row: blockedRow(host, `첫 화면 ${root.status}`, rtext, robotsAll) }
  const engine = fingerprint(root.text, host)
  if (!engine) return { host, outcome: 'no_fingerprint', requests }
  let tech = null, reason = null
  if (engine === 'discourse') {
    if (robotsState(groups, '/latest.json') === 'disallowed') { tech = false; reason = 'robots 가 /latest.json 금지' } else {
      const lt = await hit('/latest.json')
      if (lt.status === 429) return { host, outcome: 'blocked', requests, abort: true }
      if (isBlock(lt)) { tech = false; reason = `latest.json ${lt.status} — 우회하지 않음` } else {
        let n = 0
        try { n = JSON.parse(lt.text)?.topic_list?.topics?.length ?? 0 } catch { /* 못 읽음 = 가능 아님 */ }
        tech = n >= 10; reason = n >= 10 ? null : `latest.json 글 ${n}건(<10) 또는 JSON 아님`
      }
    }
  } else reason = `${engine} 어댑터 필요 — 글 10건 파싱 미측정`
  const link = /href=["']([^"']*(?:terms|tos|이용약관|terms-of-service)[^"']*)["']/i.exec(root.text)?.[1]
  const tosPath = link && link.startsWith('/') ? link.split('#')[0] : engine === 'discourse' ? '/tos' : '/terms'
  let tos = 'unknown', tosText = ''
  if (requests < MAX_REQ_PER_HOST && robotsState(groups, tosPath) !== 'disallowed') {
    const tp = await hit(tosPath)
    if (tp.status === 429) return { host, outcome: 'blocked', requests, abort: true }
    if (tp.status === 200 && !isBlock(tp)) { tosText = tp.text; tos = tosVerdict(tosText.replace(/<[^>]+>/g, ' ')) }
  }
  return { host, outcome: 'candidate', requests, row: rowOf({ host, engine, robots: robotsAll, rtext, tos, tosPath, tosText, tech, reason }) }
}

function blockedRow(host, why, rtext = '', robots = 'blocked') {
  return rowOf({ host, engine: null, robots: 'blocked', rtext, tos: 'unknown', tech: false, reason: `${why} — 우회하지 않음` })
}

function rowOf({ host, engine, robots, rtext, tos, tosPath, tosText, tech = null, reason = null }) {
  return {
    domain: host, engine, robots_status: robots, robots_checked_at: new Date().toISOString(), robots_excerpt: rtext ? rtext.slice(0, 600) : null,
    ai_signal: aiSignal(rtext), tos_status: tos, tos_url: tosPath ? `https://${host}${tosPath}` : null, tos_excerpt: tosExcerpt(tosText),
    legal_label: legalLabel({ robots, tos }), public_api: engine === 'discourse', area_guess: null, tech_feasible: tech, tech_block_reason: reason,
    onboarded_source_key: null, onboard_batch: null, note: 'v71cu-s9 매일 발굴(지문) — 켜지 않음, 세션 판단 대기',
  }
}

async function main() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const DRY = process.argv.includes('--dry'), max = Number(arg('max') ?? DAILY_MAX_HOSTS)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const tried = new Set()
  for (const t of ['source_candidates', 'source_probe_log']) {
    const { data, error } = await sb.from(t).select('domain').limit(20000)
    if (error) { if (t === 'source_probe_log') { console.log(`source_probe_log 못 읽음(마이그 20261120000001 미적용?) — 중단: ${error.message}`); process.exit(0) } throw new Error(error.message) }
    for (const r of data) tried.add(r.domain)
  }
  const { data: proj } = await sb.from('analysis_projects').select('competitor_url').not('competitor_url', 'is', null).limit(5000)
  const hosts = planHosts({ homepages: (proj ?? []).map((p) => p.competitor_url), manual: (arg('hosts') ?? '').split(',').filter(Boolean), tried, max })
  console.log(`시험 호스트 ${hosts.length}/${max}`)
  const get = makeFetcher({ gapMs: GAP_MS })
  const counts = {}
  let reqs = 0, inserted = 0, stopped = null
  for (const h of hosts) {
    const r = await probeHost(get, h)
    reqs += r.requests; counts[r.outcome] = (counts[r.outcome] ?? 0) + 1
    console.log(`${h} → ${r.outcome} (요청 ${r.requests})${r.row ? ` 라벨 ${r.row.legal_label}` : ''}`)
    if (!DRY) {
      if (r.row) { const { error } = await sb.from('source_candidates').upsert(r.row, { onConflict: 'domain', ignoreDuplicates: true }); if (error) console.log('source_candidates', error.message); else inserted++ }
      await sb.from('source_probe_log').upsert({ domain: h, outcome: r.outcome, engine: r.row?.engine ?? null, requests: r.requests }, { onConflict: 'domain', ignoreDuplicates: true })
    }
    if (r.abort) { stopped = `429 @ ${h} — 실행 전체 중단`; console.log(stopped); break }
  }
  console.log(`요청 ${reqs} · 결과 ${JSON.stringify(counts)} · source_candidates 추가 ${inserted}`)
  if (!DRY) await sb.from('discovery_run_log').insert({ channel: 'community', candidates: inserted, linked: 0, rejected_generic: 0, requests: reqs, stopped, detail: counts })
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
