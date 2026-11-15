// v71cm 모드 C2 "새 아이디어 추천" 검증기 — 순수 함수(import 없음).
// 근거 규칙: 참조 사례 이름은 후보 풀(사례 은행 조회 결과)에 있는 것만 허용한다. 풀에 없는 사례를 지어내면 거절한다(§7.1).
// 문체: 합니다체, "90일 재측정" 금지. 확률·통계 문장은 stat-lint 가 따로 막는다(생성기에서 호출).

export type C2Candidate = {
  name: string
  why_now: string
  who: string
  price: string
  how_to_sell: string
  first_ten: string
  reference_cases: string[] // 풀에 있는 이름만, 0~3개. 비면 화면에 "근거 부족"을 표시한다.
  failure_case: string | null // 풀의 실패 사례 이름, 없으면 null
  experiment: { what: string; who: string; n: number; success_metric: string; if_fail: string }
  killed_bridges: string[] // 이 후보가 다리 2·4 에서 이미 🔴 이 아니라는 확인 문장(비워 두면 안 됨)
}

export type ModeC2 = {
  two_line: { known: string; unknown: string }
  conditions_summary: string
  excluded: { area: string; reason: string }[]
  candidates: C2Candidate[] // 정확히 3개
  top_pick: { index: 0 | 1 | 2; reason: string; give_up_condition: string }
  execution_package: { artifacts: string[]; plan_b: { name: string; trigger: string } }
}

const BANNED = /90\s*일\s*재측정/
const s = (v: unknown, max: number, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`모드C2 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}
const arr = (v: unknown, min: number, max: number, field: string): unknown[] => {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(`모드C2 형식 오류: ${field} 는 ${min}~${max}개`)
  return v
}

/** allowedNames: 후보 풀의 사례 이름 전부(성공 사례 name + 실패 사례 company). 이 밖의 이름은 지어낸 것으로 본다. */
export function validateModeC2(raw: Record<string, unknown>, allowedNames: string[]): ModeC2 {
  const allowed = new Set(allowedNames.map((n) => n.trim().toLowerCase()))
  const two = (raw.two_line ?? {}) as Record<string, unknown>
  const candsRaw = arr(raw.candidates, 3, 3, 'candidates')
  const candidates = candsRaw.map((c, i): C2Candidate => {
    const x = (c ?? {}) as Record<string, unknown>
    const refs = (Array.isArray(x.reference_cases) ? x.reference_cases : []).map((r, j) => s(r, 120, `candidates[${i}].reference_cases[${j}]`))
    if (refs.length > 3) throw new Error(`모드C2 형식 오류: candidates[${i}].reference_cases 는 0~3개`)
    for (const r of refs) if (!allowed.has(r.toLowerCase())) throw new Error(`모드C2 근거 오류: 후보 풀에 없는 사례 "${r}" — 지어낸 사례 금지`)
    const fc = x.failure_case == null || x.failure_case === '' ? null : s(x.failure_case, 120, `candidates[${i}].failure_case`)
    if (fc && !allowed.has(fc.toLowerCase())) throw new Error(`모드C2 근거 오류: 후보 풀에 없는 실패 사례 "${fc}"`)
    const exp = (x.experiment ?? {}) as Record<string, unknown>
    const n = Number(exp.n)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`모드C2 형식 오류: candidates[${i}].experiment.n 은 양수`)
    return {
      name: s(x.name, 120, `candidates[${i}].name`),
      why_now: s(x.why_now, 300, `candidates[${i}].why_now`),
      who: s(x.who, 200, `candidates[${i}].who`),
      price: s(x.price, 120, `candidates[${i}].price`),
      how_to_sell: s(x.how_to_sell, 300, `candidates[${i}].how_to_sell`),
      first_ten: s(x.first_ten, 300, `candidates[${i}].first_ten`),
      reference_cases: refs,
      failure_case: fc,
      experiment: { what: s(exp.what, 300, 'experiment.what'), who: s(exp.who, 200, 'experiment.who'), n: Math.round(n), success_metric: s(exp.success_metric, 200, 'experiment.success_metric'), if_fail: s(exp.if_fail, 200, 'experiment.if_fail') },
      killed_bridges: arr(x.killed_bridges, 1, 3, `candidates[${i}].killed_bridges`).map((k, j) => s(k, 200, `candidates[${i}].killed_bridges[${j}]`)),
    }
  })
  const tp = (raw.top_pick ?? {}) as Record<string, unknown>
  const idx = Number(tp.index)
  if (![0, 1, 2].includes(idx)) throw new Error('모드C2 형식 오류: top_pick.index 는 0~2')
  const ep = (raw.execution_package ?? {}) as Record<string, unknown>
  const pb = (ep.plan_b ?? {}) as Record<string, unknown>
  const out: ModeC2 = {
    two_line: { known: s(two.known, 200, 'two_line.known'), unknown: s(two.unknown, 300, 'two_line.unknown') },
    conditions_summary: s(raw.conditions_summary, 300, 'conditions_summary'),
    excluded: arr(raw.excluded, 1, 6, 'excluded').map((e, i) => {
      const x = (e ?? {}) as Record<string, unknown>
      return { area: s(x.area, 80, `excluded[${i}].area`), reason: s(x.reason, 300, `excluded[${i}].reason`) }
    }),
    candidates,
    top_pick: { index: idx as 0 | 1 | 2, reason: s(tp.reason, 400, 'top_pick.reason'), give_up_condition: s(tp.give_up_condition, 300, 'top_pick.give_up_condition') },
    execution_package: {
      artifacts: arr(ep.artifacts, 2, 5, 'execution_package.artifacts').map((a, i) => s(a, 400, `execution_package.artifacts[${i}]`)),
      plan_b: { name: s(pb.name, 120, 'plan_b.name'), trigger: s(pb.trigger, 300, 'plan_b.trigger') },
    },
  }
  if (BANNED.test(JSON.stringify(out))) throw new Error('모드C2 문체 오류: 금지 표현')
  return out
}
