#!/usr/bin/env node
// 앱 이름 → 앱스토어 ID 사전(v71am §1-A). 공개 차트 피드(rss.marketingtools.apple.com, 구 rss.applemarketingtools.com)의
// KR·US × 무료·유료 상위 100 을 모아 normKey(이름) → [{id, name, artist, country}] 로 쓴다. 사전에 있는 이름은 Search 호출 0.
// 읽기 전용·DB 없음·robots 규칙 없음(2026-10-18 실측 200, 규칙 줄 0). 요청 간격 3초, 403/429 한 번이면 즉시 중단(우회 없음).
// 5xx·타임아웃은 한 번만 재시도하고 그 피드만 건너뛴다(2026-10-18 실측: 피드가 간헐적으로 500·무응답) — 건너뛴 피드는 skipped 에 남긴다.
//   node scripts/appstore-chart-dictionary.mjs [--out=reports/2026-10-18/appstore-chart-dictionary.json] [--limit=100]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { normKey } from './product-name-candidates.mjs'
import { USER_AGENT } from '../lib/review/runner.ts'

// v71ay C3: 국가를 늘려 입력 풀을 넓힌다(국가마다 상위 100 이 다르다). 기본은 옛 값 kr·us. --countries=us,kr,gb,ca,au,in,sg,de
export const DEFAULT_COUNTRIES = ['kr', 'us']
const feedsOf = (countries) => countries.flatMap((cc) => ['top-free', 'top-paid'].map((kind) => ({ cc, kind })))

/** 피드 JSON → 사전 항목. results 가 배열이 아니면 던진다(빈 배열과 못 읽은 것을 가른다 — §7.1). */
export function parseFeed(json, cc) {
  const rs = json?.feed?.results
  if (!Array.isArray(rs)) throw new Error('results 없음')
  return rs.filter((a) => a?.id && a?.name).map((a) => ({ id: String(a.id), name: a.name, artist: a.artistName ?? null, country: cc }))
}

export function buildDictionary(entries) {
  const d = {}
  for (const e of entries) {
    const k = normKey(e.name)
    if (k && !(d[k] ?? []).some((x) => x.id === e.id && x.country === e.country)) (d[k] ??= []).push(e)
  }
  return d
}

export async function collect({ fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), limit = 100, countries = DEFAULT_COUNTRIES, log = console.log } = {}) {
  const entries = [], skipped = []
  let stopped = null
  for (const { cc, kind } of feedsOf(countries)) {
    if (stopped) break
    const url = `https://rss.marketingtools.apple.com/api/v2/${cc}/apps/${kind}/${limit}/apps.json`
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(3000)
      const res = await fetchFn(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30000) }).catch(() => null)
      if (res && (res.status === 403 || res.status === 429)) { stopped = `HTTP ${res.status} ${cc}/${kind}`; break }
      if (res?.status === 200) {
        try { entries.push(...parseFeed(await res.json(), cc)); break } catch (e) { skipped.push(`${cc}/${kind}: ${e.message}`); break }
      }
      if (attempt) skipped.push(`${cc}/${kind}: ${res ? `HTTP ${res.status}` : '무응답'}`)
    }
  }
  log(`[차트 사전] 항목 ${entries.length} · 건너뜀 ${skipped.length ? skipped.join(', ') : '없음'}${stopped ? ` · 중단: ${stopped}` : ''}`)
  return { entries, skipped, stopped }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const opt = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const out = opt('out') ?? 'reports/2026-10-18/appstore-chart-dictionary.json'
  const { entries, skipped, stopped } = await collect({ limit: Number(opt('limit') ?? 100), countries: (opt('countries') ?? DEFAULT_COUNTRIES.join(',')).split(',').filter(Boolean) })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), skipped, stopped, names: Object.keys(buildDictionary(entries)).length, dictionary: buildDictionary(entries) }, null, 1) + '\n')
  console.log(`→ ${out}`)
  process.exit(stopped ? 2 : 0)
}
