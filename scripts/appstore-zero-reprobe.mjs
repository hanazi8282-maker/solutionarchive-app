#!/usr/bin/env node
// 앱스토어 0건 타깃 재프로브(남헌 v71al §2-1) — 읽기 전용, DB 접근 없음, 수동 실행 전용.
//
//   node scripts/appstore-zero-reprobe.mjs [--targets=reports/2026-10-17/appstore-zero-targets.txt]
//
// 왜 있나: 남헌 PC 에서 애플 리뷰 RSS 가 인기 앱(Salesforce 등)까지 entry 0건을 준다. 같은 일이 Actions 러너에서도
// 일어나는지 가른다(러너 야간 수집은 정상). 그래서 이 스크립트는 **러너에서만** 돌린다(.github/workflows/appstore-zero-reprobe.yml).
//
// 규칙: URL 은 어댑터 nextRequest(1페이지) 그대로 · UA 는 runner.ts USER_AGENT 그대로(window-probe.mjs realFetch) ·
//   요청 사이 3초 이상 · 총 요청 80 이하 · 2xx 가 아님(4xx·429 포함)·네트워크 오류·빈 응답·캡차(isStrictBlock)·비JSON 1건이면
//   즉시 전체 중단. 우회·재시도 없음. 결과는 표로 출력만 한다(DB 에 쓰지 않는다).
// 종료코드: 0 끝까지 · 3 중단 신호로 멈춤 · 64 입력 오류

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { appstoreAdapter, parseProductRef } from '../lib/review/adapters/appstore.ts'
import { isStrictBlock } from '../lib/review/runner.ts'
import { realFetch } from './window-probe.mjs'

export const MIN_INTERVAL_MS = 3000
export const MAX_REQUESTS = 80

/** 공백 구분 'cc:appId' → 중복 없는 목록. 형식이 틀린 토큰은 bad 로 돌려준다(조용히 버리지 않는다). */
export function parseTargets(text) {
  const refs = []
  const bad = []
  for (const tok of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if (!parseProductRef(tok) || !tok.includes(':')) bad.push(tok)
    else if (!refs.includes(tok)) refs.push(tok)
  }
  return { refs, bad }
}

/** RSS 본문 → entry 수. JSON 이 아니거나 feed 가 없으면 null(= 중단 사유). entry 키가 없으면 0. */
export function countEntries(body) {
  let doc
  try { doc = JSON.parse(body) } catch { return null }
  const feed = doc?.feed
  if (!feed || typeof feed !== 'object') return null
  const e = feed.entry
  if (e === undefined || e === null) return 0
  return Array.isArray(e) ? e.length : 1
}

/** 본체. 네트워크·대기는 주입(셀프테스트는 가짜). 반환 { rows:[{ref, status, entries}], requests, aborted } */
export async function reprobe(refs, { fetchText, sleep, intervalMs = MIN_INTERVAL_MS, maxRequests = MAX_REQUESTS }) {
  const out = { rows: [], requests: 0, aborted: null }
  for (const ref of refs) {
    if (out.requests >= maxRequests) { out.aborted = `요청 상한 ${maxRequests} 도달`; break }
    const req = appstoreAdapter.nextRequest({ id: 'reprobe', projectId: null, sourceKey: 'appstore', productRef: ref, cursor: null, lastReviewAt: null, consecutiveEmpty: 0 })
    if (!req) { out.rows.push({ ref, status: null, entries: null, note: 'URL 을 만들 수 없음' }); continue }
    if (out.requests > 0) await sleep(Math.max(intervalMs, MIN_INTERVAL_MS))
    const res = await fetchText(req.url)
    out.requests++
    if (res.status === null) { out.aborted = `${ref}: 네트워크 오류(${res.error})`; break }
    if (res.status < 200 || res.status >= 300) { out.aborted = `${ref}: HTTP ${res.status}`; break }
    if (isStrictBlock(res)) { out.aborted = `${ref}: 빈 응답·캡차 신호(HTTP ${res.status})`; break }
    const entries = countEntries(res.body)
    if (entries === null) { out.aborted = `${ref}: JSON 아님 또는 feed 없음`; break }
    out.rows.push({ ref, status: res.status, entries })
  }
  return out
}

/** 마크다운 표 + 판정 요약 한 줄. */
export function renderReport(result, total) {
  const ok = result.rows.filter((r) => r.entries !== null)
  const pos = ok.filter((r) => r.entries > 0).length
  const zero = ok.filter((r) => r.entries === 0).length
  return [
    '## 앱스토어 0건 타깃 러너 재프로브',
    '',
    '| 타깃(cc:appId) | HTTP | entry 수 |',
    '|---|---|---|',
    ...result.rows.map((r) => `| ${r.ref} | ${r.status ?? '-'} | ${r.entries ?? (r.note ?? '-')} |`),
    '',
    `요청 ${result.requests}회 · 확인 ${ok.length}/${total}개${result.aborted ? ` · **중단: ${result.aborted}**` : ''}`,
    '',
    `**판정 요약: 러너에서 entry>0 인 앱 ${pos}개 / 0인 앱 ${zero}개**${ok.length < total ? ` (못 본 ${total - ok.length}개는 어느 쪽도 아님)` : ''}`,
    '',
  ].join('\n')
}

async function main() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--targets='))
  const file = arg ? arg.slice('--targets='.length) : 'reports/2026-10-17/appstore-zero-targets.txt'
  const { refs, bad } = parseTargets(fs.readFileSync(file, 'utf8'))
  if (bad.length || refs.length === 0) { console.error(`입력 오류: 형식이 틀린 토큰 ${bad.length}개(${bad.slice(0, 5).join(', ')}) · 타깃 ${refs.length}개`); process.exit(64) }
  if (refs.length > MAX_REQUESTS) { console.error(`타깃 ${refs.length}개 > 요청 상한 ${MAX_REQUESTS} — 목록을 줄여라`); process.exit(64) }
  const result = await reprobe(refs, { fetchText: realFetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) })
  const report = renderReport(result, refs.length)
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  if (result.aborted) process.exit(3)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
