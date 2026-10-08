// 영역 정본 로더 — config/areas.json 한 곳을 읽는다(남헌 v37 작업 7). T2 프로젝트 순서·영역 대시보드가 이 결과만 쓴다.
//
// 방식은 lib/analysis/prefilter.ts 와 같다: parse 는 형식이 틀리면 던지고, load 가 cfg=null + error 로 접는다.
// 못 읽었을 때의 안전한 기본값 = **영역 축을 끈다**(호출부 몫): T2 는 기존 순서(compareAutoPriority) 그대로,
// 대시보드는 상태 칸을 '확인 불가'로 찍는다. 모르는 영역표로 순서를 바꾸거나 '미달'을 띄우지 않는다(§7.1).
// 숫자 기본값을 코드에 두 벌 두지 않는다 — 정본은 JSON 하나다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(CLI·셀프테스트). `@/` 별칭·enum 을 쓰지 않는다.

import fs from 'node:fs'
import path from 'node:path'

/** DB CHECK(analysis_projects_area_code_check, 마이그 20261009000020)와 같은 어휘. 셀프테스트가 마이그 파일과 대조한다. */
export const AREA_CODES = ['1', '2', '3', '4', '5', 'design', 'hold', 'out-consumer', 'out-founder'] as const
export type AreaKind = 'area' | 'hold' | 'out'

export interface AreaDef {
  code: string
  name: string
  kind: AreaKind
  active: boolean
}

export interface AbandonCriteria {
  /** 'proposed' = 남헌 확정 전 제안값. */
  status: string
  cyclesBeforeEval: [number, number]
  cycleDays: number
  minProjects: number
  projectInputMin: number
  minRelevantPct: number
  grayBandPct: [number, number]
  maxUnknownPct: number
  relevantMinN: number
  minMedianInputs: number
  immediateSwapRelevantPct: number
}

export interface AreasConfig {
  version: string
  /** 파일 순서 = 표시·판정 순서. */
  areas: AreaDef[]
  /** 영역별 최소 판정량. env RELEVANCE_AREA_FLOOR 가 이기면 floorSource='env'. */
  floor: number
  floorSource: 'config' | 'env'
  founderSources: string[]
  abandon: AbandonCriteria
}

export const DEFAULT_AREAS_PATH = path.join(process.cwd(), 'config', 'areas.json')

const KINDS: readonly string[] = ['area', 'hold', 'out']
const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const isPct = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100

/** env 문자열 → 양의 정수. 비었으면 null(설정 없음), 틀렸으면 NaN(경고 대상). */
export function parseFloorEnv(v: string | undefined): number | null {
  const s = (v ?? '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isInteger(n) && n > 0 ? n : NaN
}

/** JSON(+env) → 설정. 형식이 틀리면 던진다 — loadAreasConfig 가 확인 불가로 접는다. */
export function parseAreasConfig(raw: unknown, env: Record<string, string | undefined> = {}): { cfg: AreasConfig; warnings: string[] } {
  if (!raw || typeof raw !== 'object') throw new Error('설정이 객체가 아니다')
  const r = raw as Record<string, unknown>
  const warnings: string[] = []

  if (!Array.isArray(r.areas)) throw new Error('areas 가 배열이 아니다')
  const areas: AreaDef[] = r.areas.map((a, i) => {
    const o = (a ?? {}) as Record<string, unknown>
    if (typeof o.code !== 'string' || !(AREA_CODES as readonly string[]).includes(o.code)) throw new Error(`areas[${i}].code '${String(o.code)}' 는 어휘 밖(${AREA_CODES.join(',')})`)
    if (typeof o.name !== 'string' || o.name.trim() === '') throw new Error(`areas[${i}](${o.code}).name 이 비었다`)
    if (typeof o.kind !== 'string' || !KINDS.includes(o.kind)) throw new Error(`areas[${i}](${o.code}).kind '${String(o.kind)}' 는 area|hold|out 가 아니다`)
    if (typeof o.active !== 'boolean') throw new Error(`areas[${i}](${o.code}).active 가 boolean 이 아니다`)
    return { code: o.code, name: o.name, kind: o.kind as AreaKind, active: o.active }
  })
  const codes = areas.map((a) => a.code)
  const dup = codes.filter((c, i) => codes.indexOf(c) !== i)
  if (dup.length) throw new Error(`영역 코드 중복: ${dup.join(',')}`)
  const missing = AREA_CODES.filter((c) => !codes.includes(c))
  if (missing.length) throw new Error(`DB 어휘에 있는데 설정에 없는 코드: ${missing.join(',')}`)
  // 어휘의 뜻을 고정한다 — hold 를 켜거나 영역 외 태그를 영역으로 바꾸는 건 설정 실수로 일어나면 안 된다(남헌 지시: hold 신규 타깃 금지).
  for (const a of areas) {
    if (a.code === 'hold' && (a.kind !== 'hold' || a.active)) throw new Error('hold 는 kind=hold · active=false 여야 한다(보류 — 신규 타깃 금지)')
    if (a.code.startsWith('out-') && (a.kind !== 'out' || a.active)) throw new Error(`${a.code} 는 kind=out · active=false 여야 한다(영역이 아니라 태그)`)
    if (a.kind !== 'area' && a.active) throw new Error(`${a.code}: kind=${a.kind} 는 active 일 수 없다`)
  }

  if (!isPosInt(r.floor)) throw new Error(`floor '${String(r.floor)}' 는 양의 정수가 아니다`)
  let floor = r.floor
  let floorSource: AreasConfig['floorSource'] = 'config'
  const envFloor = parseFloorEnv(env.RELEVANCE_AREA_FLOOR)
  if (envFloor !== null) {
    if (Number.isNaN(envFloor)) warnings.push(`RELEVANCE_AREA_FLOOR='${env.RELEVANCE_AREA_FLOOR}' 는 양의 정수가 아니다 — 설정값 ${floor} 로 간다`)
    else {
      floor = envFloor
      floorSource = 'env'
    }
  }

  if (!Array.isArray(r.founder_sources) || r.founder_sources.length === 0 || !r.founder_sources.every((s) => typeof s === 'string' && s.trim() !== '')) {
    throw new Error('founder_sources 가 비어 있지 않은 문자열 배열이 아니다')
  }

  const a = (r.abandon && typeof r.abandon === 'object' ? r.abandon : null) as Record<string, unknown> | null
  if (!a) throw new Error('abandon 이 없다')
  const pair = (k: string, ok: (v: unknown) => boolean): [number, number] => {
    const v = a[k]
    if (!Array.isArray(v) || v.length !== 2 || !v.every(ok) || (v[0] as number) > (v[1] as number)) throw new Error(`abandon.${k} 가 [작은 값, 큰 값] 이 아니다`)
    return [v[0] as number, v[1] as number]
  }
  const need = <T>(k: string, ok: (v: unknown) => v is T): T => {
    if (!ok(a[k])) throw new Error(`abandon.${k} '${String(a[k])}' 가 형식 밖`)
    return a[k] as T
  }
  const abandon: AbandonCriteria = {
    status: typeof a.status === 'string' ? a.status : 'proposed',
    cyclesBeforeEval: pair('cycles_before_eval', isPosInt),
    cycleDays: need('cycle_days', isPosInt),
    minProjects: need('min_projects', isPosInt),
    projectInputMin: need('project_input_min', isPosInt),
    minRelevantPct: need('min_relevant_pct', isPct),
    grayBandPct: pair('gray_band_pct', isPct),
    maxUnknownPct: need('max_unknown_pct', isPct),
    relevantMinN: need('relevant_min_n', isPosInt),
    minMedianInputs: need('min_median_inputs', isPosInt),
    immediateSwapRelevantPct: need('immediate_swap_relevant_pct', isPct),
  }
  if (abandon.minRelevantPct < abandon.grayBandPct[0] || abandon.minRelevantPct > abandon.grayBandPct[1]) {
    throw new Error(`abandon.min_relevant_pct ${abandon.minRelevantPct} 가 회색 띠 ${abandon.grayBandPct.join('~')} 밖이다`)
  }

  return {
    cfg: { version: typeof r.version === 'string' ? r.version : '(미기재)', areas, floor, floorSource, founderSources: r.founder_sources as string[], abandon },
    warnings,
  }
}

/** 설정 파일을 읽는다. 못 읽으면 cfg=null + error — 호출부는 영역 축을 끈다(위 머리말). */
export function loadAreasConfig(
  file: string | URL = DEFAULT_AREAS_PATH,
  env: Record<string, string | undefined> = process.env,
): { cfg: AreasConfig | null; error: string | null; warnings: string[] } {
  try {
    const { cfg, warnings } = parseAreasConfig(JSON.parse(fs.readFileSync(file, 'utf8')), env)
    return { cfg, error: null, warnings }
  } catch (e) {
    return { cfg: null, error: `${String(file)}: ${e instanceof Error ? e.message : String(e)}`, warnings: [] }
  }
}

/** 최소량 대상 영역(kind=area ∧ active), 설정 순서. */
export const scorableAreas = (cfg: AreasConfig): AreaDef[] => cfg.areas.filter((a) => a.kind === 'area' && a.active)
