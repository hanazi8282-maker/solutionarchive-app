#!/usr/bin/env node
// 앵커 검증 실행기(v70 L-09) — 이름 목록을 iTunes Search 로 조회해 판정한다. 읽기 전용(공개 API, 키 없음), DB 쓰기 없음.
// 사용: node scripts/anchor-verify.mjs "InVideo AI" "Fera" "Ivory" [--country=us]
// 요청: 이름당 1회, 이름 사이 3초. 호스트 itunes.apple.com (robots 대상 아님 — 공식 검색 API). 실패는 lookup_failed 로 접지 않고 그대로 낸다.
import { USER_AGENT } from '../lib/review/runner.ts'
import { verifyAnchor } from '../lib/review/anchor.ts'

export async function lookup(name, country = 'us', fetchFn = fetch) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&limit=8&country=${country}`
  try {
    const res = await fetchFn(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20000) })
    if (res.status !== 200) return { state: 'lookup_failed', reason: `HTTP ${res.status}` }
    const j = await res.json()
    return verifyAnchor(name, j?.results)
  } catch (e) {
    return { state: 'lookup_failed', reason: String(e?.message ?? e) }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const args = process.argv.slice(2)
  const country = args.find((a) => a.startsWith('--country='))?.slice(10) ?? 'us'
  const names = args.filter((a) => !a.startsWith('--'))
  for (const n of names) {
    const v = await lookup(n, country)
    console.log(`${n.padEnd(28)} ${v.state.padEnd(13)} ${v.reason}${v.domain ? ` · ${v.domain}` : ''}`)
    await new Promise((r) => setTimeout(r, 3000))
  }
}
