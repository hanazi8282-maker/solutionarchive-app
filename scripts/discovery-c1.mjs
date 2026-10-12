#!/usr/bin/env node
// 자율 발굴 C-1(남헌 v56 §C-1 · v61) 오케스트레이터 — ①게시판(board-discovery) · ②④검색 제안(store-search-discovery) · ③이상 반응(adoption-anomaly)
// 을 한 번 돌리고 '[자율 발굴 YYYY-MM-DD]' 보고 블록 본문을 만든다(reportBlock).
//
//   node scripts/discovery-c1.mjs [--from-db] [--no-network] [--write] [--reports-dir=reports]
//   기본 = 드라이런: 요청(robots·디렉터리·목록 1페이지)은 가고, 파일·Notion 0.
//   --write: 초안·롤백·대장·제안표·보고 블록(reports/<KST>/discovery-log-block.md 에 덧붙임) + 경보 있으면 Notion 한 줄.
//   --from-db: review_sources·review_targets·review_fingerprints·analysis_inputs **SELECT 만**. 없으면 소스 행이 없어 게시판은 게이트에서 멈추고
//              이상 반응은 '확인 불가'로 센다(§7.1).
// DB 쓰기·마이그 적용은 어느 경우에도 없다(셀프테스트가 정적으로 검사). 후보 대장(product-name-candidates)은 읽지도 바꾸지도 않는다.
// 종료 코드: 0 · 1(입력·파일 실패) · 3(차단 신호로 중단 — 확인 대상, §7.2)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { anomalyLine, evaluate, loadRows, notionLine, watchList } from './adoption-anomaly.mjs'
import { boardDemotion, boardLine, discoverBoards, readLedger, writeOutputs } from './board-discovery.mjs'
import { main as storeSearch } from './store-search-discovery.mjs'
import { readAdopted } from './window-discovery.mjs'
import { kstDate } from './window-probe.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** '[자율 발굴 YYYY-MM-DD]' 블록 본문(Notion 한일 칸·discovery-log-block.md 공용). */
export function reportBlock({ date, dry, lines, alerts = [], files = [] }) {
  return [
    `[자율 발굴 ${date}] C-1${dry ? ' (드라이런 — 파일·Notion 0)' : ''}`,
    ...lines,
    'DB 쓰기 0(초안만) · 후보 대장 구조 변경 없음 · 신규 회사 후보는 승인 시트(영역별 하루 3) 경로 그대로',
    ...(alerts.length ? [`경보: ${alerts.join(' / ')}`] : []),
    ...(files.length ? [`파일: ${files.join(', ')}`] : []),
  ].join('\n')
}

async function loadBoardInputs(sb, keys) {
  const { readAll } = await import('./window-discovery-inputs.mjs')
  const sources = await readAll(() => sb.from('review_sources').select('key, enabled, tos_status, robots_status, min_interval_ms').in('key', keys).order('key'), 'review_sources')
  const targets = await readAll(
    () => sb.from('review_targets').select('id, source_key, product_ref, label, status, total_collected, consecutive_empty, created_at, last_run_at').in('source_key', keys).order('id'),
    'review_targets',
  )
  return { sources, targets }
}

export async function main(argv, { db = null, fetchText = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = new Date(), log = console.log, record = null, cfg: cfgIn = null } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const write = argv.includes('--write')
  const offline = argv.includes('--no-network')
  const reportsDir = opt('reports-dir') ?? path.join(repoRoot, 'reports')
  const date = kstDate(now.getTime())
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
  const cfg = cfgIn ?? JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'discovery-c1.json'), 'utf8'))
  const sb = argv.includes('--from-db') ? (db ?? (await (await import('./target-supply.mjs')).openDb())) : null
  const net = offline ? null : (fetchText ?? (await import('./window-probe.mjs')).realFetch)

  // ① 게시판
  const keys = Object.keys(cfg.boards ?? {})
  const { sources, targets } = sb ? await loadBoardInputs(sb, keys) : { sources: [], targets: [] }
  const ledger = readLedger(reportsDir)
  const boards = net
    ? await discoverBoards({ cfg, sources, targets, ledger, fetchText: net, sleep })
    : { sources: Object.fromEntries(keys.map((k) => [k, { status: 'no-network', slugs: 0, skipped: {} }])), adopted: [], suggested: [], requests: 0, aborted: null }
  const demote = boardDemotion(ledger, targets, now)

  // ②④ 검색 제안
  const store = await storeSearch(
    [`--date=${date}`, ...(sb ? ['--from-db'] : []), ...(offline ? ['--no-network'] : []), ...(write ? ['--write', `--reports-dir=${reportsDir}`] : [])],
    { db: sb, fetchText: net, now, log: () => {} },
  )

  // ③ 이상 반응
  const watch = watchList({ windowLedger: readAdopted(reportsDir), boardLedger: ledger }, now)
  const anomalies = evaluate(watch, sb ? await loadRows(sb, watch, now) : new Map(), now)
  const nLine = notionLine(anomalies)

  const alerts = [...(boards.aborted ? [`게시판 차단 신호(${boards.aborted}) — 전체 중단`] : []), ...(nLine ? [nLine] : [])]
  const files = []
  if (write) {
    files.push(...writeOutputs({ result: boards, demote, ledger, reportsDir, date, stamp, now }))
    if (store.file) files.push(store.file.replace(/\\/g, '/'))
  }
  const block = reportBlock({ date, dry: !write, lines: [boardLine(boards, demote), store.line, anomalyLine(anomalies)], alerts, files })
  log(block)
  let notion = 'skipped'
  if (write) {
    fs.mkdirSync(path.join(reportsDir, date), { recursive: true })
    fs.appendFileSync(path.join(reportsDir, date, 'discovery-log-block.md'), `\n\`\`\`\n${block}\n\`\`\`\n`)
    if (nLine) {
      const rec = record ?? (await import('./notion-status-log.mjs')).upsertStatusLog
      const w = await rec(
        { date, track: 'CTO', done: nLine, blocked: '', next: '', needsHuman: false, note: 'adoption-anomaly' },
        { marker: 'adoption-anomaly', pendingDir: path.join(repoRoot, 'ops', 'state', 'status-log-pending') },
      )
      notion = w.ok ? `ok ${w.title}` : `notion_unavailable(${w.stage}: ${w.error})${w.pendingPath ? ` · 폴백 ${w.pendingPath}` : ''}`
    }
  }
  log(`Notion(이상 반응): ${notion}`)
  return { block, boards, demote, store, anomalies, notion, files, code: boards.aborted ? 3 : 0 }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2))
    .then((r) => process.exit(r.code))
    .catch((e) => {
      console.error(`❌ discovery-c1: ${e.message}`)
      process.exit(1)
    })
}
