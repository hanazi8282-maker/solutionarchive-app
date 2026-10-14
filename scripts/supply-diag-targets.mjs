// 타깃 공급 진단 (L-35, 읽기 전용 GET 만). 소스별 타깃 상태 분포·마지막 실행·시계 관찰 후보를 표로 낸다.
// 쓰기 0. 사용: node --env-file=<.env.local> scripts/supply-diag-targets.mjs [--json]
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음 — 확인 불가'); process.exit(2) }

async function get(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, authorization: `Bearer ${key}`, range: `${from}-${from + 999}`, 'range-unit': 'items' } })
    const rows = await r.json().catch(() => null)
    if (!r.ok || !Array.isArray(rows)) throw new Error(`${q.split('?')[0]} HTTP ${r.status}`)
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

const sources = await get('review_sources?select=key,enabled,daily_request_cap,robots_status')
const ramps = await get('review_source_ramp?select=source_key,supply_state,frozen_until,daily_request_target,cap_base').catch(() => [])
const targets = await get('review_targets?select=source_key,status,consecutive_empty,last_run_at,total_collected')
const since = new Date(Date.now() - 24 * 3600e3).toISOString()
const runs = await get(`review_collection_runs?select=source_key,started_at,requests,status,dry_run&dry_run=eq.false&started_at=gte.${encodeURIComponent(since)}`)
const lastOk = await get('review_collection_runs?select=source_key,started_at&dry_run=eq.false&status=eq.success&order=started_at.desc&limit=1000').catch(() => [])

const by = (rows, k) => rows.reduce((m, r) => ((m[r[k]] ??= []).push(r), m), {})
const T = by(targets, 'source_key'), R = by(runs, 'source_key'), RP = Object.fromEntries(ramps.map(r => [r.source_key, r]))
const L = {}; for (const r of lastOk) L[r.source_key] ??= r.started_at

const rows = sources.map(s => {
  const t = T[s.key] ?? []
  const n = st => t.filter(x => x.status === st).length
  const r = R[s.key] ?? []
  return {
    source: s.key, enabled: s.enabled, robots: s.robots_status, supply: RP[s.key]?.supply_state ?? null,
    targets: t.length, active: n('active'), exhausted: n('exhausted'), failed: n('failed'),
    collected: t.reduce((a, x) => a + (x.total_collected ?? 0), 0),
    req24h: r.reduce((a, x) => a + (x.requests ?? 0), 0), cap: s.daily_request_cap,
    lastSuccess: L[s.key] ?? null,
  }
}).sort((a, b) => a.active - b.active || a.source.localeCompare(b.source))

if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1))
else {
  console.log('source | on | 전체/활성/소진/실패 | 24h요청/상한 | 마지막성공 | supply | robots')
  for (const x of rows) console.log(`${x.source} | ${x.enabled ? 'Y' : 'N'} | ${x.targets}/${x.active}/${x.exhausted}/${x.failed} | ${x.req24h}/${x.cap ?? '-'} | ${x.lastSuccess?.slice(0, 16) ?? '-'} | ${x.supply ?? '-'} | ${x.robots ?? '-'}`)
  const z = rows.filter(x => x.enabled && x.active === 0)
  console.log(`\n활성 0 인 enabled 소스: ${z.length}곳 — ${z.map(x => x.source).join(', ')}`)
}
