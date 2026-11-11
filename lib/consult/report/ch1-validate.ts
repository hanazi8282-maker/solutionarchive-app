// 결론서 1장 검증기 — 순수 함수(import 없음). scripts/consult-selftest.mjs 가 node 로 바로 불러 검사한다.
// 문체 규칙(v71ci §2): 합니다체, 권고는 "~하세요", 인용 130자 이하, 별명 금지, 페이지당 숫자 1개(손실 범위), "90일 재측정" 금지.

export type Ch1 = {
  headline: string
  leak_or_gap: { kind: 'leak' | 'gap'; title: string; detail: string }
  position: { category: string; where: string; basis: string }
  loss: { low_man: number; high_man: number; formula: string; assumptions: string[]; note: string }
  similar: { name: string; what: string }[] // ③ 비슷한 회사 목록(v0) — 보유 사례가 있을 때만(R5). 없으면 빈 배열.
  thin: boolean
}

const BANNED = /(90\s*일\s*재측정|액션\s*플랜)/
const str = (v: unknown, max: number, field: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`진단 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}

/** 모델 출력 → Ch1. 필수 칸이 없거나 손실 범위가 숫자가 아니면 던진다(빈 값으로 접지 않는다 — CLAUDE.md §7.1). */
export function validateCh1(raw: Record<string, unknown>, input: { thin: boolean; similar?: Ch1['similar'] }): Ch1 {
  const lg = (raw.leak_or_gap ?? {}) as Record<string, unknown>
  const pos = (raw.position ?? {}) as Record<string, unknown>
  const loss = (raw.loss ?? {}) as Record<string, unknown>
  const low = Number(loss.low_man)
  const high = Number(loss.high_man)
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) throw new Error('진단 형식 오류: 손실 범위 숫자')
  const assumptions = Array.isArray(loss.assumptions) ? loss.assumptions.filter((x): x is string => typeof x === 'string').slice(0, 5) : []
  if (assumptions.length === 0) throw new Error('진단 형식 오류: 산식의 가정이 없음')
  const out: Ch1 = {
    headline: str(raw.headline, 80, 'headline'),
    leak_or_gap: {
      kind: lg.kind === 'gap' ? 'gap' : 'leak',
      title: str(lg.title, 80, 'leak_or_gap.title'),
      detail: str(lg.detail, 500, 'leak_or_gap.detail'),
    },
    position: { category: str(pos.category, 60, 'position.category'), where: str(pos.where, 300, 'position.where'), basis: str(pos.basis, 300, 'position.basis') },
    loss: { low_man: Math.round(low), high_man: Math.round(high), formula: str(loss.formula, 200, 'loss.formula'), assumptions, note: typeof loss.note === 'string' ? loss.note.slice(0, 200) : '' },
    similar: input.similar ?? [],
    thin: input.thin,
  }
  const text = JSON.stringify(out)
  if (BANNED.test(text)) throw new Error('진단 문체 오류: 금지 표현')
  return out
}

