// 솔루션 카드 틀 v2(v71ef, 남헌 확정 2026-11-24) — 스키마 · 검증기. 모델 호출 없음, DB 없음.
// 정본: 프로젝트 문서 claude/solution-card-format-v2-2026-11-24.md (이 머신에서 못 읽어 v71ef 지시 본문을 기준으로 했다 — 문서와 다르면 문서가 이긴다).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/solution-card-v2-selftest.mjs.

export const CARD_VERSION = 'card-v2'

/** 화면에 보이는 7칸. 순서 = 화면 순서. voice: case(검은 글씨, 사례 DB 사실) / ours(파란 글씨, 우리 제안). */
export const SECTIONS = [
  { key: 'situation', no: '①', title: '지금 상황과 원인', voice: 'ours' },
  { key: 'direction', no: '②', title: '해결 방향', voice: 'ours' },
  { key: 'case', no: '③', title: '사례', voice: 'case' },
  { key: 'steps', no: '④', title: '해야 할 일', voice: 'ours' },
  { key: 'why', no: '⑤', title: '왜 통하는가', voice: 'ours' },
  { key: 'fit', no: '⑥', title: '우리 상황에 맞게', voice: 'ours' },
  { key: 'after', no: '⑦', title: '해결되면 달라지는 모습', voice: 'ours' },
] as const

/** 파란 글씨로 구분해야 하는 칸(④⑤⑥⑦). ③은 검은 글씨. ①②는 지시서에 색 지정이 없어 일단 파랑이 아니라 기본색 — 정본 문서 확인 대기. */
export const BLUE_KEYS = ['steps', 'why', 'fit', 'after'] as const

/** 화면에 두지 않는 것(지시서 '제외'). 카드 JSON 에 이 키가 있으면 검증 실패. */
export const FORBIDDEN_KEYS = ['source', 'sources', 'source_url', 'evidence_grade', 'grade', 'confidence', 'reliability', 'first_step_this_week', 'this_week', 'small_experiment', 'experiment'] as const

/** 한 줄 상황 판정 R-a~R-g 가 카드에 남기는 표시. 점수를 깎는 것이 아니라 사용자 판단·조건 문구로 쓴다. */
export type FlagKind =
  | 'weakness_conflict' // R-a 행동이 회사 약점과 부딪힘 → 약점에 맞게 바꾸고 규모는 사용자 판단
  | 'legal_edge' // R-b 법의 경계 위험 → 감점 아님, 사용자 판단
  | 'money_mismatch' // R-c 돈이 안 맞음 → △
  | 'success_condition_unclear' // R-d 성공 조건 불확실 → 카드는 두고 필요한 조건을 적는다
  | 'store_unknown' // R-e 노출 늘리기도 차별화, 적용 가능한 스토어를 모르면 주의 문구
  | 'english_platform_swapped' // R-f 영어권 플랫폼 → '한국의 비슷한 사이트'(확실할 때만 이름)
  | 'third_party_analysis' // R-g 제3자 분석·출시일 아님 → 큰 감점 아님

export interface CardCase {
  who: string // 누가
  same_problem: string // 같은 문제
  did: string // 한 일
  result: string // 결과 — 사례 DB 에 숫자가 없으면 숫자를 쓰지 않는다
}

export interface CardStep {
  title: string
  how: string // 하는 방법(요령·말 예시)
}

export interface CardCaution {
  closed_place: string // 닫은 곳
  cause: string // 원인
  reaches_us: string // 우리에게 닿는 부분
  avoid: string // 피하는 법
}

export interface CardPlace {
  name: string // 해볼 곳 이름(영어권이면 한국 비슷한 사이트로 바꾸고, 확실할 때만 이름)
  note: string
}

/** 화면에 나오는 7칸 + 해볼 곳·조심할 것. 근거 인용·출처 링크는 internal 에만 둔다(화면 숨김, 내부 저장). */
export interface CardV2 {
  version: typeof CARD_VERSION
  situation: { text: string; cause?: string } // 고객 말로. cause 는 근거 있을 때만 "~로 보입니다" 로 끝난다
  direction: string // 한 문장
  case: CardCase
  steps: CardStep[] // 3~4단계
  why: string
  fit: string // 사례와 다른 점·조정
  after: string // 사례에 숫자가 없으면 모습만. 숫자를 만들지 않는다
  places: CardPlace[] // 해볼 곳 ≤ 3
  cautions: CardCaution[] // 조심할 것 ≤ 1
  flags: FlagKind[] // R-a~R-g 표시
  needed_conditions?: string[] // R-d: 성공에 필요한 조건
  internal: {
    evidence: { claim: string; quote: string; source_url?: string }[] // 근거 인용·출처 링크 — 화면에 안 나온다
    premises?: string[] // 전제 P — 참고용, 카드를 빼는 이유로 쓰지 않는다
    case_fact_ids?: string[] // ③ 사실을 가져온 사례 DB 행
  }
}

export interface CaseFacts {
  problem: string
  action: string
  result: string
  conditions: string
}

export type Verdict = { ok: true } | { ok: false; errors: string[] }

const NUM = /\d[\d,.]*/g
/** 숫자 토큰(쉼표·마침표 정리). "3개월" 의 3, "$2.99" 의 2.99 등. */
export function numbersOf(s: string): string[] {
  return (String(s ?? '').match(NUM) ?? []).map((x) => x.replace(/[,.]+$/, '').replace(/,/g, ''))
}

const str = (v: unknown, n = 1) => typeof v === 'string' && v.trim().length >= n

/** 카드 검증(순수). facts = ③ 사실의 출처인 사례 DB 칸. ③·⑦ 의 숫자는 facts 에 있는 숫자만 허용한다. */
export function validateCardV2(card: unknown, facts: CaseFacts | null): Verdict {
  const errors: string[] = []
  const c = card as Partial<CardV2> & Record<string, unknown>
  if (!c || typeof c !== 'object') return { ok: false, errors: ['카드가 객체가 아니다'] }
  if (c.version !== CARD_VERSION) errors.push(`version 이 ${CARD_VERSION} 이 아니다`)
  for (const k of FORBIDDEN_KEYS) if (k in c) errors.push(`제외된 칸이 있다: ${k}`)
  if (!str(c.situation?.text, 5)) errors.push('① 상황이 비었다')
  const cause = typeof c.situation?.cause === 'string' && c.situation.cause.trim() === '' ? undefined : c.situation?.cause // 빈 문자열 = 원인 칸을 비운 것(근거 없음)
  if (cause !== undefined && !(str(cause) && /로 보입니다\.?$/.test(cause.trim()))) errors.push('① 원인은 근거가 있을 때만 쓰고 "~로 보입니다"로 끝나야 한다')
  if (!str(c.direction, 5)) errors.push('② 해결 방향이 비었다')
  else if ((c.direction as string).split(/[.!?。]\s*/).filter((x) => x.trim()).length > 1) errors.push('② 해결 방향은 한 문장이다')
  const cs = c.case
  if (!cs || !str(cs.who) || !str(cs.same_problem) || !str(cs.did) || !str(cs.result)) errors.push('③ 사례는 누가·같은 문제·한 일·결과 네 칸이 모두 필요하다')
  if (!Array.isArray(c.steps) || c.steps.length < 3 || c.steps.length > 4) errors.push('④ 해야 할 일은 3~4단계다')
  else if (c.steps.some((s) => !str(s?.title) || !str(s?.how))) errors.push('④ 단계마다 하는 방법(요령·말 예시)이 있어야 한다')
  if (!str(c.why)) errors.push('⑤ 왜 통하는가가 비었다')
  if (!str(c.fit)) errors.push('⑥ 우리 상황에 맞게가 비었다')
  if (!str(c.after)) errors.push('⑦ 해결되면 달라지는 모습이 비었다')
  if (!Array.isArray(c.places) || c.places.length > 3) errors.push('해볼 곳은 3곳 이하다')
  if (!Array.isArray(c.cautions) || c.cautions.length > 1) errors.push('조심할 것은 1개 이하다')
  else for (const x of c.cautions) if (!str(x?.closed_place) || !str(x?.cause) || !str(x?.reaches_us) || !str(x?.avoid)) errors.push('조심할 것은 닫은 곳·원인·우리에게 닿는 부분·피하는 법 네 칸이다')
  if (!c.internal || !Array.isArray(c.internal.evidence)) errors.push('internal.evidence(근거 인용·출처 링크 내부 저장)가 없다')
  if (c.flags && c.flags.includes('success_condition_unclear') && !(c.needed_conditions && c.needed_conditions.length)) errors.push('R-d: 성공 조건이 불확실하면 필요한 조건을 적어야 한다')
  // 숫자 가드 — ③ 사례와 ⑦ 모습의 숫자·기간은 사례 DB 칸에 있는 것만. 새로 만들지 않는다.
  if (facts) {
    const allowed = new Set(numbersOf(`${facts.problem} ${facts.action} ${facts.result} ${facts.conditions}`))
    for (const [label, text] of [['③', `${cs?.who ?? ''} ${cs?.same_problem ?? ''} ${cs?.did ?? ''} ${cs?.result ?? ''}`], ['⑦', String(c.after ?? '')]] as const) {
      const bad = numbersOf(text).filter((n) => !allowed.has(n))
      if (bad.length) errors.push(`${label} 에 사례 DB 에 없는 숫자가 있다: ${[...new Set(bad)].join(', ')}`)
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true }
}

/** 화면용 — 근거 인용·출처·전제·플래그 내부값을 뺀 모양. 칸마다 파랑 여부를 붙인다. */
export function toDisplay(card: CardV2): { key: string; no: string; title: string; blue: boolean }[] {
  return SECTIONS.map((s) => ({ key: s.key, no: s.no, title: s.title, blue: (BLUE_KEYS as readonly string[]).includes(s.key) }))
}

/** 화면 JSON 에서 내부 칸을 뺀다(출처·근거 등급은 화면에 안 나간다). */
export function stripInternal(card: CardV2): Omit<CardV2, 'internal'> {
  const { internal: _i, ...rest } = card
  return rest
}
