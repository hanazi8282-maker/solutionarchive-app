#!/usr/bin/env node
// 자율 발굴 C-1 ③(남헌 v56 §C-1 · v61) — 채택 직후 3일 이내 이상 반응(리뷰 급증·별점 급락) 감지. 오케스트레이터는 scripts/discovery-c1.mjs.
//
// 대상 = 등재 3일 이내 타깃: reports/window-adopted.json(창문 자동 등재 adopted·kept) + reports/board-discovery.json(proposed 중 적용돼 registered_at 이 채워진 것).
// 재료 = review_fingerprints(source_key, product_ref, written_at, analysis_input_id) → analysis_inputs.rating. **SELECT 만.**
// 규칙(작성일 기준 — 첫 수집이 옛 글을 한꺼번에 가져오는 것을 급증으로 읽지 않으려고 first_seen_at 을 쓰지 않는다):
//   급증 = 최근 2일(오늘·어제) 작성 ≥ SURGE_MIN ∧ 하루 평균 ≥ SURGE_RATIO × 그 전 14일 하루 평균
//   급락 = 최근 3일 별점 평균 ≤ 그 전 30일 평균 − DROP (표본 최근 ≥5 · 이전 ≥10, 모자라면 '별점 표본 부족' — 경보 아님)
//   수집분 0 = 확인 불가(§7.1 — '이상 없음'으로 접지 않는다)
// 출력 = 경보가 있을 때만 Notion 일일 상태 로그 한 줄(사람판단필요=false, marker 'adoption-anomaly' — 기존 upsert+대기파일 폴백 패턴).
//   임계값은 2026-10-12 초기값이다 — 실데이터 보정 전.

export const WATCH_DAYS = 3
export const SURGE_MIN = 10
export const SURGE_RATIO = 3
export const DROP = 1.0
export const MIN_RECENT_RATED = 5
export const MIN_BASE_RATED = 10
const DAY_MS = 86_400_000

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)

/** 감시 목록 — 등재 WATCH_DAYS 이내만. */
export function watchList({ windowLedger, boardLedger }, now) {
  const out = []
  const add = (e, kind) => {
    if (!e.registered_at || !e.source_key || !e.product_ref) return
    const age = now.getTime() - Date.parse(e.registered_at)
    if (!(age >= 0 && age <= WATCH_DAYS * DAY_MS)) return
    out.push({ kind, source_key: e.source_key, product_ref: e.product_ref, label: e.label ?? e.product_ref, registered_at: e.registered_at })
  }
  for (const e of windowLedger?.entries ?? []) if (['adopted', 'kept'].includes(e.status)) add(e, 'window')
  for (const e of boardLedger?.entries ?? []) if (e.status === 'proposed') add(e, 'board')
  return out
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

/** 타깃 하나 판정. rows = [{written_at:'YYYY-MM-DD'|null, rating:number|null}]. */
export function detect(rows, now) {
  const t = now.getTime()
  const d = (n) => ymd(t - n * DAY_MS)
  const dated = rows.filter((r) => typeof r.written_at === 'string')
  if (dated.length === 0) return { state: 'unverified', alerts: [], notes: ['작성일 있는 수집분 0'] }
  const alerts = []
  const notes = []
  const recent = dated.filter((r) => r.written_at >= d(1)).length
  const base = dated.filter((r) => r.written_at >= d(15) && r.written_at <= d(2)).length / 14
  if (recent >= SURGE_MIN && recent / 2 >= SURGE_RATIO * base) alerts.push(`리뷰 급증 ${recent}건/2일(이전 14일 하루 ${base.toFixed(1)})`)
  const rated = (from, to) => dated.filter((r) => typeof r.rating === 'number' && r.written_at >= from && r.written_at <= to).map((r) => r.rating)
  const rNow = rated(d(2), d(0))
  const rBase = rated(d(32), d(3))
  if (rNow.length >= MIN_RECENT_RATED && rBase.length >= MIN_BASE_RATED) {
    const a = mean(rNow)
    const b = mean(rBase)
    if (a <= b - DROP) alerts.push(`별점 급락 ${b.toFixed(2)} → ${a.toFixed(2)}(최근 3일 n=${rNow.length})`)
  } else notes.push(`별점 표본 부족(최근 ${rNow.length}·이전 ${rBase.length})`)
  return { state: alerts.length ? 'alert' : 'ok', alerts, notes }
}

/** 감시 목록 전체 판정. rowsByKey: Map(`source|ref` → rows) — 키가 없으면 그 타깃은 못 읽은 것(확인 불가). */
export function evaluate(watch, rowsByKey, now) {
  return watch.map((w) => {
    const rows = rowsByKey.get(`${w.source_key}|${w.product_ref}`)
    return { ...w, ...(rows ? detect(rows, now) : { state: 'unverified', alerts: [], notes: ['조회 실패'] }) }
  })
}

/** Notion 한 줄(경보 있는 타깃만). 없으면 null. */
export function notionLine(results) {
  const hits = results.filter((r) => r.state === 'alert')
  if (!hits.length) return null
  return `이상 반응(채택 3일 이내): ${hits.map((r) => `${r.label} — ${r.alerts.join(' · ')}`).join(' / ')}`
}

export function anomalyLine(results) {
  const n = (s) => results.filter((r) => r.state === s).length
  return `이상 반응: 감시 ${results.length} · 경보 ${n('alert')} · 정상 ${n('ok')} · 확인 불가 ${n('unverified')}`
}

/** DB 읽기(SELECT 만). 실패한 타깃은 Map 에 넣지 않는다 → evaluate 가 확인 불가로 센다. */
export async function loadRows(sb, watch, now, log = console.error) {
  const since = ymd(now.getTime() - 33 * DAY_MS)
  const out = new Map()
  for (const w of watch) {
    const { data: fps, error } = await sb
      .from('review_fingerprints')
      .select('written_at, analysis_input_id')
      .eq('source_key', w.source_key)
      .eq('product_ref', w.product_ref)
      .gte('written_at', since)
      .limit(5000)
    if (error || !Array.isArray(fps) || fps.length >= 5000) { log(`⚠️ review_fingerprints 확인 불가(${w.product_ref}): ${error?.message ?? (Array.isArray(fps) ? '5000행 이상(잘렸을 수 있음)' : '배열 아님')}`); continue }
    const ids = fps.map((f) => f.analysis_input_id).filter(Boolean)
    const rating = new Map()
    let ok = true
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error: e2 } = await sb.from('analysis_inputs').select('id, rating').in('id', ids.slice(i, i + 100))
      if (e2 || !Array.isArray(data)) { ok = false; log(`⚠️ analysis_inputs 확인 불가(${w.product_ref}): ${e2?.message ?? '배열 아님'}`); break }
      for (const r of data) rating.set(r.id, r.rating)
    }
    if (ok) out.set(`${w.source_key}|${w.product_ref}`, fps.map((f) => ({ written_at: f.written_at, rating: rating.get(f.analysis_input_id) ?? null })))
  }
  return out
}
