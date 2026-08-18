// LLM_PROVIDER=mock 일 때 실제 API 호출 대신 돌려주는 고정 응답.
//
// 목적: 파이프라인(extract → review → angle)의 배선·정규화·DB 저장·게이트 분기를
// API 쿼터 한 건도 쓰지 않고 끝까지 돌려보는 것. 문구의 품질은 검증 대상이 아니다.
//
// 원칙
//  - 결정론적: 같은 입력이면 항상 같은 출력. 재현 테스트가 가능해야 한다.
//  - 지연 없음: 실제 호출처럼 흉내내지 않는다. 즉시 반환한다.
//  - 스키마 충실: 호출부의 정규화(pickEnum/pickScore)가 값을 버리지 않도록
//    실제 모델이 낼 법한 값만 채운다.
//
// 호출 종류는 llm.ts 가 넘겨주는 label 로 구분한다.
//   extract | angle:generate | angle:judge | angle:rejudge | angle:rewrite

/** mock 이 스스로를 식별하는 "모델명". 로그·응답 추적에서 실제 모델과 구분된다. */
export const MOCK_MODEL = 'mock'

// ── Stage1+Stage2 (extract) ──────────────────────────────────────
// 5개 aspect. aspect_layer/importance/satisfaction/attribution/pain_timing 이
// 전부 채워진 상태이고, 사분면(Stage3)이 네 칸에 골고루 떨어지도록
// 중요도·만족도를 흩뜨려 놓았다 — 후속 단계의 분기를 전부 태우기 위함.
//
// 만족 속성(4번)의 attribution 은 의도적으로 null 이다.
// "불만이 아닌 속성에는 귀인을 붙이지 않는다"는 프롬프트 규칙을 mock 도 지킨다.
const EXTRACT_RESPONSE = {
  maturity_stage: 3,
  maturity_notes: '(mock) 고유 메커니즘을 내세우는 문구가 등장하나 아직 겹침은 적음',
  m_meta_signal: true,
  aspects: [
    {
      name: '(mock) 두피 자극·트러블',
      aspect_layer: 'OUTCOME',
      importance: 9,
      satisfaction: 3,
      attribution: 'PRODUCT_FAULT',
      pain_timing: 'POST_PURCHASE',
      persona_role: 'USER',
      proxy_consumption: false,
      is_segmentation_axis: true,
      value_realization_frequency: 'HIGH',
      notes: '(mock) 사용 후 따갑다는 언급이 반복되고, 반대로 순하다는 극찬도 함께 존재',
    },
    {
      name: '(mock) 사용법 안내 부족',
      aspect_layer: 'PROCESS',
      importance: 8,
      satisfaction: 4,
      attribution: 'USER_FAULT',
      pain_timing: 'POST_PURCHASE',
      persona_role: 'BUYER',
      proxy_consumption: false,
      is_segmentation_axis: false,
      value_realization_frequency: 'MEDIUM',
      notes: '(mock) 사용량·주기를 몰라 잘못 쓴 뒤 효과가 없다고 적은 후기가 다수',
    },
    {
      name: '(mock) 펌프 사용성',
      aspect_layer: 'PRODUCT',
      importance: 4,
      satisfaction: 8,
      attribution: 'PRODUCT_FAULT',
      pain_timing: 'PRE_PURCHASE',
      persona_role: 'USER',
      proxy_consumption: false,
      is_segmentation_axis: false,
      value_realization_frequency: 'HIGH',
      notes: '(mock) 한 손으로 눌린다는 칭찬이 있으나 새는 개체가 있다는 언급도 소수',
    },
    {
      name: '(mock) 향',
      aspect_layer: 'PRODUCT',
      importance: 3,
      satisfaction: 9,
      attribution: null,
      pain_timing: 'PRE_PURCHASE',
      persona_role: 'USER',
      proxy_consumption: false,
      is_segmentation_axis: true,
      value_realization_frequency: 'HIGH',
      notes: '(mock) 향에 대한 만족이 높고 불만 언급이 거의 없음 — 귀인 대상 아님',
    },
    {
      name: '(mock) 초기 부작용·주의사항',
      aspect_layer: 'OUTCOME',
      importance: 6,
      satisfaction: 2,
      attribution: 'ENVIRONMENT',
      pain_timing: 'POST_PURCHASE',
      persona_role: 'PAYER',
      proxy_consumption: true,
      is_segmentation_axis: false,
      value_realization_frequency: 'LOW',
      notes: '(mock) 초기 탈락 증가·기저질환 주의 언급 — 빈도는 낮지만 안전 신호라 별도 추출',
    },
  ],
}

// ── 프롬프트에서 값 꺼내기 ───────────────────────────────────────
// mock 이라도 배정된 앵글 유형은 그대로 되돌려줘야 라우트의 유형 배정 로직이
// 검증된다. 고정 문자열을 돌려주면 배정 규칙이 전부 무의미해진다.

/** `- 배정된 앵글 유형: PAS` 형태의 줄에서 값을 꺼낸다. */
function extractAssignedAngleType(userPrompt: string): string | null {
  return userPrompt.match(/^- 배정된 앵글 유형:\s*(\S+)\s*$/m)?.[1] ?? null
}

/** judge 프롬프트의 `## 심사 대상 문구` 바로 다음 줄(= 심사 대상 카피). */
function extractJudgedHeadline(userPrompt: string): string {
  return userPrompt.match(/^## 심사 대상 문구\n(.*)$/m)?.[1]?.trim() ?? ''
}

/** judge 프롬프트의 `## 수집 원문 (근거 후보 전문)` 이하 본문. */
function extractEvidenceSection(userPrompt: string): string {
  const start = userPrompt.indexOf('## 수집 원문 (근거 후보 전문)')
  if (start === -1) return ''
  const body = userPrompt.slice(start).split('\n').slice(1).join('\n')
  // 프롬프트 꼬리의 지시문은 원문이 아니므로 잘라낸다.
  const tail = body.indexOf('위 원문에 없는 근거를')
  return (tail === -1 ? body : body.slice(0, tail)).trim()
}

/**
 * 원문에서 "그대로 인용"으로 쓸 문장 하나를 고른다.
 *
 * angle 라우트는 SUBSTANTIATED 판정에 대해 인용문이 원문에 실제로 있는지
 * 코드로 검증하고, 없으면 UNSUBSTANTIATED 로 강등한다. mock 이 문장을
 * 지어내면 SUBSTANTIATED 경로가 항상 강등돼 검증할 수 없으므로,
 * 프롬프트에 실려온 원문에서 실제 문장을 뽑아 쓴다.
 */
function pickQuoteFromEvidence(evidence: string): string | null {
  const candidates = evidence
    .split('\n')
    .map(l => l.trim())
    // 코퍼스 구분 헤더(### 원문 1 ...)와 생략 표시는 원문 문장이 아니다.
    .filter(l => l && !l.startsWith('###') && !l.startsWith('(원문'))
  // 너무 짧은 줄은 우연히 다른 곳에도 들어맞아 검증이 무의미해진다.
  return candidates.find(l => l.length >= 10)?.slice(0, 200) ?? null
}

/** 문자열 → 32bit 해시(FNV-1a). 같은 입력이면 항상 같은 값이라 판정이 결정론적이다. */
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// ── 라벨별 응답 ──────────────────────────────────────────────────

function generateResponse(userPrompt: string): object {
  const angleType = extractAssignedAngleType(userPrompt) ?? 'PAS'
  return {
    angle_type: angleType,
    headline_draft: `(mock/${angleType}) 바꾸고 나서 두피 트러블이 사라졌습니다`,
    reason: '(mock) 배정된 유형과 속성만 보고 만든 고정 문구',
  }
}

/**
 * 첫 판정. 앵글마다 SUBSTANTIATED / UNSUBSTANTIATED 가 섞여 나와야
 * 재작성(rewrite) 경로도 mock 으로 확인할 수 있다.
 *
 * 심사 대상 문구의 해시로 갈라 결정론을 유지한다 — 같은 앵글은 몇 번을 돌려도
 * 같은 판정이 나오고, 서로 다른 앵글끼리는 두 갈래로 나뉜다.
 */
function judgeResponse(userPrompt: string): object {
  const headline = extractJudgedHeadline(userPrompt)
  const quote = pickQuoteFromEvidence(extractEvidenceSection(userPrompt))

  // 인용할 원문이 없으면 SUBSTANTIATED 는 어차피 코드 검증에서 강등된다.
  // 강등 로그로 검증 결과를 흐리지 말고 처음부터 UNSUBSTANTIATED 로 낸다.
  if (quote && hash32(headline) % 2 === 0) {
    return {
      verdict: 'SUBSTANTIATED',
      reason: '(mock) 원문에 근거 문장이 있다고 가정한 고정 판정',
      evidence_quote: quote,
    }
  }
  return {
    verdict: 'UNSUBSTANTIATED',
    reason: '(mock) 근거 없이 결과를 단정한다고 가정한 고정 판정',
    evidence_quote: null,
  }
}

function rewriteResponse(): object {
  return {
    headline_draft: '(mock) 사용 전 두피 상태를 한 번 확인하고 시작하세요',
    reason: '(mock) 효능 주장을 빼고 스스로 확인하는 방법으로 교체',
  }
}

/**
 * 재작성본 재심사. 성능 주장을 걷어낸 문구이므로 EXPERIENTIAL 로 통과시킨다.
 * (여기서 다시 UNSUBSTANTIATED 를 내면 게이트가 제 역할을 하는지 확인할 수 없다)
 */
function rejudgeResponse(): object {
  return {
    verdict: 'EXPERIENTIAL',
    reason: '(mock) 재작성으로 효능 주장이 제거되어 검증 대상이 아님',
    evidence_quote: null,
  }
}

/**
 * label 에 해당하는 고정 응답을 JSON 문자열로 돌려준다.
 * 반환 형식(문자열)은 실제 프로바이더와 같아야 한다 — 호출부의 파싱까지 검증하려면
 * 파싱된 객체가 아니라 모델이 낸 원문 텍스트 자리에 그대로 들어가야 하기 때문이다.
 */
export function mockResponse(label: string, userPrompt: string): string {
  const body =
    label === 'angle:generate' ? generateResponse(userPrompt)
    : label === 'angle:judge' ? judgeResponse(userPrompt)
    : label === 'angle:rejudge' ? rejudgeResponse()
    : label === 'angle:rewrite' ? rewriteResponse()
    : EXTRACT_RESPONSE

  return JSON.stringify(body)
}
