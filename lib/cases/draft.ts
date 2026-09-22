// 케이스스터디 초안 — 형식·검증·근거 등급. 네트워크도 DB 도 안 탄다.
//
// 설계: docs/case-study-pipeline-design.md
//
// ★ 어휘의 정본은 마이그레이션의 CHECK 다(20260906000001_case_study_pipeline.sql).
//   여기 배열은 그 사본이고, 어긋나면 INSERT 가 23514 로 죽는다. 어휘를 늘릴
//   때는 마이그레이션을 먼저 바꿔라. 코드에서 문자열만 늘리면 로컬 검증은
//   통과하고 DB 에서 터진다 — 가장 늦게 발견되는 형태다.

import readerProblemVocab from '../../config/reader-problems.json' with { type: 'json' }
import painTermVocab from '../../config/pain-terms.json' with { type: 'json' }

/**
 * 독자 문제 — 케이스 **선정의 1순위 축**이다.
 *
 * 독자는 "만들 줄은 아는데 그걸 돈으로 바꾸는 법을 모르는 사람"이다. 그 사람이
 * 자기 상황에 옮겨 쓸 수 있는가가 브랜드 이름보다, 등급보다 앞선다.
 *
 * ★ 어휘 정본은 **코드가 아니라 `config/reader-problems.json`** 이다.
 *   레퍼런스 자료가 오면 그 파일 한 줄만 고치면 되고 이 파일은 안 건드린다.
 *   DB CHECK 도 형식(^[A-Z][A-Z_]*$)만 본다 — 어휘를 CHECK 에 박으면 어휘를
 *   늘릴 때마다 마이그레이션이 필요하고, 그동안 조사원이 억지로 끼워 맞춘다.
 *   파일과 DB 가 어긋나는 것은 `scripts/case-pipeline-verify.mjs` 가 잡는다.
 */
export const READER_PROBLEM_FORMAT = /^[A-Z][A-Z_]*$/
export const READER_PROBLEMS: readonly string[] = readerProblemVocab.problems.map((p) => p.code)
export const READER_PROBLEM_LABEL: Readonly<Record<string, string>> =
  Object.fromEntries(readerProblemVocab.problems.map((p) => [p.code, p.label]))

/** 이식성 판정 어휘. 값을 **쓰는** 것은 사람뿐이다 — lib/cases/review.ts 참고. */
export const TRANSFERABILITY = ['HIGH', 'MEDIUM', 'LOW'] as const
export type Transferability = (typeof TRANSFERABILITY)[number]

export const BUSINESS_MODEL = ['D2C', 'MARKETPLACE_SELLER', 'SUBSCRIPTION', 'SAAS',
  'CREATOR', 'SERVICE', 'WHOLESALE', 'OTHER'] as const
export const BUYER_TYPE = ['B2C', 'B2B', 'B2B2C'] as const
export const PURCHASE_FREQUENCY = ['ONE_OFF', 'OCCASIONAL', 'REPEAT', 'CONTRACT'] as const
export const PRICE_BAND = ['LOW', 'MID', 'HIGH', 'ENTERPRISE'] as const
export const BOTTLENECK = ['AWARENESS', 'TRUST', 'CONVERSION', 'RETENTION',
  'UNIT_ECONOMICS', 'DISTRIBUTION', 'SUPPLY'] as const
export const LEVER = ['POSITIONING', 'PRICING', 'PACKAGING', 'CHANNEL', 'CONTENT',
  'COMMUNITY', 'ONBOARDING', 'PRODUCT_FEATURE', 'OPERATIONS', 'PARTNERSHIP', 'OFFER'] as const
export const OUTCOME_STATUS = ['active', 'pivoted', 'shutdown', 'unknown'] as const
export const OUTCOME_DIRECTION = ['positive', 'negative', 'mixed'] as const
export const SOURCE_TIER = ['primary', 'secondary', 'tertiary'] as const

// 상한을 넘으면 경계만 줄이고 말줄임으로 표시한다 — 목록 한가운데 항목을
// 지우는 식의 편집 판단은 금지. 근거·hoka 사례: docs/case-study-pipeline-design.md §2-4 (1)
export const SNIPPET_MAX = 300
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * 페인 유형 낱말 — 처방 매칭이 질의 낱말과 만나는 자리. 정본은 `config/pain-terms.json`.
 * 매칭(advisor.ts hitTerms)이 부분 문자열이라 "포함" 검사면 충분하다. 근거:
 * docs/review-sources-and-remedy-roadmap-2026-09-21.md §3-5 — 실패 사례 24건 중 4건만 페인 낱말이 있었다.
 */
export const PAIN_TERMS: readonly string[] = painTermVocab.types.flatMap((t) => t.terms)
export const PAIN_TERM_LEGACY_KEYS: ReadonlySet<string> = new Set(painTermVocab.legacy_case_keys)
export const PAIN_TERM_LEGACY_SLUGS: ReadonlySet<string> = new Set(painTermVocab.legacy_draft_slugs)
export function hasPainTerm(text: string | null | undefined): boolean {
  const hay = (text ?? '').toLowerCase()
  return PAIN_TERMS.some((t) => hay.includes(t))
}

export type Grade = 'A' | 'B' | 'C' | 'D'

export type Evidence = {
  url: string
  source_tier?: (typeof SOURCE_TIER)[number]
  is_self_reported?: boolean
  /** 외부 추정치인가. 비상장사 매출은 대부분 여기 해당한다. */
  is_estimate?: boolean
  /** 법정 공시 문서인가 (DART 감사보고서, SEC S-1/10-K/8-K). */
  is_regulatory_filing?: boolean
  /**
   * 이 근거가 뒷받침하는 **수치**가 발행사가 스스로 정의·집계한 지표인가.
   * 법정 공시 안에 있어도 감사인 의견·제3자 검증 범위 밖인 숫자가 여기 해당한다 —
   * DAU·활성고객수·ARPAC·NDR·재구매율 같은 운영 지표, 그리고 문서가 명시적으로
   * '독립 검증되지 않았다'고 밝힌 숫자. 재무제표 본문 수치(매출·원가·충당금)는 아니다.
   * true 면 '허위기재에 법적 책임이 따른다'는 A 등급의 전제가 성립하지 않는다.
   */
  is_issuer_defined_metric?: boolean
  /**
   * 이 근거가 전하는 **원 관측**의 식별자. 같은 관측을 옮겨 적은 행끼리 같은 값을
   * 갖는다 (10-K 원문과 그것을 받아쓴 기사 → 둘 다 `chwy-10k-fy2023`).
   * 등급 산식의 "독립"은 도메인이 아니라 이 키의 가짓수로 센다 (L-60).
   * `null`/`undefined` 는 "독립이 아니다"가 아니라 **"확인하지 않았다"**이고,
   * 산식은 확인하지 않은 것을 독립으로 세지 않는다 (§7.1).
   */
  observation_key?: string | null
  /**
   * 이 근거가 무브의 **수치**(metric_before→metric_after)를 직접 받치는가.
   * 기능의 존재·시기·메커니즘 같은 서사만 받치면 `false` (L-64).
   * `null`/`undefined` 는 "확인하지 않았다"이고 수치 뒷받침으로 세지 않는다.
   */
  supports_metric?: boolean | null
  published_at?: string | null
  retrieved_at?: string | null
  snippet?: string | null
  supports_claim?: string | null
  /** 이 근거가 붙는 무브의 배열 인덱스. 없으면 케이스 단위 근거다. */
  move?: number | null
}

export type Move = {
  lever: (typeof LEVER)[number]
  claim: string
  /**
   * 독자가 **내일** 할 수 있는 최소 행동 1개. 조사원이 채우는 관측값이다.
   * "브랜드가 무엇을 했나"가 아니라 "읽는 사람이 무엇을 해 볼 수 있나"를 적는다.
   */
  transfer_note?: string | null
  /**
   * 옮기려면 독자에게 뭐가 있어야 하나 (자본·인력·채널·재고…).
   * `null` 은 **미기재**이지 "전제 없음"이 아니다 (§7.1).
   */
  preconditions?: string | null
  outcome_direction?: (typeof OUTCOME_DIRECTION)[number]
  metric_name?: string | null
  metric_before?: number | null
  metric_after?: number | null
  metric_unit?: string | null
  observed_period_start?: string | null
  observed_period_end?: string | null
}

export type Draft = {
  slug: string
  brand_name: string
  market?: string | null
  geo?: string | null
  business_model?: (typeof BUSINESS_MODEL)[number] | null
  buyer_type?: (typeof BUYER_TYPE)[number] | null
  purchase_frequency?: (typeof PURCHASE_FREQUENCY)[number] | null
  price_band?: (typeof PRICE_BAND)[number] | null
  bottleneck?: (typeof BOTTLENECK)[number] | null
  /** 선정 1순위 축. 어휘 정본은 config/reader-problems.json. */
  reader_problem?: string | null
  outcome_status?: (typeof OUTCOME_STATUS)[number]
  period_start?: string | null
  period_end?: string | null
  summary?: string | null
  tags?: string[]
  researched_by?: string | null
  moves: Move[]
  evidence: Evidence[]
}

/** URL 에서 등록 도메인 비슷한 것을 뽑는다. 근거 독립성 판정에 쓴다. */
export function domainOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return h || null
  } catch { return null }
}

export type GradeResult = {
  grade: Grade
  reason: string
  /**
   * 독립성·수치 뒷받침을 판정할 축(`observation_key` / `supports_metric`)이
   * 비어 있어 **보수적으로** 매긴 등급인가. true 면 "근거가 약하다"가 아니라
   * "약한지 강한지 아직 안 적었다"는 뜻이다 — 이 둘을 섞으면 §7.1 위반이다.
   */
  provisional?: boolean
  /** 미기재 때문에 세지 못한 근거 행 수. 사람이 뭘 채워야 하는지 알려 준다. */
  unkeyed?: number
}

/**
 * 근거를 **원 관측** 단위로 접는다 (L-60).
 *
 * `observation_key` 가 있으면 그것으로, 없으면 세지 않는다. 도메인으로 대신
 * 세면 "S-1 을 읽고 쓴 뉴스레터 2곳"이 독립 2건이 된다 — 그게 고치려는 결함이다.
 * 그래서 이 함수는 키 없는 행을 **버리고**, 몇 건을 버렸는지 함께 돌려준다.
 */
export function foldObservations(evidence: Evidence[]): { keys: Set<string>; unkeyed: number } {
  const keys = new Set<string>()
  let unkeyed = 0
  for (const e of evidence) {
    const k = e.observation_key?.trim()
    if (k) keys.add(k)
    else unkeyed++
  }
  return { keys, unkeyed }
}

/**
 * 무브 하나의 **사실확인** 등급 — "이 수치가 얼마나 검증 가능한가"만 본다.
 *
 * ★ 2026-09-16 재설계(남헌 지시): 예전엔 이 함수가 `evidence_grade`(DB, 검수 화면의
 *   "등급" 배지)였다. 지금은 `gradeMove()`(아래, 독자 인사이트 축)가 그 자리를 대신하고,
 *   이 함수는 `fact_check_grade`(발행 게이트 CG-1/CG-2 전용, `lib/cases/publish-gate.ts`)의
 *   산식으로 이름만 바뀐 채 남는다. **로직은 그대로다** — 등급의 의미가 사실확인이라는 건
 *   여전히 유효하고 필요하다, 다만 그게 케이스를 대표하는 1등급이 아니게 됐을 뿐이다.
 *
 *   A = 법정 공시 1개(발행사 자체 정의 지표 제외)  또는  비자기보고 1차 출처 1개
 *       또는  **서로 다른 원 관측 2개 이상**
 *   B = 자기보고 1차 출처 1개 + **다른 원 관측** 1개
 *   C = 근거는 있으나 위에 못 미침
 *   D = 수치 자체가 없다 (서술만)
 *
 * ★ [L-60, 2026-09-07] "독립"을 **도메인이 아니라 `observation_key`** 로 센다.
 *   도메인으로 세면 S-1 하나를 읽고 쓴 뉴스레터 2곳이 독립 2건이 된다 —
 *   도메인은 2개지만 관측은 1개다. 키가 없는 행은 "독립이 아니다"가 아니라
 *   **"확인하지 않았다"**라서 세지 않고, 그렇게 매긴 등급에는 `provisional` 를 켠다.
 * ★ [L-64, 2026-09-07] 교차 확인 경로는 `supports_metric === true` 인 행만 센다.
 *   무브는 수치 하나만 담지 않는다 — chewy/PRODUCT_FEATURE 는 "기능이 Autoship
 *   전용이었다"와 "고객당 순매출 434→555"를 함께 담는다. 앞쪽만 다루는 독립 매체
 *   1건이 뒤쪽 수치의 등급을 올리면, **아무도 확인하지 않은 숫자가 B 가 된다.**
 *   반면 공시·비자기보고 1차 경로는 `false` 만 뺀다(개수를 세는 경로가 아니라
 *   문서 성격을 보는 경로라, 미기재를 배제로 읽으면 근거 없이 A 가 무너진다).
 * ★ 3차 출처(요약 블로그·해설 영상)는 **수치를 뒷받침하는 데 세지 않는다.**
 *   원 수치를 옮겨 적은 것이라 독립적인 확인이 아니다. C 를 만드는 데는 쓴다.
 * ★ **추정치(is_estimate)도 뒷받침에 세지 않는다.** 시범 5건에서 발견한 구멍이다 —
 *   비상장사 매출은 조사기관 추정치뿐인데, tier 와 self_reported 만 보면
 *   "비자기보고 2차 2곳"이라 A 가 나온다. 아무도 실측한 적 없는 숫자다.
 * ★ **법정 공시라도 발행사가 스스로 정의·집계한 운영 지표(is_issuer_defined_metric)는
 *   A 를 만들지 않는다.** L-56 에서 발견한 구멍이다 — Nubank 20-F 가 본문에서
 *   "not independently verified by any third party" 라고 밝힌 ARPAC 을, 산식은
 *   "법정 공시 1건"이라는 이유로 A 로 올리고 있었다. 문서 자신보다 관대한 산식이다.
 * ★ 근거가 0개인데 수치가 있는 건 등급이 아니라 **오류**다. validateDraft 가
 *   막는다 — LLM 환각이 수치로 들어오는 경로가 거기 하나뿐이다.
 */
export function factCheckGrade(move: Move, evidence: Evidence[]): GradeResult {
  if (move.metric_after === null || move.metric_after === undefined) {
    return { grade: 'D', reason: '수치 없음 — 서술만 있다' }
  }
  if (evidence.length === 0) {
    // validateDraft 가 먼저 막지만, 이 함수만 따로 불릴 수 있으니 여기서도 말한다.
    return { grade: 'D', reason: '근거 0건 — 수치 주장인데 출처가 없다 (저장 불가)' }
  }

  // ★ 법정 공시가 먼저다. 자기보고이지만 허위기재에 법적 책임이 따르는 문서라,
  //   출처를 안 밝힌 블로그 2개보다 아래에 두는 건 산식이 틀린 것이다.
  //   (시범 5건에서 캐스퍼 S-1·듀오링고 8-K 가 실제로 C 로 떨어졌다)
  //
  // ★ 단, 그 법적 책임은 **문서 전체**가 아니라 검증 범위 안의 수치에만 붙는다.
  //   Nubank 20-F 는 본문에서 ARPAC·NPS 등을 두고 "not independently verified by
  //   any third party" 라고 스스로 밝힌다. 그런 숫자를 "법정 공시니까 A" 로 올리면
  //   산식이 문서의 자기 부인보다 관대해진다 (L-56). is_issuer_defined_metric 로
  //   그 수치를 빼고, 나머지 경로(독립 도메인 2곳 등)로 다시 판정하게 둔다.
  //
  // ★ 여기(문서 성격 경로)에서는 `supports_metric === false` 인 행만 뺀다.
  //   "이 문서는 수치를 안 다룬다"고 **적힌** 것만 배제한다. 미기재(null)까지
  //   빼면 백필 전에 A 가 통째로 무너지는데, 그건 근거가 나빠져서가 아니라
  //   아직 안 적어서다 — 그 둘을 같은 결과로 만들면 §7.1 위반이다.
  const onMetric = evidence.filter(e => e.supports_metric !== false)

  const attested = onMetric.filter(e =>
    e.is_regulatory_filing && !e.is_estimate && !e.is_issuer_defined_metric)
  if (attested.length >= 1) {
    return { grade: 'A', reason: `법정 공시 ${attested.length}건 (자기보고이나 법적 책임이 따르는 문서)` }
  }

  const nonSelfPrimary = onMetric.filter(e =>
    e.source_tier === 'primary' && !e.is_self_reported && !e.is_estimate)
  if (nonSelfPrimary.length >= 1) {
    return { grade: 'A', reason: `비자기보고 1차 출처 ${nonSelfPrimary.length}건` }
  }

  // 수치를 확인해 주는 출처만 센다. 3차·자기보고·추정치를 뺀다.
  // 당사자가 자기 수치를 말한 건 그 수치의 독립적인 확인이 아니다.
  // (이걸 빼지 않으면 "브랜드 블로그 + 그걸 받아쓴 기사" 조합이 A 가 된다)
  //
  // ★ 교차 확인 경로는 규칙이 다르다. 여기는 **개수를 세는** 경로라,
  //   미기재를 통과시키면 세면 안 될 것을 센다. `supports_metric === true`
  //   (수치를 실제로 담고 있다고 확인한 행) 만 세고, 독립성은 `observation_key`
  //   로 접는다. 둘 중 하나라도 비어 있으면 그 행은 교차 확인에 못 쓴다.
  const corroborating = evidence.filter(e =>
    !e.is_self_reported && !e.is_estimate
    && (e.source_tier === 'primary' || e.source_tier === 'secondary'))
  const usable = corroborating.filter(e => e.supports_metric === true)
  const folded = foldObservations(usable)
  // 세지 못한 이유를 한 덩어리로 만든다. "왜 안 올랐나"를 사람이 바로 알아야 한다.
  const unkeyed = corroborating.length - usable.length + folded.unkeyed
  const shortfall = unkeyed > 0
    ? ` (교차 확인 후보 ${corroborating.length}건 중 ${unkeyed}건은 관측 키·수치 뒷받침 미기재라 세지 않았다)`
    : ''

  if (folded.keys.size >= 2) {
    return { grade: 'A', reason: `서로 다른 원 관측 ${folded.keys.size}개가 뒷받침${shortfall}` }
  }

  const selfPrimary = onMetric.filter(e => e.source_tier === 'primary' && e.is_self_reported)
  if (selfPrimary.length >= 1) {
    const selfFolded = foldObservations(selfPrimary)
    // B 로 올려 주는 "다른 출처"는 3차 요약글이면 안 된다. 그건 당사자 발표를
    // 옮겨 적은 것이라 교차 확인이 아니다. 이제는 도메인이 아니라 관측으로 가른다 —
    // 도메인만 보면 Retail Dive 기사가 Chewy 10-K 와 '다른 출처'로 세어졌다(L-61).
    if (selfFolded.unkeyed > 0) {
      // 자기보고 쪽 관측을 모르면 "다른 관측인가"를 물을 수가 없다. 확인 불가다.
      return {
        grade: 'C',
        reason: `자기보고 1차 ${selfPrimary.length}건의 관측 키가 미기재라 교차 확인 여부를 판정할 수 없다${shortfall}`,
        provisional: true,
        unkeyed: selfFolded.unkeyed + unkeyed,
      }
    }
    const other = [...folded.keys].filter(k => !selfFolded.keys.has(k))
    if (other.length >= 1) {
      return { grade: 'B', reason: `자기보고 1차 + 다른 원 관측 ${other.length}개(${other.join(', ')})${shortfall}` }
    }
    return {
      grade: 'C',
      reason: `자기보고 1차뿐 — 다른 원 관측 없음${shortfall}`,
      ...(unkeyed > 0 ? { provisional: true, unkeyed } : {}),
    }
  }

  const estimates = evidence.filter(e => e.is_estimate)
  if (estimates.length > 0 && folded.keys.size === 0) {
    return { grade: 'C', reason: `추정치뿐 (${estimates.length}건) — 실측 출처 없음${shortfall}` }
  }
  return {
    grade: 'C',
    reason: `교차 확인 없음 — 근거 ${evidence.length}건 / 독립 원 관측 ${folded.keys.size}개${shortfall}`,
    ...(unkeyed > 0 ? { provisional: true, unkeyed } : {}),
  }
}

// 문장이 이 케이스만의 것인지, 아무 사례에나 붙는 일반론인지 — column-check.mjs 의
// GENERAL 패턴과 같은 발상이다. transfer_note 가 이걸로 시작하면 "무엇을 할지"가 아니라
// "누구나 하는 말"이다.
const GENERIC_ACTION = /^(다른 브랜드도|이런 전략은|이 방식은|일반적으로|보통은?|누구나|비슷한 사례에서는)\s/

/**
 * 무브 하나의 **독자 인사이트** 등급 — DB `evidence_grade`, `/cases` 화면의 "등급" 배지.
 *
 * ★ 2026-09-16 재설계(남헌 지시): "이 수치가 얼마나 검증됐나"가 아니라 "독자가 읽었을 때
 *   도움이 되고 옮길 게 있나"를 1순위로 본다. 사실확인은 없어지지 않았다 — `factCheckGrade()`
 *   로 이름을 옮겨 CG-1/CG-2 발행 게이트 전용 바닥(`fact_check_grade`)이 됐다. 그래서 이
 *   함수는 사실확인을 완전히 무시하지 않는다: 근거가 0개인 "그럴듯한 행동"까지 A로 올리면
 *   지어낸 조언과 실측 조언이 같은 등급이 된다 — 그건 이 재설계의 목적이 아니다.
 *
 *   D = `transfer_note` 미기재 — 아무리 사실이 맞아도 독자가 할 행동이 없다
 *   C = `transfer_note` 는 있으나 짧거나("15자 미만") 다른 사례에도 붙는 일반론
 *       (GENERIC_ACTION)  또는  구체적 행동인데 뒷받침 근거가 전혀 없다(사실확인 D)
 *   B = 구체적 행동은 있으나 `preconditions`(옮기려면 뭐가 있어야 하나) 미기재
 *   A = 구체적 행동 + 전제 + 뒷받침 근거(사실확인 D 아님) 전부 있음
 *
 * ★ `preconditions`·`transfer_note` 는 `null`(미기재)과 빈 문자열을 구분하지 않는다 —
 *   둘 다 "독자에게 아직 아무것도 안 알려줬다"로 취급한다(§7.1, 이 축엔 "전제 없음"이라는
 *   양성 값이 없다. 조사원이 "전제 없음"이라고 명시했으면 그 문장 자체가 preconditions 값이다).
 */
export function gradeMove(move: Move, evidence: Evidence[]): GradeResult {
  const note = (move.transfer_note ?? '').trim()
  const pre = (move.preconditions ?? '').trim()

  if (!note) {
    return { grade: 'D', reason: 'transfer_note 미기재 — 독자가 할 행동이 없다' }
  }
  if (note.length < 15 || GENERIC_ACTION.test(note)) {
    return { grade: 'C', reason: `transfer_note 가 짧거나("${note.length}자") 일반론("${note.slice(0, 30)}${note.length > 30 ? '…' : ''}") — 이 케이스만의 구체적 행동인지 불분명` }
  }
  const fc = factCheckGrade(move, evidence)
  if (!pre) {
    return { grade: 'B', reason: `구체적 행동은 있으나 전제(preconditions) 미기재 — 사실확인 참고: ${fc.grade}(${fc.reason})` }
  }
  if (fc.grade === 'D') {
    return { grade: 'C', reason: `행동·전제는 구체적이나 뒷받침 근거가 없다 — 사실확인 ${fc.grade}: ${fc.reason}` }
  }
  return { grade: 'A', reason: `구체적 행동 + 전제 + 뒷받침 근거 있음 — 사실확인 참고: ${fc.grade}(${fc.reason})` }
}

export type Issue = { level: 'error' | 'warn'; where: string; message: string }

const isoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * 초안을 검증한다. `error` 가 하나라도 있으면 DB 에 넣지 않는다.
 *
 * warn 은 막지 않는다. 검수자가 보고 판단할 거리다 — 자동으로 지우면
 * "리서치가 얕다"는 정보 자체가 사라진다.
 */
export function validateDraft(draft: Draft, today = new Date()): Issue[] {
  const out: Issue[] = []
  const err = (where: string, message: string) => out.push({ level: 'error', where, message })
  const warn = (where: string, message: string) => out.push({ level: 'warn', where, message })

  const oneOf = (where: string, v: unknown, vocab: readonly string[], required = false) => {
    if (v === null || v === undefined || v === '') {
      if (required) err(where, '필수인데 비었다')
      else warn(where, `비었다 — 매칭 축이라 비면 이 케이스는 검색에 안 걸린다`)
      return
    }
    if (!vocab.includes(v as string)) {
      err(where, `어휘 밖: ${JSON.stringify(v)} (가능: ${vocab.join(', ')})`)
    }
  }

  // ── 케이스 ──
  if (!draft.slug) err('slug', '필수')
  else if (!SLUG_RE.test(draft.slug)) err('slug', `소문자·숫자·하이픈만: ${draft.slug}`)
  if (!draft.brand_name) err('brand_name', '필수')

  oneOf('business_model', draft.business_model, BUSINESS_MODEL)
  oneOf('buyer_type', draft.buyer_type, BUYER_TYPE)
  oneOf('purchase_frequency', draft.purchase_frequency, PURCHASE_FREQUENCY)
  oneOf('price_band', draft.price_band, PRICE_BAND)
  oneOf('bottleneck', draft.bottleneck, BOTTLENECK)

  // ── 독자 문제 ──
  //
  // 비면 warn 이다 — 저장은 된다. 막으면 조사원이 아무 값이나 골라 채운다.
  // 어휘 밖이면 error 다. 어휘 정본은 파일이므로, 새 어휘를 통과시키려면
  // `config/reader-problems.json` 한 줄만 고치면 된다(코드 수정 없음).
  if (draft.reader_problem === null || draft.reader_problem === undefined || draft.reader_problem === '') {
    warn('reader_problem', '비었다 — 선정 1순위 축이다. "이 이야기를 옮겨 쓸 독자가 지금 무엇에 막혀 있나"를 적어라 (config/reader-problems.json)')
  } else if (!READER_PROBLEMS.includes(draft.reader_problem)) {
    err('reader_problem', `어휘 밖: ${JSON.stringify(draft.reader_problem)} `
      + `(가능: ${READER_PROBLEMS.join(', ')}). 어휘 정본은 config/reader-problems.json 이다 — 새 어휘가 필요하면 그 파일에 추가해라`)
  }

  if (draft.outcome_status !== undefined) oneOf('outcome_status', draft.outcome_status, OUTCOME_STATUS)

  for (const f of ['period_start', 'period_end'] as const) {
    const v = draft[f]
    if (v != null && !isoDate(v)) err(f, `YYYY-MM-DD 형식이어야 한다: ${v}`)
  }
  if (isoDate(draft.period_start) && isoDate(draft.period_end) && draft.period_end < draft.period_start) {
    err('period', `기간 역전: ${draft.period_start} → ${draft.period_end}`)
  }

  if (!Array.isArray(draft.moves) || draft.moves.length === 0) {
    err('moves', '무브가 0건이다 — 케이스만 있고 실행이 없으면 이 시스템에서 쓸 데가 없다')
  }
  if (!Array.isArray(draft.evidence)) err('evidence', '배열이어야 한다')

  const moves = Array.isArray(draft.moves) ? draft.moves : []
  const evidence = Array.isArray(draft.evidence) ? draft.evidence : []

  // ── 근거 ──
  evidence.forEach((e, i) => {
    const w = `evidence[${i}]`
    if (!e.url) err(w, 'url 필수')
    else if (!domainOf(e.url)) err(w, `URL 로 못 읽는다: ${e.url}`)
    if (e.source_tier !== undefined) oneOf(`${w}.source_tier`, e.source_tier, SOURCE_TIER, true)
    // DB 의 case_evidence_filing_is_primary 와 같은 규칙. 여기서 먼저 잡아야
    // 23514 로 죽지 않는다. 공시를 2차로 적었으면 등급이 잘못 계산된다.
    if (e.is_regulatory_filing && e.source_tier !== 'primary') {
      err(w, `법정 공시인데 source_tier 가 '${e.source_tier ?? '미지정'}' 이다 — primary 여야 한다`)
    }
    if (e.snippet != null && e.snippet.length > SNIPPET_MAX) {
      err(w, `스니펫 ${e.snippet.length}자 — 상한 ${SNIPPET_MAX}자. 인용 분량이 실제 리스크다`)
    }
    if (e.published_at != null) {
      if (!isoDate(e.published_at)) err(`${w}.published_at`, `YYYY-MM-DD 형식: ${e.published_at}`)
      else if (e.published_at > today.toISOString().slice(0, 10)) {
        err(`${w}.published_at`, `미래 날짜: ${e.published_at}`)
      }
    } else {
      // 최신성 판단이 불가능해진다. 막지는 않지만 반드시 눈에 띄어야 한다.
      warn(w, 'published_at 이 없다 — 원문 시점을 모르면 최신성을 판단할 수 없다')
    }
    if (e.move != null) {
      if (!Number.isInteger(e.move) || e.move < 0 || e.move >= moves.length) {
        err(w, `move 인덱스가 범위 밖: ${e.move} (무브 ${moves.length}개)`)
      }
    }
  })

  // ── 무브 ──
  moves.forEach((m, i) => {
    const w = `moves[${i}]`
    oneOf(`${w}.lever`, m.lever, LEVER, true)
    if (!m.claim) err(w, 'claim 필수')
    // 2026-09-22 규칙. 규칙 전 초안 45건은 config/pain-terms.json legacy_draft_slugs 로 면제 (실패 앵글 원장과 같은 방식).
    else if (!PAIN_TERM_LEGACY_SLUGS.has(draft.slug ?? '') && !hasPainTerm(m.claim)) {
      err(w, 'claim 에 페인 유형 낱말(가격·효능·성분·용기 …)이 하나도 없다 — 질의 낱말과 안 겹쳐 처방 매칭에 영영 안 잡힌다. 목록: config/pain-terms.json')
    }
    if (m.outcome_direction !== undefined) oneOf(`${w}.outcome_direction`, m.outcome_direction, OUTCOME_DIRECTION, true)

    const hasNumber = m.metric_after !== null && m.metric_after !== undefined
    if (hasNumber && (!m.metric_name || !m.metric_unit)) {
      err(w, '수치를 적었으면 metric_name 과 metric_unit 도 적어야 한다')
    }

    const mine = evidence.filter(e => e.move === i)
    if (hasNumber && mine.length === 0) {
      // ★ 이 검사가 이 파일에서 가장 중요하다. LLM 환각이 수치로 들어오는
      //   경로가 여기 하나뿐이다.
      err(w, '수치 주장인데 근거가 0건이다 — 저장하지 않는다')
    }
    if (!hasNumber) {
      warn(w, '수치가 없다 (등급 D) — PMF 스코어링 입력에서 빠진다')
    }
    // 2026-09-24: warn → error. 경고로 두는 동안 무브 103건 중 D 50건이 전부 transfer_note
    // 미기재로 쌓였다(계획서 §4). 규칙 전 초안은 pain-term 과 같은 legacy_draft_slugs 로 면제한다.
    if (!(m.transfer_note ?? '').trim()) {
      if (PAIN_TERM_LEGACY_SLUGS.has(draft.slug ?? '')) {
        warn(w, 'transfer_note 가 없다 (2026-09-24 규칙 전 초안이라 면제) — 독자가 가져갈 행동이 없다')
      } else {
        err(w, 'transfer_note 가 없다 — 독자가 **내일** 할 수 있는 최소 행동 1개가 이 파이프라인의 산출물이다')
      }
    }
    for (const f of ['observed_period_start', 'observed_period_end'] as const) {
      const v = m[f]
      if (v != null && !isoDate(v)) err(`${w}.${f}`, `YYYY-MM-DD 형식: ${v}`)
    }
    if (isoDate(m.observed_period_start) && isoDate(m.observed_period_end)
        && m.observed_period_end! < m.observed_period_start!) {
      err(w, `관측 기간 역전: ${m.observed_period_start} → ${m.observed_period_end}`)
    }
    if (hasNumber && !m.observed_period_start) {
      warn(w, '수치는 있는데 관측 시점이 없다 — 몇 년도 얘긴지 모르면 나중에 못 쓴다')
    }
    if (m.outcome_direction === 'negative') {
      // 여기는 사실확인 축을 본다(2026-09-16 분리) — "그 브랜드가 실패했다"는 주장은
      // 독자 인사이트가 아니라 **얼마나 검증됐는가**가 위험을 가른다. 안 그러면 근거 0건에
      // transfer_note 만 그럴듯해도(새 evidence_grade A) 명예훼손성 주장이 발행 대기로 간다.
      const g = factCheckGrade(m, mine)
      if (g.grade !== 'A') {
        // 막지 않는다. 저장은 되고 발행만 잠긴다 (설계 §2-4).
        warn(w, `부정 사례인데 사실확인 등급 ${g.grade} — 사실확인 A 아니면 발행 불가, 사내 참고용으로만 남는다`)
      }
    }
  })

  return out
}

/**
 * 초안을 DB 행 3벌로 편다. 등급은 여기서 계산해 무브에 박는다 — 둘 다:
 * `evidence_grade`(독자 인사이트, gradeMove) · `fact_check_grade`(사실확인, factCheckGrade).
 */
export function toRows(draft: Draft) {
  const evidence = Array.isArray(draft.evidence) ? draft.evidence : []
  const study = {
    slug: draft.slug,
    brand_name: draft.brand_name,
    market: draft.market ?? null,
    geo: draft.geo ?? null,
    business_model: draft.business_model ?? null,
    buyer_type: draft.buyer_type ?? null,
    purchase_frequency: draft.purchase_frequency ?? null,
    price_band: draft.price_band ?? null,
    bottleneck: draft.bottleneck ?? null,
    reader_problem: draft.reader_problem ?? null,
    outcome_status: draft.outcome_status ?? 'unknown',
    period_start: draft.period_start ?? null,
    period_end: draft.period_end ?? null,
    summary: draft.summary ?? null,
    tags: draft.tags ?? [],
    researched_by: draft.researched_by ?? null,
  }
  const moves = draft.moves.map((m, i) => {
    const mine = evidence.filter(e => e.move === i)
    const { grade, reason } = gradeMove(m, mine)
    const fc = factCheckGrade(m, mine)
    return {
      index: i,
      grade_reason: reason,
      fact_check_reason: fc.reason,
      row: {
        lever: m.lever,
        claim: m.claim,
        // 관측 2필드는 조사원이 채운다. 판정(transferability)은 **여기서 안 쓴다** —
        // 사람이 승인할 때 고른다 (CLAUDE.md §10.1). 기계가 쓰는 경로를 만들지 않는다.
        transfer_note: m.transfer_note ?? null,
        preconditions: m.preconditions ?? null,
        outcome_direction: m.outcome_direction ?? 'positive',
        metric_name: m.metric_name ?? null,
        metric_before: m.metric_before ?? null,
        metric_after: m.metric_after ?? null,
        metric_unit: m.metric_unit ?? null,
        observed_period_start: m.observed_period_start ?? null,
        observed_period_end: m.observed_period_end ?? null,
        evidence_grade: grade,
        fact_check_grade: fc.grade,
      },
    }
  })
  return { study, moves, evidence }
}
