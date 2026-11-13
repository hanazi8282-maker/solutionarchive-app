// v71cm 모드 B "기존 결정 검증" 검증기 — 순수 함수(import 없음). ch2-validate.ts 의 execution_package 모양을 그대로 쓴다(복붙하지 않고 같은 셰이프를 재정의 — import 없음 규칙 때문에 중복은 불가피).
// 문체: 합니다체, "90일 재측정" 금지.

export type ModeBVerdict = '진행' | '조건부_진행' | '순서_바꿈' | '중단'

export type ModeB = {
  two_line: { known: string; unknown: string }
  verdict: ModeBVerdict
  verdict_reason: string
  target_stage: 0 | 1 | 2 | 3 | 4 // 이 결정이 고치려는 다리
  blocked_earlier_stage: number | null // cap 규칙: 그보다 앞에 비어 있는 다리(없으면 null)
  reference_group: { count: number; note: string }
  premortem: string[] // 사전 부검(6개월 뒤 실패했다면 이유) 2~4개
  falsifiable_condition: string
  prediction_pct: number
  kill_condition: string
  execution_package: {
    artifacts: string[]
    experiment: { what: string; who: string; n: number; success_metric: string; if_fail: string }
    plan_b: { name: string; trigger: string }
  }
}

const BANNED = /90\s*일\s*재측정/
const VERDICTS: ModeBVerdict[] = ['진행', '조건부_진행', '순서_바꿈', '중단']
const s = (v: unknown, max: number, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`모드B 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}
const arr = (v: unknown, min: number, max: number, field: string): unknown[] => {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(`모드B 형식 오류: ${field} 는 ${min}~${max}개`)
  return v
}

export function validateModeB(raw: Record<string, unknown>): ModeB {
  const two = (raw.two_line ?? {}) as Record<string, unknown>
  if (!VERDICTS.includes(raw.verdict as ModeBVerdict)) throw new Error(`모드B 형식 오류: verdict 는 ${VERDICTS.join('|')} 중 하나`)
  const stage = Number(raw.target_stage)
  if (![0, 1, 2, 3, 4].includes(stage)) throw new Error('모드B 형식 오류: target_stage 는 0~4')
  const blocked = raw.blocked_earlier_stage
  const blockedNum = blocked == null ? null : Number(blocked)
  if (blockedNum != null && (![0, 1, 2, 3, 4].includes(blockedNum) || blockedNum >= stage)) throw new Error('모드B 형식 오류: blocked_earlier_stage 는 target_stage 보다 앞이어야 함')
  // cap 규칙: 앞 다리가 막혀 있으면 진행/조건부_진행 판정은 모순(그보다 앞을 먼저 고쳐야 하므로 순서_바꿈이어야 한다).
  if (blockedNum != null && (raw.verdict === '진행' || raw.verdict === '조건부_진행')) throw new Error('모드B 형식 오류: 앞 다리가 비어 있는데 진행/조건부_진행 판정 — cap 규칙 위반(순서_바꿈이어야 함)')
  const rg = (raw.reference_group ?? {}) as Record<string, unknown>
  const rgCount = Number(rg.count)
  if (!Number.isFinite(rgCount) || rgCount < 0) throw new Error('모드B 형식 오류: reference_group.count')
  const ep = (raw.execution_package ?? {}) as Record<string, unknown>
  const artifacts = arr(ep.artifacts, 2, 5, 'execution_package.artifacts').map((a, i) => s(a, 400, `execution_package.artifacts[${i}]`))
  const exp = (ep.experiment ?? {}) as Record<string, unknown>
  const n = Number(exp.n)
  if (!Number.isFinite(n) || n <= 0) throw new Error('모드B 형식 오류: execution_package.experiment.n 은 양수')
  const pb = (ep.plan_b ?? {}) as Record<string, unknown>
  const pct = Number(raw.prediction_pct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('모드B 형식 오류: prediction_pct 는 0~100')
  const out: ModeB = {
    two_line: { known: s(two.known, 200, 'two_line.known'), unknown: s(two.unknown, 300, 'two_line.unknown') },
    verdict: raw.verdict as ModeBVerdict,
    verdict_reason: s(raw.verdict_reason, 400, 'verdict_reason'),
    target_stage: stage as ModeB['target_stage'],
    blocked_earlier_stage: blockedNum as ModeB['blocked_earlier_stage'],
    reference_group: { count: Math.round(rgCount), note: s(rg.note, 400, 'reference_group.note') },
    premortem: arr(raw.premortem, 2, 4, 'premortem').map((p, i) => s(p, 300, `premortem[${i}]`)),
    falsifiable_condition: s(raw.falsifiable_condition, 300, 'falsifiable_condition'),
    prediction_pct: Math.round(pct),
    kill_condition: s(raw.kill_condition, 300, 'kill_condition'),
    execution_package: {
      artifacts,
      experiment: { what: s(exp.what, 300, 'experiment.what'), who: s(exp.who, 200, 'experiment.who'), n: Math.round(n), success_metric: s(exp.success_metric, 200, 'experiment.success_metric'), if_fail: s(exp.if_fail, 200, 'experiment.if_fail') },
      plan_b: { name: s(pb.name, 120, 'plan_b.name'), trigger: s(pb.trigger, 300, 'plan_b.trigger') },
    },
  }
  if (BANNED.test(JSON.stringify(out))) throw new Error('모드B 문체 오류: 금지 표현')
  return out
}
