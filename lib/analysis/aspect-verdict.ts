// 속성(aspect) 한 장의 판정 어휘 — 점수 옆에 "그래서 뭘 해라" 를 붙인다 (docs/pmf-product-design.md §3-1 5).
//
// ★ 판정은 (중요도 I, 만족도 S) **두 값만으로** 낸다. 선례·사분면과 섞지 않는다 — 두 축은
//   출처가 다르고 틀리는 방식도 다르다(lib/cases/match.ts 헤더). 선례가 없다고 "버린다" 가 되면
//   "직접 검증하라" 와 "손대지 마라" 가 같은 말이 된다.
//
// ★ opportunity_score 는 DB 생성 컬럼(O = I + max(I−S, 0))이다. 여기서 **재계산해 저장하지 않는다.**
//   화면에 세 조각(중요도·만족도·격차)을 보여주려고 같은 식을 **표시용으로만** 푼다. DB 값과 다르면
//   DB 가 정본이다 — 그래서 breakdown 은 DB 의 opportunity_score 를 같이 받아 어긋나면 표시한다.
//
// 이 파일은 Node 가 타입 스트리핑으로 직접 로드한다(셀프테스트). `@/` 별칭·enum 을 쓰지 않는다.

export const ASPECT_VERDICT = ['PUSH', 'TABLE_STAKES', 'DROP', 'WATCH', 'UNKNOWN'] as const
export type AspectVerdictCode = (typeof ASPECT_VERDICT)[number]

export interface AspectVerdict {
  code: AspectVerdictCode
  /** 행동 동사 1개. 화면 배지. */
  label: string
  /** 한 줄 읽기 — 왜 그 판정인지 (I, S) 로만 말한다. */
  reading: string
}

/** 경계값. 10점 척도(analysis_aspects 실측 3~9 / 1~10). 바꾸면 selftest 가 잡는다. */
export const VERDICT_CUT = { importanceHigh: 6, satisfactionLow: 4, satisfactionHigh: 6 } as const

/**
 * (I, S) → 판정.
 *   I≥6 ∧ S≤4 → PUSH        "여기를 민다"        — 중요한데 못 채워준다. 소구점 1순위.
 *   I≥6 ∧ S≥6 → TABLE_STAKES "기본기, 안 밀어도 된다" — 중요하고 이미 만족. 빠지면 감점, 밀어도 가점 없음.
 *   I<6       → DROP        "버린다"            — 덜 중요하다. 만족도와 무관하게 소구점이 아니다.
 *   I≥6 ∧ 4<S<6 → WATCH     "지켜본다"          — 중요한데 만족이 반반. 리뷰를 더 모아야 판정이 선다.
 *   null 하나라도 → UNKNOWN "판정 없음"         — 값이 없다. 0 으로 접지 않는다(§7.1).
 */
// 인자는 number 와 문자열 숫자를 둘 다 받는다 — PostgREST 가 numeric 컬럼을 문자열로 돌려주는 자리가 있다.
// num() 이 이미 그렇게 동작하고 셀프테스트도 문자열을 넣는다. 타입만 좁아서 호출부가 캐스팅하고 있었다.
export function aspectVerdict(importance: number | string | null | undefined, satisfaction: number | string | null | undefined): AspectVerdict {
  const I = num(importance), S = num(satisfaction)
  if (I === null || S === null) {
    return { code: 'UNKNOWN', label: '판정 없음', reading: `중요도 ${I ?? '—'} · 만족도 ${S ?? '—'} — 값이 비어 판정하지 않는다` }
  }
  const { importanceHigh: IH, satisfactionLow: SL, satisfactionHigh: SH } = VERDICT_CUT
  if (I < IH) return { code: 'DROP', label: '버린다', reading: `중요도 ${I} — 리뷰가 크게 신경 쓰지 않는 속성이다. 소구점으로 밀 이유가 없다` }
  if (S <= SL) return { code: 'PUSH', label: '여기를 민다', reading: `중요도 ${I} · 만족도 ${S} — 중요한데 못 채워주고 있다. 소구점 1순위` }
  if (S >= SH) return { code: 'TABLE_STAKES', label: '기본기 — 안 밀어도 된다', reading: `중요도 ${I} · 만족도 ${S} — 중요하고 이미 만족한다. 빠지면 감점, 밀어도 가점은 없다` }
  return { code: 'WATCH', label: '지켜본다', reading: `중요도 ${I} · 만족도 ${S} — 중요한데 만족이 반반이다. 리뷰를 더 모아야 판정이 선다` }
}

export interface OpportunityBreakdown {
  importance: number | null
  satisfaction: number | null
  /** max(I−S, 0). 화면에서 "격차" 라고 부른다. */
  gap: number | null
  /** 표시용 합계 I + gap. DB 생성 컬럼과 같아야 한다. */
  computed: number | null
  /** DB 의 opportunity_score. 정본. */
  stored: number | null
  /** stored 와 computed 가 어긋나면 true — DB 가 정본이고, 화면은 이 사실을 숨기지 않는다. */
  mismatch: boolean
  reading: string
}

/** 기회점수를 세 조각으로 편다. 저장하지 않는다 — 표시용. */
export function opportunityBreakdown(
  importance: number | string | null | undefined,
  satisfaction: number | string | null | undefined,
  stored: number | string | null | undefined,
): OpportunityBreakdown {
  const I = num(importance), S = num(satisfaction), st = num(stored)
  if (I === null || S === null) {
    return { importance: I, satisfaction: S, gap: null, computed: null, stored: st, mismatch: false, reading: '중요도·만족도가 비어 분해하지 않는다' }
  }
  const gap = Math.max(I - S, 0)
  const computed = I + gap
  const mismatch = st !== null && Math.abs(st - computed) > 1e-6
  const reading = gap > 0
    ? `중요도 ${I} + 격차 ${gap} (중요도 ${I} − 만족도 ${S})`
    : `중요도 ${I} + 격차 0 (만족도 ${S} 가 중요도 이상 — 이미 채워져 있다)`
  return { importance: I, satisfaction: S, gap, computed, stored: st, mismatch, reading }
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
