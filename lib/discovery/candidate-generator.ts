// 후보 생성기(우물 파기 자동화) 1단계 — dry-run 필터·선택·지표. 순수 함수만(네트워크·DB 없음).
// 설계: reports/2026-10-16/candidate-generator-design.md (남헌 v71aa 1-4).
//
// 이 모듈은 아무것도 등록하지 않는다. "후보 N · 적합성 통과 M · 오늘 고를 몫 · 예상 수확"만 계산한다.
// 등록은 남헌 승인 뒤 마이그레이션 PR(기존 candidate-register-draft.mjs 경로)로만 한다.

import { areaOf } from '../review/target-supply.ts'
import { isOwnerRobotsOverride } from '../review/runner.ts'

/** 발굴 갈래 4개(설계 §2 ①~④) + 기존 창문 대장 pending(window — 같은 앱 다른 국가, 이미 실측 채택된 것). */
export const GENERATORS = ['mention', 'similar_app', 'forum_link', 'keyword', 'window'] as const
export type Generator = (typeof GENERATORS)[number]

/** 하루에 고르는 후보 상한(남헌 v71aa — 일일 상한 45). 등록 상한이 아니라 dry-run 이 "고를 몫"으로 보고하는 수다. */
export const GENERATOR_DAILY_CAP = 45
/** 영역 가중(②는 유입이 약하다 — 가중하되 한정하지 않는다). 없는 영역은 1. */
export const AREA_WEIGHT: Readonly<Record<string, number>> = { '2': 2 }
/** 차단 유지 소스 — 약관이 스크래핑을 금지(SP-007 G2·Capterra) 하거나 남헌이 속도를 정한·차단 이력 소스. */
export const BLOCKED_SOURCES: ReadonlySet<string> = new Set(['g2', 'capterra', 'danawa', 'todayhumor', 'producthunt'])
const ACTIVE_AREAS = new Set(['1', '2', '3', '4', '5'])
const BAD_TOS = new Set(['prohibited', 'forbids_automation'])

export type Candidate = {
  generator: Generator
  source_key: string
  product_ref: string
  /** review_targets.label 꼴 — 앞의 `N:` 이 영역(areaOf). out-* 은 라벨 앞이 `out-...:` 라 영역 밖으로 걸러진다. */
  label: string
  /** 한 번 등록했을 때 기대 신규 건수(하한). 모르면 null — 0 으로 접지 않는다. */
  expected_yield: number | null
  evidence?: string
}
export type SourceRow = { key: string; enabled: boolean; robots_status?: string | null; tos_status?: string | null; override?: string | null }
export type TargetRow = { source_key: string; product_ref: string }

export type Reject = 'bad_generator' | 'out_area' | 'no_area' | 'duplicate' | 'blocked_source' | 'no_source' | 'disabled' | 'tos_blocked' | 'robots_unverified'

/** 한 후보의 판정. null = 통과. 순서 = 영역 적합성 → 중복 → 차단 소스 → robots/약관(설계 §3). */
export function rejectReason(c: Candidate, seen: Set<string>, sources: Map<string, SourceRow>): Reject | null {
  if (!(GENERATORS as readonly string[]).includes(c.generator)) return 'bad_generator'
  if (/^out-/i.test(c.label ?? '')) return 'out_area'
  if (!ACTIVE_AREAS.has(areaOf(c.label))) return 'no_area'
  const k = `${c.source_key}|${c.product_ref}`
  if (seen.has(k)) return 'duplicate'
  if (BLOCKED_SOURCES.has(c.source_key)) return 'blocked_source'
  const s = sources.get(c.source_key)
  if (!s) return 'no_source' // 새 소스는 이 경로로 못 만든다(§10.1 — 소스 등록은 세션·마이그)
  if (s.enabled !== true) return 'disabled'
  if (BAD_TOS.has(String(s.tos_status ?? ''))) return 'tos_blocked'
  // §7.1: 못 읽은 robots 는 허용이 아니다. 허용·해당 없음 또는 소유자 예외만 통과.
  const robotsOk = s.robots_status === 'allowed' || s.robots_status === 'not_applicable' || isOwnerRobotsOverride(s.override, s.robots_status)
  if (!robotsOk) return 'robots_unverified'
  return null
}

export function filterCandidates(cands: Candidate[], { targets, sources }: { targets: TargetRow[]; sources: SourceRow[] }) {
  const seen = new Set(targets.map((t) => `${t.source_key}|${t.product_ref}`))
  const srcMap = new Map(sources.map((s) => [s.key, s]))
  const passed: Candidate[] = []
  const rejected: Record<string, number> = {}
  for (const c of cands) {
    const r = rejectReason(c, seen, srcMap)
    if (r) rejected[r] = (rejected[r] ?? 0) + 1
    else {
      passed.push(c)
      seen.add(`${c.source_key}|${c.product_ref}`) // 같은 묶음 안 중복도 막는다
    }
  }
  return { passed, rejected }
}

/** 오늘 고를 몫: 점수 = 기대 수확 × 영역 가중, 큰 순, 상한 cap. 기대 수확 모름(null)은 맨 뒤. */
export function pickDaily(passed: Candidate[], cap = GENERATOR_DAILY_CAP): Candidate[] {
  const score = (c: Candidate) => (c.expected_yield === null ? -1 : c.expected_yield * (AREA_WEIGHT[areaOf(c.label)] ?? 1))
  return [...passed].sort((a, b) => score(b) - score(a) || `${a.source_key}|${a.product_ref}`.localeCompare(`${b.source_key}|${b.product_ref}`)).slice(0, cap)
}

/** 일일 지표(설계 §5). registered 는 1단계에서 항상 0 — 등록은 사람 승인 뒤 마이그 PR. */
export function dailyMetrics(cands: Candidate[], passed: Candidate[], picked: Candidate[]) {
  const byArea: Record<string, { generated: number; passed: number; picked: number }> = {}
  const bump = (list: Candidate[], k: 'generated' | 'passed' | 'picked') => {
    for (const c of list) {
      const a = /^out-/i.test(c.label ?? '') ? 'out' : areaOf(c.label)
      byArea[a] ??= { generated: 0, passed: 0, picked: 0 }
      byArea[a][k]++
    }
  }
  bump(cands, 'generated')
  bump(passed, 'passed')
  bump(picked, 'picked')
  const known = picked.filter((c) => c.expected_yield !== null)
  return {
    generated: cands.length,
    passed: passed.length,
    picked: picked.length,
    registered: 0,
    avg_expected_yield: known.length ? Math.round((10 * known.reduce((s, c) => s + (c.expected_yield as number), 0)) / known.length) / 10 : null,
    yield_unknown: picked.length - known.length,
    by_generator: Object.fromEntries(GENERATORS.map((g) => [g, cands.filter((c) => c.generator === g).length])),
    by_area: byArea,
  }
}

/** 기존 창문 대장(reports/window-adopted.json)의 pending → window 후보. 기대 수확 = 프로브 첫 페이지 신규(하한). */
export function fromWindowLedger(ledger: { entries?: Array<Record<string, unknown>> }): Candidate[] {
  return (ledger.entries ?? [])
    .filter((e) => e.status === 'pending')
    .map((e) => ({
      generator: 'window' as const,
      source_key: String(e.source_key),
      product_ref: String(e.product_ref),
      label: String(e.label ?? ''),
      expected_yield: typeof e.new_per_request === 'number' ? e.new_per_request : null,
      evidence: `window pending since ${e.pending_since ?? '?'} (${e.reason ?? '?'})`,
    }))
}
