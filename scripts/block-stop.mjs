#!/usr/bin/env node
// 차단 시 즉시 정지 — CLAUDE.md §10.1 "차단 시 즉시 정지"(남헌 2026-10-14, v70 §1-3, 2026-10-15 개정) 조건 1~6 의 구현 한 파일.
//
// 하는 일: review_sources.enabled 를 true → false 로만 바꾼다. 쓰는 칸은 enabled·disabled_reason·disabled_at 세 개뿐(ALLOWED_COLS, guardPatch).
//   대상(조건 1)  override='owner_2026-10-14' ∧ 지금 enabled=true 인 소스만. 앱스토어·구글 플레이·다나와 등은 override 가 달라 대상이 아니다.
//   사유(조건 2)  (a) 기술 차단 — 최근 비-dry-run 실행이 blocked_responses>0 이고(그래서 HALT_ON_BLOCK_SOURCES soft-skip 이 걸린 상태),
//                    그 뒤 정기 슬롯(기존 2슬롯, lib/review/ramp.ts LEGACY_SLOTS)이 STOP_SLOTS(3)개 이상 지났다. 5xx·타임아웃은
//                    blocked_responses 에 안 들어가므로 사유가 될 수 없다.
//                 (b) 중지 요청·경고·법적 통지 — 기계가 판정하지 않는다. 사람이 Notion 에 올린 것을 --notice <key>=<url> 로 받는다.
//   확인 불가(실행 기록·Actions 이력·다른 소스 실행 행을 못 읽음, 차단 수치 null)는 정지하지 않는다(§7.1).
//   조건 3  disabled_reason 에 사유·실행 URL, 같은 UPDATE 에서 disabled_at(review_sources_disabled_needs_reason CHECK).
//   조건 4  쓴 즉시 Notion 일일 상태 로그 CTO 행. 사람판단필요 = 통지 사유가 하나라도 있을 때만 true, 단순 차단 정지는 false.
//           매일 행의 "[꺼진 소스]" 칸은 review-collect.mjs 가 loadOffSources 로 읽어 review-collect-status.mjs 가 적는다.
//   조건 5  켜는 것은 사람만. 이 파일에는 enabled=true·override·health 를 쓰는 코드가 없다(셀프테스트가 고정). 롤백 SQL 은 사람용 파일이다.
//
// soft-skip 슬롯을 어떻게 세나: soft-skip 은 DB 에 아무것도 안 남긴다(실행 행 없음, lib/review/latest-health.ts). 그래서 두 출처를 맞춘다.
//   ① GitHub Actions 의 nightly-review-collect 스케줄 실행(event=schedule, 결론 success/failure)으로 생성 시각이 기존 2슬롯 창에 드는 것,
//   ② 그 실행 시간 안에 다른 소스의 비-dry-run 실행 행이 있다(= 그 슬롯이 실제로 소스 루프를 돌았다).
//   ①∧② 이고 그동안 이 소스의 새 실행 행이 없으면(최신 행이 여전히 차단 행) 그 슬롯은 이 소스를 soft-skip 한 것이다.
//
// 사용법:
//   node scripts/block-stop.mjs                          # 드라이런(기본): 판정·disabled_reason·롤백 SQL 출력. 쓰기 0
//   node scripts/block-stop.mjs --apply                  # 롤백 파일(reports/<KST>/) 먼저 쓰고 → UPDATE → Notion 행
//   node scripts/block-stop.mjs --notice <key>=<url>     # 사람이 Notion 에 올린 중지 요청·경고·법적 통지(여러 번 가능)
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · NOTION_API_TOKEN · (선택) GITHUB_TOKEN/GH_TOKEN · GITHUB_REPOSITORY · GITHUB_RUN_ID
// ⚠️ 워크플로에 배선돼 있지 않다(2026-10-15) — 배선은 별도 판단.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { softSkipDecision, SOFT_SKIP_STREAK } from '../lib/review/latest-health.ts'
import { recordStatusLog, kstDate } from './notion-status-log.mjs'
import { PENDING_DIR } from './notion-status-log-flush.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const TARGET_OVERRIDE = 'owner_2026-10-14'
export const ALLOWED_COLS = Object.freeze(['enabled', 'disabled_reason', 'disabled_at'])
export const STOP_SLOTS = 3
export const WORKFLOW_FILE = 'nightly-review-collect.yml'
const DEFAULT_REPO = 'hanazi8282-maker/solutionarchive-app'

/** UPDATE patch 검사 — 화이트리스트 밖 칸, true 방향, 사유·시각 누락이면 throw. 모든 UPDATE 가 이걸 지난다. */
export function guardPatch(patch) {
  const extra = Object.keys(patch ?? {}).filter((k) => !ALLOWED_COLS.includes(k))
  if (extra.length) throw new Error(`block-stop: 허용 밖 칸 — ${extra.join(', ')} (허용: ${ALLOWED_COLS.join(', ')})`)
  if (patch.enabled !== false) throw new Error('block-stop: enabled 는 false 로만 쓴다(한 방향)')
  if (typeof patch.disabled_reason !== 'string' || !patch.disabled_reason.trim()) throw new Error('block-stop: disabled_reason 이 비었다')
  if (typeof patch.disabled_at !== 'string' || Number.isNaN(Date.parse(patch.disabled_at))) throw new Error('block-stop: disabled_at 이 없다')
  return patch
}

/** 조건 1 — 대상 소스인가. */
export const isTarget = (s) => s?.override === TARGET_OVERRIDE && s?.enabled === true

/**
 * 기존 2슬롯(UTC 05:37 · 17:37) 의 스케줄 실행인가 — Actions API 는 cron 문자열을 안 준다. 생성 시각으로 가른다.
 * 창 = 기존 슬롯 시각 ~ 다음 추가 슬롯 시각(09:29 · 20:47). 추가 슬롯은 자기 시각 전엔 생성되지 않아 이 창에 못 든다.
 * ponytail: 01:43 추가 슬롯이 3시간 54분 넘게 밀리면 05:37 창에 들어와 기존 슬롯으로 오인된다. 그런 지연이 보이면 실행 로그의 COLLECT_SLOT 대조로 바꾼다.
 */
export function isLegacySlotRun(createdAt) {
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return false
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  return (m >= 5 * 60 + 37 && m < 9 * 60 + 29) || (m >= 17 * 60 + 37 && m < 20 * 60 + 47)
}

/**
 * 조건 2(a) 판정. 순수 함수.
 * @param runs  이 소스의 최근 비-dry-run 실행 행(SoftSkipRow) 또는 null(못 읽음)
 * @param actionsRuns nightly-review-collect 실행 목록(GitHub API workflow_runs) 또는 null
 * @param otherRows 차단 실행 이후 다른 소스의 비-dry-run 실행 행 [{ source_key, started_at }] 또는 null
 * @returns { state: 'stop'|'hold'|'unknown', reason, slots: [html_url], blockedAt }
 */
export function judgeBlockStop({ key, runs, actionsRuns, otherRows, now = Date.now() }) {
  const ss = softSkipDecision(runs, runs ? null : '실행 기록 없음', now, key)
  if (ss.state === 'unknown') return { state: 'unknown', reason: ss.reason, slots: [] }
  const latest = [...runs].filter((r) => r.dry_run !== true).sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  if (ss.state !== 'skip' || !latest || !(latest.blocked_responses > 0)) {
    return { state: 'hold', reason: `차단 soft-skip 상태 아님 — ${ss.reason}`, slots: [] }
  }
  const blockedAt = latest.started_at
  if (!Array.isArray(actionsRuns)) return { state: 'unknown', reason: 'Actions 실행 이력 확인 불가 — 정지 안 함', slots: [], blockedAt }
  if (!Array.isArray(otherRows)) return { state: 'unknown', reason: '다른 소스 실행 행 확인 불가 — 정지 안 함', slots: [], blockedAt }
  const slots = actionsRuns
    .filter((a) => a.event === 'schedule' && (a.conclusion === 'success' || a.conclusion === 'failure'))
    .filter((a) => a.created_at > blockedAt && isLegacySlotRun(a.created_at))
    .filter((a) => {
      const from = a.run_started_at ?? a.created_at
      return otherRows.some((r) => r.source_key !== key && r.started_at >= from && r.started_at <= a.updated_at)
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const urls = slots.map((a) => a.html_url)
  if (slots.length < STOP_SLOTS) {
    return { state: 'hold', reason: `차단(${blockedAt.slice(0, 16)}Z) 뒤 soft-skip 정기 슬롯 ${slots.length}개(<${STOP_SLOTS})`, slots: urls, blockedAt }
  }
  return {
    state: 'stop',
    reason: `차단 응답 ${latest.blocked_responses}건(${blockedAt.slice(0, 16)}Z 실행) 뒤 soft-skip 정기 슬롯 ${slots.length}개 연속`,
    slots: urls,
    blockedAt,
  }
}

/** --notice key=url 파싱. url 은 http(s) 여야 한다. */
export function parseNotices(argv) {
  const out = new Map()
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i] === '--notice' ? argv[++i] : argv[i].startsWith('--notice=') ? argv[i].slice(9) : null
    if (v === null) continue
    const m = /^([a-z0-9_]+)=(https?:\/\/\S+)$/.exec(v ?? '')
    if (!m) throw new Error(`--notice 는 <source_key>=<http(s) URL> 형식이다: ${v}`)
    out.set(m[1], m[2])
  }
  return out
}

/** disabled_reason 문구(조건 3 — 사유 + 실행 URL). */
export function reasonText({ kind, detail, urls, runUrl }) {
  const head = kind === 'notice' ? '[block-stop] 중지 요청·경고·법적 통지(사람이 Notion 에 올림)' : '[block-stop] 차단 정지'
  return `${head} — ${detail} · 근거 ${urls.join(' ') || '(없음)'} · 실행 ${runUrl ?? '로컬 실행(run URL 없음)'} · 켜기는 사람만`
}

const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

/** 사람용 롤백 SQL — 이전 값 그대로 되돌린다. 이 스크립트는 이 SQL 을 실행하지 않는다. */
export function rollbackSql(stops, stamp) {
  return [
    `-- block-stop 롤백 ${stamp} — 사람이 실행한다(CLAUDE.md §10.1 조건 5: 켜는 것은 사람만). 기계는 실행하지 않는다.`,
    '-- 각 행은 block-stop 이 끈 그대로일 때만 바뀐다(enabled=false ∧ disabled_reason 이 block-stop 이 쓴 값).',
    'BEGIN;',
    ...stops.map((s) => `UPDATE public.review_sources SET enabled = true, disabled_reason = ${lit(s.prev.disabled_reason)}, disabled_at = ${lit(s.prev.disabled_at)} WHERE key = ${lit(s.key)} AND enabled = false AND disabled_reason = ${lit(s.patch.disabled_reason)};`),
    'COMMIT;',
    `-- 확인: SELECT key, enabled, disabled_reason, disabled_at FROM public.review_sources WHERE key IN (${stops.map((s) => lit(s.key)).join(', ')});`,
    '',
  ].join('\n')
}

/** 파일을 쓰고 되읽어 같은지 본다(target-revive 와 같은 패턴). 못 쓰면 throw → UPDATE 안 함. */
export function writeVerified(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
  if (fs.readFileSync(file, 'utf8') !== body) throw new Error(`파일 되읽기 불일치: ${file} — UPDATE 하지 않았다`)
}

/** 매일 행 "[꺼진 소스]" 칸 재료 — override 대상 중 꺼진 소스. 읽기만. 못 읽으면 null(확인 불가). throw 하지 않는다. */
export async function loadOffSources(sb) {
  try {
    const { data, error } = await sb.from('review_sources').select('key, disabled_at, disabled_reason')
      .eq('override', TARGET_OVERRIDE).eq('enabled', false).order('key', { ascending: true })
    return error ? null : (data ?? [])
  } catch { return null }
}

/** Notion 행 입력(조건 4). 순수 함수. */
export function buildStopEntry({ date, stops, rollbackPath, runUrl }) {
  const needsHuman = stops.some((s) => s.kind === 'notice')
  return {
    date,
    track: 'CTO',
    done: `차단 시 즉시 정지 — ${stops.length}곳 enabled=false: ${stops.map((s) => s.key).join(', ')}`,
    blocked: stops.map((s) => `꺼진 소스 ${s.key}: ${s.patch.disabled_reason}`).join('\n'),
    next: `켜기는 사람만 — 롤백 SQL ${rollbackPath}${needsHuman ? ' · 통지 사유: 대응 판단 필요' : ''}`,
    needsHuman,
    note: `[block-stop] ${runUrl ?? '로컬 실행(run URL 없음)'} · CLAUDE.md §10.1 차단 시 즉시 정지`,
  }
}

async function fetchActionsRuns(sinceIso) {
  const repo = process.env.GITHUB_REPOSITORY || DEFAULT_REPO
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=schedule&per_page=100&created=${encodeURIComponent('>=' + sinceIso)}`
  try {
    const res = await fetch(url, { headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) } })
    if (!res.ok) return null
    const j = await res.json()
    return Array.isArray(j.workflow_runs) ? j.workflow_runs : null
  } catch { return null }
}

export async function main(argv, { db, now = new Date(), fetchRuns = fetchActionsRuns, record = recordStatusLog, outDir = path.join(repoRoot, 'reports') } = {}) {
  const apply = argv.includes('--apply')
  const notices = parseNotices(argv)
  const runUrl = process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null
  const log = (s) => console.log(s)
  const sb = db ?? (await (await import('../lib/supabase/server.ts')).createClient())
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')

  const { data: sources, error } = await sb.from('review_sources').select('key, enabled, override, disabled_reason, disabled_at').eq('override', TARGET_OVERRIDE)
  if (error || !Array.isArray(sources)) throw new Error(`review_sources 확인 불가 — ${error?.message ?? '응답 없음'} (정지 안 함)`)
  const targets = sources.filter(isTarget)
  for (const k of notices.keys()) if (!targets.some((s) => s.key === k)) log(`- ${k}: --notice 대상 아님(override≠${TARGET_OVERRIDE} 또는 이미 꺼짐) — 정지 안 함`)

  const stops = []
  for (const s of targets) {
    let kind, detail, urls
    if (notices.has(s.key)) {
      kind = 'notice'; detail = `${s.key} 사이트 통지`; urls = [notices.get(s.key)]
    } else {
      const r = await sb.from('review_collection_runs')
        .select('source_key, started_at, finished_at, status, dry_run, health_after, reviews_parsed, parse_failures, blocked_responses')
        .eq('source_key', s.key).eq('dry_run', false).order('started_at', { ascending: false }).limit(SOFT_SKIP_STREAK)
      const runs = r.error ? null : r.data
      const pre = judgeBlockStop({ key: s.key, runs, actionsRuns: [], otherRows: [], now: now.getTime() })
      let v = pre
      if (pre.blockedAt) {
        const [actionsRuns, other] = await Promise.all([
          fetchRuns(pre.blockedAt),
          sb.from('review_collection_runs').select('source_key, started_at').eq('dry_run', false).neq('source_key', s.key).gte('started_at', pre.blockedAt).limit(5000),
        ])
        v = judgeBlockStop({ key: s.key, runs, actionsRuns, otherRows: other.error ? null : other.data, now: now.getTime() })
      }
      log(`- ${s.key}: ${v.state} — ${v.reason}`)
      if (v.state !== 'stop') continue
      kind = 'block'; detail = `${s.key} ${v.reason}`; urls = v.slots
    }
    const patch = guardPatch({ enabled: false, disabled_reason: reasonText({ kind, detail, urls, runUrl }), disabled_at: now.toISOString() })
    stops.push({ key: s.key, kind, patch, prev: { disabled_reason: s.disabled_reason ?? null, disabled_at: s.disabled_at ?? null } })
  }

  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
  const out = path.join(outDir, kstDate(now), `block-stop-rollback-${stamp}.sql`)
  const sql = rollbackSql(stops, stamp)
  log(`${apply ? 'APPLY' : 'DRY'} 정지 대상 ${stops.length}곳${stops.length ? `: ${stops.map((x) => `${x.key}(${x.kind})`).join(', ')}` : ''}`)
  if (!apply || stops.length === 0) {
    if (stops.length) log(`\n-- 롤백 SQL(적용 때 ${path.relative(repoRoot, out)} 에 먼저 쓴다) --\n${sql}`)
    return { stops, applied: null, out: null }
  }

  // 1) 롤백 파일 먼저. 못 쓰면 throw → UPDATE 없음.
  writeVerified(out, sql)
  log(`롤백 파일: ${out}`)
  // 2) UPDATE — 조건을 다시 건다(그새 꺼졌거나 override 가 바뀐 행은 안 건드린다).
  const applied = []
  for (const st of stops) {
    const { data, error: e } = await sb.from('review_sources').update(guardPatch(st.patch))
      .eq('key', st.key).eq('enabled', true).eq('override', TARGET_OVERRIDE).select('key, enabled')
    if (e) { log(`❌ ${st.key}: UPDATE 실패 — ${e.message}`); continue }
    if (data?.length === 1 && data[0].enabled === false) applied.push(st)
    else log(`⚠️ ${st.key}: 바뀐 행 ${data?.length ?? 0}개 — 그새 상태가 바뀌었다(건너뜀)`)
  }
  if (applied.length !== stops.length) writeVerified(out, rollbackSql(applied, stamp))
  // 3) Notion 일일 상태 로그(조건 4). 실패는 폴백 파일 + 종료 코드 1.
  let w = { ok: true }
  if (applied.length) {
    w = await record(buildStopEntry({ date: kstDate(now), stops: applied, rollbackPath: path.relative(repoRoot, out), runUrl }), { pendingDir: PENDING_DIR })
    log(w.ok ? `✅ Notion 일일 상태 로그(CTO) ${w.title} 기록·재확인` : `❌ Notion 기록 실패 — ${w.stage}: ${w.error}${w.pendingPath ? ` · 폴백 ${w.pendingPath}` : ''}`)
  }
  return { stops, applied, out, notionOk: w.ok }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).then((r) => process.exit(r.notionOk === false ? 1 : 0)).catch((e) => {
    console.error(`❌ block-stop: ${e.message}`)
    process.exit(1)
  })
}
