// T2 앞 '부드러운 규칙 필터'(v31 항목 5, 남헌 확정) — **순수함수 + 설정 로더.** DB 는 호출부가 읽는다.
//
// 원칙: 불만을 놓치는 것보다 쓰레기를 조금 더 통과시킨다. 애매하면 통과.
//   · 거르는 후보(확실한 것만): 빈 글 · 평점만 · 기호만 · 이모지만 · 같은 프로젝트 안 동일 본문 중복 ·
//     확실한 스팸 광고 템플릿 · (지정 소스 한정) 제품명+카테고리어 미포함.
//   · 절대 안 거름: 불만 낱말 포함(짧아도) · 평점 ≤3 + 본문 있음 · 영어 글.
//   · 길이만으로 거르는 규칙은 없다 — 9/23 실측: <80자 컷은 무관 1건당 관련 1.6건을 버린다
//     (reports/2026-09-23/voc-expansion-investigation.md §5-3). 페인 낱말 '필터'도 역효과라 쓰지 않는다 —
//     여기 불만 낱말은 **보호**(통과)에만 쓴다.
//
// 모드: shadow(기본) = 표시만 · enforce = T2 대상에서 뺌. enforce 전환은 사람이 한다(docs/prefilter-shadow.md).
// 설정을 못 읽으면 아무것도 표시하지 않는다(fail-open) — 모르는 규칙으로 원문을 버리지 않는다(§7.1).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(CLI·셀프테스트). `@/` 별칭·enum 을 쓰지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { stripSourceHeader } from '../review/types.ts'
import { rng, shuffle } from './relevance-judge.ts'

export const PREFILTER_RULES = ['empty', 'rating_only', 'symbols_only', 'emoji_only', 'duplicate', 'ad_template', 'category_miss'] as const
export type PrefilterRule = (typeof PREFILTER_RULES)[number]
export type PrefilterProtect = 'complaint_word' | 'low_rating' | 'english'
export type PrefilterMode = 'shadow' | 'enforce'

/** 카테고리 규칙 금지 소스(남헌 v31) — 설정에 적어도 코드가 무시한다. 일반어 겹침이 아니라 앱/글 단위로 이미 제품에 묶인 소스다. */
export const CATEGORY_RULE_FORBIDDEN: readonly string[] = ['appstore', 'googleplay', 'hackernews']

export interface PrefilterConfig {
  mode: PrefilterMode
  /** '*' = 전부. */
  applySources: '*' | string[]
  complaintWords: string[]
  lowRatingMax: number
  englishMinLatin: number
  englishMinRatio: number
  duplicateMinChars: number
  adPatterns: RegExp[]
  category: { sources: string[]; require: 'both' | 'either'; projects: Record<string, { product: string[]; category: string[] }> }
}

// session-guard.json 과 같은 방식 — 스크립트는 리포 루트에서 돈다(CI·크론 모두).
export const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config', 'prefilter-rules.json')

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
const numOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** JSON(+env) → 설정. 형식이 틀리면 던진다 — 호출부(loadPrefilterConfig)가 확인 불가로 접는다. */
export function parsePrefilterConfig(raw: unknown, env: Record<string, string | undefined> = {}): { cfg: PrefilterConfig; warnings: string[] } {
  if (!raw || typeof raw !== 'object') throw new Error('설정이 객체가 아니다')
  const r = raw as Record<string, unknown>
  const warnings: string[] = []

  const modeRaw = (env.PREFILTER_MODE ?? (typeof r.mode === 'string' ? r.mode : 'shadow')).trim().toLowerCase()
  // 모르는 값은 shadow 다 — 오타로 enforce 가 켜지는 일은 없어야 한다.
  const mode: PrefilterMode = modeRaw === 'enforce' ? 'enforce' : 'shadow'
  if (modeRaw !== 'enforce' && modeRaw !== 'shadow') warnings.push(`모드 '${modeRaw}' 는 어휘 밖 — shadow 로 둔다`)

  const srcEnv = env.PREFILTER_SOURCES?.trim()
  const srcRaw: unknown = srcEnv ? (srcEnv === '*' ? '*' : srcEnv.split(',').map(s => s.trim()).filter(Boolean)) : r.apply_sources
  const applySources: '*' | string[] = srcRaw === '*' ? '*' : strList(srcRaw)

  const adPatterns: RegExp[] = []
  for (const p of strList(r.ad_patterns)) {
    try {
      adPatterns.push(new RegExp(p, 'isu')) // s: 줄바꿈 넘어 연락처 동반 여부를 본다(lookahead 패턴)
    } catch (e) {
      warnings.push(`광고 패턴 무시(정규식 오류): ${p}`) // 패턴 하나가 깨졌다고 전체를 끄지 않는다 — 그 패턴만 빠진다(덜 거르는 쪽)
    }
  }

  const c = (r.category_rule && typeof r.category_rule === 'object' ? r.category_rule : {}) as Record<string, unknown>
  const catSources = strList(c.sources)
  const forbidden = catSources.filter(s => CATEGORY_RULE_FORBIDDEN.includes(s))
  if (forbidden.length) warnings.push(`카테고리 규칙 금지 소스 무시: ${forbidden.join(',')}`)
  const projects: PrefilterConfig['category']['projects'] = {}
  if (c.projects && typeof c.projects === 'object') {
    for (const [id, v] of Object.entries(c.projects as Record<string, unknown>)) {
      const o = (v ?? {}) as Record<string, unknown>
      projects[id] = { product: strList(o.product), category: strList(o.category) }
    }
  }

  return {
    cfg: {
      mode,
      applySources,
      complaintWords: strList(r.complaint_words),
      lowRatingMax: numOr(r.low_rating_max, 3),
      englishMinLatin: numOr(r.english_min_latin_letters, 8),
      englishMinRatio: numOr(r.english_min_ratio, 0.5),
      duplicateMinChars: numOr(r.duplicate_min_chars, 20),
      adPatterns,
      category: {
        sources: catSources.filter(s => !CATEGORY_RULE_FORBIDDEN.includes(s)),
        require: c.require === 'either' ? 'either' : 'both',
        projects,
      },
    },
    warnings,
  }
}

/** 설정 파일을 읽는다. 못 읽으면 cfg=null + error — 호출부는 필터를 끈다(아무것도 표시 안 함). */
export function loadPrefilterConfig(
  file: string | URL = DEFAULT_CONFIG_PATH,
  env: Record<string, string | undefined> = process.env,
): { cfg: PrefilterConfig | null; error: string | null; warnings: string[] } {
  try {
    const { cfg, warnings } = parsePrefilterConfig(JSON.parse(fs.readFileSync(file, 'utf8')), env)
    return { cfg, error: null, warnings }
  } catch (e) {
    return { cfg: null, error: `${String(file)}: ${e instanceof Error ? e.message : String(e)}`, warnings: [] }
  }
}

export interface PrefilterInput {
  id: string
  raw_text?: string | null
  source_key?: string | null
  rating?: number | null
  collected_at?: string | null
  created_at?: string | null
}

export interface PrefilterVerdict {
  input_id: string
  /** 거를 후보면 그 규칙. null = 통과. */
  rule: PrefilterRule | null
  /** 보호 규칙으로 통과했으면 그 이유(로그용). */
  protectedBy: PrefilterProtect | null
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '')

function protection(body: string, rating: number | null | undefined, cfg: PrefilterConfig): PrefilterProtect | null {
  const hay = squash(body)
  if (cfg.complaintWords.some(w => hay.includes(squash(w)))) return 'complaint_word'
  if (typeof rating === 'number' && rating <= cfg.lowRatingMax) return 'low_rating'
  // 영어 판정에서 링크·도메인·@아이디는 뺀다 — 한국어 스팸의 연락처가 '영어 글'로 보호받지 않게.
  const prose = body.replace(/\S*:\/\/\S*|\b[\w-]+(\.[\w-]+)+(\/\S*)?|@\w+/g, ' ')
  const letters = prose.match(/\p{L}/gu)?.length ?? 0
  const latin = prose.match(/[a-z]/gi)?.length ?? 0
  if (latin >= cfg.englishMinLatin && letters > 0 && latin / letters >= cfg.englishMinRatio) return 'english'
  return null
}

function inScope(source: string | null | undefined, cfg: PrefilterConfig): boolean {
  if (cfg.applySources === '*') return true
  return !!source && cfg.applySources.includes(source)
}

/**
 * 호출부가 넘긴 한 프로젝트의 입력을 판정한다(중복은 그 안에서 센다 — 그래서 T2 묶음이 아니라 조회된 입력을 받는다).
 * ⚠️ T2 호출부(relevance-pending.ts)는 range 없이 조회하므로 PostgREST 기본 상한 1,000행까지만 본다 — "프로젝트 전체"가 아니다.
 * 중복의 '원본'은 가장 이른 수집분(동시면 id 순)이다 — 입력 순서와 무관하게 같은 결과(결정적).
 */
export function prefilterInputs(
  inputs: readonly PrefilterInput[],
  cfg: PrefilterConfig,
  projectId: string | null = null,
): PrefilterVerdict[] {
  const ts = (i: PrefilterInput) => {
    const t = Date.parse(i.collected_at ?? i.created_at ?? '')
    return Number.isFinite(t) ? t : 0
  }
  const order = inputs.map((input, idx) => ({ input, idx })).sort((a, b) => ts(a.input) - ts(b.input) || (a.input.id < b.input.id ? -1 : a.input.id > b.input.id ? 1 : 0))
  const seen = new Set<string>()
  const terms = projectId ? cfg.category.projects[projectId] : undefined
  const out: PrefilterVerdict[] = new Array(inputs.length)

  for (const { input, idx } of order) {
    const pass = (protectedBy: PrefilterProtect | null = null): PrefilterVerdict => ({ input_id: input.id, rule: null, protectedBy })
    const flag = (rule: PrefilterRule): PrefilterVerdict => ({ input_id: input.id, rule, protectedBy: null })
    if (!inScope(input.source_key, cfg)) { out[idx] = pass(); continue }

    const body = stripSourceHeader(input.raw_text, { appVersion: true }).trim()
    if (body === '') { out[idx] = flag(typeof input.rating === 'number' ? 'rating_only' : 'empty'); continue }

    const key = squash(body)
    const dup = key.length >= cfg.duplicateMinChars && seen.has(key)
    seen.add(key)

    const prot = protection(body, input.rating, cfg)
    if (prot) { out[idx] = pass(prot); continue }

    if (!/[\p{L}\p{N}]/u.test(body)) { out[idx] = flag(/\p{Extended_Pictographic}/u.test(body) ? 'emoji_only' : 'symbols_only'); continue }
    if (cfg.adPatterns.some(re => re.test(body))) { out[idx] = flag('ad_template'); continue }
    if (dup) { out[idx] = flag('duplicate'); continue }

    const src = input.source_key ?? ''
    if (terms && cfg.category.sources.includes(src) && !CATEGORY_RULE_FORBIDDEN.includes(src) && (terms.product.length || terms.category.length)) {
      const lower = body.toLowerCase()
      const hasP = terms.product.some(w => lower.includes(w.toLowerCase()))
      const hasC = terms.category.some(w => lower.includes(w.toLowerCase()))
      const ok = cfg.category.require === 'either' ? hasP || hasC : hasP && hasC
      if (!ok) { out[idx] = flag('category_miss'); continue }
    }
    out[idx] = pass()
  }
  return out
}

/** 규칙별·보호별 건수(로그·tracker detail 용). 0 인 규칙도 키를 남긴다 — "안 걸림"과 "안 셈"을 가른다. */
export function summarizePrefilter(verdicts: readonly PrefilterVerdict[]) {
  const flagged = Object.fromEntries(PREFILTER_RULES.map(r => [r, 0])) as Record<PrefilterRule, number>
  const protectedBy: Record<PrefilterProtect, number> = { complaint_word: 0, low_rating: 0, english: 0 }
  for (const v of verdicts) {
    if (v.rule) flagged[v.rule] += 1
    if (v.protectedBy) protectedBy[v.protectedBy] += 1
  }
  return { total: verdicts.length, flagged, protectedBy }
}

/**
 * T2 대상에 모드를 적용한다. **shadow 는 아무것도 빼지 않는다** — wouldDrop 만 채운다.
 * enforce 일 때만 kept 에서 뺀다. 판정 없는 입력(verdicts 에 없음)은 통과다.
 */
export function applyPrefilter<T extends { input_id: string }>(
  reviews: readonly T[],
  verdicts: readonly PrefilterVerdict[],
  mode: PrefilterMode,
): { kept: T[]; wouldDrop: { input_id: string; rule: PrefilterRule }[] } {
  const byId = new Map(verdicts.filter(v => v.rule).map(v => [v.input_id, v.rule as PrefilterRule]))
  const wouldDrop = reviews.filter(r => byId.has(r.input_id)).map(r => ({ input_id: r.input_id, rule: byId.get(r.input_id)! }))
  const kept = mode === 'enforce' ? reviews.filter(r => !byId.has(r.input_id)) : [...reviews]
  return { kept, wouldDrop }
}

// ── 오탈락률 측정(읽기 전용 스크립트 scripts/prefilter-falsedrop-sample.mjs 가 쓴다) ──

/**
 * 걸렸을 후보에서 층(영역×소스)별로 고르게 n건을 뽑는다 — 층마다 섞은 뒤 돌아가며 1건씩(작은 층도 빠지지 않게).
 * seed 가 같고 후보 집합이 같으면 같은 표본이다(입력 순서 무관 — id 로 먼저 정렬).
 */
export function sampleFlagged<T extends { input_id: string; stratum: string }>(items: readonly T[], opts: { n?: number; seed?: number } = {}): T[] {
  const n = Math.max(0, Math.floor(opts.n ?? 200))
  const random = rng(opts.seed ?? 42)
  const strata = new Map<string, T[]>()
  for (const it of [...items].sort((a, b) => (a.input_id < b.input_id ? -1 : a.input_id > b.input_id ? 1 : 0))) {
    if (!strata.has(it.stratum)) strata.set(it.stratum, [])
    strata.get(it.stratum)!.push(it)
  }
  const queues = [...strata.keys()].sort().map(k => shuffle(strata.get(k)!, random))
  const out: T[] = []
  for (let round = 0; out.length < n && queues.some(q => q.length > round); round++) {
    for (const q of queues) if (round < q.length && out.length < n) out.push(q[round])
  }
  return out
}

/**
 * 오탈락률 = 걸렀는데 관련이었던 비율. 분모는 relevant+irrelevant 뿐이다 — unknown·미판정은 따로 센다(§7.1, 0 으로 접지 않는다).
 * 사람 판정이 있으면 그게 이긴다. 판정된 건이 0 이면 rate=null(확인 불가).
 */
export function falseDropRate(rows: readonly { verdict?: string | null; human_verdict?: string | null }[]) {
  let relevant = 0, irrelevant = 0, unknown = 0, unjudged = 0
  for (const r of rows) {
    const v = r.human_verdict?.trim() || r.verdict?.trim() || null
    if (v === 'relevant') relevant++
    else if (v === 'irrelevant') irrelevant++
    else if (v === 'unknown') unknown++
    else unjudged++
  }
  const judged = relevant + irrelevant
  return { relevant, irrelevant, unknown, unjudged, rate: judged > 0 ? relevant / judged : null }
}

/** 전환 문턱(docs/prefilter-shadow.md). 5% 초과면 완화 후 재측정, 이하면 사람이 enforce 로 바꿀 수 있다. */
export const FALSE_DROP_MAX = 0.05
/** 판정된 표본이 이보다 적으면 판단하지 않는다(확인 불가) — 재판정 입력부터 돌린다. */
export const FALSE_DROP_MIN_JUDGED = 100
/** 층 하나의 오탈락률을 문턱과 견줄 최소 판정 수. 이보다 적은 층은 strataThin(확인 불가)으로만 보고한다. */
export const FALSE_DROP_MIN_STRATUM = 5

/** review_targets.label 접두("3:klaviyo")로 프로젝트 영역을 정한다. 접두가 갈리면 'mixed', 없으면 'unmapped'. */
export function areaOfProject(labels: readonly (string | null | undefined)[]): string {
  const areas = new Set(labels.map(l => /^([^:\s]+):/.exec(l ?? '')?.[1]).filter((a): a is string => !!a))
  return areas.size === 1 ? [...areas][0] : areas.size > 1 ? 'mixed' : 'unmapped'
}

export interface FalseDropProject {
  id: string
  area: string
  product_elevator_pitch?: string | null
  purpose?: string | null
  business_model?: string | null
}

/**
 * 측정 표본 한 벌(순수). 걸렸을 후보 → 층(영역|소스) 표본 n건 → 기존 판정으로 바로 잴 수 있는 것과
 * T2 재판정이 필요한 것(relevant/irrelevant 판정 없음)으로 가른다.
 */
export function buildFalseDropSample(args: {
  projects: readonly FalseDropProject[]
  inputs: readonly (PrefilterInput & { project_id: string })[]
  verdicts: readonly { input_id: string; verdict?: string | null; human_verdict?: string | null }[]
  cfg: PrefilterConfig
  n?: number
  seed?: number
}) {
  const byProject = new Map<string, (PrefilterInput & { project_id: string })[]>()
  for (const i of args.inputs) {
    if (!byProject.has(i.project_id)) byProject.set(i.project_id, [])
    byProject.get(i.project_id)!.push(i)
  }
  const proj = new Map(args.projects.map(p => [p.id, p]))
  const verdictOf = new Map(args.verdicts.map(v => [v.input_id, v]))

  const flagged: { input_id: string; project_id: string; source_key: string | null; area: string; stratum: string; rule: PrefilterRule; text: string }[] = []
  for (const [pid, rows] of byProject) {
    const area = proj.get(pid)?.area ?? 'unmapped'
    const vs = prefilterInputs(rows, args.cfg, pid)
    rows.forEach((row, i) => {
      const rule = vs[i].rule
      if (!rule) return
      const source = row.source_key ?? null
      flagged.push({ input_id: row.id, project_id: pid, source_key: source, area, stratum: `${area}|${source ?? '(none)'}`, rule, text: String(row.raw_text ?? '') })
    })
  }

  const population: Record<string, number> = {}
  for (const f of flagged) population[f.stratum] = (population[f.stratum] ?? 0) + 1
  const sample = sampleFlagged(flagged, { n: args.n, seed: args.seed }).map(s => {
    const v = verdictOf.get(s.input_id)
    return { ...s, verdict: v?.verdict ?? null, human_verdict: v?.human_verdict ?? null }
  })

  const isJudged = (s: { verdict: string | null; human_verdict: string | null }) => ['relevant', 'irrelevant'].includes((s.human_verdict || s.verdict || '').trim())
  const rejudge: Record<string, { purpose: Omit<FalseDropProject, 'id' | 'area'>; reviews: { input_id: string; text: string }[] }> = {}
  for (const s of sample.filter(s => !isJudged(s))) {
    const p = proj.get(s.project_id)
    rejudge[s.project_id] ??= { purpose: { product_elevator_pitch: p?.product_elevator_pitch ?? null, purpose: p?.purpose ?? null, business_model: p?.business_model ?? null }, reviews: [] }
    rejudge[s.project_id].reviews.push({ input_id: s.input_id, text: stripSourceHeader(s.text, { appVersion: true }) })
  }

  const byStratum: Record<string, ReturnType<typeof falseDropRate>> = {}
  for (const k of new Set(sample.map(s => s.stratum))) byStratum[k] = falseDropRate(sample.filter(s => s.stratum === k))
  const overall = falseDropRate(sample)
  const judged = overall.relevant + overall.irrelevant

  // 표본은 층마다 고르게 뽑아서(라운드로빈) 표본 비율은 모집단 비율이 아니다 — 모집단 가중 비율을 따로 낸다.
  let wNum = 0, wDen = 0
  for (const [k, r] of Object.entries(byStratum)) if (r.rate !== null) { wNum += population[k] * r.rate; wDen += population[k] }
  const weightedRate = wDen > 0 ? wNum / wDen : null
  // 층 문턱: 한 층이 통째로 오탈락이어도 전체 비율에 묻히지 않게 한다. 판정 FALSE_DROP_MIN_STRATUM 건 미만 층은 잴 수 없다(thin).
  const stratumAlerts = Object.entries(byStratum).filter(([, r]) => r.relevant + r.irrelevant >= FALSE_DROP_MIN_STRATUM && (r.rate ?? 0) > FALSE_DROP_MAX).map(([k]) => k)
  const strataThin = Object.entries(byStratum).filter(([, r]) => r.relevant + r.irrelevant < FALSE_DROP_MIN_STRATUM).map(([k]) => k)

  const decision =
    judged < FALSE_DROP_MIN_JUDGED || overall.rate === null ? 'insufficient'
    : overall.rate > FALSE_DROP_MAX || (weightedRate ?? 0) > FALSE_DROP_MAX || stratumAlerts.length > 0 ? 'relax'
    : 'enforce_ok'

  return { totalFlagged: flagged.length, population, sample, ids: sample.map(s => s.input_id), rejudge, overall, weightedRate, byStratum, stratumAlerts, strataThin, decision }
}
