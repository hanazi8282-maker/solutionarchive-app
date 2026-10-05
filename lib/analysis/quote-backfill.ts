// 옛 인용(source_key 없음) 입력 대조 백필 — 남헌 v23 4·5-c(2026-10-06), 설계 reports/2026-10-06/design-report-v22.md §3-4.
//
// 대상: analysis_aspects.evidence_quotes(jsonb 배열 [{ text, source_type, source_key? }]) 중 source_key 가 없는 항목.
// 하는 일: 같은 프로젝트의 analysis_inputs.raw_text 와 대조해 항목에 키 3개를 **더한다**. text·source_type·배열 순서는 안 건드린다
//   (evidence_quotes_ko 가 인덱스로 짝지어져 있다).
//   - verified: 'full'   — isVerbatimExcerpt(#418 고객 화면 규칙: 공백 정규화·'…' 조각 순서)를 통과한 입력이 있다
//               'prefix' — 전문은 안 맞고 앞 20자만 맞다(저장 시 normalizeEvidenceQuotes 와 같은 기준)
//               'purged' — 보존 원문 어디에도 없고, 그 프로젝트에 원문이 폐기된 입력(raw_text NULL)이 있다 → 거기서 나왔을 수 있다
//               'none'   — 보존 원문 어디에도 없고 폐기 입력도 없다(지어냈거나 입력이 지워졌다)
//   - source_key: full·prefix 이고 찾은 입력에 source_key 가 있을 때만
//   - backfill: BACKFILL_TAG — 되돌리기 표식. rollbackQuotes 는 이 표식이 있는 항목에서 세 키를 떼어 원값으로 돌린다.
// none·purged 는 지우지 않는다 — 후속 요약 대체 PR 이 이 표시를 보고 요약으로 바꾼다.
// publicQuotes 는 source_key 없는 항목을 계속 뺀다 — none·purged 는 이 백필 뒤에도 고객 화면에 안 나간다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(scripts/quote-backfill.mjs). `@/` 별칭·enum 을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isVerbatimExcerpt, squash, QUOTE_PREFIX_CHARS, QUOTE_BACKFILL_TAG } from './evidence-quotes.ts'

/** 고객 화면(publicLines)이 verified='full' ∧ 이 표식을 원문 대조 대신 믿는다(isBackfillVerified) — 값을 바꾸면 그 신뢰가 끊긴다. */
export const BACKFILL_TAG = QUOTE_BACKFILL_TAG
export type Verified = 'full' | 'prefix' | 'none' | 'purged'

export interface BackfillInput { source_key?: string | null; source_type?: string | null; raw_text?: string | null }
export interface AspectRow { id: string; project_id: string; evidence_quotes: unknown }
type Item = Record<string, unknown>

const isObj = (v: unknown): v is Item => typeof v === 'object' && v !== null && !Array.isArray(v)
/** 백필 대상 = 글이 있는 객체 ∧ source_key 없음 ∧ 아직 백필 안 함. */
export const isLegacy = (q: unknown): q is Item =>
  isObj(q) && typeof q.text === 'string' && typeof q.source_key !== 'string' && q.backfill !== BACKFILL_TAG

/** 원문 목록을 한 번만 눕혀 둔다(인용마다 다시 squash 하지 않는다). raw_text NULL = 폐기된 원문. */
export function prepareInputs(inputs: readonly BackfillInput[]) {
  const kept = inputs.filter((i) => typeof i.raw_text === 'string' && i.raw_text)
    .map((i) => ({ input: i, flat: squash(i.raw_text as string) }))
  return { kept, hasPurged: inputs.some((i) => i.raw_text == null) }
}
export type Prepared = ReturnType<typeof prepareInputs>

/** 인용 하나 → 판정 + 찾은 입력. 먼저 맞은 입력(호출부가 created_at 순으로 준다)을 쓴다. */
export function classifyQuote(text: string, p: Prepared): { verified: Verified; input: BackfillInput | null } {
  const flat = squash(text)
  if (flat.length >= 2) {
    const full = p.kept.find((k) => isVerbatimExcerpt(flat, k.flat))
    if (full) return { verified: 'full', input: full.input }
    const probe = flat.slice(0, QUOTE_PREFIX_CHARS)
    const pre = p.kept.find((k) => k.flat.includes(probe))
    if (pre) return { verified: 'prefix', input: pre.input }
  }
  return { verified: p.hasPurged ? 'purged' : 'none', input: null }
}

export interface QuoteResult { verified: Verified; source_key: string | null }

/** 속성 하나의 인용 배열 → 새 배열(바뀐 게 없으면 changed=false). 원본 배열·객체는 변형하지 않는다. */
export function planQuotes(quotes: unknown, p: Prepared): { next: unknown; changed: boolean; results: QuoteResult[] } {
  if (!Array.isArray(quotes)) return { next: quotes, changed: false, results: [] }
  const results: QuoteResult[] = []
  const next = quotes.map((q) => {
    if (!isLegacy(q)) return q
    const { verified, input } = classifyQuote(q.text as string, p)
    const key = typeof input?.source_key === 'string' && input.source_key ? input.source_key : null
    results.push({ verified, source_key: key })
    return key ? { ...q, verified, source_key: key, backfill: BACKFILL_TAG } : { ...q, verified, backfill: BACKFILL_TAG }
  })
  return { next, changed: results.length > 0, results }
}

/** 되돌리기 — 표식 있는 항목에서 백필이 더한 키 3개를 뗀다. 그 뒤에 붙은 다른 키(예: 후속 summary)는 남긴다. */
export function rollbackQuotes(quotes: unknown): { next: unknown; changed: boolean } {
  if (!Array.isArray(quotes)) return { next: quotes, changed: false }
  let changed = false
  const next = quotes.map((q) => {
    if (!isObj(q) || q.backfill !== BACKFILL_TAG) return q
    changed = true
    const { source_key: _k, verified: _v, backfill: _b, ...rest } = q
    return rest
  })
  return { next, changed }
}

export interface Summary {
  aspects: number; quotes: number; with_key: number; malformed: number
  legacy: number; full: number; prefix: number; none: number; purged: number
  /** full·prefix 인데 찾은 입력에 source_key 가 없어 키를 못 단 수(고객 화면엔 여전히 안 나간다). */
  matched_no_key: number
  /** 이미 백필된 항목 — 재실행 시 건너뛴다. */
  already: number
  aspects_to_update: number; projects: number
  by_source: Record<string, number>
}

export interface Change { id: string; before: unknown; after: unknown }

/** 전체 계획(읽기만). measure·apply 드라이런·apply 실행이 같은 계획을 쓴다. */
export async function planBackfill(sb: SupabaseClient): Promise<{ summary: Summary; changes: Change[] }> {
  const aspects = await pageAll<AspectRow>((a, b) =>
    sb.from('analysis_aspects').select('id, project_id, evidence_quotes').order('id').range(a, b))
  const s: Summary = {
    aspects: aspects.length, quotes: 0, with_key: 0, malformed: 0, legacy: 0, full: 0, prefix: 0, none: 0, purged: 0,
    matched_no_key: 0, already: 0, aspects_to_update: 0, projects: 0, by_source: {},
  }
  const byProject = new Map<string, AspectRow[]>()
  for (const a of aspects) {
    for (const q of Array.isArray(a.evidence_quotes) ? a.evidence_quotes : []) {
      s.quotes++
      if (!isObj(q) || typeof q.text !== 'string') s.malformed++
      else if (q.backfill === BACKFILL_TAG) s.already++
      else if (typeof q.source_key === 'string') s.with_key++
    }
    if (Array.isArray(a.evidence_quotes) && a.evidence_quotes.some(isLegacy)) {
      byProject.set(a.project_id, [...(byProject.get(a.project_id) ?? []), a])
    }
  }
  s.projects = byProject.size
  const changes: Change[] = []
  for (const [pid, rows] of byProject) {
    const inputs = await pageAll<BackfillInput>((a, b) =>
      sb.from('analysis_inputs').select('id, source_type, source_key, raw_text')
        .eq('project_id', pid).order('created_at').order('id').range(a, b))
    const p = prepareInputs(inputs)
    for (const r of rows) {
      const { next, changed, results } = planQuotes(r.evidence_quotes, p)
      if (!changed) continue
      changes.push({ id: r.id, before: r.evidence_quotes, after: next })
      for (const x of results) {
        s.legacy++
        s[x.verified]++
        if ((x.verified === 'full' || x.verified === 'prefix') && !x.source_key) s.matched_no_key++
        const bucket = x.source_key ?? (x.verified === 'full' || x.verified === 'prefix' ? '(matched:no-key)' : `(${x.verified})`)
        s.by_source[bucket] = (s.by_source[bucket] ?? 0) + 1
      }
    }
  }
  s.aspects_to_update = changes.length
  return { summary: s, changes }
}

/** 한 줄 요약 — 오케스트레이터가 Notion·보고에 그대로 붙인다. */
export function summaryLine(s: Summary): string {
  return `quote-backfill legacy=${s.legacy}/${s.quotes} full=${s.full} prefix=${s.prefix} none=${s.none} purged=${s.purged}` +
    ` matched_no_key=${s.matched_no_key} with_key=${s.with_key} already=${s.already} malformed=${s.malformed}` +
    ` aspects_to_update=${s.aspects_to_update}/${s.aspects} projects=${s.projects}`
}

/** 되돌리기 계획 — 표식 있는 항목을 가진 속성만. */
export async function planRollback(sb: SupabaseClient): Promise<Change[]> {
  const aspects = await pageAll<AspectRow>((a, b) =>
    sb.from('analysis_aspects').select('id, project_id, evidence_quotes').order('id').range(a, b))
  return aspects.flatMap((r) => {
    const { next, changed } = rollbackQuotes(r.evidence_quotes)
    return changed ? [{ id: r.id, before: r.evidence_quotes, after: next }] : []
  })
}

/**
 * 변경 쓰기 — 행 하나 = UPDATE 하나(= 트랜잭션 하나, 행 잠금만 짧게). batch 행마다 pauseMs 쉰다.
 * 0행 갱신(그 사이 재추출로 행이 지워짐)은 gone 으로 세고 넘어간다. 오류는 거기서 멈춘다 — 이미 쓴 행은 표식이 있어
 * --rollback 으로 되돌릴 수 있다. backup(change) 는 UPDATE **전에** 부른다(원값을 먼저 남긴다).
 */
export async function writeChanges(
  sb: SupabaseClient, changes: readonly Change[],
  o: { batch: number; pauseMs: number; backup?: (c: Change) => void; log?: (m: string) => void },
): Promise<{ updated: number; gone: number; error: string | null }> {
  let updated = 0, gone = 0
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    o.backup?.(c)
    const { data, error } = await sb.from('analysis_aspects').update({ evidence_quotes: c.after }).eq('id', c.id).select('id')
    if (error) return { updated, gone, error: `id=${c.id} ${error.code ?? ''} ${error.message}` }
    if (!data || data.length === 0) gone++
    else updated++
    if ((i + 1) % o.batch === 0) {
      o.log?.(`  · ${i + 1}/${changes.length} (updated=${updated} gone=${gone})`)
      if (o.pauseMs > 0) await new Promise((r) => setTimeout(r, o.pauseMs))
    }
  }
  return { updated, gone, error: null }
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>
/** 1000행씩 끝까지. 조회 실패는 던진다 — 반쯤 읽은 것을 전부로 접지 않는다(§7.1). */
async function pageAll<T>(q: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999)
    if (error) throw new Error(`조회 실패(${error.code ?? ''}): ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}
