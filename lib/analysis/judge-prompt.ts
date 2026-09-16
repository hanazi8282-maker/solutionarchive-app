// judge(실증 심사) 프롬프트와 근거 코퍼스. route 에서 뺀 이유는 두 가지다.
//   1. 순수 node 셀프테스트가 route 파일을 import 할 수 없다(next/server 등 런타임 전용 import).
//      angle-adaptation.ts 를 뺀 것과 같은 이유.
//   2. 여기 프롬프트의 **줄 순서 자체가 비용 구조**라서, 테스트로 고정해야 한다(아래).
//
// ⚠️ 순서 규칙 (진단 1-2) — 바꾸지 마라.
//
//   코퍼스(최대 20KB)는 요청당 1회만 DB 에서 읽지만 LLM 에는 앵글마다 매번 실려 나간다.
//   앵글 6~8건 × (judge + 재작성 + 재심사) 최대 3회 = 같은 20KB 를 20회 이상 전송한다.
//   Gemini 암묵적 캐시는 **앞쪽 공통 접두사가 일치할 때만** 걸리므로, 변하는 부분
//   (심사 대상 문구·속성 메모·산출물 유형)이 맨 앞에 있으면 적중률이 구조적으로 0 이다.
//
//   그래서 불변(코퍼스) → 가변(유형·속성·문구) 순으로 쓴다. 판정 품질에는 영향이 없다 —
//   같은 정보가 같은 프롬프트 안에 다 들어 있고, 지시문이 절 이름으로 참조한다.
//   buildJudgePrompt 의 두 결과가 코퍼스 길이만큼 공통 접두사를 갖는지는
//   scripts/analyze-judge-prompt-selftest.mjs 가 대조한다.

/** 실증 판정은 writer 가 아니라 이 프롬프트를 쓰는 별도 호출이 담당한다.
 * (writer 가 자기 문구를 스스로 판정하면 "1인칭 경험담이라 검증 대상 아님"으로 면죄부를 준다) */
export const JUDGE_SYSTEM_PROMPT = `너는 이커머스 카피의 실증 심사자다. 카피를 고치지 마라. 판정만 해라.

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

SUBSTANTIATED 로 판정하려면 '수집 원문' 절에서 근거가 되는 문장을 글자 그대로 인용해
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

export type EvidenceInputRow = { source_type: string | null; raw_text: string | null }

/** judge 에 넘길 근거 원문. normalized 는 인용 검증(공백 무시 비교)용 사본. */
export type EvidenceCorpus = { text: string; normalized: string }

/** buildJudgePrompt 가 쓰는 속성 필드만. route 의 AspectRow 가 이 모양을 만족한다. */
export type JudgeAspect = { name: string; aspect_layer: string | null; notes: string | null }

/** 연속 공백을 1칸으로 축약 — 모델이 줄바꿈/공백만 다르게 인용해도 통과시키기 위함. */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function buildEvidenceCorpus(inputs: EvidenceInputRow[]): EvidenceCorpus {
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
 *
 * 줄 순서: 한 프로젝트 안에서 **같은 코퍼스가 맨 앞**에 오고, 앵글마다 달라지는 것이
 * 뒤에 온다. 이 순서가 캐시 적중의 전제다(파일 헤더 참조).
 */
export function buildJudgePrompt(
  headline: string,
  aspects: JudgeAspect[],
  outputType: string,
  evidence: EvidenceCorpus,
): string {
  // ── 여기부터 프로젝트 안에서 불변 (캐시 접두사) ──
  const lines = ['## 수집 원문 (근거 후보 전문)', evidence.text, '']

  // ── 여기부터 앵글마다 달라진다 ──
  lines.push(
    '## 산출물 유형',
    `- ${outputType}: ${OUTPUT_TYPE_JUDGE_NOTE[outputType] ?? ''}`,
    '',
    '## 이 문구가 근거로 삼은 속성',
  )

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
    '## 심사 대상 문구',
    headline || '(문구 없음)',
    '',
    "'수집 원문' 절에 없는 근거를 지어내지 마라. 원문에 임상·시험·인증 언급이 없으면 SUBSTANTIATED 는 불가능하다.",
  )
  return lines.join('\n')
}

/** 한 프로젝트 안에서 모든 judge 프롬프트가 공유하는 접두사. 캐시 적중 여부의 기준이자 테스트 기준. */
export function judgeCachePrefix(evidence: EvidenceCorpus): string {
  return ['## 수집 원문 (근거 후보 전문)', evidence.text, ''].join('\n')
}
