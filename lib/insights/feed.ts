// 인사이트 화면(/insights, 로그인후 전용)의 읽기 한 벌.
// 정본: reports/2026-09-30/design-direction-ia-insights-report.md I1 (남헌 2026-09-30 확정).
//
// 데이터: analysis_angles(judge 최종 판정) ⨝ analysis_projects ⨝ analysis_aspects ⨝ pmf_assessments(최신 1건)
//         + validated_angles_corpus(실전 채택 표시). 이미 계산된 값만 읽는다 — LLM 호출 0, 마이그 0.
// ★ 3상태: 조회 실패('error')와 0건('ok' + 빈 배열)을 가른다(§7.1). 핵심 4테이블 중 하나라도 못 읽으면
//   화면 전체가 "확인 불가"다 — 사분면을 "미진단"으로, 앵글을 "0건"으로 접지 않는다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(scripts/insights-feed-selftest.mjs). `@/` 별칭을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ANGLE_TYPES, OUTPUT_TYPES, QUADRANTS as ASPECT_QUADRANTS, SUBSTANTIATION_VERDICTS,
  type AnalysisMode, type AngleType, type OutputType, type Quadrant as AspectQuadrant, type SubstantiationVerdict,
} from '../analysis/types.ts'
import { QUADRANT as PMF_QUADRANTS, type Quadrant as PmfQuadrant } from '../cases/match.ts'
import { safeSelect } from '../cases/corpus-db.ts'
import { EXCERPT_MAX, PAGE_SIZE, UUID, excerptOf, type Loaded } from '../signals/feed.ts'

export { EXCERPT_MAX, PAGE_SIZE }
export type { Loaded }

/**
 * 게이트 통과의 정의(I1-1). 네 조건이 **모두** 맞아야 기본 화면에 나온다.
 *  - verdicts: judge 최종 판정. UNSUBSTANTIATED 는 재작성 뒤에도 근거가 없다고 재심사된 것.
 *  - outputTypes: 소비자 노출물만. 내부 메모(PRODUCT_SPEC·BASELINE_SPEC)와 NULL 은 인사이트가 아니다.
 *  - aspectQuadrants: 속성 사분면. OVER_INVESTED·IGNORE·속성 없음(aspect_id NULL)은 뺀다.
 *  - projectStatuses: 생성 도중(claimed 등)이 아닌 것만.
 * `?gate=all` 은 verdicts 조건만 UNSUBSTANTIATED 까지 넓힌다(나머지 셋은 그대로).
 */
export const INSIGHT_GATE = {
  verdicts: ['SUBSTANTIATED', 'EXPERIENTIAL'],
  outputTypes: ['COPY', 'OFFER', 'STRUCTURE'],
  aspectQuadrants: ['DIFFERENTIATOR', 'TABLE_STAKES'],
  projectStatuses: ['angled', 'done'],
} as const satisfies {
  verdicts: readonly SubstantiationVerdict[]
  outputTypes: readonly OutputType[]
  aspectQuadrants: readonly AspectQuadrant[]
  projectStatuses: readonly string[]
}
export type InsightGate = { [K in keyof typeof INSIGHT_GATE]: readonly string[] }

export const GATE_MODES = ['pass', 'all'] as const
export type GateMode = (typeof GATE_MODES)[number]
export const SORTS = ['recent', 'verdict'] as const
export type InsightSort = (typeof SORTS)[number]
/** 사분면 필터·그룹 키. 'none' = 미진단(진단 행 없음 · quadrant NULL). */
export type QuadrantKey = PmfQuadrant | 'none'
export const QUADRANT_ORDER: readonly QuadrantKey[] = [...PMF_QUADRANTS, 'none']
/** 프로젝트 칩을 펴 두는 수. 나머지는 접힘. */
export const PROJECT_CHIPS = 8
export const MAX_PAGE = 40

// ── 행 타입(select 컬럼과 1:1) ─────────────────────────────────

/** GET /api/analyze/angle(route.ts) 와 같은 12개 + project_id. */
export const ANGLE_COLS =
  'id, project_id, aspect_id, angle_type, output_type, headline_draft, substantiation_verdict, substantiation_reason, substantiation_evidence, headline_original, gate_rewritten, adaptation_suggestion, created_at'
export const PROJECT_COLS = 'id, product_elevator_pitch, mode, purpose, status, maturity_stage, created_at'
export const ASPECT_COLS = 'id, project_id, name, quadrant, opportunity_score'
export const ASSESSMENT_COLS = 'target_project_id, quadrant, demand_axis, precedent_axis, match_status, created_at'

export interface AngleRow {
  id: string
  project_id: string | null
  aspect_id: string | null
  angle_type: string | null
  output_type: string | null
  headline_draft: string | null
  substantiation_verdict: string | null
  substantiation_reason: string | null
  substantiation_evidence: string | null
  headline_original: string | null
  gate_rewritten: boolean | null
  adaptation_suggestion: string | null
  created_at: string | null
}
export interface ProjectRow {
  id: string
  product_elevator_pitch: string | null
  mode: string | null
  purpose?: string | null
  status: string | null
  maturity_stage?: number | null
  created_at: string | null
}
export interface AspectRow { id: string; project_id: string | null; name: string | null; quadrant: string | null; opportunity_score?: number | string | null }
export interface AssessmentRow {
  target_project_id: string | null
  quadrant: string | null
  demand_axis?: number | string | null
  precedent_axis?: number | string | null
  match_status: string | null
  created_at: string | null
}

/** 조회 결과 묶음. null = 그 테이블을 못 읽었다(0행과 다르다). validated 만 null 이어도 화면이 산다. */
export interface InsightCorpora {
  angles: AngleRow[] | null
  projects: ProjectRow[] | null
  aspects: AspectRow[] | null
  assessments: AssessmentRow[] | null
  /** validated_angles_corpus.angle_id 집합. null = 확인 불가(테이블 없음 등) — 칩만 뺀다. */
  validated: Set<string> | null
}

export interface InsightItem {
  id: string
  project_id: string
  headline: string
  verdict: SubstantiationVerdict
  /** SUBSTANTIATED 일 때만 — EXCERPT_MAX 자 발췌. 그 밖은 null(줄을 안 만든다). */
  evidence: string | null
  reason: string | null
  headline_original: string | null
  gate_rewritten: boolean
  angle_type: AngleType | null
  output_type: OutputType
  adaptation: string | null
  created_at: string | null
  /** analysis_angles.aspect_id — 게이트가 속성 있음을 요구하므로 항상 채워진다. 처방·인용의 연결 고리(lib/insights/evidence.ts). */
  aspect_id: string
  aspect_name: string | null
  aspect_quadrant: AspectQuadrant
  project_pitch: string | null
  mode: AnalysisMode | null
  pmf: QuadrantKey
  /** true = 실전 채택 기록 있음, false = 없음, null = 확인 불가. */
  validated: boolean | null
}

export interface InsightQuery {
  quadrant: QuadrantKey | null
  gate: GateMode
  project: string | null
  sort: InsightSort
  page: number
}

// ── 순수 함수 (selftest 대상) ───────────────────────────────────

const has = (list: readonly string[], v: string | null | undefined): boolean => v != null && list.includes(v)
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

/**
 * 한 앵글이 게이트를 통과하나. 판정 이유는 첫 번째로 걸린 조건(selftest·캡션이 쓴다), 통과면 null.
 * `mode='all'` 은 verdict 조건만 UNSUBSTANTIATED 까지 넓힌다. 문구가 빈 행은 보여줄 게 없어 뺀다.
 */
export function gateReason(
  a: Pick<AngleRow, 'substantiation_verdict' | 'output_type' | 'headline_draft'>,
  aspect: Pick<AspectRow, 'quadrant'> | null,
  project: Pick<ProjectRow, 'status'> | null,
  mode: GateMode = 'pass',
  gate: InsightGate = INSIGHT_GATE,
): 'verdict' | 'output' | 'aspect' | 'status' | 'empty' | null {
  const verdicts = mode === 'all' ? [...gate.verdicts, 'UNSUBSTANTIATED'] : gate.verdicts
  if (!has(verdicts, a.substantiation_verdict)) return 'verdict'
  if (!has(gate.outputTypes, a.output_type)) return 'output'
  if (!has(gate.aspectQuadrants, aspect?.quadrant)) return 'aspect'
  if (!has(gate.projectStatuses, project?.status)) return 'status'
  if (!a.headline_draft?.trim()) return 'empty'
  return null
}

/** 진단이 여러 번이면 created_at 최신 1건(`/analyze` 목록과 한 벌). 없으면 null. */
export function latestAssessment<T extends { created_at: string | null }>(rows: readonly T[] | null | undefined): T | null {
  return [...(rows ?? [])].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0] ?? null
}

/** URL 질의 → 필터. 어휘 밖 값은 버리고 errors 에 적는다(조용히 무시하지 않는다). */
export function parseInsightQuery(sp: Record<string, string | string[] | undefined>): { query: InsightQuery; errors: string[] } {
  const one = (k: string) => ((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? '').trim()
  const errors: string[] = []
  const rawQ = one('quadrant')
  const quadrant = pick(rawQ, QUADRANT_ORDER)
  if (rawQ && !quadrant) errors.push(`사분면 "${rawQ.slice(0, 20)}" 는 ${QUADRANT_ORDER.join('·')} 가 아니다`)
  const rawG = one('gate')
  const gate = pick(rawG, GATE_MODES) ?? 'pass'
  if (rawG && gate !== rawG) errors.push(`판정 "${rawG.slice(0, 20)}" 는 pass·all 이 아니다`)
  const rawP = one('project')
  const project = UUID.test(rawP) ? rawP.toLowerCase() : null
  if (rawP && !project) errors.push(`프로젝트 "${rawP.slice(0, 40)}" 는 id 형식이 아니다`)
  const rawS = one('sort')
  const sort = pick(rawS, SORTS) ?? 'recent'
  if (rawS && sort !== rawS) errors.push(`정렬 "${rawS.slice(0, 20)}" 는 recent·verdict 가 아니다`)
  const p = Number(one('page') || 1)
  const page = Number.isInteger(p) && p >= 1 ? Math.min(p, MAX_PAGE) : 1
  if (one('page') && page !== p) errors.push(`페이지 번호는 1~${MAX_PAGE} 이다`)
  return { query: { quadrant, gate, project, sort, page }, errors }
}

/** 기본값은 URL 에 안 적는다 — 파라미터 없는 첫 진입과 같은 화면이 된다. */
export function insightHref(q: InsightQuery, patch: Partial<InsightQuery>): string {
  const n = { ...q, page: 1, ...patch }
  const p = new URLSearchParams()
  if (n.quadrant) p.set('quadrant', n.quadrant)
  if (n.gate !== 'pass') p.set('gate', n.gate)
  if (n.project) p.set('project', n.project)
  if (n.sort !== 'recent') p.set('sort', n.sort)
  if (n.page > 1) p.set('page', String(n.page))
  const s = p.toString()
  return s ? `/insights?${s}` : '/insights'
}

const VERDICT_RANK: Record<SubstantiationVerdict, number> = { SUBSTANTIATED: 0, EXPERIENTIAL: 1, UNSUBSTANTIATED: 2 }
const newer = (a: { created_at: string | null; id: string }, b: { created_at: string | null; id: string }) =>
  String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || a.id.localeCompare(b.id)

export interface InsightFeed {
  /** 이 페이지 카드를 PMF 사분면 순서로 묶은 것(이 페이지에 카드가 없는 그룹은 뺀다). count = 필터 뒤 그 사분면 전체 건수. */
  groups: { quadrant: QuadrantKey; items: InsightItem[]; count: number }[]
  /** 필터 적용 뒤 총건수(페이지 무관). 한 페이지에 다 들어오면 그룹 count 합 = total. */
  total: number
  /** 기본 게이트(pass)에서 verdict 조건 하나로만 숨은 건수 — 판정 필터가 all 이면 0. */
  hiddenUnsubstantiated: number
  /** 필터 적용 전, 게이트 통과 전체 중 미진단(none) 건수. */
  undiagnosed: number
  /** 게이트 통과 앵글이 속한 프로젝트 중 최신 진단이 not_run(선례 확인 불가)인 곳 수. */
  notRunProjects: number
  /** 사분면 칩 건수(프로젝트 필터 적용, 사분면 필터 무관). */
  quadrantCounts: Record<QuadrantKey, number>
  /** 프로젝트 칩(게이트 통과 앵글 1건 이상, 최신 앵글순). 사분면 필터 무관. */
  projects: { id: string; label: string; count: number }[]
  /** 게이트 통과 전체(필터 전). */
  gated: number
  validatedKnown: boolean
}

/** 순수: 조인 → 게이트 → 필터 → 정렬 → 페이지 → 그룹. corpora 의 핵심 4개가 모두 배열이어야 한다. */
export function buildInsightFeed(
  q: InsightQuery,
  c: { angles: AngleRow[]; projects: ProjectRow[]; aspects: AspectRow[]; assessments: AssessmentRow[]; validated: Set<string> | null },
  gate: InsightGate = INSIGHT_GATE,
): InsightFeed {
  const projectById = new Map(c.projects.map((p) => [p.id, p]))
  const aspectById = new Map(c.aspects.map((a) => [a.id, a]))
  const byProject = new Map<string, AssessmentRow[]>()
  for (const r of c.assessments) {
    if (!r.target_project_id) continue
    byProject.set(r.target_project_id, [...(byProject.get(r.target_project_id) ?? []), r])
  }
  const latestOf = new Map([...byProject].map(([id, rows]) => [id, latestAssessment(rows)]))

  let hiddenUnsubstantiated = 0
  const gated: InsightItem[] = []
  for (const a of c.angles) {
    const project = a.project_id ? projectById.get(a.project_id) ?? null : null
    const aspect = a.aspect_id ? aspectById.get(a.aspect_id) ?? null : null
    const why = gateReason(a, aspect, project, q.gate, gate)
    if (why) {
      // 판정 하나로만 걸린 것 = "전부 보기"로 볼 수 있는 숨긴 건수.
      if (q.gate === 'pass' && why === 'verdict' && a.substantiation_verdict === 'UNSUBSTANTIATED'
        && !gateReason(a, aspect, project, 'all', gate)) hiddenUnsubstantiated++
      continue
    }
    const verdict = a.substantiation_verdict as SubstantiationVerdict
    const pmf = latestOf.get(project!.id)?.quadrant
    gated.push({
      id: a.id,
      project_id: project!.id,
      headline: a.headline_draft!.trim(),
      verdict,
      evidence: verdict === 'SUBSTANTIATED' && a.substantiation_evidence?.trim() ? excerptOf(a.substantiation_evidence, EXCERPT_MAX) : null,
      reason: a.substantiation_reason,
      headline_original: a.headline_original,
      gate_rewritten: a.gate_rewritten === true,
      angle_type: pick(a.angle_type, ANGLE_TYPES),
      output_type: pick(a.output_type, OUTPUT_TYPES) as OutputType,
      adaptation: a.adaptation_suggestion,
      created_at: a.created_at,
      aspect_id: aspect!.id,
      aspect_name: aspect?.name ?? null,
      aspect_quadrant: pick(aspect?.quadrant, ASPECT_QUADRANTS) as AspectQuadrant,
      project_pitch: project!.product_elevator_pitch,
      mode: project!.mode === 'forward' || project!.mode === 'reverse' ? project!.mode : null,
      pmf: pick(pmf, PMF_QUADRANTS) ?? 'none',
      validated: c.validated ? c.validated.has(a.id) : null,
    })
  }
  gated.sort(newer)

  // 프로젝트 칩: 게이트 통과 앵글이 있는 프로젝트, 최신 앵글순(gated 가 이미 최신순).
  const projects: InsightFeed['projects'] = []
  for (const it of gated) {
    const hit = projects.find((p) => p.id === it.project_id)
    if (hit) hit.count++
    else projects.push({ id: it.project_id, label: excerptOf(it.project_pitch ?? '(설명 없음)', 30), count: 1 })
  }
  const notRunProjects = projects.filter((p) => latestOf.get(p.id)?.match_status === 'not_run').length

  const inProject = q.project ? gated.filter((it) => it.project_id === q.project) : gated
  const quadrantCounts = Object.fromEntries(QUADRANT_ORDER.map((k) => [k, 0])) as Record<QuadrantKey, number>
  for (const it of inProject) quadrantCounts[it.pmf]++

  const filtered = q.quadrant ? inProject.filter((it) => it.pmf === q.quadrant) : inProject
  const sorted = q.sort === 'verdict'
    ? [...filtered].sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || newer(a, b))
    : filtered
  const from = (q.page - 1) * PAGE_SIZE
  const page = sorted.slice(from, from + PAGE_SIZE)
  const groups = QUADRANT_ORDER
    .map((quadrant) => {
      const items = page.filter((it) => it.pmf === quadrant)
      return { quadrant, items, count: filtered.filter((it) => it.pmf === quadrant).length }
    })
    .filter((g) => g.items.length > 0)

  return {
    groups,
    total: filtered.length,
    hiddenUnsubstantiated,
    undiagnosed: gated.filter((it) => it.pmf === 'none').length,
    notRunProjects,
    quadrantCounts,
    projects,
    gated: gated.length,
    validatedKnown: c.validated !== null,
  }
}

// ── 조회 ────────────────────────────────────────────────────────

/**
 * 앵글 행 상한. Supabase 기본 max-rows(1000)와 같다 — 그보다 크게 적어도 서버가 자른다.
 * ponytail: 앵글 전체를 받아 앱에서 거른다(09-23 실측 angled 프로젝트 5곳). 잘리면(받은 행 < count)
 *   "확인 불가"로 떨어진다 — 일부만 거른 걸 피드로 내지 않는다. 넘기 시작하면 서버 필터·RPC 로 옮긴다.
 */
export const ANGLE_CAP = 1000

/** 핵심 4개 중 하나라도 못 읽으면 error. validated 는 못 읽어도 칩만 뺀다(safeSelect → null). */
export async function loadInsightFeed(sb: SupabaseClient, q: InsightQuery): Promise<Loaded<InsightFeed>> {
  const where = 'insights'
  const [angles, projects, aspects, assessments, validated] = await Promise.all([
    sb.from('analysis_angles').select(ANGLE_COLS, { count: 'exact' }).range(0, ANGLE_CAP - 1),
    safeSelect<ProjectRow>(sb, 'analysis_projects', PROJECT_COLS, where),
    safeSelect<AspectRow>(sb, 'analysis_aspects', ASPECT_COLS, where),
    safeSelect<AssessmentRow>(sb, 'pmf_assessments', ASSESSMENT_COLS, where),
    safeSelect<{ angle_id: string | null }>(sb, 'validated_angles_corpus', 'angle_id', where),
  ])
  if (angles.error) {
    console.error(`[${where}] analysis_angles select error:`, angles.error.code ?? '', angles.error.message)
    return { status: 'error', reason: `앵글 조회 실패(${angles.error.code ?? 'error'})` }
  }
  const rows = (angles.data ?? []) as unknown as AngleRow[]
  if (angles.count == null || rows.length < angles.count) {
    console.error(`[${where}] analysis_angles truncated:`, rows.length, '/', angles.count)
    return { status: 'error', reason: `앵글 ${rows.length}건만 받았다(전체 ${angles.count ?? '모름'}) — 잘린 목록을 피드로 내지 않는다` }
  }
  const missing = [['프로젝트', projects], ['속성', aspects], ['PMF 진단', assessments]].filter(([, v]) => v === null).map(([k]) => k)
  if (missing.length) return { status: 'error', reason: `${missing.join('·')} 조회 실패` }
  if (validated === null) console.warn(`[${where}] validated_angles_corpus 확인 불가 — 실전 채택 칩을 뺀다`)
  const feed = buildInsightFeed(q, {
    angles: rows,
    projects: projects!,
    aspects: aspects!,
    assessments: assessments!,
    validated: validated ? new Set(validated.map((v) => v.angle_id).filter((v): v is string => !!v)) : null,
  })
  return { status: 'ok', ...feed }
}
