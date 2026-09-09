#!/usr/bin/env node
// 밤 Notion 풀백 — 아직 안 읽은(pulled_at IS NULL) notion_sync_log 행을 전부
// 다시 읽어 원본(pushed_body/pushed_status)과 대조하고 분류한다.
//
//   node --env-file=.env.local scripts/notion-pull-feedback.mjs [--dry]
//
// 분류: unchanged / edited / adopted(상태=채택) / held(상태=보류).
// 결과는 새 방식을 발명하지 않고 기존 판정 로그 관례(LOG-YYYYMMDD-NN,
// methodology/content/solfa/04-decisions.md 참조)를 그대로 써서
// reports/<날짜>/notion-feedback-log.md 에 append-only 로 남긴다.
//
// ⚠️ 이번 라운드는 "로그 적재까지만" — 여기서 읽은 diff_status 를 근거로
//   자동 승인/반려 로직을 걸지 않는다. review_status 변경은 여전히 사람이 한다
//   (CLAUDE.md §10.1).
//
// ⚠️ pulled_at IS NULL 로 대상을 고른다(날짜 매칭이 아니다). 푸시는 05:17 KST
//   (=전날 20:17 UTC), 풀은 21:00 KST(=당일 12:00 UTC) 라 UTC 날짜가 하루
//   어긋난다 — 날짜 문자열로 짝을 맞추면 이 어긋남 때문에 조용히 빠뜨린다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '../lib/supabase/server.ts'

const NOTION_VERSION = '2022-06-28'
const NOTION_API = 'https://api.notion.com/v1'

function today(d = new Date()) { return d.toISOString().slice(0, 10) }

function notionHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }
}

export async function notionRequest(token, method, endpoint) {
  let res
  try { res = await fetch(`${NOTION_API}${endpoint}`, { method, headers: notionHeaders(token) }) }
  catch (e) { return { ok: false, error: `네트워크 실패 — ${e.message}` } }
  const json = await res.json().catch(() => null)
  if (!res.ok) return { ok: false, error: `${res.status} ${json?.code ?? ''} ${json?.message ?? ''}`.trim() }
  return { ok: true, data: json }
}

/** 페이지의 상위 블록을 읽어 문단 텍스트를 이어붙인다. 자식 블록(중첩)은 안 본다 — 이 DB 는 평면 구조로만 쓴다. */
export async function readPageText(token, pageId) {
  const out = []
  let cursor = null
  for (;;) {
    const q = cursor ? `?start_cursor=${cursor}` : ''
    const r = await notionRequest(token, 'GET', `/blocks/${pageId}/children${q}`)
    if (!r.ok) return { ok: false, error: r.error }
    for (const b of r.data.results) {
      const rt = b[b.type]?.rich_text
      if (Array.isArray(rt)) out.push(rt.map((t) => t.plain_text).join(''))
    }
    if (!r.data.has_more) break
    cursor = r.data.next_cursor
  }
  return { ok: true, text: out.join('\n\n') }
}

export async function readPageStatus(token, pageId) {
  const r = await notionRequest(token, 'GET', `/pages/${pageId}`)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, status: r.data.properties?.상태?.select?.name ?? null }
}

export function nextLogCode(logPath, date) {
  const prefix = `LOG-${date.replace(/-/g, '')}-`
  let n = 1
  if (fs.existsSync(logPath)) {
    const text = fs.readFileSync(logPath, 'utf-8')
    const nums = [...text.matchAll(new RegExp(prefix.replace(/[-]/g, '\\-') + '(\\d{2})', 'g'))].map((m) => Number(m[1]))
    if (nums.length) n = Math.max(...nums) + 1
  }
  return `${prefix}${String(n).padStart(2, '0')}`
}

async function run() {
  const dry = process.argv.includes('--dry')
  const token = process.env.NOTION_API_TOKEN
  if (!token) {
    console.log('ℹ️ NOTION_API_TOKEN 미설정 — 풀백을 건너뛴다.')
    process.exit(0)
  }

  let supabase
  try { supabase = await createClient() }
  catch (e) { console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`); process.exit(2) }
  if (!supabase) { console.error('⚠️ 확인 불가: Supabase 자격증명 미설정'); process.exit(2) }

  const { data: rows, error } = await supabase.from('notion_sync_log')
    .select('id,post_id,notion_page_id,notion_page_url,pushed_body,pushed_status')
    .is('pulled_at', null)
  if (error) {
    const hint = ['42P01', 'PGRST205'].includes(error.code) ? ' — 마이그레이션 20260909000001_notion_sync_log.sql 미적용일 수 있다.' : ''
    console.error(`⚠️ 확인 불가: notion_sync_log 조회 실패 — ${error.code ?? ''} ${error.message}${hint}`)
    process.exit(2)
  }
  if (!rows.length) { console.log('풀백 대상 0건 (아직 안 읽은 페이지 없음).'); process.exit(0) }

  const date = today()
  const reportDir = path.join(process.cwd(), 'reports', date)
  const logPath = path.join(reportDir, 'notion-feedback-log.md')
  fs.mkdirSync(reportDir, { recursive: true })
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, `# Notion 피드백 풀백 로그 — ${date}\n\n_notion-pull-feedback.mjs 가 append-only 로 쓴다. 이번 라운드는 로그 적재까지만 — 자동 반영 로직 없음._\n`, 'utf-8')
  }

  const counts = { unchanged: 0, edited: 0, adopted: 0, held: 0, error: 0 }
  for (const row of rows) {
    const [textRes, statusRes] = await Promise.all([
      readPageText(token, row.notion_page_id),
      readPageStatus(token, row.notion_page_id),
    ])
    if (!textRes.ok || !statusRes.ok) {
      console.error(`⚠️ ${row.notion_page_id} 확인 불가 — ${textRes.error ?? statusRes.error}`)
      counts.error++
      continue
    }

    let diffStatus
    if (statusRes.status === '채택') diffStatus = 'adopted'
    else if (statusRes.status === '보류') diffStatus = 'held'
    else if (textRes.text.trim() !== row.pushed_body.trim()) diffStatus = 'edited'
    else diffStatus = 'unchanged'
    counts[diffStatus]++

    const logCode = nextLogCode(logPath, date)
    const entry = [
      `## ${logCode} — ${row.notion_page_url}`,
      '',
      `- post_id: \`${row.post_id}\``,
      `- 분류: **${diffStatus}** (Notion 상태=${statusRes.status ?? '(미설정)'})`,
      `- 원본 대비: ${diffStatus === 'edited' ? '본문 변경 감지' : diffStatus === 'unchanged' ? '변경 없음' : '상태 필드로 판정'}`,
      '',
    ].join('\n')

    if (dry) {
      console.log(`(dry) ${row.notion_page_id} → ${diffStatus}`)
      continue
    }

    fs.appendFileSync(logPath, `\n${entry}`, 'utf-8')

    const upd = await supabase.from('notion_sync_log').update({
      pulled_body: textRes.text, pulled_status: statusRes.status, diff_status: diffStatus,
      pulled_at: new Date().toISOString(), decision_log_code: logCode,
    }).eq('id', row.id)
    if (upd.error) console.error(`⚠️ ${row.notion_page_id} 판정은 로그에 남았지만 DB 갱신 실패 — ${upd.error.code ?? ''} ${upd.error.message}`)
  }

  console.log(`\n풀백 완료 — 무변경 ${counts.unchanged} · 편집됨 ${counts.edited} · 채택 ${counts.adopted} · 보류 ${counts.held} · 확인불가 ${counts.error}`)
  process.exit(0)
}

function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}
if (isMain()) run()
