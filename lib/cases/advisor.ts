// 크로스섹션 어드바이저 — 백엔드 v1 (M3, 결정 C).
//
// 낮은 증거등급에서 막히거나 다음 스텝이 불분명한 사용자에게, 유사 사례·원칙을
// 근거로 방향을 제시한다. 이 파일은 **순수 함수만** 둔다 — DB 조회는
// app/api/analyze/advisor 가 하고 여기엔 행 배열을 넘긴다. 그래야 셀프테스트가
// 네트워크 없이 돈다 (lib/cases/match.ts 와 같은 규약).
//
// 코퍼스 (§20 / §13-7):
//   A 성공사례 — case_studies / case_moves (이미 존재)
//   B 실패사례 — failed_angles (브랜치④에서 신설·시딩, 2026-09-11 프로덕션 적용).
//                "이 소구점은 이미 실패한 적 있다"를 돌려주는 자리다.
//   C 원칙원장 — strategy_principles (이 브랜치에서 신설·시딩)
//
// 구현 방법론 (§13-7): v1 은 벡터 검색 없이 **카테고리·키워드 태그 매칭**.
//   리포에 pgvector·임베딩 인프라가 없고(pmf_assessments 의 matched_by 는 어휘만
//   열어둔 자리), 새 유료 의존성을 넣지 않는다. 기존 facet 매칭 패턴을 그대로 쓴다.
//
// ★ §7.1 3상태를 타입으로 강제한다 (match.ts 와 동일):
//   matched  = 근거 카드가 1장 이상 (양성)
//   no_match = 조회는 정상인데 0장이다 → "관련 사례 없음"을 명시 (음성)
//   not_run  = 조회를 못 했거나 질의어가 없어 판정 자체를 못 했다 (확인 불가)
//   억지로 끼워맞추지 않는다.

import { GRADE_RANK, gradeRankOf, type MoveRow, type StudyRow } from './match.ts'

export const ADVISOR_STATUS = ['matched', 'no_match', 'not_run'] as const
export type AdvisorStatus = (typeof ADVISOR_STATUS)[number]

/** strategy_principles 한 행 (docs/strategy-principles.md §22 표에서 시딩). */
export interface PrincipleRow {
  sp_id: string
  tags: string[]
  statement: string
  evidence_grade: string
  evidence_grade_note?: string | null
  source_ref: string
}

export interface PrincipleCard {
  kind: 'principle'
  sp_id: string
  statement: string
  evidence_grade: string
  evidence_grade_note: string | null
  source_ref: string
  matched_terms: string[]
  score: number
  /** SP-024. 겹친 낱말이 하나뿐이라 근거가 얇다 — 숨기지 않고 화면에 표시한다. */
  low_confidence: boolean
}

/**
 * 같은 케이스에 기록된 무브 한 줄 — 카드 안 "기록된 무브 N개(시간순)" 접힘에 쓴다.
 * 정렬은 화면이 `lib/cases/detail.ts sortMovesByTime` 으로 한다(같은 데이터 계약을 두 번 적지 않는다).
 */
export interface CaseMoveSibling {
  id: string
  lever: string
  claim: string
  /** null = 관측 시점 미기재. 화면이 "시점 미확인"으로 말한다 — 모르는 것을 1단계로 배치하지 않는다. */
  observed_period_start: string | null
  created_at?: string
}

export interface CaseMoveCard {
  kind: 'case_move'
  case_move_id: string
  /** 같은 케이스의 무브를 묶는 열쇠. 카드가 형제 무브를 들고 다니게 된 뒤로 필요해졌다. */
  case_study_id: string
  slug: string
  brand_name: string
  lever: string
  claim: string
  evidence_grade: string
  /** 사실확인 등급. 조회에 없으면 null — 화면은 "미기재" 로 말한다(등급 D 와 다르다). */
  fact_check_grade: string | null
  /**
   * PMF 등급축(마이그 20260930000004). 배지 1순위 축이다 — 화면은 `displayGrade(card)` 로만 읽는다.
   * null = 컬럼 미적용이거나 재채점 전. 그때 배지는 `evidence_grade` 로 폴백하고 **그 사실을 이름으로 밝힌다**.
   */
  pmf_grade: string | null
  /** 사람이 신호 강도·이식성을 확정하지 않은 잠정 등급인가. 확정과 같게 보이면 §7.1 위반이다. */
  pmf_provisional: boolean | null
  outcome_direction: string
  /**
   * 내일 할 행동 — `case_moves.transfer_note` **원문 그대로**. LLM 이 다시 쓰지 않는다(§10.1).
   * null = 미기재. 빈 줄로 두지 않고 화면이 "행동 미기재" 배지로 말한다.
   */
  transfer_note: string | null
  /** 옮기려면 뭐가 있어야 하나. null = 미기재이고 "전제가 없다"는 뜻이 아니다. */
  preconditions: string | null
  observed_period_start: string | null
  /** 같은 케이스의 승인 무브 전부(자기 포함). 1개면 화면이 접힘을 그리지 않는다. */
  siblings: CaseMoveSibling[]
  matched_terms: string[]
  score: number
  low_confidence: boolean
}

/** failed_angles 한 행 (docs/failed-angles.md 표에서 시딩). */
export interface FailedAngleRow {
  case_key: string
  product_category: string
  claimed_angle: string
  outcome: string
  evidence_source: string
  source_tier: string
  is_estimate: boolean
}

export interface FailedAngleCard {
  kind: 'failed_angle'
  case_key: string
  product_category: string
  claimed_angle: string
  outcome: string
  source_tier: string
  is_estimate: boolean
  matched_terms: string[]
  score: number
  low_confidence: boolean
}

export interface CorpusResult<Card> {
  status: AdvisorStatus
  reason: string
  cards: Card[]
}

export interface AdvisorResult {
  status: AdvisorStatus
  reason: string
  terms: string[]
  corpus_a: CorpusResult<CaseMoveCard>
  corpus_c: CorpusResult<PrincipleCard>
  corpus_b: CorpusResult<FailedAngleCard>
}

const TOP_N = 5

/**
 * 매칭에서 빼는 범용 기능어.
 *
 * 왜 필요한가: hitTerms 는 2자 이상 토큰의 부분문자열 일치다. 필터가 없으면
 * "직접"·"안내" 같은 아무 문서에나 있는 낱말 하나로 무관한 코퍼스가 걸린다.
 * 실제로 탈모 샴푸 프로젝트가 amazon-fire-phone(실패한 스마트폰)과 "직접" 으로,
 * google-glass-explorer 와 "안내" 로 매칭돼 사용자 화면에 올라갔다. §13-7 AC-2
 * ("관련 사례 없음"을 명시 — 억지로 끼워맞추지 않는다)를 정면으로 어기는 결함이다.
 *
 * 최소 글자수를 3자로 올리는 방식은 쓰지 않는다 — "탈모"·"두피"·"가격" 같은
 * 의미 있는 2자 도메인 명사가 같이 죽는다. 기능어만 이름으로 집어서 뺀다.
 *
 * 여기 넣는 기준: 그 낱말 하나만으로는 어떤 제품·시장 얘기인지 전혀 좁혀지지
 * 않는 것(기능어·범용 수식어·범용 동작명사). "광고" 처럼 이 도메인에서 실제
 * 주제어로 쓰이는 낱말은 일부러 남겨 뒀다.
 *
 * ★ 이 목록은 단일 낱말 오탐을 **줄이지만 없애지 못한다**(SP-024). 남겨 둔
 *   도메인어("광고" 등) 하나로만 겹치는 매칭은 여전히 통과하고, 점수로도 안
 *   걸러진다 — isLowConfidence 주석 참고. 그래서 목록에 낱말을 더 넣어
 *   해결하려 들지 말고, 저신뢰 표시로 사람에게 넘긴다.
 *
 * 목록은 scripts/advisor-corpus-audit.mjs 로 실데이터 전수 매칭을 찍어서 고른다.
 * 새 노이즈 쌍이 보이면 여기에 추가하고 감사 스크립트를 다시 돌린다.
 */
const STOPWORDS = new Set([
  // 조사·어미가 붙은 기능어
  '하는', '있는', '없는', '없이', '있다', '있으나', '않아', '같은', '만에', '대비',
  '위해', '통해', '위한', '통한', '대한', '대해', '관련', '해당', '먼저', '잘못',
  // 범용 수식어
  '다양', '각종', '전체', '부분', '이번', '전용', '신규', '별도', '초기', '기본',
  '일반', '주요', '실제', '최대', '최소', '이상', '이하', '정도',
  // 범용 동작·서술 명사
  '직접', '안내', '확인', '이용', '제공', '지원', '소개', '설명', '사용', '제거',
  '제어', '추출',
  '증가', '감소', '개선', '평균', '적용', '진행', '완료', '시작', '검토', '판단',
  // 범용 대상 명사
  '정보', '내용', '방법', '방식', '기준', '목적', '문제', '상황', '상태', '스펙',
  '제품', '서비스', '기능', '효과', '경우', '결과', '대상', '수준', '종류', '항목',
  '수집', '원문', '자료', '주장', '비교', '반응', '차이', '존재', '부족', '관리',
  // 원형이 STOPWORDS 에 없는 맨 동사 활용형. 실데이터 감사에서 걸린 것만 넣는다
  // — 한국어 활용형은 끝이 없어서 미리 채워 두려 하면 의미 있는 낱말까지 죽는다.
  '돌려',
])

/**
 * 불용어 뒤에 붙는 조사·어미. 한국어는 공백 분리만으로 조사가 떨어지지 않아,
 * STOPWORDS 를 Set 으로만 보면 "제품과"·"확인하는"·"판단해" 가 그대로 통과한다.
 * 실제로 이 형태들이 수정 1차 후에도 무관한 케이스를 물어왔다.
 *
 * 명사 파생 접미사(자·성·력 등)는 일부러 넣지 않는다 — "사용자" 처럼 뜻이
 * 달라지는 낱말까지 죽는다.
 */
const PARTICLES = [
  '으로', '하는', '되는', '해서', '하고', '하여', '에서', '에게', '까지', '부터',
  '과', '와', '은', '는', '이', '가', '을', '를', '에', '의', '로', '도', '만',
  '해', '한', '된', '함', '들',
]

/** 기능어인가 — 원형이거나, 원형에 조사·어미만 붙은 형태인가. */
function isStopword(t: string): boolean {
  if (STOPWORDS.has(t)) return true
  for (const suf of PARTICLES) {
    if (t.length > suf.length && t.endsWith(suf) && STOPWORDS.has(t.slice(0, -suf.length))) return true
  }
  return false
}

/** 자유 텍스트 → 매칭용 토큰. 소문자·2자 이상·중복 제거. 기능어와 순수 숫자는 뺀다. */
export function toTerms(...parts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const p of parts) {
    if (!p) continue
    for (const raw of String(p).toLowerCase().split(/[^a-z0-9가-힣]+/)) {
      const t = raw.trim()
      if (t.length < 2) continue
      if (isStopword(t)) continue
      // 순수 숫자는 어떤 주제도 좁히지 못한다 — "12"(12.4%)·"70"(70%) 가 실제로
      // 무관한 케이스를 물어왔다. "8주"·"g2" 처럼 글자가 섞인 토큰은 남는다.
      if (/^[0-9]+$/.test(t)) continue
      seen.add(t)
    }
  }
  return [...seen]
}

/**
 * 신뢰도 낮음 판정 (SP-024). 겹친 낱말이 **단 하나**면 저신뢰다.
 *
 * 왜 점수 임계를 안 쓰는가: score 는 evidence_grade 가중(×10)이 겹친 낱말
 * 수(×1)를 압도한다. 낱말 1개로 걸린 A등급 무브가 31점, 낱말 5개로 걸린
 * C등급 무브가 15점이라 "점수가 낮으면 얇은 근거"가 성립하지 않는다.
 * 임계를 어디에 두든 둘 중 하나는 반드시 오분류된다.
 *
 * 왜 아예 숨기지 않는가: 낱말 하나로 걸린 매칭도 맞을 때가 있다(카테고리명이
 * 그대로 겹치는 경우). 숨기면 "관련 사례 없음"과 구분이 안 되는데 그 둘은
 * 다음 행동이 정반대다(§7.1). 그래서 노출하고, 왜 나왔는지를 같이 보여준다.
 *
 * 판정은 여기 한 곳이다 — 화면·감사 스크립트가 각자 계산하지 않는다.
 */
export function isLowConfidence(matchedTerms: string[]): boolean {
  return matchedTerms.length === 1
}

/**
 * 제품 종류 — 카테고리 선행 필터의 축 (2026-09-21 남헌 결정).
 *
 * A/B(docs/remedy-matching-ab-2026-09-21.md)에서 낱말 겹침 83%·임베딩 74% 가 무관이었고,
 * 원인은 알고리즘이 아니라 **코퍼스가 SaaS 쪽으로 기울어** 물리 제품 질의에 짝이 없는 것이었다.
 * 그래서 랭킹 전에 같은 종류 안으로 후보를 좁힌다. 축은 새로 만들지 않고 이미 있는
 * `business_model`(lib/cases/draft.ts BUSINESS_MODEL) 을 둘로 접는다:
 *   software — SAAS
 *   physical — D2C · MARKETPLACE_SELLER · WHOLESALE · SUBSCRIPTION · OTHER · SERVICE · CREATOR · (미기재)
 *
 * ⚠️ 미기재(null)를 physical 로 두는 이유: analysis_projects 는 리뷰 수집(다나와 등 실물 상품)
 *    에서 시작하는 물리 제품 프로젝트뿐이고(2026-09-21 실측 26건 중 business_model 25건 NULL),
 *    null 을 "판단 불가"로 접어 전부 걸러 버리면 처방 카드가 통째로 빈다. 케이스 쪽 null 도 같은
 *    규칙이다 — 케이스는 review 단계에서 business_model 을 채우므로 실제로는 거의 없다.
 * ⚠️ 서비스(SERVICE·CREATOR)를 physical 에 두는 것은 거친 근사다. 둘 다 승인 무브가 0건이라
 *    지금은 영향이 없고, 생기면 그때 세 갈래로 나눈다.
 */
export type ProductKind = 'physical' | 'software'

export function productKindOf(businessModel: string | null | undefined): ProductKind {
  return businessModel === 'SAAS' ? 'software' : 'physical'
}

/**
 * 종류가 다를 때 어떻게 하나 — **되돌리는 손잡이는 이 상수 하나다** (2026-09-23).
 *
 * 'exclude' 가 원래 동작(하드필터)이다. 지금 승인 SaaS 무브는 5건뿐이라(2026-09-23 실측)
 * SaaS 질의에 하드필터를 걸면 화면이 통째로 "0건"이 되고, 진짜 없는 것과 필터가 셌던 것이
 * 구분되지 않는다(reports/2026-09-23/saas-pivot-mvp-assessment.md §2-3).
 * 그래서 MVP 기간에는 'bonus' 로 낮춘다 — 같은 종류가 **먼저**, 다른 종류는 **뒤에**.
 * 코퍼스가 차면 이 값을 'exclude' 로 되돌리면 되고, 다른 코드는 고칠 게 없다.
 */
export const KIND_MISMATCH_MODE: 'bonus' | 'exclude' = 'bonus'

/** 종류가 같을 때 더하는 점수. 등급 최대(A=30)+낱말 수보다 크게 잡는다 — "먼저/뒤에"여야지 "섞임"이면 SaaS 질의 첫 화면에 텀블러가 앉는다. */
export const KIND_MATCH_BONUS = 100

/** term 이 haystack 에 부분문자열로 있는가 (양방향 — 짧은 쪽이 긴 쪽에 들어가면 hit). */
function hitTerms(terms: string[], haystack: string): string[] {
  const hay = haystack.toLowerCase()
  return terms.filter((t) => hay.includes(t))
}

/**
 * 원칙의 독자 — 2026-09-21 남헌 결정(처방 매칭 4라운드).
 *
 * strategy_principles 는 원래 **우리 팀의 운영 원장**이다(채널·법무·robots·인프라). 2026-09-21 실측 32건 중
 * 27건이 그것이고, 셀러에게 줄 수 있는 제품·가격 원칙은 5건(SP-001~004·SP-013)뿐이었다. 그런데 처방 카드가
 * "가격"·"광고" 같은 낱말로 운영 원칙을 끌어와 셀러 화면에 냈다 — A/B(docs/remedy-matching-ab-2026-09-21.md)에서
 * 원칙 카드 관련도가 0.00 이 나온 이유다. 그래서 원장 태그로 독자를 가르고, 셀러 화면은 `seller` 태그가
 * 있는 행만 본다. 스키마를 늘리지 않는다 — 태그는 원장(docs/strategy-principles.md)이 정본이고 sync 로 DB 에 간다.
 *
 *   seller    — 셀러 처방용. 이 태그가 없으면 셀러 화면(advise)에서 제외.
 *   software  — 그 원칙이 SaaS 전용(예: 하이브리드 프라이싱). 물리 제품 질의에는 제외(productKindOf 와 같은 축).
 */
export const PRINCIPLE_AUDIENCE_TAG = 'seller'
export const PRINCIPLE_SOFTWARE_TAG = 'software'

export function principleKindOf(tags: string[] | null | undefined): ProductKind {
  return (tags ?? []).includes(PRINCIPLE_SOFTWARE_TAG) ? 'software' : 'physical'
}

/**
 * Corpus C: 원칙 원장 태그·진술 매칭.
 * principles 가 null 이면 not_run (조회 실패를 "원칙 없음"으로 접지 않는다).
 *
 * opts.audience — 'seller'(기본): seller 태그 없는 운영 원칙을 랭킹 전에 뺀다. 'all': 안 뺀다(감사·비교용).
 * opts.kind     — 주면 software 태그 원칙을 물리 질의에서(그 반대도) 뺀다. null = 안 가른다.
 */
export function matchPrinciples(
  terms: string[],
  principles: PrincipleRow[] | null | undefined,
  opts: { audience?: 'seller' | 'all'; kind?: ProductKind | null } = {},
): CorpusResult<PrincipleCard> {
  if (!terms.length) return { status: 'not_run', reason: '질의어가 없다 — 무엇을 찾을지 모르는 상태다', cards: [] }
  if (principles == null) {
    return { status: 'not_run', reason: 'strategy_principles 조회 실패 (null) — "원칙 없음"이 아니라 확인 불가다', cards: [] }
  }
  const audience = opts.audience ?? 'seller'
  const kind = opts.kind ?? null
  const excluded = { audience: 0, kind: 0 }

  const cards: PrincipleCard[] = []
  for (const p of principles) {
    // 독자 필터 — 운영 원칙은 셀러 화면에 내지 않는다. 낱말이 겹쳐도 그건 우연이다.
    if (audience === 'seller' && !(p.tags ?? []).includes(PRINCIPLE_AUDIENCE_TAG)) { excluded.audience++; continue }
    if (kind !== null && principleKindOf(p.tags) !== kind) { excluded.kind++; continue }
    const tagHits = hitTerms(terms, (p.tags ?? []).join(' '))
    const stmtHits = hitTerms(terms, p.statement ?? '')
    const matched = [...new Set([...tagHits, ...stmtHits])]
    if (matched.length === 0) continue
    // 태그 일치가 진술 일치보다 무겁다 (태그는 큐레이터가 매칭용으로 단 것).
    const score = tagHits.length * 2 + stmtHits.length + (GRADE_RANK[p.evidence_grade] ?? 0) * 0.1
    cards.push({
      kind: 'principle',
      sp_id: p.sp_id,
      statement: p.statement,
      evidence_grade: p.evidence_grade,
      evidence_grade_note: p.evidence_grade_note ?? null,
      source_ref: p.source_ref,
      matched_terms: matched,
      score,
      low_confidence: isLowConfidence(matched),
    })
  }
  cards.sort((a, b) => b.score - a.score || a.sp_id.localeCompare(b.sp_id))

  if (cards.length === 0) {
    const why = [
      excluded.audience ? `운영 원칙 ${excluded.audience}건 제외` : '',
      excluded.kind ? `제품 종류 다름 ${excluded.kind}건 제외` : '',
    ].filter(Boolean).join(' / ')
    return { status: 'no_match', reason: `조회는 정상인데 질의어와 겹치는 원칙이 0건이다${why ? ` (${why})` : ''} — 관련 사례 없음`, cards: [] }
  }
  return { status: 'matched', reason: `원칙 ${cards.length}건`, cards: cards.slice(0, TOP_N) }
}

/**
 * Corpus A: 승인된 케이스 무브를 키워드로 매칭.
 * §7.1: studies·moves 중 하나라도 null 이면 not_run.
 * D 등급은 뺀다 (match.ts 와 동일 — 수치 없는 무브).
 */
export function matchCaseMoves(
  terms: string[],
  studies: StudyRow[] | null | undefined,
  moves: MoveRow[] | null | undefined,
  /** 질의 쪽 제품 종류. 주면 같은 종류가 먼저 온다(KIND_MISMATCH_MODE). 안 주면 전과 같다. */
  projectKind: ProductKind | null = null,
  /**
   * matchAllWhenNoTerms — 질의어 없이 하드필터(병목·문제 유형)만으로 좁힌 경우에도 후보로 본다.
   *   검색 화면에서 칩만 고르고 자유 텍스트를 비운 경로다. 기본 false = 전과 같다(질의어 없으면 not_run).
   * limit — 상위 몇 장인가. 기본 TOP_N(5).
   */
  opts: { matchAllWhenNoTerms?: boolean; limit?: number } = {},
): CorpusResult<CaseMoveCard> {
  const matchAll = opts.matchAllWhenNoTerms === true && terms.length === 0
  if (!terms.length && !matchAll) return { status: 'not_run', reason: '질의어가 없다', cards: [] }
  if (studies == null || moves == null) {
    return { status: 'not_run', reason: 'case_studies / case_moves 조회 실패 (null) — "선례 없음"이 아니라 확인 불가다', cards: [] }
  }

  const byId = new Map(studies.map((s) => [s.id, s]))
  const excluded = { not_approved: 0, grade_d: 0, no_context: 0, kind: 0 }
  const cards: CaseMoveCard[] = []

  // 케이스별 승인 무브 — 카드의 "기록된 무브 N개" 접힘 재료다. 등급 D 도 남긴다(타임라인은
  // 랭킹이 아니라 그 케이스의 이야기라서, 수치 없는 무브도 단계로는 실제로 있었던 일이다).
  const siblingsOf = new Map<string, CaseMoveSibling[]>()
  for (const m of moves) {
    if (m.review_status !== 'approved') continue
    const list = siblingsOf.get(m.case_study_id) ?? []
    list.push({
      id: m.id,
      lever: m.lever,
      claim: m.claim,
      observed_period_start: m.observed_period_start ?? null,
      created_at: m.created_at,
    })
    siblingsOf.set(m.case_study_id, list)
  }

  for (const m of moves) {
    const study = byId.get(m.case_study_id)
    if (!study) { excluded.no_context++; continue }
    if (study.review_status !== 'approved' || m.review_status !== 'approved') { excluded.not_approved++; continue }
    if ((gradeRankOf(m) ?? 0) <= 0) { excluded.grade_d++; continue }
    // 카테고리 축 — 'exclude' 면 랭킹 전에 빼고, 'bonus' 면 빼지 않고 점수로 뒤로 민다(KIND_MISMATCH_MODE).
    const kindMatch = projectKind === null || productKindOf(study.business_model) === projectKind
    if (!kindMatch && KIND_MISMATCH_MODE === 'exclude') { excluded.kind++; continue }

    const haystack = [
      study.brand_name,
      study.bottleneck,
      study.business_model ?? '',
      m.lever,
      m.claim,
    ].join(' ')
    const matched = matchAll ? [] : hitTerms(terms, haystack)
    if (!matchAll && matched.length === 0) continue

    cards.push({
      kind: 'case_move',
      case_move_id: m.id,
      case_study_id: m.case_study_id,
      slug: study.slug,
      brand_name: study.brand_name,
      lever: m.lever,
      claim: m.claim,
      evidence_grade: m.evidence_grade,
      fact_check_grade: m.fact_check_grade ?? null,
      pmf_grade: m.pmf_grade ?? null,
      pmf_provisional: m.pmf_provisional ?? null,
      outcome_direction: m.outcome_direction,
      // 이식 3필드는 **그대로 옮긴다** — 여기서 다듬거나 기본값을 채우지 않는다.
      // `undefined`(조회에서 빠짐)와 null(안 적힘)을 화면이 가를 수 있게 null 로만 접는다.
      transfer_note: m.transfer_note ?? null,
      preconditions: m.preconditions ?? null,
      observed_period_start: m.observed_period_start ?? null,
      siblings: siblingsOf.get(m.case_study_id) ?? [],
      matched_terms: matched,
      // SP-024 재개(남헌 2026-09-25): 겹친 낱말 수가 1순위, 등급은 동점 처리. 재개 전엔 등급×10 + 낱말 수 라
      // 낱말 1개짜리 A 무브(31)가 낱말 5개짜리 C 무브(15)보다 위였다 — 코퍼스 감사에서 역전 쌍이 실측됐다.
      // 종류 보너스(KIND_MATCH_BONUS=100)는 여전히 둘 다 압도한다("먼저/뒤에").
      score: matched.length * 10 + (gradeRankOf(m) ?? 0) + (kindMatch && projectKind !== null ? KIND_MATCH_BONUS : 0),
      low_confidence: isLowConfidence(matched),
    })
  }
  cards.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug) || a.lever.localeCompare(b.lever))

  if (cards.length === 0) {
    const why = [
      excluded.not_approved ? `미승인 ${excluded.not_approved}건` : '',
      excluded.grade_d ? `등급 D ${excluded.grade_d}건` : '',
      excluded.no_context ? `맥락 없는 무브 ${excluded.no_context}건` : '',
      excluded.kind ? `제품 종류 다름 ${excluded.kind}건` : '',
    ].filter(Boolean).join(' / ')
    return {
      status: 'no_match',
      reason: `조회는 정상인데 ${matchAll ? '조건에 맞는' : '질의어와 겹치는'} 승인 무브가 0건이다${why ? ` (제외: ${why})` : ''} — 관련 사례 없음`,
      cards: [],
    }
  }
  return { status: 'matched', reason: `승인 무브 ${cards.length}건`, cards: cards.slice(0, opts.limit ?? TOP_N) }
}

/**
 * Corpus B: 실패 앵글 원장 매칭 — "이 소구점은 이미 실패한 적 있다".
 *
 * haystack 을 product_category + claimed_angle 로 좁힌다. outcome(실패 이유)까지
 * 넣으면 무관한 카테고리끼리 "가격"·"규제" 같은 흔한 낱말로 우연히 걸린다.
 * 실패 서술은 매칭 대상이 아니라 **매칭된 뒤 읽히는 근거**다.
 *
 * is_estimate=true(재서술에 추정·해석이 섞인 행)는 점수를 1점 깎는다. 원칙
 * 원장에서 evidence_grade 로 가중을 주는 것과 같은 정신 — 같은 조건이면 사실
 * 그대로인 사례가 먼저 읽혀야 한다(과신 방지).
 */
export function matchFailedAngles(
  terms: string[],
  failedAngles: FailedAngleRow[] | null | undefined,
): CorpusResult<FailedAngleCard> {
  if (!terms.length) return { status: 'not_run', reason: '질의어가 없다 — 무엇을 찾을지 모르는 상태다', cards: [] }
  if (failedAngles == null) {
    return { status: 'not_run', reason: 'failed_angles 조회 실패 (null) — "실패 사례 없음"이 아니라 확인 불가다', cards: [] }
  }

  const cards: FailedAngleCard[] = []
  for (const f of failedAngles) {
    const haystack = [f.product_category ?? '', f.claimed_angle ?? ''].join(' ')
    const matched = hitTerms(terms, haystack)
    if (matched.length === 0) continue
    cards.push({
      kind: 'failed_angle',
      case_key: f.case_key,
      product_category: f.product_category,
      claimed_angle: f.claimed_angle,
      outcome: f.outcome,
      source_tier: f.source_tier,
      is_estimate: f.is_estimate,
      matched_terms: matched,
      score: matched.length * 10 - (f.is_estimate ? 1 : 0),
      low_confidence: isLowConfidence(matched),
    })
  }
  cards.sort((a, b) => b.score - a.score || a.case_key.localeCompare(b.case_key))

  if (cards.length === 0) {
    return { status: 'no_match', reason: '조회는 정상인데 질의어와 겹치는 실패 사례가 0건이다 — 관련 사례 없음', cards: [] }
  }
  return { status: 'matched', reason: `실패 사례 ${cards.length}건`, cards: cards.slice(0, TOP_N) }
}

/**
 * 세 코퍼스를 합쳐 방향을 제시한다.
 * 전체 status: 하나라도 matched 면 matched (반쪽이라도 근거를 준다). 셋 다 조회
 * 정상인데 0건이면 no_match (= "관련 사례 없음" 명시). 그 밖은 not_run.
 */
export function advise(
  input: {
    category?: string | null
    angleDescription?: string | null
    freeText?: string | null
    /** 프로젝트 business_model. 주면 선례·원칙 코퍼스에 카테고리 선행 필터가 걸린다(productKindOf). */
    businessModel?: string | null
    /** 원칙 독자. 기본 'seller' — 운영 원칙 제외. 'all' 은 감사·비교 스크립트용이지 화면용이 아니다. */
    principleAudience?: 'seller' | 'all'
  },
  corpora: {
    principles: PrincipleRow[] | null | undefined
    studies: StudyRow[] | null | undefined
    moves: MoveRow[] | null | undefined
    failedAngles: FailedAngleRow[] | null | undefined
  },
): AdvisorResult {
  const terms = toTerms(input.category, input.angleDescription, input.freeText)
  // undefined = 호출자가 종류를 모른다(필터 없음). null 포함 문자열 = 안다(null 은 physical 로 접힌다).
  const kind = input.businessModel === undefined ? null : productKindOf(input.businessModel)
  const corpus_a = matchCaseMoves(terms, corpora.studies, corpora.moves, kind)
  const corpus_c = matchPrinciples(terms, corpora.principles, { audience: input.principleAudience ?? 'seller', kind })
  const corpus_b = matchFailedAngles(terms, corpora.failedAngles)

  const all = [corpus_a, corpus_b, corpus_c]
  let status: AdvisorStatus
  let reason: string
  if (all.some((c) => c.status === 'matched')) {
    status = 'matched'
    const total = corpus_a.cards.length + corpus_b.cards.length + corpus_c.cards.length
    reason = `근거 카드 ${total}장 (선례 ${corpus_a.cards.length} / 실패사례 ${corpus_b.cards.length} / 원칙 ${corpus_c.cards.length})`
  } else if (all.every((c) => c.status === 'no_match')) {
    status = 'no_match'
    reason = '세 코퍼스 모두 조회는 정상인데 겹치는 근거가 0건이다 — 관련 사례 없음. 억지로 끼워맞추지 않는다.'
  } else {
    status = 'not_run'
    reason = `판정 불가 — 선례: ${corpus_a.reason} · 실패사례: ${corpus_b.reason} · 원칙: ${corpus_c.reason}`
  }

  return { status, reason, terms, corpus_a, corpus_b, corpus_c }
}
