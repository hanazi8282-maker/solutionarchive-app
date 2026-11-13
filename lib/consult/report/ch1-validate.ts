// 결론서 1장 검증기 — 순수 함수(import 없음). scripts/consult-selftest.mjs 가 node 로 바로 불러 검사한다.
// 문체 규칙(v71ci §2): 합니다체, 권고는 "~하세요", 인용 130자 이하, 별명 금지, 페이지당 숫자 1개(손실 범위), "90일 재측정" 금지.

// v71cl-엔진(결론서 v5): 끊긴 Fit·실패모드 라벨. config/viability_rules_v1.json 의 fit_chain.stages 순서(0~4)와 failure_modes(F1~F13) 키를 그대로 쓴다.
export type Ch1Viability = {
  fit_broken_stage: 0 | 1 | 2 | 3 | 4
  fit_color: '🟢' | '🟡' | '🔴'
  fit_test_result: string // 그 단계 한 줄 테스트에 대한 판정 근거(§2 test 질문에 대한 답)
  failure_modes: string[] // F1~F13 중 0~3개. 근거 없으면 빈 배열(지어내지 않음).
  segment: 'P' | 'S' | 'M' | 'E'
}

export type Ch1 = {
  headline: string
  leak_or_gap: { kind: 'leak' | 'gap'; title: string; detail: string }
  position: { category: string; where: string; basis: string }
  loss: { low_man: number; high_man: number; formula: string; assumptions: string[]; note: string }
  similar: { name: string; what: string }[] // ③ 비슷한 회사 목록(v0) — 보유 사례가 있을 때만(R5). 없으면 빈 배열.
  thin: boolean
  viability?: Ch1Viability // v5 신규. 옛 결론서(consult_reports 캐시)에는 없을 수 있어 옵셔널 — 화면은 없으면 v4 그대로 렌더.
  evidence_level: '낮음' | '보통' | '높음' // G6(2026-11-13): LLM 이 만드는 확률 대신 코드로만 계산하는 근거 충분도.
}

/** 근거 충분도 — LLM 이 아니라 코드로만 계산한다(G6). 근거: 수집 페이지 수 · thin 여부 · 부재 주장("~가 없습니다") 존재 여부.
 * thin 이면 한 단계 낮추고, 부재 주장이 있으면 한 단계 더 낮춘다(2026-11-13 실측 사고 — 부재 주장은 틀릴 위험이 더 크다). */
export function computeEvidenceLevel(input: { pageCount: number; thin: boolean; hasAbsenceClaim: boolean }): Ch1['evidence_level'] {
  let tier = input.pageCount >= 4 ? 2 : input.pageCount >= 1 ? 1 : 0 // 0=낮음 1=보통 2=높음
  if (input.thin) tier = Math.max(0, tier - 1)
  if (input.hasAbsenceClaim) tier = Math.max(0, tier - 1)
  return (['낮음', '보통', '높음'] as const)[tier]
}

const ABSENCE_CLAIM = /가\s*없습니다/

const BANNED = /90\s*일\s*재측정/
const FAILURE_MODE_IDS = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13'])
const SEGMENTS = new Set(['P', 'S', 'M', 'E'])
const FIT_COLORS = new Set(['🟢', '🟡', '🔴'])

/** raw.viability 가 있을 때만 검증한다(없으면 undefined — 옛 캐시와 호환). 값이 있는데 틀리면 던진다(§7.1: 확인 실패를 양성으로 접지 않는다). */
function parseViability(raw: unknown): Ch1Viability | undefined {
  if (raw == null) return undefined
  const v = raw as Record<string, unknown>
  const stage = Number(v.fit_broken_stage)
  if (![0, 1, 2, 3, 4].includes(stage)) throw new Error('진단 형식 오류: viability.fit_broken_stage 는 0~4')
  if (typeof v.fit_color !== 'string' || !FIT_COLORS.has(v.fit_color)) throw new Error('진단 형식 오류: viability.fit_color 는 🟢/🟡/🔴')
  const testResult = str(v.fit_test_result, 300, 'viability.fit_test_result')
  const fm = Array.isArray(v.failure_modes) ? v.failure_modes.filter((x): x is string => typeof x === 'string') : []
  if (fm.length > 3) throw new Error('진단 형식 오류: viability.failure_modes 는 최대 3개')
  if (fm.some((x) => !FAILURE_MODE_IDS.has(x))) throw new Error('진단 형식 오류: viability.failure_modes 는 F1~F13 중에서만')
  if (typeof v.segment !== 'string' || !SEGMENTS.has(v.segment)) throw new Error('진단 형식 오류: viability.segment 는 P/S/M/E')
  return { fit_broken_stage: stage as 0 | 1 | 2 | 3 | 4, fit_color: v.fit_color as Ch1Viability['fit_color'], fit_test_result: testResult, failure_modes: fm, segment: v.segment as Ch1Viability['segment'] }
}
const str = (v: unknown, max: number, field: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`진단 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}

/** 모델 출력 → Ch1. 필수 칸이 없거나 손실 범위가 숫자가 아니면 던진다(빈 값으로 접지 않는다 — CLAUDE.md §7.1). */
export function validateCh1(raw: Record<string, unknown>, input: { thin: boolean; similar?: Ch1['similar']; pageCount?: number }): Ch1 {
  const lg = (raw.leak_or_gap ?? {}) as Record<string, unknown>
  const pos = (raw.position ?? {}) as Record<string, unknown>
  const loss = (raw.loss ?? {}) as Record<string, unknown>
  const low = Number(loss.low_man)
  const high = Number(loss.high_man)
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) throw new Error('진단 형식 오류: 손실 범위 숫자')
  if (high <= 0) throw new Error('진단 형식 오류: 손실 범위가 0 — 가정을 명시한 구간으로 산출해야 함')
  const assumptions = Array.isArray(loss.assumptions) ? loss.assumptions.filter((x): x is string => typeof x === 'string').slice(0, 5) : []
  if (assumptions.length === 0) throw new Error('진단 형식 오류: 산식의 가정이 없음')
  // 누수/미개척은 모델이 근거로 골라야 한다 — 값이 없거나 다른 값이면 누수로 접지 않고 거절한다(§7.1, v71ck 4).
  if (lg.kind !== 'leak' && lg.kind !== 'gap') throw new Error('진단 형식 오류: leak_or_gap.kind 는 leak 또는 gap')
  if (typeof lg.detail !== 'string' || lg.detail.trim().length < 30) throw new Error('진단 형식 오류: leak_or_gap.detail 이 너무 짧음 — gap 은 비어 있는 자리, leak 은 어긋남의 증거를 적어야 함')
  const out: Ch1 = {
    headline: str(raw.headline, 80, 'headline'),
    leak_or_gap: {
      kind: lg.kind,
      title: str(lg.title, 80, 'leak_or_gap.title'),
      detail: str(lg.detail, 500, 'leak_or_gap.detail'),
    },
    position: { category: str(pos.category, 60, 'position.category'), where: str(pos.where, 300, 'position.where'), basis: str(pos.basis, 300, 'position.basis') },
    loss: { low_man: Math.round(low), high_man: Math.round(high), formula: str(loss.formula, 200, 'loss.formula'), assumptions, note: typeof loss.note === 'string' ? loss.note.slice(0, 200) : '' },
    similar: input.similar ?? [],
    thin: input.thin,
    viability: parseViability(raw.viability),
    evidence_level: computeEvidenceLevel({
      pageCount: input.pageCount ?? 0,
      thin: input.thin,
      hasAbsenceClaim: ABSENCE_CLAIM.test(`${raw.headline ?? ''} ${lg.detail ?? ''}`),
    }),
  }
  const text = JSON.stringify(out)
  if (BANNED.test(text)) throw new Error('진단 문체 오류: 금지 표현')
  return out
}

