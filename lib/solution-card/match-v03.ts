// 매칭 v0.3(v71eg B2-④, 정본 묶음 §5) — 회사 라벨 × 사례 → 카드 후보. 순수 함수(DB·모델 없음). 로더는 scripts/solution-pipeline.mjs 쪽.
// 점수 = 0.30 제품군 + 0.30 신호 맞춤 + 0.15 근거 + 0.10 단계 + 0.10 숫자 있음 + 0.05 고객층, 곱하기 전제 계수(충족 1 / 모름 0.6 / 미충족 0.2).
// 사례 쪽 S-code 는 case_signal_labels_v06 에서 읽고(라벨 있음 → 같은 코드 1.0), 없으면 낱말 규칙으로 대체(0.7), 행동 종류만 맞으면 0.6.
// ⚠️ Node 타입 스트리핑 직접 로드: `@/` 별칭·enum 금지.

export const WEIGHTS = { family: 0.3, signal: 0.3, evidence: 0.15, stage: 0.1, number: 0.1, customer: 0.05 } as const
export const PREMISE_MULT = { met: 1, unknown: 0.6, unmet: 0.2 } as const
export type PremiseState = keyof typeof PREMISE_MULT
export const MIN_PRECEDENTS = 3 // 선례가 3건 미만이면 억지로 채우지 않는다(빈칸 원칙)

export interface CaseRow {
  id: string // 에피소드 id
  slug: string
  chapter: number
  domain: string | null // 제품군(이야기 라벨)
  customer: string | null
  stage: string | null
  adversity_ko: string
  action_ko: string
  result_ko: string
  result_class: string | null // positive | negative | mixed | none ...
  result_grain: string | null // signal | learned | ...
  evidence_strength: string | null // A | B | C
  quote_orig: string | null
  signals: string[] // case_signal_labels_v06 에서 온 S-code(없으면 [])
  action_kind?: string | null // 행동 종류(필요 전제 규칙표의 키)
}
export interface CompanyLabel {
  name: string
  domain: string
  customer: string
  stage: string // 추정
  signals: { code: string; evidence: string }[]
  premises: Record<string, PremiseState> // P1·P2·P10 …
}
export interface Candidate { case: CaseRow; score: number; parts: Record<string, number>; direction: 'try' | 'caution'; signalFit: 'label' | 'words' | 'kind' | 'none'; premiseMult: number; needPremise: string | null }

const REGRET = /후회|하지 말|하지 않았으면|실수였|잘못/
/** 결과 방향 필터(§5): 잘 됨 = positive ∧ 결과 문장 ∧ grain 이 signal·learned 아님 ∧ 후회 낱말 없음 → 해볼 곳. 후회·교훈만·섞임·실패 → 조심할 것. 결과가 명단·시험 단계에서 끝나면 섞임 이하. */
export function directionOf(c: Pick<CaseRow, 'result_class' | 'result_grain' | 'result_ko'>): 'try' | 'caution' | null {
  const txt = String(c.result_ko ?? '').trim()
  if (!txt) return null
  const grain = String(c.result_grain ?? '')
  const rc = String(c.result_class ?? '')
  const listStage = /명단|대기자|시험|테스트 단계/.test(txt)
  if (rc === 'positive' && grain !== 'signal' && grain !== 'learned' && !REGRET.test(txt) && !listStage) return 'try'
  if (rc === 'negative' || rc === 'mixed' || REGRET.test(txt) || grain === 'learned' || grain === 'signal' || listStage) return 'caution'
  return null
}

const bigrams = (s: string): Set<string> => { const c = String(s ?? '').replace(/[\s.,'"“”‘’()\[\]·\-]/g, ''); const o = new Set<string>(); for (let i = 0; i < c.length - 1; i++) o.add(c.slice(i, i + 2)); return o }
export function overlap(a: string, b: string): number { const x = bigrams(a), y = bigrams(b); if (!x.size || !y.size) return 0; let n = 0; for (const t of x) if (y.has(t)) n++; return n / Math.min(x.size, y.size) }

/** 신호 맞춤: 라벨 있는 사례 → 같은 코드 1.0. 라벨 없음 → 낱말 규칙(회사 신호 근거 문장 ↔ 사례 어려움 칸 겹침 ≥ 0.25) 0.7. 행동 종류만 맞음(kinds) 0.6. */
export function signalFit(co: CompanyLabel, c: CaseRow, kinds: ReadonlySet<string> = new Set()): { fit: number; how: Candidate['signalFit'] } {
  const codes = new Set(co.signals.map((s) => s.code))
  if (c.signals.length) return c.signals.some((s) => codes.has(s)) ? { fit: 1, how: 'label' } : { fit: 0, how: 'none' }
  if (co.signals.some((s) => overlap(s.evidence, c.adversity_ko) >= 0.25)) return { fit: 0.7, how: 'words' }
  if (c.action_kind && kinds.has(c.action_kind)) return { fit: 0.6, how: 'kind' }
  return { fit: 0, how: 'none' }
}

const same = (a: string | null, b: string) => (a && b ? (a === b ? 1 : overlap(a, b) >= 0.5 ? 0.5 : 0) : 0)
const STAGE_NEAR: Record<string, string[]> = { 초기: ['초기', '첫 매출'], '첫 매출': ['초기', '첫 매출', '성장'], 성장: ['첫 매출', '성장'] }
/** 사례 라벨의 단계 코드(ss_story_labels.stage) → 회사 쪽 단계 말(ledger.ts STAGE_KO). 이미 같은 말이면 그대로. unknown 은 어느 단계와도 같지 않다. */
const CASE_STAGE: Record<string, string> = { prelaunch: '초기', zero_rev: '초기', early_rev: '첫 매출', growing: '성장' }

export interface MatchOpts { actionPremise?: Record<string, string> /** 행동 종류 → 필요 전제(약 30줄 규칙표, 없으면 전제 배수 1) */; kinds?: ReadonlySet<string> }

/** 점수 하나. 전제 배수는 점수에 곱한다 — 카드를 빼는 이유가 아니다(낮게 줄 세울 뿐). */
export function scoreCase(co: CompanyLabel, c: CaseRow, o: MatchOpts = {}): Candidate | null {
  const dir = directionOf(c)
  if (!dir) return null
  const sf = signalFit(co, c, o.kinds)
  const need = (c.action_kind && o.actionPremise?.[c.action_kind]) || null
  const state: PremiseState = need ? co.premises[need] ?? 'unknown' : 'met'
  const mult = PREMISE_MULT[state]
  const parts = {
    family: WEIGHTS.family * same(c.domain, co.domain),
    signal: WEIGHTS.signal * sf.fit,
    evidence: WEIGHTS.evidence * (({ A: 1, B: 0.6, C: 0.3 } as Record<string, number>)[String(c.evidence_strength)] ?? 0),
    stage: WEIGHTS.stage * (c.stage && (STAGE_NEAR[co.stage] ?? [co.stage]).includes(CASE_STAGE[c.stage] ?? c.stage) ? 1 : 0),
    number: WEIGHTS.number * (/\d/.test(c.result_ko) ? 1 : 0),
    customer: WEIGHTS.customer * same(c.customer, co.customer),
  }
  const raw = Object.values(parts).reduce((s, x) => s + (x || 0), 0)
  return { case: c, score: raw * mult, parts, direction: dir, signalFit: sf.how, premiseMult: mult, needPremise: need }
}

/** 회사 하나의 카드 후보: 해볼 곳 ≤3(제품군 우선 + 3장 중 1장은 다른 업종의 같은 원리) · 조심할 것 ≤1. 선례 3건 미만이면 빈칸(try=[]). 같은 이야기에서 둘 이상 뽑지 않는다. */
export function matchCompany(co: CompanyLabel, pool: readonly CaseRow[], o: MatchOpts = {}): { try: Candidate[]; caution: Candidate[]; precedents: number; blank: boolean; why: string } {
  const all = pool.map((c) => scoreCase(co, c, o)).filter((x): x is Candidate => !!x && x.signalFit !== 'none').sort((a, b) => b.score - a.score)
  const tries = all.filter((x) => x.direction === 'try'), cautions = all.filter((x) => x.direction === 'caution')
  const precedents = tries.length
  if (precedents < MIN_PRECEDENTS) return { try: [], caution: cautions.slice(0, 1), precedents, blank: true, why: `선례 ${precedents}건(<${MIN_PRECEDENTS}) — 억지로 채우지 않음` }
  const seen = new Set<string>(), pick: Candidate[] = []
  const take = (x: Candidate) => { if (seen.has(x.case.slug) || pick.length >= 3) return false; seen.add(x.case.slug); pick.push(x); return true }
  for (const x of tries) { if (pick.length >= 2) break; if (same(x.case.domain, co.domain) > 0) take(x) } // 제품군 우선
  for (const x of tries) { if (pick.length >= 2) break; take(x) }
  const other = tries.find((x) => same(x.case.domain, co.domain) === 0 && !seen.has(x.case.slug)) // 3장 중 1장은 다른 업종
  if (other) take(other)
  for (const x of tries) if (pick.length < 3) take(x)
  return { try: pick, caution: cautions.slice(0, 1), precedents, blank: false, why: 'ok' }
}

/** 12곳 전체 규칙(§4): 같은 카드(사례)는 12곳 안에서 최대 2회, 같은 회사 안 같은 방법(행동 종류) 금지, 조건 "모름"(전제 배수 0.6)인 카드는 3번째 이후. */
export function applyPortfolioRules(results: { company: string; cards: Candidate[] }[]): { company: string; cards: Candidate[]; dropped: { slug: string; why: string }[] }[] {
  const uses = new Map<string, number>()
  return results.map((r) => {
    const dropped: { slug: string; why: string }[] = [], kinds = new Set<string>(), out: Candidate[] = []
    for (const x of r.cards) {
      const slug = x.case.slug
      if ((uses.get(slug) ?? 0) >= 2) { dropped.push({ slug, why: '같은 카드 12곳 안 최대 2회' }); continue }
      if (x.case.action_kind && kinds.has(x.case.action_kind)) { dropped.push({ slug, why: '같은 회사 안 같은 방법' }); continue }
      out.push(x)
      uses.set(slug, (uses.get(slug) ?? 0) + 1)
      if (x.case.action_kind) kinds.add(x.case.action_kind)
    }
    // 조건 "모름" 카드는 3번째 이후로 민다(안정 정렬)
    const known = out.filter((x) => x.premiseMult !== PREMISE_MULT.unknown), unk = out.filter((x) => x.premiseMult === PREMISE_MULT.unknown)
    return { company: r.company, cards: [...known, ...unk], dropped }
  })
}
