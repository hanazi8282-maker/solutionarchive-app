// v71cm 모드 C1 "아이디어 검증(예비 창업자)" 검증기 — 순수 함수(import 없음).
// Stage0 게이트 G0.1~G0.6 전부 + 다리 0·1 + 참조군 + 분야 기저율. 문체: 합니다체, "90일 재측정" 금지.

export type Gate = { id: 'G0.1' | 'G0.2' | 'G0.3' | 'G0.4' | 'G0.5' | 'G0.6'; color: '🟢' | '🟡' | '🔴'; reason: string }

export type ModeC1 = {
  two_line: { known: string; unknown: string }
  gates: Gate[] // G0.1~G0.6 전부, 정확히 6개
  blocked_stage: 0 | 1 | 2 | 3 | 4 // 가장 먼저 끊긴 다리(도메인상 다리4가 먼저 끊길 수도 있다 — 예: 무료 플랫폼이 이미 해결)
  secondary_blocked_stage: (0 | 1 | 2 | 3 | 4) | null // 그 다음으로 걸리는 다리(없으면 null)
  reference_group: { count: number; note: string } // 분야 기저율 포함
  experiment: { what: string; who: string; n: number; success_metric: string; if_fail: string } // 지금 당장 할 실험 1개(2주)
  execution_package: { artifacts: string[]; plan_b: { name: string; trigger: string } }
  give_up_condition: string
}

const BANNED = /90\s*일\s*재측정/
const GATE_IDS: Gate['id'][] = ['G0.1', 'G0.2', 'G0.3', 'G0.4', 'G0.5', 'G0.6']
const COLORS = new Set(['🟢', '🟡', '🔴'])
const s = (v: unknown, max: number, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`모드C1 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}
const arr = (v: unknown, min: number, max: number, field: string): unknown[] => {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(`모드C1 형식 오류: ${field} 는 ${min}~${max}개`)
  return v
}

export function validateModeC1(raw: Record<string, unknown>): ModeC1 {
  const two = (raw.two_line ?? {}) as Record<string, unknown>
  const gatesRaw = arr(raw.gates, 6, 6, 'gates')
  const seen = new Set<string>()
  const gates = gatesRaw.map((g, i) => {
    const x = (g ?? {}) as Record<string, unknown>
    if (!GATE_IDS.includes(x.id as Gate['id'])) throw new Error(`모드C1 형식 오류: gates[${i}].id 는 G0.1~G0.6`)
    if (seen.has(x.id as string)) throw new Error(`모드C1 형식 오류: gates 에 ${x.id} 중복`)
    seen.add(x.id as string)
    if (typeof x.color !== 'string' || !COLORS.has(x.color)) throw new Error(`모드C1 형식 오류: gates[${i}].color 는 🟢/🟡/🔴`)
    return { id: x.id as Gate['id'], color: x.color as Gate['color'], reason: s(x.reason, 300, `gates[${i}].reason`) }
  })
  if (seen.size !== 6) throw new Error('모드C1 형식 오류: G0.1~G0.6 전부 있어야 함')
  const stage = Number(raw.blocked_stage)
  if (![0, 1, 2, 3, 4].includes(stage)) throw new Error('모드C1 형식 오류: blocked_stage 는 0~4')
  const sec = raw.secondary_blocked_stage
  const secNum = sec == null ? null : Number(sec)
  if (secNum != null && !([0, 1, 2, 3, 4].includes(secNum))) throw new Error('모드C1 형식 오류: secondary_blocked_stage 는 0~4 또는 null')
  const rg = (raw.reference_group ?? {}) as Record<string, unknown>
  const rgCount = Number(rg.count)
  if (!Number.isFinite(rgCount) || rgCount < 0) throw new Error('모드C1 형식 오류: reference_group.count')
  const exp = (raw.experiment ?? {}) as Record<string, unknown>
  const n = Number(exp.n)
  if (!Number.isFinite(n) || n <= 0) throw new Error('모드C1 형식 오류: experiment.n 은 양수')
  const ep = (raw.execution_package ?? {}) as Record<string, unknown>
  const artifacts = arr(ep.artifacts, 2, 5, 'execution_package.artifacts').map((a, i) => s(a, 400, `execution_package.artifacts[${i}]`))
  const pb = (ep.plan_b ?? {}) as Record<string, unknown>
  const out: ModeC1 = {
    two_line: { known: s(two.known, 200, 'two_line.known'), unknown: s(two.unknown, 300, 'two_line.unknown') },
    gates,
    blocked_stage: stage as ModeC1['blocked_stage'],
    secondary_blocked_stage: secNum as ModeC1['secondary_blocked_stage'],
    reference_group: { count: Math.round(rgCount), note: s(rg.note, 500, 'reference_group.note') },
    experiment: { what: s(exp.what, 300, 'experiment.what'), who: s(exp.who, 200, 'experiment.who'), n: Math.round(n), success_metric: s(exp.success_metric, 200, 'experiment.success_metric'), if_fail: s(exp.if_fail, 200, 'experiment.if_fail') },
    execution_package: { artifacts, plan_b: { name: s(pb.name, 120, 'plan_b.name'), trigger: s(pb.trigger, 300, 'plan_b.trigger') } },
    give_up_condition: s(raw.give_up_condition, 300, 'give_up_condition'),
  }
  if (BANNED.test(JSON.stringify(out))) throw new Error('모드C1 문체 오류: 금지 표현')
  return out
}
