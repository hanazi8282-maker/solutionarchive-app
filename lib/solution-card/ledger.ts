// 회사 사실 원장(v71eg-3 2-1) — 입력 형식·어댑터·비교 지표. 순수 함수(모델·DB·네트워크 없음).
// 형식은 결론서 세션의 원장(Notion "[결론서→CC 입력] 초기형 12곳 진단 JSON·사실 원장 v2" + "[결론서] 실제 초기형 12곳 사실 정리")와 같다:
//   facts[{id:'C1', text, url, seen_at}] · 한줄불편(complaint) · 근거(evidence) · 장후보 · 상황신호 · 사전에없는전제 · 먼저고칠것 · 전제판정(P2 기준 v2).
// ⚠️ Node 타입 스트리핑 직접 로드: `@/` 별칭·enum 금지.
import { isEstimated, type CompanyLabel, type PremiseState } from './match-v03.ts'

/** 근거 수준(남헌 2026-11-26): 확인 = 직접 쓴 문장·공식 화면, 추정 = 공개 정보로 조립한 해석, 가설 = 더 물어봐야 함. 없으면 확인. */
export type EvidenceLevel = '확인' | '추정' | '가설'
export type Fact = { id: string; text: string; url: string; seen_at: string; blocked?: boolean; level?: EvidenceLevel; basis?: string }
export type LedgerSignal = { code: string; evidence: string; fact_ids: string[] }
export type Ledger = {
  slug: string
  name: string
  field: string
  stage: string // E0 | E1 | E2 …(공개 화면 신호로 본 추정)
  customer: string
  complaint: string // 한줄불편
  evidence: string // 근거(fact id 포함 문장)
  chapters: number[] // 장후보
  signals: LedgerSignal[] // 상황신호(사전 v0.6, R-D·R-E)
  premises: Record<string, PremiseState> // 전제판정(P2 기준 v2: 확정·추정→met, 미충족→unmet, 모름→unknown)
  premises_not_in_dict: string
  fix_first: string // 먼저고칠것
  facts: Fact[]
  source: 'ref-ledger' | 'cc-input' | 'auto' | 'json'
}

const STAGE_KO: Record<string, string> = { E0: '초기', E1: '초기', E2: '첫 매출', E3: '성장' }
const P_KO: Record<string, PremiseState> = { 확정: 'met', 추정: 'met', 충족: 'met', 미충족: 'unmet', 모름: 'unknown' }
export const normPremise = (v: unknown): PremiseState => (v === 'met' || v === 'unmet' || v === 'unknown' ? v : P_KO[String(v ?? '').replace(/[(（].*$/, '').trim()] ?? 'unknown')

/** 원장 → 매칭이 읽는 회사 라벨. 근거 문장이 비어 있는 신호는 넣지 않는다(R-E). */
export function ledgerToLabel(l: Ledger): CompanyLabel {
  return {
    // 고객 유형은 사례 라벨과 같은 코드(smb·consumer·…)로 비교한다. 한글로 바꾸면 어느 사례와도 같지 않다. unknown 은 비운다(점수 없음).
    name: l.name, domain: l.field || '', customer: l.customer && l.customer !== 'unknown' ? l.customer : '', stage: STAGE_KO[l.stage] ?? '초기',
    signals: l.signals.filter((s) => String(s.evidence ?? '').trim()).map((s) => ({ code: s.code, evidence: s.evidence })),
    premises: { P1: l.premises.P1 ?? 'unknown', P2: l.premises.P2 ?? 'unknown', P10: l.premises.P10 ?? 'unknown' },
  }
}

/** cc_input_early_12cos 의 회사 한 곳(+기존 원장 축약본)을 Ledger 로. 기존 원장이 없으면 facts 만 있는 'cc-input' 원장(신호 없음). */
export function ledgerFromCcInput(c: any, ref?: any): Ledger {
  const facts: Fact[] = (c.facts ?? []).map((f: any) => ({ id: String(f.id), text: String(f.text), url: String(f.url ?? ''), seen_at: String(f.seen_at ?? '') }))
  const byId = new Map(facts.map((f) => [f.id, f.text]))
  const base: Ledger = { slug: c.slug, name: c.name, field: c.field ?? '', stage: c.stage ?? 'E1', customer: c.customer ?? 'unknown', complaint: '', evidence: '', chapters: [], signals: [], premises: {}, premises_not_in_dict: '', fix_first: '', facts, source: 'cc-input' }
  if (!ref) return base
  const ids = (s: string) => [...new Set(String(s).match(/C\d+/g) ?? [])]
  const factIds = ids(ref.evidence ?? '')
  const evText = factIds.map((id) => byId.get(id)).filter(Boolean).join(' ')
  return {
    ...base, complaint: ref.complaint ?? '', evidence: ref.evidence ?? '', source: 'ref-ledger',
    // 기존 원장은 코드만 갖고 있다 — 신호의 근거 문장은 한줄불편 + 인용된 사실 문장이다(둘 다 입력 안에 있는 글).
    signals: (ref.signals ?? []).map((code: string) => ({ code, evidence: `${ref.complaint ?? ''} ${evText}`.trim(), fact_ids: factIds })),
    premises: Object.fromEntries(Object.entries(ref.premises ?? {}).map(([k, v]) => [k, normPremise(v)])),
  }
}

/** 원장 JSON 검증(사용자가 직접 넣는 JSON·자동 생성 결과 공통). 오류 목록을 돌려준다. */
export function validateLedger(l: Partial<Ledger>): string[] {
  const e: string[] = []
  if (!l || typeof l !== 'object') return ['원장이 객체가 아니다']
  if (!l.slug || !l.name) e.push('slug·name 이 필요하다')
  if (!Array.isArray(l.facts) || l.facts.length === 0) e.push('facts 가 비었다')
  else {
    const ids = new Set<string>()
    for (const f of l.facts) { if (!/^C\d+$/.test(f.id)) e.push(`fact id 형식 오류: ${f.id}`); if (ids.has(f.id)) e.push(`fact id 중복: ${f.id}`); ids.add(f.id); if (!String(f.text ?? '').trim()) e.push(`fact ${f.id} 문장이 비었다`) }
    for (const s of l.signals ?? []) {
      if (!/^S\d{2}$/.test(s.code)) e.push(`신호 코드 형식 오류: ${s.code}`)
      if (!String(s.evidence ?? '').trim()) e.push(`신호 ${s.code} 근거가 비었다(R-E)`)
      for (const id of s.fact_ids ?? []) if (!ids.has(id)) e.push(`신호 ${s.code} 가 없는 fact ${id} 를 인용`)
    }
  }
  return e
}

const tokens = (s: string) => (String(s).match(/[\d][\d,.]*[+천만원%]?|[가-힣A-Za-z]{2,}/g) ?? []).map((x) => x.replace(/,/g, ''))
/** 2-5c(1): 기존 원장이 인용한 핵심 사실(fact id)의 숫자 토큰이 자동 수집 facts 합집합에 모두 있으면 "포함". 숫자가 없는 사실은 한글 토큰 70% 이상. */
export function factCoverage(refFacts: Fact[], citedIds: string[], autoFacts: Fact[]): { total: number; covered: number; missing: string[] } {
  const pool = tokens(autoFacts.map((f) => f.text).join(' ')), poolSet = new Set(pool)
  const missing: string[] = []; let covered = 0, total = 0
  for (const id of citedIds) {
    const f = refFacts.find((x) => x.id === id); if (!f) continue
    total++
    const t = tokens(f.text), nums = t.filter((x) => /^\d/.test(x))
    const ok = nums.length ? nums.every((n) => poolSet.has(n)) : t.length > 0 && t.filter((x) => poolSet.has(x)).length / t.length >= 0.7
    if (ok) covered++; else missing.push(id)
  }
  return { total, covered, missing }
}
/** 2-5c(2): 신호 코드 일치 — 기존 원장 기준 재현율·정밀도·완전일치 */
export function signalAgreement(ref: string[], auto: string[]): { recall: number | null; precision: number | null; exact: boolean } {
  const r = new Set(ref), a = new Set(auto), both = [...r].filter((x) => a.has(x)).length
  return { recall: r.size ? both / r.size : null, precision: a.size ? both / a.size : null, exact: r.size === a.size && both === r.size }
}
/** 2-5c(3): 전제판정 칸별 일치율(두 쪽 다 값이 있는 칸 기준, unknown 도 하나의 값으로 센다) */
export function premiseAgreement(ref: Record<string, PremiseState>, auto: Record<string, PremiseState>, keys = ['P1', 'P2', 'P5', 'P6', 'P9', 'P10']): { per: Record<string, boolean>; rate: number } {
  const per: Record<string, boolean> = {}
  for (const k of keys) per[k] = (ref[k] ?? 'unknown') === (auto[k] ?? 'unknown')
  return { per, rate: keys.length ? Object.values(per).filter(Boolean).length / keys.length : 0 }
}

export const ESTIMATE_PHRASE = '~로 보입니다. 맞는지 확인 부탁드립니다'
export type CardEvidence = { case_level: EvidenceLevel; case_basis: string | null; company: { fact_id: string; level: EvidenceLevel; basis: string | null }[]; estimate: boolean }
/** 카드 한 장의 근거 태그: 회사 신호가 인용한 사실의 수준 + 고른 사례 어려움이 해석인지. 추정·가설마다 어떻게 알았는지 한 줄을 붙인다. */
export function cardEvidence(l: Ledger, c: { adversity_ko: string; quote_orig: string | null }): CardEvidence {
  const cited = new Set(l.signals.flatMap((s) => s.fact_ids ?? []))
  const company = l.facts.filter((f) => cited.has(f.id)).map((f) => ({ fact_id: f.id, level: f.level ?? ('확인' as EvidenceLevel), basis: f.level && f.level !== '확인' ? f.basis ?? '근거 설명 없음' : null }))
  const est = isEstimated(c.adversity_ko)
  return {
    case_level: est ? '추정' : '확인',
    case_basis: est ? `원문 인용 "${String(c.quote_orig ?? '').slice(0, 140)}" 에서 라벨 단계가 해석한 어려움(원문에 직접 없음)` : null,
    company, estimate: est || company.some((x) => x.level !== '확인'),
  }
}
/** 한 회사 결론서의 근거 중 추정·가설 비율(같은 회사 사실은 한 번만 센다). 절반 이상이면 표시한다. */
export function estimateShare(cards: readonly CardEvidence[]): { total: number; estimated: number; flag: boolean } {
  const seen = new Map<string, EvidenceLevel>()
  cards.forEach((c, i) => { seen.set(`case:${i}`, c.case_level); for (const f of c.company) seen.set(`fact:${f.fact_id}`, f.level) })
  const estimated = [...seen.values()].filter((v) => v !== '확인').length
  return { total: seen.size, estimated, flag: seen.size > 0 && estimated * 2 >= seen.size }
}
