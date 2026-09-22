// 처방 카드 관련성 판정 — 속성 1건 × 후보 카드 N장을 LLM 이 0(무관)/1(부분)/2(직접)로 채점한다.
//
// 호출은 lib/analysis/llm.ts 한 벌을 그대로 쓴다(프로바이더 스위치·재시도·Gemini 모델 폴백).
// 판정 결과를 DB 에 넣고 빼는 것은 lib/cases/remedy-db.ts, 거르는 계산은 lib/cases/remedy-gate.ts 다.
//
// ★ mock 프로바이더면 전부 null(미검증)을 돌려준다. 가짜 2 를 만들지 않는다 —
//   그러면 "판정했다" 는 초록불이 뜨고 그 위에 다음 판단을 쌓게 된다(§7.1).
// ★ 파싱 실패·빠진 id 도 null 이다. 무관(0)이 아니다. 여기서 한 칸만 접으면 화면에서 카드가 조용히 사라진다.
//
// 비용·속도(실측, docs/review-sources-and-remedy-roadmap-2026-09-21.md §3-4):
//   카드 9장 기준 입력 ≈1.3k 토큰 · 속성당 1.0~1.6초. 그래서 화면에서 부르지 않고 캐시해 둔다.

import { MOCK_MODEL } from '../analysis/mock.ts'
import { callLlmWithModel, resolveProvider } from '../analysis/llm.ts'
import type { CardKind } from './remedy-gate.ts'
// 제품 종류 축은 새로 만들지 않는다 — advisor.productKindOf 와 같은 한 벌이다(business_model → physical/software).
import type { ProductKind } from './advisor.ts'

/** 판정에 넘기는 카드 한 장. text 는 화면에 나가는 그 문장이다(remedy-gate.cardLine). */
export interface JudgeCard {
  kind: CardKind
  card_id: string
  text: string
}

export interface JudgeAspect {
  name: string
  notes?: string | null
  /**
   * 이 속성이 달린 프로젝트의 제품 종류(advisor.productKindOf). 지시문 첫 줄이 여기서 갈린다.
   * 안 주면 physical — analysis_projects 는 대부분 business_model 이 NULL 이고, 그때가 기존 동작이다.
   */
  kind?: ProductKind
}

export interface JudgeVerdict {
  card_kind: CardKind
  card_id: string
  /** 0 무관 · 1 부분 · 2 직접 · null 미검증. */
  verdict: number | null
}

export interface JudgeOutcome {
  model: string
  verdicts: JudgeVerdict[]
}

/** llm.ts 의 호출 함수와 같은 모양. 셀프테스트가 가짜를 꽂을 수 있게 주입받는다. */
export type JudgeCall = (system: string, user: string) => Promise<{ text: string; model: string }>

const KIND_LABEL: Record<CardKind, string> = {
  case_move: '선례',
  failed_angle: '실패',
  principle: '원칙',
}

const KIND_PREFIX: Record<CardKind, string> = { case_move: 'A', failed_angle: 'B', principle: 'C' }

/**
 * 지시문 첫 줄 — 검수자가 누구의 처방을 보는지. 여기가 소비재로 고정돼 있어서 SaaS 처방이
 * 스스로 무관 처리됐다(reports/2026-09-23/data-velocity-plan.md §2 T4 · §7-4).
 */
const SELLER_LINE: Record<ProductKind, string> = {
  physical: '너는 물리적 제품(실물 소비재)을 파는 셀러의 개선 처방을 검수한다.',
  software: '너는 소프트웨어·SaaS 제품을 파는 1인·소규모 팀 창업가의 개선 처방을 검수한다.',
}

const SYSTEM_TAIL = [
  '그 사람이 겪는 페인 속성 하나와, 낱말 겹침으로 걸러진 처방 후보 카드가 주어진다.',
  '카드마다 이 속성에 얼마나 관련 있는지 0·1·2 로 판정해라.',
  '',
  '2 = 직접 관련 — 이 속성의 문제를 푸는 데 그대로 쓸 수 있는 처방이다.',
  '1 = 부분 관련 — 같은 페인 유형이지만 도메인·조건이 다르다.',
  '0 = 무관 — 그 외 전부. 낱말만 겹쳤을 뿐 이 속성과 상관이 없다.',
  '',
  '애매하면 낮게 준다. 억지로 관련을 만들어내지 마라.',
  '출력은 JSON 배열 하나뿐이다: [{"id":"A1","rel":0}]. 설명·코드블록·다른 키를 붙이지 마라.',
].join('\n')

/** 제품 종류별 지시문. 안 주면 physical — 기존 동작 그대로다. */
export function judgeSystem(kind: ProductKind = 'physical'): string {
  return SELLER_LINE[kind] + '\n' + SYSTEM_TAIL
}

/** 프롬프트를 만든다(순수). 라벨은 카드 순서로 정해지므로 같은 입력이면 같은 프롬프트다. */
export function buildJudgePrompt(aspect: JudgeAspect, cards: JudgeCard[]): { system: string; user: string; labels: string[] } {
  const seq: Record<CardKind, number> = { case_move: 0, failed_angle: 0, principle: 0 }
  const labels = cards.map((c) => `${KIND_PREFIX[c.kind]}${++seq[c.kind]}`)
  const user = [
    `속성: ${aspect.name}`,
    `메모: ${aspect.notes?.trim() || '(없음)'}`,
    '',
    '카드:',
    ...cards.map((c, i) => `${labels[i]}. [${KIND_LABEL[c.kind]}] ${c.text}`),
  ].join('\n')
  return { system: judgeSystem(aspect.kind), user, labels }
}

/**
 * 모델 응답에서 JSON 배열 하나를 건져낸다(코드블록·앞뒤 잡텍스트·껍데기 객체를 견딘다).
 * 못 건지면 null 이다 — **빈 배열이 아니다.** 빈 배열은 호출부에서 "전부 무관"으로 읽힌다.
 * 리뷰 관련성 판정(lib/analysis/relevance-judge.ts)도 이 한 벌을 쓴다.
 */
export function extractJsonArray(raw: string): unknown[] | null {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  const candidates: string[] = [stripped]
  const start = stripped.indexOf('[')
  const end = stripped.lastIndexOf(']')
  if (start !== -1 && end > start) candidates.push(stripped.slice(start, end + 1))

  for (const text of candidates) {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { continue }
    // 모델이 배열 대신 {"verdicts":[...]} 같은 껍데기를 씌우는 경우가 있다. 배열 값 하나면 그것을 쓴다.
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object'
        ? Object.values(parsed as Record<string, unknown>).find((v) => Array.isArray(v))
        : undefined)
    if (Array.isArray(arr)) return arr
  }
  return null
}

/** 모델이 낸 텍스트에서 [{"id","rel"}] 배열을 건져낸다. 못 건지면 null(미검증)이지 0 이 아니다. */
export function parseJudgeArray(raw: string): { id: string; rel: number }[] | null {
  const arr = extractJsonArray(raw)
  if (!arr) return null
  return arr
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    .map((x) => ({ id: String(x.id ?? ''), rel: Number(x.rel) }))
}

/**
 * 속성 1건을 판정한다. 실패는 전부 null(미검증)로 내려간다 — 던지지 않는다.
 * 호출자(remedy-db.judgeProjectRemedies)는 속성 하나가 죽어도 나머지를 계속 판정해야 한다.
 */
export async function judgeAspect(aspect: JudgeAspect, cards: JudgeCard[], call?: JudgeCall): Promise<JudgeOutcome> {
  const unverified = (model: string): JudgeOutcome => ({
    model,
    verdicts: cards.map((c) => ({ card_kind: c.kind, card_id: c.card_id, verdict: null })),
  })

  if (cards.length === 0) return { model: MOCK_MODEL, verdicts: [] }

  const provider = resolveProvider()
  // mock 은 판정을 흉내내지 않는다. "판정 안 했다" 를 그대로 돌려준다.
  if (provider === 'mock') return unverified(MOCK_MODEL)

  const { system, user, labels } = buildJudgePrompt(aspect, cards)
  const run = call ?? ((s: string, u: string) => callLlmWithModel(provider, s, u, 'remedy-judge'))

  let text: string
  let model: string
  try {
    const res = await run(system, user)
    text = res.text
    model = res.model
  } catch (e) {
    console.error(`[remedy-judge] 판정 호출 실패 (속성=${aspect.name}):`, e instanceof Error ? e.message : String(e))
    return unverified(`${provider}:failed`)
  }

  const parsed = parseJudgeArray(text)
  if (!parsed) {
    console.warn(`[remedy-judge] JSON 파싱 실패 — 원문 앞 200자: ${JSON.stringify(text.slice(0, 200))}`)
    return unverified(model)
  }

  const byLabel = new Map<string, number>()
  for (const { id, rel } of parsed) {
    if (rel === 0 || rel === 1 || rel === 2) byLabel.set(id.trim().toUpperCase(), rel)
  }

  // 응답에 없는 라벨은 null 로 남는다(빠진 것은 무관이 아니다). 응답에만 있는 라벨은 버린다.
  return {
    model,
    verdicts: cards.map((c, i) => ({
      card_kind: c.kind,
      card_id: c.card_id,
      verdict: byLabel.has(labels[i]) ? (byLabel.get(labels[i]) as number) : null,
    })),
  }
}
