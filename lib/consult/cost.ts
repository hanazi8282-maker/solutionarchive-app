// 단가 계산 — 순수 함수(import 없음, 셀프테스트가 node 로 바로 불러 검사한다).
export type ModelTag = 'opus' | 'sonnet' | 'haiku' | 'mock'
export type Purpose = 'collect' | 'diagnosis' | 'l1' | 'memo' | 'chat' | 'measure' | 'report' | 'judge'

// ponytail: 추정 단가. 정확한 청구는 Anthropic 콘솔이 정본 — 어긋나면 이 표만 고친다.
const PRICE_PER_M: Record<ModelTag, [number, number]> = {
  opus: [15, 75],
  sonnet: [3, 15],
  haiku: [0.8, 4],
  mock: [0, 0],
}

export function costUsd(tag: ModelTag, inTok: number, outTok: number): number {
  const [i, o] = PRICE_PER_M[tag]
  return Math.round(((inTok * i + outTok * o) / 1_000_000) * 100000) / 100000
}

