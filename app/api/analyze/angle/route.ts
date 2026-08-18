import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  ANGLE_TYPES,
  SUBSTANTIATION_VERDICTS,
  type AngleType,
  type OutputType,
  type SubstantiationVerdict,
} from '@/lib/analysis/types'
import {
  callLlmJsonWithModel,
  describeFailure,
  requiredKeyFor,
  resolveProvider,
  type LlmProvider,
} from '@/lib/analysis/llm'

// 앵글 1건당 LLM 호출이 붙으므로 여유를 크게 잡는다.
export const maxDuration = 300

// LLM 호출 동시 실행 상한.
// Gemini 무료 티어는 분당 요청 수 제한이 빡빡해서 동시에 던지면 바로 429 가 난다.
// 앵글은 보통 5~8건이라 순차 처리해도 총 시간이 크게 늘지 않는다(건당 3~6초).
const CONCURRENCY = 1

type AspectRow = {
  id: string
  name: string
  aspect_layer: string | null
  importance: number | string | null
  satisfaction: number | string | null
  opportunity_score: number | string | null
  quadrant: string | null
  attribution: string | null
  pain_timing: string | null
  persona_role: string | null
  is_segmentation_axis: boolean | null
  value_realization_frequency: string | null
  notes: string | null
}

type ProjectRow = {
  id: string
  competitor_url: string
  product_elevator_pitch: string
  purpose: string
  seller_own_guess: string | null
  status: string
  maturity_stage: number | null
  maturity_notes: string | null
}

/** 만들 앵글 1건의 설계도. LLM 호출 전에 코드가 먼저 확정한다. */
type AnglePlan = {
  aspectId: string | null
  aspectName: string // 프롬프트/로그용
  angleType: AngleType
  outputType: OutputType
  /** 이 배정이 어느 규칙에서 나왔는지 — 보고·디버깅용 */
  rule: string
  /** BASELINE_SPEC 처럼 여러 속성을 묶는 경우 */
  groupedAspects?: AspectRow[]
}

// ── 앵글 배정 규칙 (강제 우선순위는 코드로 고정) ─────────────────
/**
 * maturity_stage 별 기본 후보군. 최종 선택은 LLM 이 하되, 후보 밖으로는 못 나간다.
 *   1~2단계 → PAS / ASPIRATION
 *   3~4단계 → MECHANISM / COMPARISON
 *   5단계   → SOCIAL_PROOF / FEAR_FOMO
 */
function defaultCandidates(maturityStage: number | null): AngleType[] {
  if (maturityStage === null) return ['MECHANISM', 'COMPARISON']
  if (maturityStage <= 2) return ['PAS', 'ASPIRATION']
  if (maturityStage <= 4) return ['MECHANISM', 'COMPARISON']
  return ['SOCIAL_PROOF', 'FEAR_FOMO']
}

/**
 * DIFFERENTIATOR 속성 1건의 angle_type/output_type 을 정한다.
 * 우선순위는 위에서부터 먼저 걸리는 규칙이 이긴다.
 */
function planForDifferentiator(a: AspectRow, project: ProjectRow): AnglePlan | { skip: 'PRODUCT_SPEC' } {
  // output_type 선분기: 상세페이지 목적인데 구매 후에야 알게 되는 페인이면
  // 카피로 쓰면 역효과다(사기 전에 검증 불가 → 불신). 제품 개선 과제로 넘긴다.
  if (project.purpose === 'detail_page' && a.pain_timing === 'POST_PURCHASE') {
    return { skip: 'PRODUCT_SPEC' }
  }

  // 1순위: 사용자가 자기 탓으로 서술하는 페인 → 재귀인
  if (a.attribution === 'USER_FAULT') {
    return {
      aspectId: a.id, aspectName: a.name,
      angleType: 'REATTRIBUTION',
      outputType: a.aspect_layer === 'PROCESS' ? 'OFFER' : 'COPY',
      rule: '1순위 attribution=USER_FAULT',
    }
  }

  // 2순위: 구매·사용 프로세스의 페인 → 카피가 아니라 오퍼로 푼다
  if (a.aspect_layer === 'PROCESS') {
    return {
      aspectId: a.id, aspectName: a.name,
      angleType: 'COMPARISON',
      outputType: 'OFFER',
      rule: '2순위 aspect_layer=PROCESS → OFFER',
    }
  }

  // 3순위: 극찬과 혐오가 공존하는 축 → 자기선택 유도
  if (a.is_segmentation_axis === true) {
    return {
      aspectId: a.id, aspectName: a.name,
      angleType: 'SELF_SELECTION',
      outputType: 'COPY',
      rule: '3순위 is_segmentation_axis=true',
    }
  }

  // 4순위: 성숙도 기본값 (후보군 중 최종 선택은 LLM)
  return {
    aspectId: a.id, aspectName: a.name,
    angleType: defaultCandidates(project.maturity_stage)[0],
    outputType: 'COPY',
    rule: `4순위 maturity_stage=${project.maturity_stage ?? '미판정'}`,
  }
}

// ── 프롬프트 ─────────────────────────────────────────────────────
const ANGLE_TYPE_GUIDE = `앵글 유형 정의:
- PAS: 문제(Problem)→동요(Agitate)→해결(Solution). 감정적 페인을 정면으로 건드린다.
- MECHANISM: 왜 되는지의 고유 작동원리를 설명해 믿게 만든다.
- COMPARISON: 대안/경쟁 방식과 대조해 우위를 드러낸다.
- SOCIAL_PROOF: 다른 사람들의 선택·후기를 근거로 안심시킨다.
- FEAR_FOMO: 놓쳤을 때의 손실·뒤처짐을 환기한다.
- ASPIRATION: 도달하고 싶은 상태·정체성을 그려준다.
- REATTRIBUTION: "당신 탓이 아니다". 자책 인정 → 원인은 당신이 아니라 구조/제품 → 구조적 해법 제시.
  반드시 이 3단 구조를 지켜라. 사용자를 탓하거나 훈계하지 마라.
- SELF_SELECTION: "이런 사람에게는 맞고, 이런 사람에게는 안 맞는다"로 스스로 걸러내게 한다.

산출물 유형(output_type)별 톤:
- COPY: 실제 노출되는 카피 문구 한 줄. 헤드라인으로 바로 쓸 수 있어야 한다.
- OFFER: 카피가 아니라 "오퍼(제안) 문구". 보장·교환·체험·구성 등 거래 조건으로 페인을 없앤다.
  예) 사이즈가 안 맞으면 무료 교환, 30일 안에 효과 없으면 전액 환불 같은 형태.
- PRODUCT_SPEC: 광고 문구가 아니라 "차기 제품 개선 과제" 메모. 무엇을 고쳐야 하는지 한 줄로.
- BASELINE_SPEC: 광고 문구가 아니라 "기본으로 반드시 충족해야 하는 사양" 목록 요약 한 줄.
  이건 차별화 소구점이 아니라, 빠지면 탈락하는 기본기다.`

const PURPOSE_TONE: Record<string, string> = {
  hook: '광고 후킹 — 스크롤을 멈추게 하는 말. 짧고 의외성 있게.',
  ad_conversion: '메타광고 전환 — 클릭해서 사게 하는 말. 편익과 행동을 분명히.',
  detail_page: '상세페이지 구매전환 — 이미 관심 있는 사람에게 확신을 주는 말. 과장보다 근거.',
  product_fit: '제품/오퍼 매력 — 애초에 팔릴 제품인지 판단하는 관점. 제품·오퍼 구조 중심.',
}

const SYSTEM_PROMPT = `너는 이커머스 소구점 발굴 파이프라인의 Stage4(앵글 생성)를 수행한다.
주어진 속성(aspect) 하나와 배정된 앵글 유형에 맞춰 한국어 산출물 1건을 만든다.

${ANGLE_TYPE_GUIDE}

작성 제약:
원문에 근거가 없는 효능·결과·변화는 단정하지 마라. 1인칭 경험담 형식으로 우회하는 것도 금지다.

반드시 JSON만 출력해라. 형식:
{ "angle_type": "배정된 유형 또는 허용 후보 중 하나",
  "headline_draft": "산출물 한 줄",
  "reason": "이 문구를 만든 근거 한 줄" }`

const COPY_REWRITE_SYSTEM_PROMPT = `너는 이커머스 카피의 실증 게이트를 통과시키는 편집자다.
입력으로 받은 문구는 근거 없이 성능·효능을 주장(UNSUBSTANTIATED)한다고 판정됐다.

성능·효능 주장을 완전히 제거하고, 대신 "불안 해소 장치"로 다시 써라.
불안 해소 장치란 구매자가 스스로 확인·통제할 수 있게 해주는 것이다:
사용 가이드, 확인 방법, 사용 조건 안내, 자가 점검 기준 등.
효과를 약속하지 말고, 확인하는 방법을 주어라.

재작성 시 원문(aspect의 notes, 프로젝트 입력 리뷰/광고 원문)에 실제로 존재하는 사실·정보만 사용해라. 환불 정책·체험 기간·보장 제도·증정품 등 어떤 형태의 정책·오퍼도 원문에 명시되지 않았다면 새로 만들어내지 마라. 원문에 불안 해소에 쓸 만한 사실이 없으면, 정책을 지어내는 대신 막연한 행동 유도(예: '직접 사용해보고 두피 상태를 확인하세요', '궁금하면 성분표를 확인해보세요')처럼 무언가를 보장하지 않는 문장으로만 재작성해라. 특정 숫자·기간·비율이 붙은 보장 문구는 원문에 그 숫자가 실제로 있을 때만 써라.

반드시 JSON만 출력해라. 형식:
{ "headline_draft": "다시 쓴 문구 한 줄", "reason": "무엇을 어떻게 바꿨는지 한 줄" }`

// BASELINE_SPEC / PRODUCT_SPEC 은 소비자 노출물이 아니라 내부 문서다.
// COPY 용 재작성 지시(불안 해소 장치 / 막연한 행동 유도 폴백)를 그대로 적용하면
// "직접 확인해보세요" 같은 설득형 CTA 가 사양서·개선과제 메모에 박힌다.
// 그래서 재작성 지시를 산출물 유형별로 갈라, 사양 계열은 사실 서술만 하게 한다.
const SPEC_REWRITE_SYSTEM_PROMPT = `너는 내부 문서를 다듬는 편집자다.
입력으로 받은 문장은 근거 없이 성능·효능을 주장(UNSUBSTANTIATED)한다고 판정됐다.

이 문장은 광고 카피가 아니다. 소비자에게 노출되지 않는 내부 문서다:
- BASELINE_SPEC: 경쟁 진입을 위해 반드시 충족해야 하는 기본 사양 요약
- PRODUCT_SPEC: 차기 제품에서 무엇을 고쳐야 하는지 적은 개선 과제 메모

근거 없는 효능·성능·결과 주장만 제거하고, 나머지는 사실을 담담하게 나열하는
서술문으로만 다시 써라. 설득하려 하지 마라.

금지:
- 행동 유도(CTA). '~하세요', '~해보세요', '~확인해보세요', '~바꾸세요' 같은 명령·권유 문장을 쓰지 마라.
- 구매자를 향해 말 걸지 마라. 읽는 사람은 소비자가 아니라 내부 담당자다.
- 불안 해소 장치(사용 가이드·자가 점검법 안내)로 바꾸지 마라. 그건 카피용 처방이다.
- 감탄·강조·수식(확실히, 압도적, 완벽히)을 붙이지 마라.

써야 할 형태: 충족해야 할 사양 항목 나열, 또는 고쳐야 할 문제의 사실 기술.
예) '약산성 pH 5.5, 비건 인증, 실리콘·설페이트 무첨가를 기본 사양으로 충족할 것.'
예) '지성 두피에서 오후 시간대 유분·체취 제어가 유지되지 않는 문제를 차기 제품에서 개선할 것.'

원문(aspect 의 notes, 프로젝트 입력 리뷰/광고 원문)에 실제로 존재하는 사실만 써라.
원문에 없는 성분·수치·정책·인증을 지어내지 마라.

반드시 JSON만 출력해라. 형식:
{ "headline_draft": "다시 쓴 문장 한 줄", "reason": "무엇을 어떻게 바꿨는지 한 줄" }`

/**
 * 재작성 지시는 산출물 유형에 따라 갈린다.
 * COPY/OFFER/STRUCTURE 는 소비자 노출물이라 기존 카피용 지시(막연한 행동 유도 폴백 포함)를 쓰고,
 * BASELINE_SPEC/PRODUCT_SPEC 은 내부 문서라 사실 서술 전용 지시를 쓴다.
 * 프롬프트와 라벨(mode)을 함께 돌려주는 이유: 둘을 따로 계산하면 응답의 rewrite_mode 가
 * 실제로 쓰인 프롬프트와 어긋나도 아무도 모른다(감사 경로가 거짓말을 한다).
 */
function rewriteInstructionFor(outputType: OutputType): { prompt: string; mode: 'copy' | 'spec' } {
  return outputType === 'BASELINE_SPEC' || outputType === 'PRODUCT_SPEC'
    ? { prompt: SPEC_REWRITE_SYSTEM_PROMPT, mode: 'spec' }
    : { prompt: COPY_REWRITE_SYSTEM_PROMPT, mode: 'copy' }
}

// 실증 판정은 writer 가 아니라 이 프롬프트를 쓰는 별도 호출이 담당한다.
// (writer 가 자기 문구를 스스로 판정하면 "1인칭 경험담이라 검증 대상 아님"으로 면죄부를 준다)
const JUDGE_SYSTEM_PROMPT = `너는 이커머스 카피의 실증 심사자다. 카피를 고치지 마라. 판정만 해라.

판정 분류:
- SUBSTANTIATED: 임상·인체적용시험·시험성적서·인증 등 원문에 제시된 근거로 뒷받침되는 주장
- EXPERIENTIAL: 사용감·경험 서술이라 검증 대상이 아닌 표현
- UNSUBSTANTIATED: 근거 없이 성능·효능·결과를 단정하는 주장

경험담·1인칭 서술 형식으로 포장됐더라도, 효능·결과·변화를 암시하거나 단정하는 내용이면(예: '~가 멈췄다', '~이 좋아졌다') 반드시 UNSUBSTANTIATED로 판정해라. '형식이 경험담이라 검증 대상이 아니다'는 사유는 허용하지 않는다 — 실제 근거(임상·시험 성적서·인증) 유무만으로 판정해라.

반대로 결과·변화·효능을 전혀 암시하지 않는 순수 감각/사용감/취향/형태 서술은 EXPERIENTIAL 이다.
이런 표현까지 UNSUBSTANTIATED 로 떨어뜨리지 마라 — 과잉 판정도 오판이다.

대조 예시:
- "머리 감고 나면 개운하다" → EXPERIENTIAL (결과를 주장하지 않는 순수 사용감)
- "머리 감는 법을 바꿨더니 탈모가 멈추기 시작했습니다" → UNSUBSTANTIATED (1인칭이지만 결과를 단정)
- "펌프가 한 손으로 눌려서 편하다" → EXPERIENTIAL (형태·사용감 서술)
- "펌프를 바꿨더니 두피 트러블이 사라졌습니다" → UNSUBSTANTIATED (1인칭이지만 변화를 단정)

SUBSTANTIATED 로 판정하려면 아래 '수집 원문'에서 근거가 되는 문장을 글자 그대로 인용해
evidence_quote 에 넣어야 한다. 인용할 문장이 없으면 SUBSTANTIATED 는 금지다.
요약·의역·짜깁기는 인용이 아니다.

반드시 JSON만 출력해라. 형식:
{ "verdict": "SUBSTANTIATED|EXPERIENTIAL|UNSUBSTANTIATED",
  "reason": "판정 사유 한 줄",
  "evidence_quote": "원문에서 그대로 인용한 문장 또는 null" }`

// judge 프롬프트에는 원문(corpus)이 앵글마다 반복 실려나가므로
// extract 의 상한(8k/120k)을 그대로 쓰면 토큰이 폭증한다. 여기서는 따로 좁게 잡는다.
const MAX_EVIDENCE_CHARS_PER_INPUT = 3000
const MAX_EVIDENCE_CHARS_TOTAL = 20000

// 실증 근거(임상·시험성적서·인증)는 리뷰가 아니라 광고/상세페이지에 들어있다.
// created_at 순으로 넣고 뒤를 자르면 근거가 든 광고가 먼저 잘려 SUBSTANTIATED 가 구조적으로 불가능해진다.
const EVIDENCE_SOURCE_PRIORITY: Record<string, number> = { ad: 0, detail_page: 1, review: 2 }

type EvidenceInputRow = { source_type: string | null; raw_text: string | null }

/** judge 에 넘길 근거 원문. normalized 는 인용 검증(공백 무시 비교)용 사본. */
type EvidenceCorpus = { text: string; normalized: string }

/** 연속 공백을 1칸으로 축약 — 모델이 줄바꿈/공백만 다르게 인용해도 통과시키기 위함. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function buildEvidenceCorpus(inputs: EvidenceInputRow[]): EvidenceCorpus {
  const sorted = [...inputs].sort(
    (a, b) =>
      (EVIDENCE_SOURCE_PRIORITY[a.source_type ?? ''] ?? 99) -
      (EVIDENCE_SOURCE_PRIORITY[b.source_type ?? ''] ?? 99),
  )

  const parts: string[] = []
  let used = 0
  let truncated = false

  for (let i = 0; i < sorted.length; i++) {
    const full = String(sorted[i].raw_text ?? '')
    let text = full.slice(0, MAX_EVIDENCE_CHARS_PER_INPUT)
    if (text.length < full.length) truncated = true

    const remain = MAX_EVIDENCE_CHARS_TOTAL - used
    if (remain <= 0) {
      truncated = true
      break
    }
    if (text.length > remain) {
      text = text.slice(0, remain)
      truncated = true
    }

    used += text.length
    parts.push(`### 원문 ${i + 1} (source_type: ${sorted[i].source_type ?? '-'})\n${text}`)
  }

  // 잘렸다는 사실을 알려야 judge 가 "근거 없음"과 "잘림"을 혼동하지 않는다.
  if (truncated) parts.push('(원문 일부 생략됨)')

  const text = parts.length > 0 ? parts.join('\n\n') : '(수집된 원문 없음)'
  return { text, normalized: normalizeWhitespace(text) }
}

// 산출물 유형별로 "소비자 노출물인가"가 다르다. PRODUCT_SPEC 을 광고 주장으로 오인하면 오탐이 난다.
const OUTPUT_TYPE_JUDGE_NOTE: Record<string, string> = {
  COPY: '소비자에게 실제로 노출되는 카피 문구다.',
  OFFER: '소비자에게 제시되는 오퍼(보장·교환·환불 등 거래 조건) 문구다.',
  BASELINE_SPEC: '광고 문구가 아니라 반드시 충족해야 할 기본 사양 요약이다.',
  PRODUCT_SPEC:
    '소비자 노출물이 아니라 내부용 차기 제품 개선 과제 메모다. 광고 주장이 아니므로 과잉 판정하지 마라.',
}

/**
 * judge 에게 줄 프롬프트.
 * writer 의 reason 은 절대 넣지 않는다 — judge 가 writer 의 자기 정당화에 앵커링된다.
 * 점수(I/S)·사분면도 판정과 무관하므로 뺀다.
 */
function buildJudgePrompt(
  headline: string,
  aspects: AspectRow[],
  outputType: OutputType,
  evidence: EvidenceCorpus,
): string {
  const lines = ['## 심사 대상 문구', headline || '(문구 없음)', '', '## 이 문구가 근거로 삼은 속성']

  if (aspects.length === 0) {
    lines.push('- (연결된 속성 없음)')
  } else {
    for (const a of aspects) {
      lines.push(
        `- 속성명: ${a.name}`,
        `  레이어: ${a.aspect_layer ?? '-'}`,
        `  판단근거: ${a.notes ?? '-'}`,
      )
    }
  }

  lines.push(
    '',
    '## 산출물 유형',
    `- ${outputType}: ${OUTPUT_TYPE_JUDGE_NOTE[outputType] ?? ''}`,
    '',
    '## 수집 원문 (근거 후보 전문)',
    evidence.text,
    '',
    '위 원문에 없는 근거를 지어내지 마라. 원문에 임상·시험·인증 언급이 없으면 SUBSTANTIATED 는 불가능하다.',
  )
  return lines.join('\n')
}

function aspectBlock(a: AspectRow): string {
  return [
    `- 속성명: ${a.name}`,
    `- 레이어: ${a.aspect_layer ?? '-'} / 사분면: ${a.quadrant ?? '-'}`,
    `- 중요도: ${a.importance ?? '-'} / 만족도: ${a.satisfaction ?? '-'} / 기회점수: ${a.opportunity_score ?? '-'}`,
    `- 귀인: ${a.attribution ?? '(없음 — 불만이 아닌 속성)'} / 인지시점: ${a.pain_timing ?? '-'}`,
    `- 페르소나: ${a.persona_role ?? '-'} / 세그먼트축: ${a.is_segmentation_axis ? '예' : '아니오'}`,
    `- 가치실현빈도: ${a.value_realization_frequency ?? '-'}`,
    `- 판단근거: ${a.notes ?? '-'}`,
  ].join('\n')
}

function buildUserPrompt(plan: AnglePlan, project: ProjectRow, candidates: AngleType[]): string {
  const head = [
    '## 분석 대상',
    `- 경쟁사 상품 URL: ${project.competitor_url}`,
    `- 내 상품 한 줄 소개: ${project.product_elevator_pitch}`,
    `- 분석 목적: ${project.purpose} — ${PURPOSE_TONE[project.purpose] ?? ''}`,
    `- 시장 성숙도: ${project.maturity_stage ?? '미판정'}단계 (${project.maturity_notes ?? '-'})`,
    '',
    '## 배정',
    `- 배정된 앵글 유형: ${plan.angleType}`,
    `- 선택 가능한 유형: ${candidates.join(', ')} (이 밖으로 나가지 마라)`,
    `- 산출물 유형(output_type): ${plan.outputType}`,
    `- 배정 근거: ${plan.rule}`,
    '',
  ]

  if (plan.groupedAspects?.length) {
    head.push('## 대상 속성들 (기본기 묶음)')
    for (const a of plan.groupedAspects) head.push(aspectBlock(a), '')
    head.push('위 속성들은 "있어도 차별화되지 않지만 없으면 탈락하는 기본기"다.')
    head.push('개별 소구 카피가 아니라, 반드시 충족해야 할 기본 사양을 한 줄로 요약해라.')
  } else {
    head.push('## 대상 속성')
    head.push(aspectBlock(plan.groupedAspects?.[0] ?? ({} as AspectRow)))
  }
  return head.join('\n')
}

// ── 앵글 1건 생성 ────────────────────────────────────────────────
// write → judge → (UNSUBSTANTIATED 면) rewrite → re-judge 에서 정지.
// 평시 2호출, 최악 4호출. 재차 UNSUBSTANTIATED 여도 루프하지 않는다(비용 폭주 방지).
type GeneratedAngle = {
  plan: AnglePlan
  angleType: AngleType
  headline: string
  /** rewrite 전 원문 (rewrite 했을 때만) */
  headlineOriginal?: string
  /** 최종(재심사 반영) 판정 */
  verdict: SubstantiationVerdict
  /** judge 판정 사유 */
  verdictReason: string
  /** SUBSTANTIATED 근거 인용 (코드 검증을 통과한 것만) */
  evidenceQuote: string | null
  /** writer 의 작성 근거 — 감사용. judge 에는 넘기지 않는다. */
  writerReason: string
  rewritten: boolean
  rewriteReason?: string
  /** 재작성 지시가 카피용이었는지 사양용이었는지 — 유형별 분기가 실제로 걸렸는지 확인용 */
  rewriteMode?: 'copy' | 'spec'
  /** 이 앵글에 쓴 LLM 호출 수 */
  llmCalls: number
  /** 이 앵글을 만든 실제 모델명(호출 순). 모델이 바뀌어 결과가 달라졌을 때 추적용. */
  models: string[]
}

type JudgeResult = {
  verdict: SubstantiationVerdict
  reason: string
  evidenceQuote: string | null
  /** 이 판정을 낸 실제 모델명 */
  model: string
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

/**
 * 실증 판정 1회. 프롬프트만으로는 막히지 않는 두 가지를 코드로 막는다.
 *  (A) 인용 환각 — SUBSTANTIATED 인데 인용이 없거나 원문에 없으면 UNSUBSTANTIATED 로 강등
 *  (B) fail-close — 파싱이 어긋나면 통과(EXPERIENTIAL)가 아니라 UNSUBSTANTIATED
 */
async function judgeHeadline(
  provider: LlmProvider,
  headline: string,
  aspects: AspectRow[],
  outputType: OutputType,
  evidence: EvidenceCorpus,
  label: 'angle:judge' | 'angle:rejudge',
): Promise<JudgeResult> {
  const { data: parsed, model } = await callLlmJsonWithModel(
    provider,
    JUDGE_SYSTEM_PROMPT,
    buildJudgePrompt(headline, aspects, outputType, evidence),
    label,
  )

  let verdict =
    pickEnum<SubstantiationVerdict>(parsed.verdict, SUBSTANTIATION_VERDICTS) ?? 'UNSUBSTANTIATED'
  let reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''
  let quote =
    typeof parsed.evidence_quote === 'string' && parsed.evidence_quote.trim()
      ? parsed.evidence_quote.trim()
      : null

  if (verdict === 'SUBSTANTIATED') {
    const needle = normalizeWhitespace(quote ?? '')
    if (!needle || !evidence.normalized.includes(needle)) {
      console.warn(
        `[analyze/angle] ${label}: SUBSTANTIATED 강등 — ${needle ? '인용이 원문에 없음' : '인용 없음'} quote=${JSON.stringify((quote ?? '').slice(0, 120))}`,
      )
      verdict = 'UNSUBSTANTIATED'
      reason = `${reason || '(사유 없음)'} / 코드검증: 원문 인용이 확인되지 않아 강등`
      quote = null
    }
  }

  return { verdict, reason, evidenceQuote: verdict === 'SUBSTANTIATED' ? quote : null, model }
}

async function generateAngle(
  provider: LlmProvider,
  plan: AnglePlan,
  project: ProjectRow,
  aspectsById: Map<string, AspectRow>,
  evidence: EvidenceCorpus,
): Promise<GeneratedAngle> {
  // 규칙으로 확정된 유형은 후보를 1개로 고정하고, 4순위(기본값)일 때만 성숙도 후보군을 준다.
  const candidates = plan.rule.startsWith('4순위')
    ? defaultCandidates(project.maturity_stage)
    : [plan.angleType]

  const target = plan.groupedAspects ?? (plan.aspectId ? [aspectsById.get(plan.aspectId)!] : [])
  const userPrompt = buildUserPrompt({ ...plan, groupedAspects: target }, project, candidates)

  let llmCalls = 0
  // 호출마다 실제 사용된 모델을 모은다 — 도중에 모델이 폴백되면 앵글 하나 안에서도 섞일 수 있다.
  const models: string[] = []
  const { data: parsed, model: writerModel } = await callLlmJsonWithModel(
    provider,
    SYSTEM_PROMPT,
    userPrompt,
    'angle:generate',
  )
  llmCalls++
  models.push(writerModel)

  const angleType = pickEnum<AngleType>(parsed.angle_type, ANGLE_TYPES) ?? plan.angleType
  let headline = typeof parsed.headline_draft === 'string' ? parsed.headline_draft.trim() : ''
  const writerReason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''

  // 판정 권한은 writer 에 없다. 별도 judge 호출이 원문 근거만 보고 판정한다.
  let judged = await judgeHeadline(provider, headline, target, plan.outputType, evidence, 'angle:judge')
  llmCalls++
  models.push(judged.model)

  // 실증 게이트: 근거 없는 성능 주장이면 성능 주장을 빼고 다시 쓴다.
  // 무엇으로 다시 쓰는지는 산출물 유형이 정한다 — 카피는 불안 해소 장치로,
  // 사양(BASELINE_SPEC/PRODUCT_SPEC)은 설득 없는 사실 서술로.
  let rewritten = false
  let rewriteReason: string | undefined
  let rewriteMode: 'copy' | 'spec' | undefined
  let headlineOriginal: string | undefined

  if (judged.verdict === 'UNSUBSTANTIATED') {
    const instruction = rewriteInstructionFor(plan.outputType)
    const { data: rw, model: rewriteModel } = await callLlmJsonWithModel(
      provider,
      instruction.prompt,
      [
        `## 원래 문구 (UNSUBSTANTIATED 판정)`,
        headline,
        '',
        `## 판정 사유`,
        judged.reason || '(없음)',
        '',
        `## 수집 원문 (여기 있는 사실만 쓸 수 있다)`,
        evidence.text,
        '',
        `## 맥락`,
        userPrompt,
      ].join('\n'),
      'angle:rewrite',
    )
    llmCalls++
    models.push(rewriteModel)

    const newHeadline = typeof rw.headline_draft === 'string' ? rw.headline_draft.trim() : ''
    if (newHeadline) {
      headlineOriginal = headline
      headline = newHeadline
      rewritten = true
      rewriteReason = typeof rw.reason === 'string' ? rw.reason.trim() : ''
      rewriteMode = instruction.mode

      // 재심사. 이걸 안 하면 성능 주장을 걷어낸 안전한 문구에
      // "근거 없는 효능 주장" 라벨이 그대로 붙어 저장된다(정합성 버그).
      judged = await judgeHeadline(provider, headline, target, plan.outputType, evidence, 'angle:rejudge')
      llmCalls++
      models.push(judged.model)
      // 재차 UNSUBSTANTIATED 여도 여기서 정지한다. 루프 금지.
    }
  }

  return {
    plan,
    angleType,
    headline,
    headlineOriginal,
    verdict: judged.verdict,
    verdictReason: judged.reason,
    evidenceQuote: judged.evidenceQuote,
    writerReason,
    rewritten,
    rewriteReason,
    rewriteMode,
    llmCalls,
    models,
  }
}

/** 동시 실행 상한을 두고 순서를 보존하며 처리한다. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// ── POST: 앵글 생성 ──────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const provider = resolveProvider()
  // mock 은 키가 필요 없으므로 requiredKey 가 null 이다.
  const requiredKey = requiredKeyFor(provider)
  if (requiredKey && !process.env[requiredKey]) {
    console.error(`[analyze/angle] ${requiredKey} is not set (provider=${provider})`)
    return NextResponse.json({ error: '분석 엔진이 설정되지 않았습니다.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const projectId = typeof body?.project_id === 'string' ? body.project_id.trim() : ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }
  // 프롬프트를 여러 번 돌려보려면 기존 앵글이 남아 있어야 비교 기준선이 생긴다.
  // dry_run 이면 DELETE/INSERT/status 전환을 전부 건너뛰고 생성 결과만 돌려준다.
  const dryRun = body?.dry_run === true

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, maturity_stage, maturity_notes')
    .eq('id', projectId)
    .single<ProjectRow>()

  if (projectError || !project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (project.status !== 'reviewed') {
    return NextResponse.json(
      { error: '검수 완료 후에만 앵글을 생성할 수 있습니다.', status: project.status },
      { status: 400 },
    )
  }

  const { data: aspects, error: aspectsError } = await supabase
    .from('analysis_aspects')
    .select('id, name, aspect_layer, importance, satisfaction, opportunity_score, quadrant, attribution, pain_timing, persona_role, is_segmentation_axis, value_realization_frequency, notes')
    .eq('project_id', projectId)
    .eq('human_confirmed', true)
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .returns<AspectRow[]>()

  if (aspectsError) {
    return NextResponse.json({ error: '속성 조회 실패' }, { status: 500 })
  }
  const list = aspects ?? []
  if (list.length === 0) {
    return NextResponse.json({ error: '검수 완료된 속성이 없습니다.' }, { status: 400 })
  }

  const aspectsById = new Map(list.map(a => [a.id, a]))

  // judge 가 볼 근거 원문. 앵글마다 재조회하면 N배 DB 왕복이라 요청당 1회만 읽는다.
  const { data: rawInputs, error: inputsError } = await supabase
    .from('analysis_inputs')
    .select('source_type, raw_text')
    .eq('project_id', projectId)
    .returns<EvidenceInputRow[]>()

  if (inputsError) {
    console.error('[analyze/angle] inputs fetch error:', inputsError.message)
    return NextResponse.json({ error: '수집 원문 조회 실패' }, { status: 500 })
  }
  const evidence = buildEvidenceCorpus(rawInputs ?? [])

  // 1. 설계도 확정 (LLM 호출 전에 코드가 규칙으로 결정)
  const plans: AnglePlan[] = []
  const skipped: { aspect: AspectRow; reason: string }[] = []

  for (const a of list.filter(x => x.quadrant === 'DIFFERENTIATOR')) {
    const p = planForDifferentiator(a, project)
    if ('skip' in p) {
      // 카피에서 빼고 차기 제품 개선 과제로 1건 남긴다.
      skipped.push({ aspect: a, reason: 'detail_page + POST_PURCHASE' })
      plans.push({
        aspectId: a.id, aspectName: a.name,
        angleType: 'PAS', // PRODUCT_SPEC 은 광고 앵글이 아니라 메모라 유형은 형식상 값
        outputType: 'PRODUCT_SPEC',
        rule: 'detail_page + POST_PURCHASE → 카피 제외, 제품 개선 과제',
        groupedAspects: [a],
      })
      continue
    }
    plans.push({ ...p, groupedAspects: [a] })
  }

  // 2. TABLE_STAKES 는 프로젝트당 1건으로 묶는다 (BASELINE_SPEC)
  const tableStakes = list.filter(a => a.quadrant === 'TABLE_STAKES')
  if (tableStakes.length > 0) {
    plans.push({
      // analysis_angles.aspect_id 는 nullable 이고 여러 속성을 묶으므로 null 로 둔다.
      aspectId: null,
      aspectName: `기본기 ${tableStakes.length}건 묶음`,
      angleType: 'COMPARISON',
      outputType: 'BASELINE_SPEC',
      rule: 'TABLE_STAKES 묶음',
      groupedAspects: tableStakes,
    })
  }

  if (plans.length === 0) {
    return NextResponse.json(
      { error: '앵글을 만들 속성이 없습니다. (DIFFERENTIATOR/TABLE_STAKES 없음)' },
      { status: 400 },
    )
  }

  // 3. LLM 호출
  const startedAt = Date.now()
  let generated: GeneratedAngle[]
  try {
    generated = await mapWithLimit(plans, CONCURRENCY, p =>
      generateAngle(provider, p, project, aspectsById, evidence),
    )
  } catch (e) {
    const detail = describeFailure(e)
    console.error(`[analyze/angle] project=${projectId} generation failed: ${detail}`)
    return NextResponse.json({ error: `앵글 생성에 실패했습니다: ${detail}` }, { status: 502 })
  }
  const llmCallsTotal = generated.reduce((sum, g) => sum + g.llmCalls, 0)
  console.log(
    `[analyze/angle] project=${projectId} provider=${provider} ${plans.length}건 llm=${llmCallsTotal}회 ${Date.now() - startedAt}ms${dryRun ? ' (dry_run)' : ''}`,
  )

  // 4. 기존 앵글 교체 후 저장 (재실행 시 중복 누적 방지)
  //    dry_run 이면 여기 전체를 건너뛴다 — 기존 앵글이 기준선으로 남아야 비교가 된다.
  let anglesCreated = 0

  if (!dryRun) {
    const { error: deleteError } = await supabase
      .from('analysis_angles')
      .delete()
      .eq('project_id', projectId)
    if (deleteError) {
      return NextResponse.json({ error: `기존 앵글 삭제 실패: ${deleteError.message}` }, { status: 500 })
    }

    const rows = generated.map(g => ({
      project_id: projectId,
      aspect_id: g.plan.aspectId,
      angle_type: g.angleType,
      output_type: g.plan.outputType,
      headline_draft: g.headline || null,
      // 재심사까지 마친 최종 판정을 저장한다.
      substantiation_verdict: g.verdict,
      // 판정 근거 — 응답에만 있으면 요청이 끝나는 순간 사라져 사후 추적이 불가능하다.
      substantiation_reason: g.verdictReason || null,
      // 코드 검증(원문 포함 여부)을 통과한 인용만 들어온다. 아니면 이미 null 이다.
      substantiation_evidence: g.evidenceQuote,
      // 재작성이 없었으면 undefined 이므로 null 로 눕힌다.
      headline_original: g.headlineOriginal ?? null,
      gate_rewritten: g.rewritten,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('analysis_angles')
      .insert(rows)
      .select('id')

    if (insertError) {
      return NextResponse.json({ error: `앵글 저장 실패: ${insertError.message}` }, { status: 500 })
    }
    anglesCreated = inserted?.length ?? 0

    const { error: statusError } = await supabase
      .from('analysis_projects')
      .update({ status: 'angled' })
      .eq('id', projectId)

    if (statusError) {
      return NextResponse.json({ error: `상태 변경 실패: ${statusError.message}` }, { status: 500 })
    }
  }

  // DB 에는 verdict 만 남으므로, 판정 사유·인용·재작성 이력은 이 응답이 유일한 감사 경로다.
  return NextResponse.json({
    status: dryRun ? project.status : 'angled',
    dry_run: dryRun,
    provider,
    // 실제로 응답을 만든 모델. 폴백이 일어나면 2개 이상이 찍힌다 —
    // "결과가 달라졌는데 어느 모델이었나"를 사후에 가릴 수 있는 유일한 기록이다.
    models_used: [...new Set(generated.flatMap(g => g.models))],
    angles_created: anglesCreated,
    elapsed_ms: Date.now() - startedAt,
    llm_calls_total: llmCallsTotal,
    gate_rewritten: generated.filter(g => g.rewritten).length,
    skipped_for_product_spec: skipped.map(s => s.aspect.name),
    angles: generated.map(g => ({
      aspect_id: g.plan.aspectId,
      aspect_name: g.plan.aspectName,
      angle_type: g.angleType,
      output_type: g.plan.outputType,
      rule: g.plan.rule,
      headline_draft: g.headline,
      ...(g.headlineOriginal ? { headline_original: g.headlineOriginal } : {}),
      substantiation_verdict: g.verdict,
      verdict_reason: g.verdictReason,
      evidence_quote: g.evidenceQuote,
      reason: g.writerReason,
      rewritten: g.rewritten,
      ...(g.rewriteReason ? { rewrite_reason: g.rewriteReason } : {}),
      ...(g.rewriteMode ? { rewrite_mode: g.rewriteMode } : {}),
      llm_calls: g.llmCalls,
      models: g.models,
    })),
  })
}

// ── GET: 생성된 앵글 목록 ────────────────────────────────────────
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() ?? ''
  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 정보가 없습니다.' }, { status: 400 })
  }

  const { data: project, error: projectError } = await supabase
    .from('analysis_projects')
    .select('id, status, purpose, maturity_stage')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: angles, error } = await supabase
    .from('analysis_angles')
    .select('id, aspect_id, angle_type, output_type, headline_draft, substantiation_verdict, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: '앵글 조회 실패' }, { status: 500 })
  }

  // 앵글에 붙은 속성 이름을 같이 돌려준다 (화면에서 바로 쓰기 위함)
  const { data: aspects } = await supabase
    .from('analysis_aspects')
    .select('id, name, quadrant')
    .eq('project_id', projectId)
  const nameById = new Map((aspects ?? []).map(a => [a.id, a.name]))

  return NextResponse.json({
    project,
    angles: (angles ?? []).map(a => ({
      ...a,
      aspect_name: a.aspect_id ? (nameById.get(a.aspect_id) ?? null) : null,
    })),
    count: angles?.length ?? 0,
  })
}
