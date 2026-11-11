// R8 측정카드 순수부 — 모드 선택과 검증. import 없음(셀프테스트가 node 로 바로 불러 검사).
// 보증 1장, 두 모드: ROI(지표가 있을 때) / 몰랐던 사실(지표가 없을 때). 카드는 약속이 아니라 "이 진단이 맞았는지 확인하는 기준"이다 — 돈·환불을 약속하지 않는다.

export type Mode = 'roi' | 'unknown_fact'

/** 운영 중인 회사이고 1층 숫자(전환율)가 있으면 ROI, 아니면 몰랐던 사실. */
export function pickMode(run: { kind: 'company' | 'idea' }, hasLayer1Numbers: boolean): Mode {
  return run.kind === 'company' && hasLayer1Numbers ? 'roi' : 'unknown_fact'
}

export type RoiCard = { metric_name: string; baseline: number; target: number; due_date: string | null; statement: string }

export function buildRoiCard(baselinePct: number, targetRaw: unknown, dueRaw: unknown): RoiCard {
  const target = Number(String(targetRaw ?? '').replace(/,/g, '').trim())
  if (!Number.isFinite(target) || target <= baselinePct || target > 100) throw new Error('목표 전환율은 현재보다 높고 100 이하여야 합니다')
  let due: string | null = null
  const d = String(dueRaw ?? '').trim()
  if (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw new Error('점검일 형식 오류(YYYY-MM-DD)')
    due = d
  }
  return {
    metric_name: '전환율(%)',
    baseline: baselinePct,
    target,
    due_date: due,
    statement: `전환율이 ${baselinePct}%에서 ${target}%로 오르지 않으면 이 진단은 틀린 것으로 보고 다시 봅니다.`,
  }
}

export type UnknownFact = { fact: string; source: string }

/** 몰랐던 사실: 1~3개, 각각 130자 이하이고 출처(수집 페이지 주소·사례 이름·진단 항목)가 있어야 한다. */
export function validateUnknownFacts(raw: Record<string, unknown>): UnknownFact[] {
  const list = Array.isArray(raw.facts) ? raw.facts : []
  if (list.length < 1 || list.length > 3) throw new Error('몰랐던 사실은 1~3개')
  return list.map((f, i) => {
    const o = (f ?? {}) as Record<string, unknown>
    const fact = typeof o.fact === 'string' ? o.fact.trim() : ''
    const source = typeof o.source === 'string' ? o.source.trim() : ''
    if (!fact || fact.length > 130) throw new Error(`사실 ${i + 1}: 비었거나 130자 초과`)
    if (!source) throw new Error(`사실 ${i + 1}: 출처 없음`)
    if (/90\s*일\s*재측정/.test(fact)) throw new Error(`사실 ${i + 1}: 금지 표현`)
    return { fact, source: source.slice(0, 200) }
  })
}
