#!/usr/bin/env node
// v70 §3·L-04 — 접근 실패(RETRY) 12곳 재시도 기록. 사이트당 루트 페이지 GET 1회(honest UA), 사이트 사이 4초. 우회 없음.
// 판정: 403·429·캡차·526·연결 실패 = 실패 시도. 서로 다른 날·시간대 3회 실패면 BLOCKED(v70 §3). 200 이어도 챌린지 HTML 이면 실패로 센다.
// 결과를 reports/2026-10-14/retry-probe.json 에 시도별로 누적한다(append). 사용: node scripts/retry-probe-v70.mjs
import fs from 'node:fs'
import { USER_AGENT } from '../lib/review/runner.ts'

export const SITES = {
  '커리어리': 'https://careerly.co.kr/', '잡플래닛': 'https://www.jobplanet.co.kr/', 'MLBPARK': 'https://mlbpark.donga.com/', '원티드': 'https://www.wanted.co.kr/',
  'Edge Add-ons': 'https://microsoftedge.microsoft.com/addons/', 'SaaSworthy': 'https://www.saasworthy.com/', 'Slant': 'https://www.slant.co/', 'Crozdesk': 'https://crozdesk.com/',
  'Bluesky(공식 API 경로)': 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=saas&limit=1', 'Medium': 'https://medium.com/', 'HubSpot Community': 'https://community.hubspot.com/', 'Zoom Community': 'https://community.zoom.com/',
}
const FILE = 'reports/2026-10-14/retry-probe.json'
const CHALLENGE = /just a moment|cf-chl|captcha|access denied|attention required|enable javascript/i

/** 순수 함수: 응답 → 시도 결과. */
export function classify(status, body) {
  if (status === null) return 'fail'
  if (status === 403 || status === 429 || status >= 500) return 'fail'
  if (status >= 200 && status < 300) return CHALLENGE.test(body.slice(0, 4000)) || !body.trim() ? 'fail' : 'ok'
  return status >= 400 ? 'fail' : 'ok'
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []
  const at = new Date().toISOString()
  for (const [name, url] of Object.entries(SITES)) {
    const row = { name, url, at }
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
      const body = await res.text()
      row.status = res.status
      row.result = classify(res.status, body)
      row.bytes = body.length
    } catch (e) {
      row.status = null
      row.result = 'fail'
      row.error = String(e.message ?? e).slice(0, 60)
    }
    prev.push(row)
    console.log(`${name.padEnd(24)} ${String(row.status ?? row.error).padEnd(8)} ${row.result}`)
    await new Promise((r) => setTimeout(r, 4000))
  }
  fs.writeFileSync(FILE, JSON.stringify(prev, null, 1) + '\n')
}
