// 케이스스터디 초안 — 형식·검증·근거 등급. 네트워크도 DB 도 안 탄다.
//
// 설계: docs/case-study-pipeline-design.md
//
// ★ 어휘의 정본은 마이그레이션의 CHECK 다(20260906000001_case_study_pipeline.sql).
//   여기 배열은 그 사본이고, 어긋나면 INSERT 가 23514 로 죽는다. 어휘를 늘릴
//   때는 마이그레이션을 먼저 바꿔라. 코드에서 문자열만 늘리면 로컬 검증은
//   통과하고 DB 에서 터진다 — 가장 늦게 발견되는 형태다.

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

export const SNIPPET_MAX = 300
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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

export type GradeResult = { grade: Grade; reason: string }

/**
 * 무브 하나의 근거 등급.
 *
 *   A = 법정 공시 1개(발행사 자체 정의 지표 제외)  또는  비자기보고 1차 출처 1개
 *       또는  독립 도메인 2개 이상
 *   B = 자기보고 1차 출처 1개 + 다른 도메인의 출처 1개
 *   C = 근거는 있으나 위에 못 미침
 *   D = 수치 자체가 없다 (서술만)
 *
 * ★ "독립"은 도메인이 다른 것으로 센다. 같은 보도자료를 받아쓴 기사 5개는 1개다.
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
export function gradeMove(move: Move, evidence: Evidence[]): GradeResult {
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
  const attested = evidence.filter(e =>
    e.is_regulatory_filing && !e.is_estimate && !e.is_issuer_defined_metric)
  if (attested.length >= 1) {
    return { grade: 'A', reason: `법정 공시 ${attested.length}건 (자기보고이나 법적 책임이 따르는 문서)` }
  }

  const nonSelfPrimary = evidence.filter(e =>
    e.source_tier === 'primary' && !e.is_self_reported && !e.is_estimate)
  if (nonSelfPrimary.length >= 1) {
    return { grade: 'A', reason: `비자기보고 1차 출처 ${nonSelfPrimary.length}건` }
  }

  // 수치를 확인해 주는 출처만 센다. 3차·자기보고·추정치를 뺀다.
  // 당사자가 자기 수치를 말한 건 그 수치의 독립적인 확인이 아니다.
  // (이걸 빼지 않으면 "브랜드 블로그 + 그걸 받아쓴 기사" 조합이 A 가 된다)
  const corroborating = evidence.filter(e =>
    !e.is_self_reported && !e.is_estimate
    && (e.source_tier === 'primary' || e.source_tier === 'secondary'))
  const domains = new Set(corroborating.map(e => domainOf(e.url)).filter(Boolean) as string[])
  if (domains.size >= 2) {
    return { grade: 'A', reason: `독립 도메인 ${domains.size}곳이 뒷받침` }
  }

  const selfPrimary = evidence.filter(e => e.source_tier === 'primary' && e.is_self_reported)
  if (selfPrimary.length >= 1) {
    const selfDomains = new Set(selfPrimary.map(e => domainOf(e.url)).filter(Boolean) as string[])
    // B 로 올려 주는 "다른 출처"는 3차 요약글이면 안 된다. 그건 당사자 발표를
    // 옮겨 적은 것이라 교차 확인이 아니다.
    const other = corroborating.filter(e => {
      const d = domainOf(e.url)
      return d !== null && !selfDomains.has(d)
    })
    if (other.length >= 1) {
      return { grade: 'B', reason: '자기보고 1차 + 다른 도메인의 비추정 출처 1건' }
    }
    return { grade: 'C', reason: '자기보고 1차뿐 — 교차 확인 없음' }
  }

  const estimates = evidence.filter(e => e.is_estimate)
  if (estimates.length > 0 && domains.size === 0) {
    return { grade: 'C', reason: `추정치뿐 (${estimates.length}건) — 실측 출처 없음` }
  }
  return { grade: 'C', reason: `교차 확인 없음 — 근거 ${evidence.length}건 / 독립 실측 도메인 ${domains.size}곳` }
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
      const g = gradeMove(m, mine)
      if (g.grade !== 'A') {
        // 막지 않는다. 저장은 되고 발행만 잠긴다 (설계 §2-4).
        warn(w, `부정 사례인데 등급 ${g.grade} — 등급 A 아니면 발행 불가, 사내 참고용으로만 남는다`)
      }
    }
  })

  return out
}

/** 초안을 DB 행 3벌로 편다. 등급은 여기서 계산해 무브에 박는다. */
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
    return {
      index: i,
      grade_reason: reason,
      row: {
        lever: m.lever,
        claim: m.claim,
        outcome_direction: m.outcome_direction ?? 'positive',
        metric_name: m.metric_name ?? null,
        metric_before: m.metric_before ?? null,
        metric_after: m.metric_after ?? null,
        metric_unit: m.metric_unit ?? null,
        observed_period_start: m.observed_period_start ?? null,
        observed_period_end: m.observed_period_end ?? null,
        evidence_grade: grade,
      },
    }
  })
  return { study, moves, evidence }
}
