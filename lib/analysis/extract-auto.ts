// 야간 자동 extract 의 **대상 선정**(순수함수). DB 조회는 호출부(scripts/extract-auto.mjs)가 한다.
//
// 남헌 2026-09-23 확정: "extract 야간 자동 실행 허용 — 신규 리뷰 100건 이상 프로젝트만,
// 일 $5 상한 안에서, Gemini 429 면 다음 날로" (reports/2026-09-23/data-velocity-plan.md §1 Q1).
// 그전까지 extract 는 사람이 `/analyze` 에서 눌러야만 돌았고, 그래서 입력 12,443건에
// 속성 40개였다. 비용 상한은 lib/analysis/budget.ts 가 이미 강제한다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/** 마지막 추출 이후 새로 들어온 입력이 이만큼 있어야 다시 돌린다. */
export const autoMinNew = () => num(process.env.EXTRACT_AUTO_MIN_NEW, 100)
/** 한 실행에서 돌릴 최대 프로젝트 수. */
export const autoMaxProjects = () => num(process.env.EXTRACT_AUTO_MAX_PROJECTS, 3)

export type AutoCandidate = {
  projectId: string
  /** 마지막 extract 이후 새로 들어온 analysis_inputs 수. null = 세지 못했다(확인 불가). */
  newInputs: number | null
  label?: string | null
}

export type AutoPick = {
  /** 이번 실행에서 돌릴 것. 신규 많은 순. */
  targets: AutoCandidate[]
  /** 기준(minNew)을 넘긴 전체 수. */
  eligible: number
  /** 상한에 걸려 이번에 못 돈 수 — "대상 0"과 "상한 도달"을 가른다(§7.2). */
  remaining: number
  /** 신규가 기준에 못 미쳐 제외된 수. */
  belowMin: number
  /** 신규 수를 세지 못한 수. 0 으로 접지 않는다(§7.1). */
  unknown: number
}

/**
 * 신규 입력 많은 순으로 상한까지 고른다. 동수는 projectId 사전순(결정적).
 * `newInputs === null`(조회 실패)은 대상에도 제외에도 넣지 않고 따로 센다 —
 * "새 리뷰가 없다"와 "세지 못했다"는 다른 사건이고, 후자는 사람이 봐야 한다.
 */
export function pickAutoTargets(
  candidates: readonly AutoCandidate[],
  opts: { minNew?: number; max?: number } = {},
): AutoPick {
  const minNew = opts.minNew ?? autoMinNew()
  const max = opts.max ?? autoMaxProjects()

  const unknown = candidates.filter(c => c.newInputs === null).length
  const known = candidates.filter(c => c.newInputs !== null)
  const eligibleList = known
    .filter(c => (c.newInputs as number) >= minNew)
    .sort((a, b) => (b.newInputs as number) - (a.newInputs as number) || (a.projectId < b.projectId ? -1 : 1))

  const targets = eligibleList.slice(0, Math.max(0, max))
  return {
    targets,
    eligible: eligibleList.length,
    remaining: eligibleList.length - targets.length,
    belowMin: known.length - eligibleList.length,
    unknown,
  }
}

/** 로그 한 줄 — "대상 0"과 "상한 도달, 남은 k건"을 말로 구분한다(§7.2). */
export function describePick(pick: AutoPick, minNew: number, max: number): string {
  const head =
    pick.eligible === 0
      ? `대상 0건 (신규 ${minNew}건 이상인 프로젝트가 없다)`
      : pick.remaining > 0
        ? `대상 ${pick.eligible}건 중 ${pick.targets.length}건 실행 — 실행 상한 ${max}건 도달, 남은 대상 ${pick.remaining}건은 다음 실행`
        : `대상 ${pick.eligible}건 전부 실행`
  const tail = [
    pick.belowMin > 0 ? `신규 부족 제외 ${pick.belowMin}건` : null,
    pick.unknown > 0 ? `⚠️ 신규 수 확인 불가 ${pick.unknown}건` : null,
  ].filter(Boolean)
  return tail.length ? `${head} · ${tail.join(' · ')}` : head
}
