#!/usr/bin/env node
// 일일 상태 로그 — 트랙(CMO/CTO/기타)별 하루 결과를 Notion "일일 상태 로그" DB 에 1페이지로 남긴다.
// 아침 브리핑이 사람이 붙여넣은 CC 보고 대신 이 DB 를 읽게 하려는 것.
//
//   node scripts/notion-status-log.mjs --probe
//   node scripts/notion-status-log.mjs --track 기타 [--date YYYY-MM-DD(기본 KST 오늘)] \
//     [--done ..] [--blocked ..] [--next ..] [--needs-human] [--note ..] [--title ..]
//   (기록 모드도 종료 코드 규약은 아래와 같다)
//
// 종료 코드 (--probe):
//   0 = 성공 (생성 → GET 재확인 → archived 정리 → GET 으로 archived 확인까지 전부)
//   2 = 권한 없음 (403/404 — 이 연동이 DB 에 Connections 로 공유 안 됨)
//   3 = 스키마 불일치 (400 validation / 재확인한 속성 타입이 다름)
//   1 = 기타·확인 불가 (토큰 없음, 401, 네트워크, 재확인 불일치, 정리 실패 등)
//   ★ 토큰이 없으면 1 이다. "안 해 봤다"를 0 으로 접지 않는다 (CLAUDE.md §7.1).
//
// 쓰기 함수 writeStatusLog() 는 절대 throw 하지 않고 결과 객체를 돌려준다 —
// 호출하는 루프가 이 기록 실패로 막히면 안 된다.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { notionRequest } from './notion-api.mjs'

// 출처: 남헌이 2026-09-14 생성한 "일일 상태 로그" DB
// (부모 페이지 "Solution Archive Reference database" — "CMO 발행 대기함"과 같은 부모).
export const DEFAULT_STATUS_LOG_DB_ID = 'f57ae10b-4cc0-433b-9db6-20785216aebe'
export const TRACKS = ['CMO', 'CTO', '기타']
// Notion DB 속성명 → 타입. 한국어 이름 그대로가 정본이다.
// ⛔ DB 에는 "알림완료"(checkbox) 도 있지만 Cowork 즉시 알림 시스템 전용이다.
//    이 코드는 그 속성을 쓰지도(빌더에 없음 → 기본 false) 읽지도(재확인 대상 아님) 않는다.
export const SCHEMA = {
  제목: 'title', 날짜: 'date', 트랙: 'select', 한일: 'rich_text',
  막힌것: 'rich_text', 다음할일: 'rich_text', 사람판단필요: 'checkbox', 비고: 'rich_text',
}
const MAX_TEXT = 2000 // Notion text object 당 content 상한

/** 2000자(UTF-16 단위, 그러면 코드포인트로도 ≤2000)로 자른다. 서로게이트 쌍은 쪼개지 않는다. */
export function clip(text, max = MAX_TEXT) {
  const s = String(text ?? '')
  if (s.length <= max) return s
  let cut = max - 1
  const c = s.charCodeAt(cut - 1)
  if (c >= 0xd800 && c <= 0xdbff) cut--
  return `${s.slice(0, cut)}…`
}

const rt = (text) => {
  const s = clip(text)
  return s ? [{ type: 'text', text: { content: s } }] : []
}

/** 입력 → Notion properties. 트랙·날짜가 틀리면 throw (select 에 엉뚱한 옵션이 조용히 생기는 걸 막는다). */
export function buildStatusLogProperties({ date, track, done, blocked, next, needsHuman, note, title }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new TypeError(`date 는 YYYY-MM-DD 여야 한다: ${date}`)
  if (!TRACKS.includes(track)) throw new TypeError(`track 은 ${TRACKS.join('/')} 중 하나여야 한다: ${track}`)
  return {
    제목: { title: rt(title ?? `${date}-${track}`) },
    날짜: { date: { start: date } },
    트랙: { select: { name: track } },
    한일: { rich_text: rt(done) },
    막힌것: { rich_text: rt(blocked) },
    다음할일: { rich_text: rt(next) },
    사람판단필요: { checkbox: needsHuman === true },
    비고: { rich_text: rt(note) },
  }
}

const bareId = (id) => String(id ?? '').replace(/-/g, '').toLowerCase()
const titleOf = (page) => (page?.properties?.제목?.title ?? []).map((t) => t.plain_text).join('')

/** HTTP 상태 → 프로브 종료 코드. */
export function exitCodeFor(status) {
  if (status === 403 || status === 404) return 2
  if (status === 400) return 3
  return 1
}

/**
 * 1페이지 생성 후 GET 으로 재확인(parent DB·제목·속성 타입).
 * 반환: { ok:true, pageId, url } | { ok:false, stage, status?, code, error, pageId? }
 *   code 는 exitCodeFor 규약. pageId 가 있으면 페이지는 만들어졌다는 뜻이다.
 */
export async function writeStatusLog(entry, { token = process.env.NOTION_API_TOKEN, dbId = process.env.NOTION_STATUS_LOG_DB_ID || DEFAULT_STATUS_LOG_DB_ID } = {}) {
  let properties
  try { properties = buildStatusLogProperties(entry) }
  catch (e) { return { ok: false, stage: 'build', code: 1, error: e.message } }
  if (!token) return { ok: false, stage: 'env', code: 1, error: '확인 불가(토큰 없음) — NOTION_API_TOKEN 미설정' }

  const created = await notionRequest(token, 'POST', '/pages', { parent: { database_id: dbId }, properties })
  if (!created.ok) return { ok: false, stage: 'create', status: created.status, code: exitCodeFor(created.status), error: created.error }
  const pageId = created.data?.id
  if (!pageId) return { ok: false, stage: 'create', code: 1, error: '200 인데 응답에 page id 가 없다' }

  const got = await notionRequest(token, 'GET', `/pages/${pageId}`)
  if (!got.ok) return { ok: false, stage: 'verify', status: got.status, code: 1, pageId, error: `재확인 GET 실패 — ${got.error}` }
  const page = got.data
  if (bareId(page?.parent?.database_id) !== bareId(dbId)) {
    return { ok: false, stage: 'verify', code: 1, pageId, error: `parent.database_id 불일치 — ${page?.parent?.database_id ?? '(없음)'}` }
  }
  const wantTitle = properties.제목.title.map((t) => t.text.content).join('')
  if (titleOf(page) !== wantTitle) return { ok: false, stage: 'verify', code: 1, pageId, error: `제목 불일치 — "${titleOf(page)}"` }
  const badTypes = Object.entries(SCHEMA).filter(([k, type]) => page.properties?.[k]?.type !== type)
    .map(([k, type]) => `${k}(기대 ${type}, 실제 ${page.properties?.[k]?.type ?? '없음'})`)
  if (badTypes.length) return { ok: false, stage: 'verify', code: 3, pageId, error: `속성 타입 불일치 — ${badTypes.join(', ')}` }

  return { ok: true, pageId, url: page.url ?? created.data.url }
}

/** 생성 → 재확인 → archived 정리 → archived 재확인. 각 단계 한 줄 출력, 종료 코드 반환. */
export async function runProbe({ token = process.env.NOTION_API_TOKEN, dbId = process.env.NOTION_STATUS_LOG_DB_ID || DEFAULT_STATUS_LOG_DB_ID, log = console.log, now = new Date() } = {}) {
  const iso = now.toISOString()
  log(`대상 DB: ${dbId}${process.env.NOTION_STATUS_LOG_DB_ID ? ' (env)' : ' (기본값)'}`)
  const w = await writeStatusLog({
    date: iso.slice(0, 10), track: '기타', title: `PROBE-${iso}-삭제예정`,
    done: '연동 프로브', blocked: '', next: '', needsHuman: false, note: 'notion-status-log.mjs --probe — 곧 archived 처리됨',
  }, { token, dbId })

  let code = 0
  if (w.ok) log(`✅ 생성·재확인: ${w.pageId} (parent·제목·속성 8개 타입 일치)`)
  else {
    code = w.code
    const label = { 2: '권한 없음 — DB 에 연동 Connections 추가 필요', 3: '스키마 불일치', 1: '기타·확인 불가' }[code]
    log(`❌ ${w.stage}: ${label} — ${w.error}`)
    if (!w.pageId) { log(`PROBE_EXIT=${code}`); return code }
  }

  const arch = await notionRequest(token, 'PATCH', `/pages/${w.pageId}`, { archived: true })
  if (!arch.ok) {
    log(`❌ 정리(archived) 실패 — ${arch.error} · 수동 삭제 필요: ${w.pageId}`)
    log(`PROBE_EXIT=${code || 1}`); return code || 1
  }
  const after = await notionRequest(token, 'GET', `/pages/${w.pageId}`)
  if (!after.ok) {
    log(`❌ 정리 재확인 GET 실패 — ${after.error} · 수동 확인 필요: ${w.pageId}`)
    log(`PROBE_EXIT=${code || 1}`); return code || 1
  }
  if (after.data?.archived !== true && after.data?.in_trash !== true) {
    log(`❌ 정리 재확인: archived=${after.data?.archived} — 아직 살아 있다 · 수동 삭제 필요: ${w.pageId}`)
    log(`PROBE_EXIT=${code || 1}`); return code || 1
  }
  log('✅ 정리 재확인: archived=true')
  log(`PROBE_EXIT=${code}`)
  return code
}

/** CLI 인자 → { probe } | { entry }. 트랙·날짜 검증은 buildStatusLogProperties 한 곳에서 한다. */
export function parseCliArgs(argv, now = new Date()) {
  const { values: v } = parseArgs({
    args: argv,
    options: {
      probe: { type: 'boolean' }, track: { type: 'string' }, date: { type: 'string' },
      done: { type: 'string' }, blocked: { type: 'string' }, next: { type: 'string' },
      'needs-human': { type: 'boolean' }, note: { type: 'string' }, title: { type: 'string' },
    },
  })
  if (v.probe) return { probe: true }
  const kstToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now)
  return {
    entry: {
      date: v.date ?? kstToday, track: v.track, done: v.done, blocked: v.blocked, next: v.next,
      needsHuman: v['needs-human'] === true, note: v.note, title: v.title,
    },
  }
}

function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}
if (isMain()) {
  let args
  try { args = parseCliArgs(process.argv.slice(2)) }
  catch (e) { console.error(`❌ 인자 오류 — ${e.message}`); process.exit(1) }
  if (args.probe) process.exit(await runProbe())
  const w = await writeStatusLog(args.entry)
  if (w.ok) console.log(`✅ 기록·재확인: ${w.url ?? w.pageId}`)
  else console.error(`❌ ${w.stage}: ${w.error}${w.pageId ? ` (페이지는 생성됨: ${w.pageId})` : ''}`)
  process.exit(w.ok ? 0 : w.code)
}
