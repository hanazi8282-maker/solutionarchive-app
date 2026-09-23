// 야간 자동 extract 의 **대상 선정**(순수함수). DB 조회는 호출부(scripts/extract-auto.mjs)가 한다.
//
// 남헌 2026-09-23 확정: "extract 야간 자동 실행 허용 — 신규 리뷰 100건 이상 프로젝트만,
// 일 $5 상한 안에서, Gemini 429 면 다음 날로" (reports/2026-09-23/data-velocity-plan.md §1 Q1).
// 그전까지 extract 는 사람이 `/analyze` 에서 눌러야만 돌았고, 그래서 입력 12,443건에
// 속성 40개였다. 비용 상한은 lib/analysis/budget.ts 가 이미 강제한다.
//
// 남헌 2026-09-23 추가 결정: **대상은 SaaS 프로젝트 우선**이다. 신규 많은 순만 보면 상위 3건이
// 전부 소비재(SONY 3,272 · QCY 1,910 · 코웨이 1,349)라 일 $5 를 소비재에 태우게 된다.
// 피봇 방향이 SaaS 인데 추출 예산이 소비재로 나가는 것을 순서 하나로 막는다.
//
// 남헌 2026-09-23 Q4(a): **추출이 끝난 프로젝트도 다시 태운다.** 그전까지 후보는
// `status='collecting'` 뿐이라 extract 는 프로젝트당 평생 1회였다 — 어제 추출된 SaaS 3건에
// 그 뒤로 +602·+401건이 들어왔는데 야간 루프에서 영구히 빠져 있었다
// (reports/2026-09-23/voc-expansion-investigation.md §4-2). 재추출 주기는 새 조건을 만들지
// 않고 기존 `신규 ≥ EXTRACT_AUTO_MIN_NEW` 가 그대로 조절한다(신규 0건이면 대상이 아니다).
//
// ⚠️ 재추출은 `force` 로 들어가고 force 는 기존 aspects 를 교체한다. 사람이 확인한
//    (human_confirmed=true) 속성은 extract-run.ts 가 지우지 않고 남긴다 — 그 보호가 없으면
//    이 기능이 매일 밤 검수 결과를 지운다. 검수 **이후** 단계(reviewed/angled/done)는
//    extract-gate.REANALYZABLE 이 애초에 후보에서 뺀다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

// 제품 종류 축은 새로 만들지 않는다 — advisor.productKindOf(business_model) 한 벌이다.
import { productKindOf } from '../cases/advisor.ts'
// 어느 상태가 재추출 가능한지는 extract-gate 가 정본이다. 여기서 문자열을 다시 적지 않는다 —
// 두 벌이 되면 후보에는 들어오는데 claimExtraction 이 거부하는 상태가 생긴다.
import { REANALYZABLE } from './extract-gate.ts'

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
  /** analysis_projects.business_model. 'SAAS' 면 순서에서 앞선다. 안 주면 physical 취급(기존 동작). */
  businessModel?: string | null
  /**
   * analysis_projects.status. 'extracted' 면 **재추출**이라 force 가 필요하고 순서에서 뒤로 간다.
   * 안 주면 첫 추출로 본다(기존 동작 — 후보가 collecting 뿐이던 시절과 같다).
   */
  status?: string | null
}

/**
 * 이 후보를 돌리려면 `claimExtraction(..., force)` 가 필요한가.
 * 판단 기준을 호출부에 복사하지 않기 위해 여기 한 벌만 둔다.
 */
export function needsForce(c: { status?: string | null }): boolean {
  return REANALYZABLE.includes((c.status ?? '').trim())
}

/** SaaS 가 0, 나머지·미기재가 1. 미기재를 SaaS 로 올리지 않는다 — 대부분 NULL 이라 순서가 무의미해진다. */
const saasRank = (c: { businessModel?: string | null }): number =>
  productKindOf(c.businessModel) === 'software' ? 0 : 1

/**
 * 첫 추출이 0, 재추출이 1.
 *
 * 속성이 **0개**인 프로젝트를 채우는 것이, 이미 5개 있는 프로젝트를 갱신하는 것보다 먼저다.
 * 이 축이 없으면 HN 이 주 소스인 재추출 후보(신규가 하루 수백 건 늘어난다)가 매일 밤 상한을
 * 다 먹고, 한 번도 추출 안 된 프로젝트가 영원히 순서를 못 받는다.
 */
const firstRunRank = (c: { status?: string | null }): number => (needsForce(c) ? 1 : 0)

/**
 * 야간 배치의 프로젝트 우선순위:
 * **SaaS 먼저 → 첫 추출 먼저 → 신규(또는 미판정) 많은 순 → projectId**.
 * extract 와 관련성 판정이 같은 순서를 쓴다(scripts/extract-auto.mjs · relevance-judge-auto.mjs).
 * 두 벌이 되면 어느 날 한쪽만 소비재를 먼저 태운다.
 *
 * status 를 안 주는 호출부(relevance-judge-auto.mjs 는 collecting 만 본다)에서는
 * firstRunRank 가 전부 0 이라 기존 순서와 같다.
 */
export function compareAutoPriority(
  a: { projectId: string; newInputs: number | null; businessModel?: string | null; status?: string | null },
  b: { projectId: string; newInputs: number | null; businessModel?: string | null; status?: string | null },
): number {
  return (
    saasRank(a) - saasRank(b) ||
    firstRunRank(a) - firstRunRank(b) ||
    (b.newInputs ?? 0) - (a.newInputs ?? 0) ||
    (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0)
  )
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
 * 기준(minNew)을 넘긴 것 중 **SaaS 우선 → 첫 추출 우선 → 신규 많은 순 → projectId** 로
 * 상한까지 고른다(결정적).
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
  const eligibleList = known.filter(c => (c.newInputs as number) >= minNew).sort(compareAutoPriority)

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
  const reruns = pick.targets.filter(needsForce).length
  const tail = [
    reruns > 0 ? `그중 재추출(force) ${reruns}건` : null,
    pick.belowMin > 0 ? `신규 부족 제외 ${pick.belowMin}건` : null,
    pick.unknown > 0 ? `⚠️ 신규 수 확인 불가 ${pick.unknown}건` : null,
  ].filter(Boolean)
  return tail.length ? `${head} · ${tail.join(' · ')}` : head
}
