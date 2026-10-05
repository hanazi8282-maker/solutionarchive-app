#!/usr/bin/env node
// 앵글 판정 분포 체크 — `/cases/report` 앵글 검증(옵션 B, idea_angle_runs)이 "체험 기반"으로 쏠려 있는지
// 데이터가 쌓일 때마다 재고, 여전히 쏠려 있으면 Notion "일일 상태 로그" CTO 행(사람판단필요=true)으로 올린다.
//
//   node scripts/idea-angle-distribution-check.mjs          # NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · NOTION_API_TOKEN
//   node scripts/idea-angle-distribution-check.mjs --dry    # 계산·출력만. Notion 호출 0
//
// 왜 (남헌 2026-10-01): #389 프로덕션 실주행 2건의 앵글 판정이 전부 EXPERIENTIAL(선례 근거 있음 0/3)이었다.
// 프롬프트는 손대지 않는다(근거 없는 걸 있는 척 만들 위험). 대신 실행량이 쌓이면 분포를 다시 재고 알린다.
//
// 구간(창)과 "마지막 체크" 상태 — **상태를 따로 저장하지 않는다.**
//   창 경계는 done 행의 finished_at 만으로 결정론적으로 다시 계산된다: EPOCH 부터 시작해 done 이 RUNS 건 쌓이거나
//   DAYS 일이 지나면(먼저 오는 쪽) 창이 닫히고 다음 창이 그 시각에 시작한다. 그래서 "마지막 체크 이후"는 곧
//   "마지막으로 닫힌 창의 끝 이후"이고, 어느 밤 실행이 빠져도(Actions 스케줄 미발화) 다음 실행이 같은 창을 본다.
//   이미 알린 창인지는 Notion 비고의 창 표지(`idea-angle-distribution@<창 시작 ISO>`)로 확인한다 — 알린 창만 표지가 있다.
//   정상(임계 미만)·표본 부족 창은 행이 없어도 된다: 창 경계가 데이터에서 나오므로 "체크했다"는 기록이 필요 없다.
//
// 지키는 것
//   · DB 는 읽기만 한다(idea_angle_runs select). 쓰기 0줄.
//   · 정상이면 Notion 행 없음. 경보만 행을 만든다(§8 즉시 알림 체계 — 사람판단필요=true 를 그대로 탄다).
//   · 표본이 MIN_RUNS 건 미만인 창은 비율을 해석하지 않는다 — "표본 부족 N건"만 출력(§7.1).
//   · DB 를 못 읽으면 "확인 불가"를 출력하고 종료 코드 1. 조용히 넘어가지 않는다.
//   · Notion 쓰기는 upsertStatusLog 재사용(같은 날 행 멱등 · 실패/토큰 없음 → ops/state/status-log-pending 폴백 + ok:false).
//   · `알림완료` 는 쓰지도 읽지도 않는다.
//
// 종료 코드: 0 = 체크 완료(경보 기록 성공·정상·표본 부족·창 미닫힘 포함) · 1 = 확인 불가 또는 Notion 기록 실패

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { notionRequest } from './notion-api.mjs'
import { upsertStatusLog, kstDate, DEFAULT_STATUS_LOG_DB_ID } from './notion-status-log.mjs'

export const MARKER = 'idea-angle-distribution'

/** 설정 한 곳. env 로 덮는다. 수치 근거는 PR 본문(이항분포 산수). */
export function config(env = process.env) {
  const num = (k, d) => (env[k] != null && env[k] !== '' && Number.isFinite(Number(env[k])) ? Number(env[k]) : d)
  return {
    runs: num('IDEA_DIST_RUNS', 50),          // 창을 닫는 done 실행 수(남헌 제안값)
    days: num('IDEA_DIST_DAYS', 7),           // 창을 닫는 경과 일수(남헌 제안값)
    minRuns: num('IDEA_DIST_MIN_RUNS', 15),   // 이 미만이면 표본 부족(남헌 예시 5 → 15 권고: 5건이면 참값 80% 에서도 17% 오경보)
    alert: num('IDEA_DIST_ALERT', 0.9),       // EXPERIENTIAL 비율이 이 이상이면 경보(남헌 제안값)
    epoch: env.IDEA_DIST_EPOCH || '2026-09-30T15:00:00Z', // = 2026-10-01 00:00 KST, 000046 적용일
  }
}

const DAY_MS = 86_400_000

/**
 * done 실행(finished_at 오름차순 아니어도 됨) → { closed: [{start,end,reason,runs}], open: {start,runs} }.
 * 창은 [start, end). count 로 닫힌 창의 end 는 마지막 실행 시각 + 1ms.
 */
export function windows(runs, cfg, now) {
  const sorted = [...runs].filter((r) => r.finished_at).sort((a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at))
  const closed = []
  let start = Date.parse(cfg.epoch)
  let cur = []
  const closeByDays = (t) => {
    while (t >= start + cfg.days * DAY_MS) {
      closed.push({ start, end: start + cfg.days * DAY_MS, reason: 'days', runs: cur })
      start += cfg.days * DAY_MS
      cur = []
    }
  }
  for (const r of sorted) {
    const t = Date.parse(r.finished_at)
    if (t < start) continue
    closeByDays(t)
    cur.push(r)
    if (cur.length >= cfg.runs) {
      closed.push({ start, end: t + 1, reason: 'count', runs: cur })
      start = t + 1
      cur = []
    }
  }
  closeByDays(now.getTime())
  return { closed, open: { start, runs: cur } }
}

/** 실행들 → 앵글 단위 판정 분포 + 실행 단위 참고치. 어휘는 lib/cases/idea-angles.ts IdeaVerdict. */
export function distribution(runs) {
  const d = { runs: runs.length, angles: 0, SUBSTANTIATED: 0, EXPERIENTIAL: 0, other: 0, allExperientialRuns: 0 }
  for (const r of runs) {
    const angles = Array.isArray(r.angles) ? r.angles : []
    for (const a of angles) {
      d.angles++
      if (a?.verdict === 'SUBSTANTIATED' || a?.verdict === 'EXPERIENTIAL') d[a.verdict]++
      else d.other++
    }
    if (angles.length > 0 && angles.every((a) => a?.verdict === 'EXPERIENTIAL')) d.allExperientialRuns++
  }
  const rate = (x, n) => (n > 0 ? x / n : null)
  d.experientialRate = rate(d.EXPERIENTIAL, d.angles)
  d.substantiatedRate = rate(d.SUBSTANTIATED, d.angles)
  d.otherRate = rate(d.other, d.angles)
  d.allExperientialRunRate = rate(d.allExperientialRuns, d.runs)
  return d
}

/** 닫힌 창 하나 → 'insufficient' | 'alert' | 'healthy'. */
export function judge(dist, cfg) {
  if (dist.runs < cfg.minRuns || dist.angles === 0) return 'insufficient'
  if (dist.experientialRate >= cfg.alert) return 'alert'
  return 'healthy'
}

const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
const kst = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')

export function describe(w, dist) {
  return `창 ${kst(w.start)}~${kst(w.end)} KST(${w.reason === 'count' ? '실행 수' : '경과 일수'}로 닫힘) · done ${dist.runs}건 · 앵글 ${dist.angles}개 · ` +
    `체험 기반 ${dist.EXPERIENTIAL}(${pct(dist.experientialRate)}) · 선례 근거 있음 ${dist.SUBSTANTIATED}(${pct(dist.substantiatedRate)}) · ` +
    `기타 ${dist.other}(${pct(dist.otherRate)}) · 참고: 앵글 전부 체험 기반인 실행 ${dist.allExperientialRuns}/${dist.runs}(${pct(dist.allExperientialRunRate)})`
}

export const windowMarker = (w) => `${MARKER}@${new Date(w.start).toISOString()}`

export function buildAlertEntry({ date, w, dist, cfg, now, runUrl }) {
  const at = `${kst(now.getTime()).slice(11)} KST`
  return {
    date,
    track: 'CTO',
    done: `[${at}] 앵글 판정 분포 체크 — 체험 기반 ${pct(dist.experientialRate)} ≥ 임계 ${pct(cfg.alert)} (앵글 ${dist.angles}개 · done ${dist.runs}건)`,
    blocked: `[${at}] ${describe(w, dist)}${runUrl ? ` · 실행 ${runUrl}` : ''}`,
    next: `[${at}] 프롬프트를 손볼지 CTO 세션이 판단 — 지금 판정 대부분이 "체험 기반"이라 선례 근거 판정이 거의 나오지 않는다(남헌 2026-10-01: 근거 없이 있는 척 만들지 않는다)`,
    needsHuman: false, // 분포 경보는 사실 보고(v17)
    note: `${windowMarker(w)} · 임계 ${cfg.alert} · 최소 표본 ${cfg.minRuns} · ${runUrl ?? '로컬 실행(run URL 없음)'}`,
  }
}

/** 창 표지가 비고에 든 행이 (날짜 무관) 이미 있나. { ok, hit } | { ok:false, error } */
export async function alreadyAlerted(token, dbId, marker) {
  const q = await notionRequest(token, 'POST', `/databases/${dbId}/query`, { filter: { property: '비고', rich_text: { contains: marker } }, page_size: 1 })
  if (!q.ok || !Array.isArray(q.data?.results)) return { ok: false, error: q.error ?? 'results 배열 없음' }
  return { ok: true, hit: q.data.results.length > 0 }
}

/**
 * 한 번 체크. throw 하지 않는다. 반환 { ok, status, message, entry?, record? }.
 * status: unknown(확인 불가) · waiting(닫힌 창 없음) · insufficient · healthy · alert · already · dry
 * @param loadRuns async () => [{ id, finished_at, angles }] (status='done' 만) — throw 하면 확인 불가
 */
export async function runCheck({ loadRuns, cfg = config(), now = new Date(), date = kstDate(now), runUrl = null, dry = false,
  token = process.env.NOTION_API_TOKEN, dbId = process.env.NOTION_STATUS_LOG_DB_ID || DEFAULT_STATUS_LOG_DB_ID, pendingDir = null, upsert = upsertStatusLog }) {
  let runs
  try { runs = await loadRuns() } catch (e) {
    return { ok: false, status: 'unknown', message: `확인 불가 — idea_angle_runs 를 못 읽었다(${e?.message ?? e}). 이번 체크는 판정하지 않았다` }
  }
  const { closed, open } = windows(runs, cfg, now)
  // ponytail: 마지막으로 닫힌 창 하나만 본다. 두 밤 사이에 창이 두 개 닫히면(하루 100건+) 앞 창은 건너뛴다 — 그 정도 양이면 뒤 창이 같은 신호를 준다.
  const w = closed.at(-1)
  if (!w) {
    return { ok: true, status: 'waiting', message: `닫힌 창 없음 — 현재 창 ${kst(open.start)} KST 부터 done ${open.runs.length}/${cfg.runs}건, ${((now.getTime() - open.start) / DAY_MS).toFixed(1)}/${cfg.days}일` }
  }
  const dist = distribution(w.runs)
  const verdict = judge(dist, cfg)
  if (verdict === 'insufficient') return { ok: true, status: 'insufficient', message: `표본 부족 ${dist.runs}건(최소 ${cfg.minRuns}) — 비율을 해석하지 않는다 · ${describe(w, dist)}` }
  if (verdict === 'healthy') return { ok: true, status: 'healthy', message: `정상(체험 기반 ${pct(dist.experientialRate)} < ${pct(cfg.alert)}) — 행 없음 · ${describe(w, dist)}` }

  const entry = buildAlertEntry({ date, w, dist, cfg, now, runUrl })
  if (dry) return { ok: true, status: 'dry', message: `[dry] 경보 — Notion 에 쓰지 않음 · ${describe(w, dist)}`, entry }
  const marker = windowMarker(w)
  if (token) {
    const seen = await alreadyAlerted(token, dbId, marker)
    // 조회 실패면 아래 upsert 로 넘긴다 — upsert 가 같은 날 행을 다시 조회하고, 그것도 실패하면 폴백 파일 + ok:false 다.
    if (seen.ok && seen.hit) return { ok: true, status: 'already', message: `이미 알린 창(${marker}) — 새 행 없음` }
  }
  const record = await upsert(entry, { marker, token, dbId, pendingDir })
  const ok = record.ok === true
  return { ok, status: 'alert', entry, record,
    message: ok ? `경보 기록 ${record.url ?? record.pageId} · ${describe(w, dist)}`
      : `경보 기록 실패(${record.stage}: ${record.error})${record.pendingPath ? ` — 폴백 ${record.pendingPath}` : ''} · ${describe(w, dist)}` }
}

/** done 행 전부(EPOCH 이후). PostgREST 1000행 상한 때문에 range 로 넘긴다. 읽기 전용. */
async function loadDoneRuns(epoch) {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('idea_angle_runs').select('id, finished_at, angles')
      .eq('status', 'done').gte('finished_at', epoch).order('finished_at', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`.trim())
    out.push(...data)
    if (data.length < 1000) return out
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const { PENDING_DIR } = await import('./notion-status-log-flush.mjs')
  const cfg = config()
  const e = process.env
  const runUrl = e.GITHUB_RUN_ID ? `${e.GITHUB_SERVER_URL}/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}` : null
  const r = await runCheck({ loadRuns: () => loadDoneRuns(cfg.epoch), cfg, runUrl, dry: process.argv.includes('--dry'), pendingDir: PENDING_DIR })
  ;(r.ok ? console.log : console.error)(`[idea-angle-distribution] ${r.status}: ${r.message}`)
  if (r.entry && r.status === 'dry') console.log(JSON.stringify(r.entry, null, 2))
  process.exit(r.ok ? 0 : 1)
}
