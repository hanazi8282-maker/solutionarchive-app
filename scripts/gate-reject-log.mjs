#!/usr/bin/env node
// 30% 게이트 거절 로그(v71ap-추가) — 게이트가 후보를 막을 때 한 줄, 쌓이면 "풀었을 때 늘어날 양" 한 줄.
// 게이트 로직·임계값은 건드리지 않는다(규칙 A 유지). 이 파일은 기록과 집계만 한다. DB·네트워크 없음.
//   node scripts/gate-reject-log.mjs [--dir=reports] [--days=7] [--appstore-cap=200] [--appstore-used=131]
//        [--req-per-visit=1.85] [--revisit-days=5] [--new-per-request=20]
// 한 줄: "[게이트 YYYY-MM-DD] 막은 후보 N(유니크) / 풀면 추가 일일 요청 ≈X·리뷰 ≈Y [추정] / appstore cap 200 대비 여유 Z"
// 기본값(요청/방문 1.85·재방문 5일·요청당 신규 20)은 2026-10-18 limit-ledger 실측에서 온 [추정]이다 — 플래그로 덮는다.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const FILE = 'gate-rejects.jsonl'

/** 거절 한 줄. active/headroom 은 그때 값, cap_room 은 appstore 요청 cap 대비 여유(모르면 null — 0 으로 접지 않는다). */
export const rejectLine = ({ at = new Date(), source, candidate, reason, active = null, totalActive = null, headroom = null, newPerRequest = null, capRoom = null }) => ({
  at: new Date(at).toISOString(), source, candidate, reason, active, total_active: totalActive, headroom, new_per_request: newPerRequest, cap_room: capRoom,
})

/** reports/<date>/gate-rejects.jsonl 에 이어 쓴다. 쓸 게 없으면 파일을 만들지 않는다. */
export function appendRejects(dayDir, lines) {
  if (!lines.length) return null
  fs.mkdirSync(dayDir, { recursive: true })
  const f = path.join(dayDir, FILE)
  fs.appendFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  return f
}

/** reports/*/gate-rejects.jsonl 전부(최근 days 일)를 읽는다. 깨진 줄은 센다(조용히 버리지 않는다). */
export function readRejects(dir, { days = 7, now = new Date() } = {}) {
  const lines = []
  let bad = 0
  if (!fs.existsSync(dir)) return { lines, bad }
  const since = now.getTime() - days * 86400_000
  for (const d of fs.readdirSync(dir)) {
    const f = path.join(dir, d, FILE)
    if (!fs.existsSync(f)) continue
    for (const raw of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!raw.trim()) continue
      try {
        const l = JSON.parse(raw)
        if (new Date(l.at).getTime() >= since) lines.push(l)
      } catch { bad++ }
    }
  }
  return { lines, bad }
}

/**
 * 풀었을 때 늘어날 양(추정). 후보 하나가 활성 타깃이 되면 하루 요청 = 요청/방문 ÷ 재방문 간격, 리뷰 = 그 요청 × 요청당 신규.
 * 후보의 new_per_request 가 있으면 그것을 쓰고 없으면 기본값. 같은 후보가 여러 날 막혀도 한 번만 센다(유니크).
 */
export function estimate(lines, { appstoreCap = 200, appstoreUsed = null, reqPerVisit = 1.85, revisitDays = 5, newPerRequest = 20, source = 'appstore' } = {}) {
  const uniq = new Map()
  for (const l of lines) if (l.source === source) uniq.set(l.candidate, l)
  const perTargetReq = reqPerVisit / revisitDays
  let req = 0
  let rev = 0
  for (const l of uniq.values()) {
    req += perTargetReq
    rev += perTargetReq * (l.new_per_request ?? newPerRequest)
  }
  const room = appstoreUsed == null ? null : appstoreCap - appstoreUsed
  return { blocked: uniq.size, extra_requests: Math.round(req * 10) / 10, extra_reviews: Math.round(rev), cap: appstoreCap, cap_room: room, fits_cap: room == null ? null : req <= room }
}

export function summaryLine(est, date) {
  const room = est.cap_room == null ? '확인 불가(사용량 미입력)' : `${est.cap_room}${est.fits_cap ? '' : ' — 부족'}`
  return `[게이트 ${date}] 막은 후보 ${est.blocked}(유니크) / 풀면 추가 일일 요청 ≈${est.extra_requests}·리뷰 ≈${est.extra_reviews} [추정] / appstore cap ${est.cap} 대비 여유 ${room}`
}

export function main(argv = process.argv.slice(2), { log = console.log, now = new Date() } = {}) {
  const opt = (k, d) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
  const num = (k, d) => (opt(k) == null ? d : Number(opt(k)))
  const { lines, bad } = readRejects(opt('dir', 'reports'), { days: num('days', 7), now })
  const est = estimate(lines, {
    appstoreCap: num('appstore-cap', 200), appstoreUsed: opt('appstore-used') == null ? null : Number(opt('appstore-used')),
    reqPerVisit: num('req-per-visit', 1.85), revisitDays: num('revisit-days', 5), newPerRequest: num('new-per-request', 20),
  })
  log(lines.length ? summaryLine(est, new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)) : '[게이트] 거절 로그 0줄 — 확인 불가(아직 안 쌓였거나 게이트가 안 막았다)')
  if (bad) log(`⚠️ 깨진 줄 ${bad}개 — 집계에서 빠졌다`)
  return { est, lines: lines.length, bad }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
