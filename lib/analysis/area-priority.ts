// T2 프로젝트 순서의 영역 결손 축(남헌 v37 작업 7 U1, 설계 reports/2026-10-08/area-quota-and-abandon-design-v31.md §2.2).
//
// 순서 = 결손 영역(최소량 대상 1~5·design, 판정 < floor) 프로젝트(결손 큰 순) → 충족 영역 → 영역 외(out-*·미부여·라벨 갈림) → hold 맨 뒤.
// 같은 칸 안에서는 기존 compareAutoPriority(SaaS → 첫 추출 → 미판정 많은 순 → id) 그대로 — 그 함수는 extract 와 한 벌이라 손대지 않고 감싼다.
// 고를 때마다 그 프로젝트의 미판정 수만큼 영역 판정 수를 미리 더한다(탐욕) — 하루 상한 5프로젝트가 한 결손 영역에 몰리지 않고
// 최소량을 채운 영역은 그 자리에서 충족 칸으로 내려간다.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/** 0 결손 영역 · 1 충족 영역 · 2 영역 외(out-*·미부여) · 3 hold. */
export function areaRank(code: string, judged: number, cfg: AreasConfig): 0 | 1 | 2 | 3 {
  if (code === 'hold') return 3
  if (!scorableAreas(cfg).some((a) => a.code === code)) return 2
  return judged < cfg.floor ? 0 : 1
}

/**
 * 탐욕 정렬(순수). 매 단계 남은 후보 중 (칸 → 결손 큰 순(칸 0 끼리) → compareAutoPriority) 최소를 고르고, 그 영역 판정 수에 미판정 수를 더한다.
 * ponytail: O(n²) — 후보 프로젝트 수백 개 규모라 충분하다. 수천 개가 되면 영역별 큐로.
 */
export function orderByAreaDeficit<T extends AreaCandidate>(
  cands: readonly T[],
  areaOfProject: (projectId: string) => string,
  judged: Record<string, number>,
  cfg: AreasConfig,
): T[] {
  const projected: Record<string, number> = { ...judged }
  const key = (c: T) => {
    const code = areaOfProject(c.projectId)
    const n = projected[code] ?? 0
    return { rank: areaRank(code, n, cfg), deficit: cfg.floor - n }
  }
  const cmp = (a: T, b: T) => {
    const ka = key(a)
    const kb = key(b)
    return ka.rank - kb.rank || (ka.rank === 0 ? kb.deficit - ka.deficit : 0) || compareAutoPriority(a, b)
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
  }
  return out
}

/** 로그용 한 줄: `1 54/200 · 2 400/200 · …` (최소량 대상 영역, 설정 순서). */
export function areaFloorLine(judged: Record<string, number>, cfg: AreasConfig): string {
  return scorableAreas(cfg).map((a) => `${a.code} ${judged[a.code] ?? 0}/${cfg.floor}${(judged[a.code] ?? 0) < cfg.floor ? '(결손)' : ''}`).join(' · ')
}
