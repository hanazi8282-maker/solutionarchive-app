// T2 프로젝트 순서의 영역 결손 축(남헌 v37 작업 7 U1, 설계 reports/2026-10-08/area-quota-and-abandon-design-v31.md §2.2).
//
// 순서(칸) = 0 공급 충분한 결손 영역(결손 큰 순) → 1 공급 부족 결손 영역(남은 미판정 합 < 결손, 결손 큰 순) → 2 충족 영역
//            → 3 영역 외(out-*·미부여·라벨 갈림) → 4 hold 맨 뒤. (최소량 대상 = config kind=area·active: 1~5·design)
// 결손 칸(0·1) 안에서는 미판정이 큰 프로젝트가 먼저(하루 상한이 프로젝트 수라 슬롯당 판정 수를 키운다), 그다음 기존 compareAutoPriority.
// 나머지 칸은 기존 compareAutoPriority(SaaS → 첫 추출 → 미판정 많은 순 → id) 그대로 — 그 함수는 extract 와 한 벌이라 손대지 않고 감싼다.
// 고를 때마다 그 프로젝트의 미판정 수만큼 영역 판정 수를 더하고 남은 공급에서 뺀다(탐욕) — 하루 상한 5프로젝트가 한 결손 영역에
// 몰리지 않고, 최소량을 채운 영역은 그 자리에서 충족 칸으로 내려간다. 공급 부족 칸: 2건뿐인 영역이 결손이 크다는 이유로
// 슬롯 하나를 맨 앞에서 먹지 않게 한다(2026-10-09 독립 점검 권고 1 — 실 DB ② 미판정 2건).
//
// 영역 = analysis_projects.area_code(소급 열, 마이그 20261009000020). NULL(새 프로젝트)이면 review_targets.label 접두(target-supply.ts areaOf),
// 그래도 없으면 영역 외 취급. 열이 없으면(42703) 전부 라벨 폴백 + 경고. 판정 수를 못 읽으면 null — 호출부가 영역 축을 끈다(§7.1).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { compareAutoPriority } from './extract-auto.ts'
import { scorableAreas, type AreasConfig } from './areas-config.ts'
import { areaOf as labelArea } from '../review/target-supply.ts'

export type AreaVia = 'column' | 'label' | 'mixed' | 'none' | 'unknown'
export interface ProjectArea {
  /** 영역 코드(1~5·design·hold·out-*) 또는 영역 밖 표지 'unassigned'(근거 없음·갈림·확인 불가). */
  code: string
  via: AreaVia
}
export interface AreaContext {
  column: 'present' | 'absent'
  byProject: Map<string, ProjectArea>
  /** 영역 코드 → review_relevance_verdicts 행 수(코드가 있는 프로젝트만). */
  judged: Record<string, number>
}

type Warn = (m: string) => void
const PAGE = 1000

async function readAll(build: (from: number, to: number) => any): Promise<{ rows: any[]; error: { code?: string; message: string } | null }> {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) return { rows, error }
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return { rows, error: null }
  }
}

/**
 * 프로젝트 영역·영역별 판정 수를 읽는다(SELECT 만). 실패는 null — "판정 0"으로 접지 않는다.
 * 라벨 조회만 실패하면 그 프로젝트들은 via='unknown'(영역 외 칸)으로 두고 경고한다 — 열로 아는 영역까지 끄지 않는다.
 */
export async function loadAreaContext(supabase: any, warn: Warn): Promise<AreaContext | null> {
  let column: AreaContext['column'] = 'present'
  let proj = await readAll((a, b) => supabase.from('analysis_projects').select('id, area_code').order('id').range(a, b))
  if (proj.error?.code === '42703') {
    column = 'absent'
    warn('analysis_projects.area_code 열이 없다(42703, 마이그 20261009000020 미적용) — 영역을 전부 타깃 라벨 접두로 정한다')
    proj = await readAll((a, b) => supabase.from('analysis_projects').select('id').order('id').range(a, b))
  }
  if (proj.error) {
    warn(`프로젝트 영역 조회 실패 — 영역 축 확인 불가: ${proj.error.message}`)
    return null
  }

  const byProject = new Map<string, ProjectArea>()
  const needLabel: string[] = []
  for (const p of proj.rows as { id: string; area_code?: string | null }[]) {
    if (p.area_code) byProject.set(p.id, { code: p.area_code, via: 'column' })
    else needLabel.push(p.id)
  }

  if (needLabel.length > 0) {
    const tg = await readAll((a, b) => supabase.from('review_targets').select('project_id, label').not('project_id', 'is', null).order('id').range(a, b))
    if (tg.error) {
      warn(`타깃 라벨 조회 실패 — 영역 미부여 프로젝트 ${needLabel.length}건을 영역 외 칸에 둔다(확인 불가): ${tg.error.message}`)
      for (const id of needLabel) byProject.set(id, { code: 'unassigned', via: 'unknown' })
    } else {
      const labels = new Map<string, Set<string>>()
      for (const t of tg.rows as { project_id: string; label: string | null }[]) {
        const a = labelArea(t.label)
        if (a === 'unmapped') continue
        ;(labels.get(t.project_id) ?? labels.set(t.project_id, new Set()).get(t.project_id)!).add(a)
      }
      for (const id of needLabel) {
        const s = labels.get(id)
        byProject.set(id, !s ? { code: 'unassigned', via: 'none' } : s.size === 1 ? { code: [...s][0], via: 'label' } : { code: 'unassigned', via: 'mixed' })
      }
    }
  }

  const ver = await readAll((a, b) => supabase.from('review_relevance_verdicts').select('project_id').order('input_id').range(a, b))
  if (ver.error) {
    warn(`판정 수 조회 실패 — 영역 결손을 모른다(영역 축 끔): ${ver.error.message}`)
    return null
  }
  const judged: Record<string, number> = {}
  for (const v of ver.rows as { project_id: string }[]) {
    const code = byProject.get(v.project_id)?.code
    if (code && code !== 'unassigned') judged[code] = (judged[code] ?? 0) + 1
  }
  return { column, byProject, judged }
}

export interface AreaCandidate {
  projectId: string
  newInputs: number | null
  businessModel?: string | null
  status?: string | null
}

/**
 * 칸: 0 공급 충분한 결손 · 1 공급 부족 결손(남은 미판정 합 supply < 결손) · 2 충족 · 3 영역 외(out-*·미부여) · 4 hold.
 * supply 를 모르면(undefined) 충분으로 본다 — 공급 계산은 순서를 미루는 쪽으로만 쓴다.
 */
export function areaRank(code: string, judged: number, cfg: AreasConfig, supply?: number): 0 | 1 | 2 | 3 | 4 {
  if (code === 'hold') return 4
  if (!scorableAreas(cfg).some((a) => a.code === code)) return 3
  if (judged >= cfg.floor) return 2
  return supply !== undefined && supply < cfg.floor - judged ? 1 : 0
}

/**
 * 탐욕 정렬(순수). 매 단계 남은 후보 중 (칸 → 결손 큰 순(칸 0·1) → 미판정 큰 순(칸 0·1) → compareAutoPriority) 최소를 고르고,
 * 그 영역 판정 수에 미판정 수를 더하고 남은 공급에서 뺀다. 공급 = 남은 후보 중 그 영역 프로젝트의 미판정 합(이번 실행이 볼 수 있는 것).
 * ponytail: O(n²) — 후보 프로젝트 수백 개 규모라 충분하다. 수천 개가 되면 영역별 큐로.
 */
export function orderByAreaDeficit<T extends AreaCandidate>(
  cands: readonly T[],
  areaOfProject: (projectId: string) => string,
  judged: Record<string, number>,
  cfg: AreasConfig,
): T[] {
  const projected: Record<string, number> = { ...judged }
  const supply: Record<string, number> = {}
  for (const c of cands) {
    const code = areaOfProject(c.projectId)
    supply[code] = (supply[code] ?? 0) + (c.newInputs ?? 0)
  }
  const key = (c: T) => {
    const code = areaOfProject(c.projectId)
    const n = projected[code] ?? 0
    return { rank: areaRank(code, n, cfg, supply[code] ?? 0), deficit: cfg.floor - n }
  }
  const cmp = (a: T, b: T) => {
    const ka = key(a)
    const kb = key(b)
    const deficitAxis = ka.rank <= 1
    return (
      ka.rank - kb.rank ||
      (deficitAxis ? kb.deficit - ka.deficit || (b.newInputs ?? 0) - (a.newInputs ?? 0) : 0) ||
      compareAutoPriority(a, b)
    )
  }
  const left = [...cands]
  const out: T[] = []
  while (left.length) {
    let best = 0
    for (let i = 1; i < left.length; i++) if (cmp(left[i], left[best]) < 0) best = i
    const [c] = left.splice(best, 1)
    out.push(c)
    const code = areaOfProject(c.projectId)
    projected[code] = (projected[code] ?? 0) + (c.newInputs ?? 0)
    supply[code] = (supply[code] ?? 0) - (c.newInputs ?? 0)
  }
  return out
}

export type AreaOrderPlan<T> = { ordered: T[]; axis: 'on' | 'off'; reason: string | null; ctx: AreaContext | null }

/**
 * 호출부 배선(스크립트가 쓴다). 설정 없음·맥락 확인 불가·**예외**(조회·정렬 어디서든) → 축 끔 + 사유, 기존 순서(compareAutoPriority)로 후퇴.
 * 영역 축은 순서 최적화일 뿐이라, 여기서 난 예외가 T2 실행 전체를 죽이면 안 된다.
 */
export async function planAreaOrder<T extends AreaCandidate>(deps: {
  cfg: AreasConfig | null
  load: () => Promise<AreaContext | null>
  cands: readonly T[]
  warn: Warn
}): Promise<AreaOrderPlan<T>> {
  const fallback = (reason: string, ctx: AreaContext | null = null): AreaOrderPlan<T> => ({ ordered: [...deps.cands].sort(compareAutoPriority), axis: 'off', reason, ctx })
  if (!deps.cfg) return fallback('영역 설정 확인 불가')
  try {
    const ctx = await deps.load()
    if (!ctx) return fallback('영역 맥락(영역·판정 수) 확인 불가')
    const ordered = orderByAreaDeficit(deps.cands, (id) => ctx.byProject.get(id)?.code ?? 'unassigned', ctx.judged, deps.cfg)
    return { ordered, axis: 'on', reason: null, ctx }
  } catch (e) {
    const reason = `영역 축 예외 — 기존 순서로 후퇴: ${e instanceof Error ? e.message : String(e)}`
    deps.warn(reason)
    return fallback(reason)
  }
}

/** 로그용 한 줄: `1 54/200 · 2 400/200 · …` (최소량 대상 영역, 설정 순서). */
export function areaFloorLine(judged: Record<string, number>, cfg: AreasConfig): string {
  return scorableAreas(cfg).map((a) => `${a.code} ${judged[a.code] ?? 0}/${cfg.floor}${(judged[a.code] ?? 0) < cfg.floor ? '(결손)' : ''}`).join(' · ')
}
